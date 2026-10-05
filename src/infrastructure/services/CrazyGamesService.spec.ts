import { CrazyGamesService } from './CrazyGamesService';
import { AdLifecyclePhase } from '../../domain/ports/ICrazyGamesService';

type Callbacks = {
  adStarted?: () => void;
  adFinished: () => void;
  adError: (error: unknown) => void;
};

/**
 * Instala un `window.CrazyGames.SDK` falso. `requestAd` NO dispara nada solo:
 * cada test decide cuándo llegan adStarted / adFinished / adError, igual que
 * el SDK real, que responde de forma asíncrona.
 * `adblock` (default `false`) configura lo que reporta `hasAdblock()`.
 * `initialMuteAudio` (default `false`) es el valor inicial de
 * `game.settings.muteAudio` (CG-MON-002); `emitMuteAudio()` simula lo que
 * haría `addSettingsChangeListener` al cambiar el setting.
 */
function installFakeSdk(adblock = false, initialMuteAudio = false): {
  lastCallbacks: () => Callbacks;
  requestAd: jest.Mock;
  emitMuteAudio: (muted: boolean) => void;
} {
  let callbacks: Callbacks | null = null;
  const requestAd = jest.fn((_type: string, cb: Callbacks) => {
    callbacks = cb;
  });
  const settings = { muteAudio: initialMuteAudio };
  const muteListeners: Array<(newSettings: { muteAudio: boolean }) => void> = [];
  (globalThis as unknown as { window: unknown }).window = {
    CrazyGames: {
      SDK: {
        init: () => Promise.resolve(),
        ad: { requestAd, hasAdblock: () => Promise.resolve(adblock) },
        game: {
          gameplayStart: jest.fn(),
          gameplayStop: jest.fn(),
          settings,
          addSettingsChangeListener: (listener: (newSettings: { muteAudio: boolean }) => void) => {
            muteListeners.push(listener);
          }
        },
        user: { systemInfo: { locale: 'en-US' } }
      }
    }
  };
  return {
    lastCallbacks: () => callbacks!,
    requestAd,
    emitMuteAudio: (muted: boolean) => {
      settings.muteAudio = muted;
      muteListeners.forEach(listener => listener({ muteAudio: muted }));
    }
  };
}

/** Deja correr las continuaciones pendientes (el `await initPromise` interno de requestAd). */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
}

async function createReadyService(): Promise<CrazyGamesService> {
  const service = new CrazyGamesService();
  service.init();
  await service.getUserLocale(); // espera a que init() termine
  return service;
}

