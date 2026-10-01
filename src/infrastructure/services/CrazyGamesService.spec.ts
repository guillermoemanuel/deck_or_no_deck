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
 */
function installFakeSdk(adblock = false): { lastCallbacks: () => Callbacks; requestAd: jest.Mock } {
  let callbacks: Callbacks | null = null;
  const requestAd = jest.fn((_type: string, cb: Callbacks) => {
    callbacks = cb;
  });
  (globalThis as unknown as { window: unknown }).window = {
    CrazyGames: {
      SDK: {
        init: () => Promise.resolve(),
        ad: { requestAd, hasAdblock: () => Promise.resolve(adblock) },
        game: { gameplayStart: jest.fn(), gameplayStop: jest.fn() },
        user: { systemInfo: { locale: 'en-US' } }
      }
    }
  };
  return { lastCallbacks: () => callbacks!, requestAd };
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

  it('emite started/ended solo cuando el anuncio realmente empezó', async () => {
    const sdk = installFakeSdk();
    const service = await createReadyService();
    const phases: AdLifecyclePhase[] = [];
    service.onAdLifecycle(phase => phases.push(phase));

    const pending = service.showMidgameAd();
    await flushMicrotasks();
    expect(phases).toEqual([]); // pedirlo NO silencia nada

    sdk.lastCallbacks().adStarted?.();
    sdk.lastCallbacks().adFinished();
    await pending;

    expect(phases).toEqual(['started', 'ended']);
  });

  it('un adError sin fill no emite ningún evento de audio y clasifica como ad_unavailable', async () => {
    const sdk = installFakeSdk();
    const service = await createReadyService();
    const phases: AdLifecyclePhase[] = [];
    service.onAdLifecycle(phase => phases.push(phase));

    const pending = service.showMidgameAd();
    await flushMicrotasks();
    sdk.lastCallbacks().adError({ code: 'unfilled', message: 'No ad available' });

    await expect(pending).resolves.toEqual({ success: false, reason: 'ad_unavailable' });
    expect(phases).toEqual([]);
  });

  it('si el anuncio nunca arranca, vence a los 15 s como error', async () => {
    installFakeSdk();
    const service = await createReadyService();

    const pending = service.showRewardedAd();
    await flushMicrotasks();
    jest.advanceTimersByTime(15_000);

    await expect(pending).resolves.toEqual({ success: false, reason: 'error' });
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

    expect(phases).toEqual(['started', 'ended']);
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
});