describe('CrazyGamesService — ciclo de vida de anuncios', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('un rewarded que dura más que el timeout de arranque igual otorga la recompensa', async () => {
    const sdk = installFakeSdk();
    const service = await createReadyService();

    const pending = service.showRewardedAd();
    await flushMicrotasks();
    sdk.lastCallbacks().adStarted?.();

    // 40 s de anuncio: antes de este fix, a los 15 s se resolvía como error.
    jest.advanceTimersByTime(40_000);
    sdk.lastCallbacks().adFinished();

    await expect(pending).resolves.toEqual({ success: true });
  });

  it('emite requesting al pedir, y started/ended solo cuando el anuncio realmente empezó', async () => {
    const sdk = installFakeSdk();
    const service = await createReadyService();
    const phases: AdLifecyclePhase[] = [];
    service.onAdLifecycle(phase => phases.push(phase));

    const pending = service.showMidgameAd();
    await flushMicrotasks();
    // Pedirlo emite 'requesting' (CG-MON-001: señal para bloquear la UI
    // desde el primer instante del request) pero NO 'started' — el mute
    // de audio sigue sin activarse.
    expect(phases).toEqual(['requesting']);

    sdk.lastCallbacks().adStarted?.();
    sdk.lastCallbacks().adFinished();
    await pending;

    expect(phases).toEqual(['requesting', 'started', 'ended']);
  });

  it('un adError sin fill cierra el ciclo con "ended" (sin "started") y clasifica como ad_unavailable', async () => {
    const sdk = installFakeSdk();
    const service = await createReadyService();
    const phases: AdLifecyclePhase[] = [];
    service.onAdLifecycle(phase => phases.push(phase));

    const pending = service.showMidgameAd();
    await flushMicrotasks();
    sdk.lastCallbacks().adError({ code: 'unfilled', message: 'No ad available' });

    await expect(pending).resolves.toEqual({ success: false, reason: 'ad_unavailable' });
    // El ciclo ABRE con 'requesting' y CIERRA con 'ended' aunque el ad
    // nunca arranque: sin ese par el bloqueador de UI quedaría clavado
    // (CG-MON-001). Sin 'started' no hay evento de audio que mute.
    expect(phases).toEqual(['requesting', 'ended']);
  });

  it('si el anuncio nunca arranca, vence a los 15 s como error y cierra el ciclo con "ended"', async () => {
    installFakeSdk();
    const service = await createReadyService();
    const phases: AdLifecyclePhase[] = [];
    service.onAdLifecycle(phase => phases.push(phase));

    const pending = service.showRewardedAd();
    await flushMicrotasks();
    jest.advanceTimersByTime(15_000);

    await expect(pending).resolves.toEqual({ success: false, reason: 'error' });
    // El timeout de arranque NO pasa por closeLifecycle (nunca hubo
    // 'started'): sin el 'ended' de cierre del ciclo, el bloqueador de
    // UI quedaría clavado para siempre (CG-MON-001).
    expect(phases).toEqual(['requesting', 'ended']);
  });

  it('si arranca tarde (después del timeout), igual restaura el audio al terminar', async () => {
    const sdk = installFakeSdk();
    const service = await createReadyService();
    const phases: AdLifecyclePhase[] = [];
    service.onAdLifecycle(phase => phases.push(phase));

    const pending = service.showMidgameAd();
    await flushMicrotasks();
    jest.advanceTimersByTime(15_000);
    await pending;

    sdk.lastCallbacks().adStarted?.();
    sdk.lastCallbacks().adFinished();

    // El timeout de arranque cierra el primer ciclo (requesting→ended);
    // el 'started' TARDÍO del SDK abre otro ciclo de audio/bloqueo que el
    // 'ended' de cierre del anuncio — simétrico: se silencia y se
    // restaura igual que con un ad puntual.
    expect(phases).toEqual(['requesting', 'ended', 'started', 'ended']);
  });

  it('rechaza un segundo anuncio mientras hay uno en curso', async () => {
    installFakeSdk();
    const service = await createReadyService();

    void service.showRewardedAd();
    await flushMicrotasks();

    await expect(service.showMidgameAd()).resolves.toEqual({ success: false, reason: 'error' });
  });

  it('tras un rewarded fallido, isRewardedAdAvailable() es false durante el cooldown y vuelve a true', async () => {
    const sdk = installFakeSdk();
    const service = await createReadyService();
    expect(service.isRewardedAdAvailable()).toBe(true);

    const pending = service.showRewardedAd();
    await flushMicrotasks();
    sdk.lastCallbacks().adError({ code: 'unfilled' });
    await pending;

    expect(service.isRewardedAdAvailable()).toBe(false);
    jest.advanceTimersByTime(60_000);
    expect(service.isRewardedAdAvailable()).toBe(true);
  });

  it('sin SDK resuelve sdk_unavailable y no ofrece rewarded', async () => {
    const service = new CrazyGamesService();
    service.init();

    expect(service.isRewardedAdAvailable()).toBe(false);
    await expect(service.showRewardedAd()).resolves.toEqual({ success: false, reason: 'sdk_unavailable' });
  });

  // --- rewardedAdStatus(): el motivo del cooldown define la política de reembolso (ADR-006) ---

  it('tras un rewarded sin fill, rewardedAdStatus() es "cooldown_no_fill" durante el cooldown', async () => {
    const sdk = installFakeSdk();
    const service = await createReadyService();
    expect(service.rewardedAdStatus()).toBe('available');

    const pending = service.showRewardedAd();
    await flushMicrotasks();
    sdk.lastCallbacks().adError({ code: 'unfilled', message: 'No ad available' });
    await pending;

    expect(service.rewardedAdStatus()).toBe('cooldown_no_fill');
    expect(service.isRewardedAdAvailable()).toBe(false);
  });

  it('tras un rewarded con otro fallo (timeout de arranque), rewardedAdStatus() es "cooldown_retryable"', async () => {
    installFakeSdk();
    const service = await createReadyService();

    const pending = service.showRewardedAd();
    await flushMicrotasks();
    jest.advanceTimersByTime(15_000); // nunca llegó adStarted → settle con reason 'error'
    await pending;

    expect(service.rewardedAdStatus()).toBe('cooldown_retryable');
    expect(service.isRewardedAdAvailable()).toBe(false);
  });

  it('vencido el cooldown de 60 s, rewardedAdStatus() vuelve a "available"', async () => {
    const sdk = installFakeSdk();
    const service = await createReadyService();

    const pending = service.showRewardedAd();
    await flushMicrotasks();
    sdk.lastCallbacks().adError({ code: 'unfilled' });
    await pending;
    expect(service.rewardedAdStatus()).toBe('cooldown_no_fill');

    jest.advanceTimersByTime(60_000);
    expect(service.rewardedAdStatus()).toBe('available');
    expect(service.isRewardedAdAvailable()).toBe(true);
  });

  it('con adblock detectado, rewardedAdStatus() es "adblock" aunque haya cooldown activo', async () => {
    const sdk = installFakeSdk(/* adblock */ true);
    const service = await createReadyService();
    await flushMicrotasks(); // el resultado de hasAdblock() resuelve un tick después de init()

    // Un fallo para dejar cooldown activo: lo permanente (adblock) debe mandar igual.
    const pending = service.showRewardedAd();
    await flushMicrotasks();
    sdk.lastCallbacks().adError({ code: 'unfilled' });
    await pending;

    expect(service.rewardedAdStatus()).toBe('adblock');
    expect(service.isRewardedAdAvailable()).toBe(false);
  });

  it('sin SDK, rewardedAdStatus() es "sdk_unavailable" (lo permanente manda sobre cualquier cooldown)', async () => {
    const service = new CrazyGamesService();
    service.init();

    expect(service.rewardedAdStatus()).toBe('sdk_unavailable');
  });

  it('un rewarded exitoso limpia el cooldown y el motivo previo: rewardedAdStatus() vuelve a "available"', async () => {
    const sdk = installFakeSdk();
    const service = await createReadyService();

    // 1) Fallo sin fill → cooldown no_fill todavía activo.
    const failed = service.showRewardedAd();
    await flushMicrotasks();
    sdk.lastCallbacks().adError({ code: 'unfilled' });
    await failed;
    expect(service.rewardedAdStatus()).toBe('cooldown_no_fill');

    // 2) Éxito sin avanzar el reloj: si no limpiara cooldown Y motivo, seguiría bloqueado.
    const retry = service.showRewardedAd();
    await flushMicrotasks();
    sdk.lastCallbacks().adStarted?.();
    sdk.lastCallbacks().adFinished();
    await retry;

    expect(service.rewardedAdStatus()).toBe('available');
    expect(service.isRewardedAdAvailable()).toBe(true);
  });

  // CG-PUB-003 (auditoría de publicación 2026-10-04): en Basic Launch el
  // SDK reporta los rewarded con adError {code: 'adsDisabledBasicLaunch'}.
  // Sin este mapping el error caía como 'error' genérico → cooldown
  // reintentable → el jugador perdía monedas cada 60 s en un botón que
  // nunca funciona (criterio de rechazo QA: "no rewarded buttons without
  // effect"). El estado nuevo es PERMANENTE en la sesión, igual que
  // 'adblock'/'sdk_unavailable' — por eso manda sobre el cooldown.
  it('un adError adsDisabledBasicLaunch deja rewardedAdStatus() en "ads_disabled" PERMANENTE (no vuelve con el cooldown)', async () => {
    const sdk = installFakeSdk();
    const service = await createReadyService();

    const pending = service.showRewardedAd();
    await flushMicrotasks();
    sdk.lastCallbacks().adError({ code: 'adsDisabledBasicLaunch', message: 'Ads are disabled' });

    await expect(pending).resolves.toEqual({ success: false, reason: 'error' });
    expect(service.rewardedAdStatus()).toBe('ads_disabled');
    expect(service.isRewardedAdAvailable()).toBe(false);

    // Ni siquiera vencido el cooldown de 60 s: el estado no caduca.
    jest.advanceTimersByTime(60_000);
    expect(service.rewardedAdStatus()).toBe('ads_disabled');
  });

  // hasAdblock() puede no detectar la extensión (corre al init, antes de
  // que exista) y el SDK también avisa con adError {code: 'adblock'} al
  // pedir el anuncio. Sin mapearlo caía en 'error' → cooldown
  // reintentable → SIN reembolso, cuando ADR-006 trata el adblock como
  // PERMANENCIA, que SÍ reembolsa al consumir.
  it('un adError {code: "adblock"} setea adblock permanente aunque hasAdblock() lo haya negado', async () => {
    const sdk = installFakeSdk(false); // hasAdblock() dice "sin adblock"
    const service = await createReadyService();

    const pending = service.showRewardedAd();
    await flushMicrotasks();
    sdk.lastCallbacks().adError({ code: 'adblock', message: 'Adblock detected' });

    await expect(pending).resolves.toEqual({ success: false, reason: 'error' });
    expect(service.rewardedAdStatus()).toBe('adblock');
    expect(service.isRewardedAdAvailable()).toBe(false);
  });
});

/**
 * CG-MON-002 (auditoría de publicación 2026-10-04): `muteAudio` del SDK —
 * 0 matches en src/ antes de este sprint. Requisito oficial
 * (docs.crazygames.com/sdk/game, Game Settings): leer `game.settings.muteAudio`
 * y registrarse en `addSettingsChangeListener`; el setting tiene PRIORIDAD
 * sobre el toggle in-game.
 */
describe('CrazyGamesService — muteAudio de la plataforma (CG-MON-002)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('lee settings.muteAudio al iniciar y notifica a quien ya estaba suscripto', async () => {
    installFakeSdk(false, true); // la plataforma dice "silencio" desde el arranque
    const service = new CrazyGamesService();
    const seen: boolean[] = [];
    service.onMuteAudioChange(muted => seen.push(muted));

    service.init();
    await service.getUserLocale(); // espera a que init() termine

    expect(seen).toEqual([true]);
  });

  it('un suscriptor tardío recibe el valor inicial conocido y cada cambio posterior', async () => {
    const sdk = installFakeSdk();
    const service = await createReadyService();
    const seen: boolean[] = [];

    service.onMuteAudioChange(muted => seen.push(muted));
    expect(seen).toEqual([false]); // valor inicial (conocido) al suscribirse tarde

    sdk.emitMuteAudio(true);
    sdk.emitMuteAudio(false);
    expect(seen).toEqual([false, true, false]);
  });

  it('la baja deja de notificar', async () => {
    const sdk = installFakeSdk();
    const service = await createReadyService();
    const seen: boolean[] = [];

    const off = service.onMuteAudioChange(muted => seen.push(muted));
    off();
    sdk.emitMuteAudio(true);

    expect(seen).toEqual([false]);
  });

  it('sin SDK cargado nunca notifica y la baja sigue siendo segura', async () => {
    const service = new CrazyGamesService();
    service.init();
    await service.getUserLocale();

    const seen: boolean[] = [];
    const off = service.onMuteAudioChange(muted => seen.push(muted));

    expect(seen).toEqual([]);
    off(); // no-op sin listeners
  });
});
