import {
  OwnRewardedAdService,
  AdOverlayOutcome,
  AdOverlayPresenter
} from './OwnRewardedAdService';
import { AdLifecyclePhase, AdType } from '../../domain/ports/ICrazyGamesService';

/**
 * Presenter fake controlable: cada test decide si el overlay "completa"
 * el countdown, el jugador lo cancela, o el presenter revienta — las tres
 * ramas que OwnRewardedAdService debe traducir a AdResult (ADR-007).
 * El array `seen` registra el tipo pedido para verificar que rewarded y
 * midgame lleguen al overlay correcto.
 */
function fakePresenter(
  behavior: () => Promise<AdOverlayOutcome> = () => Promise.resolve({ completed: true })
): { presenter: AdOverlayPresenter; seen: AdType[] } {
  const seen: AdType[] = [];
  const presenter: AdOverlayPresenter = type => {
    seen.push(type);
    return behavior();
  };
  return { presenter, seen };
}

/** Reloj controlable (mismo patrón que RewardCooldownTracker.spec) para vencer el cooldown al ms exacto. */
function createClock(startMs = 0): { now: () => number; advance: (ms: number) => void } {
  let current = startMs;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    }
  };
}

/** Suscribe un listener que acumula las fases en orden. */
function trackLifecycle(service: OwnRewardedAdService): AdLifecyclePhase[] {
  const phases: AdLifecyclePhase[] = [];
  service.onAdLifecycle(phase => phases.push(phase));
  return phases;
}

/** Instala `window`/`navigator` falso y devuelve la restauración de los descriptores originales. */
function installGlobals(values: { window?: unknown; navigator?: unknown }): () => void {
  const originals = {
    window: Object.getOwnPropertyDescriptor(globalThis, 'window'),
    navigator: Object.getOwnPropertyDescriptor(globalThis, 'navigator')
  };
  Object.defineProperty(globalThis, 'window', { value: values.window, configurable: true, writable: true });
  Object.defineProperty(globalThis, 'navigator', { value: values.navigator, configurable: true, writable: true });
  return () => {
    for (const name of ['window', 'navigator'] as const) {
      const original = originals[name];
      if (original) {
        Object.defineProperty(globalThis, name, original);
      } else {
        delete (globalThis as Record<string, unknown>)[name];
      }
    }
  };
}

describe('OwnRewardedAdService — anuncio propio (overlay con countdown) para portales externos (ADR-007)', () => {
  it('arranca "available" y ofrece rewarded: sin SDK externo siempre hay ads propios', () => {
    const { presenter } = fakePresenter();
    const service = new OwnRewardedAdService(presenter);

    expect(service.rewardedAdStatus()).toBe('available');
    expect(service.isRewardedAdAvailable()).toBe(true);
    expect(service.isAvailable()).toBe(true);
  });

  it('rewarded completado → success, con lifecycle started/ended una vez cada uno y en orden', async () => {
    const { presenter, seen } = fakePresenter();
    const service = new OwnRewardedAdService(presenter);
    const phases = trackLifecycle(service);

    await expect(service.showRewardedAd()).resolves.toEqual({ success: true });

    expect(seen).toEqual(['rewarded']);
    expect(phases).toEqual(['started', 'ended']);
    expect(service.rewardedAdStatus()).toBe('available');
  });

  it('countdown cancelado por el jugador → user_cancelled y status cooldown_retryable (ADR-006)', async () => {
    const { presenter } = fakePresenter(() => Promise.resolve({ completed: false }));
    const service = new OwnRewardedAdService(presenter);
    const phases = trackLifecycle(service);

    await expect(service.showRewardedAd()).resolves.toEqual({ success: false, reason: 'user_cancelled' });

    expect(phases).toEqual(['started', 'ended']);
    expect(service.rewardedAdStatus()).toBe('cooldown_retryable');
    expect(service.isRewardedAdAvailable()).toBe(false);
  });

  it('si el presenter lanza, resuelve "error" sin rechazar la promesa hacia el caller', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const { presenter } = fakePresenter(() => Promise.reject(new Error('overlay roto')));
      const service = new OwnRewardedAdService(presenter);
      const phases = trackLifecycle(service);

      await expect(service.showRewardedAd()).resolves.toEqual({ success: false, reason: 'error' });

      expect(phases).toEqual(['started', 'ended']);
      expect(service.rewardedAdStatus()).toBe('cooldown_retryable');
    } finally {
      warn.mockRestore();
    }
  });

  it('la ventana dura 60 s exactos: dentro retryable, a los 60 001 ms vuelve a available (reintento real)', async () => {
    const clock = createClock();
    const { presenter } = fakePresenter(() => Promise.resolve({ completed: false }));
    const service = new OwnRewardedAdService(presenter, clock.now);

    await service.showRewardedAd();
    expect(service.rewardedAdStatus()).toBe('cooldown_retryable');

    clock.advance(59_999); // un ms antes del vencimiento: sigue bloqueado
    expect(service.rewardedAdStatus()).toBe('cooldown_retryable');

    clock.advance(2); // 60 001 ms desde el fallo: ventana vencida
    expect(service.rewardedAdStatus()).toBe('available');
    expect(service.isRewardedAdAvailable()).toBe(true);
  });

  it('midgame cancelado → user_cancelled y status sigue "available" (el cooldown es solo de rewarded)', async () => {
    const { presenter, seen } = fakePresenter(() => Promise.resolve({ completed: false }));
    const service = new OwnRewardedAdService(presenter);
    const phases = trackLifecycle(service);

    await expect(service.showMidgameAd()).resolves.toEqual({ success: false, reason: 'user_cancelled' });

    expect(seen).toEqual(['midgame']);
    expect(phases).toEqual(['started', 'ended']);
    expect(service.rewardedAdStatus()).toBe('available');
  });

  it('midgame tampoco LIMPIA un cooldown de rewarded activo (paridad con CrazyGamesService.settle)', async () => {
    const cancelled = fakePresenter(() => Promise.resolve({ completed: false }));
    const service = new OwnRewardedAdService(cancelled.presenter);
    await service.showRewardedAd();
    expect(service.rewardedAdStatus()).toBe('cooldown_retryable');

    await service.showMidgameAd();
    expect(service.rewardedAdStatus()).toBe('cooldown_retryable');
  });

  it('un rewarded completado limpia un cooldown previo: status vuelve a "available"', async () => {
    const behaviour: Array<'complete' | 'cancel'> = ['cancel', 'complete'];
    let index = 0;
    const { presenter } = fakePresenter(() =>
      Promise.resolve({ completed: behaviour[index++] === 'complete' })
    );
    const service = new OwnRewardedAdService(presenter);

    await service.showRewardedAd();
    expect(service.rewardedAdStatus()).toBe('cooldown_retryable');

    await service.showRewardedAd();
    expect(service.rewardedAdStatus()).toBe('available');
    expect(service.isRewardedAdAvailable()).toBe(true);
  });

  it('rechaza un segundo anuncio mientras el overlay está en curso, sin tocar el tracker', async () => {
    let settle: ((outcome: AdOverlayOutcome) => void) | undefined;
    const presenter: AdOverlayPresenter = () =>
      new Promise<AdOverlayOutcome>(resolve => {
        settle = resolve;
      });
    const service = new OwnRewardedAdService(presenter);

    const first = service.showRewardedAd();
    await expect(service.showMidgameAd()).resolves.toEqual({ success: false, reason: 'error' });

    settle!({ completed: true });
    await expect(first).resolves.toEqual({ success: true });
    expect(service.rewardedAdStatus()).toBe('available');
  });

  it('getUserLocale() lee navigator.language y devuelve null sin navigator (nunca lanza)', async () => {
    const restore = installGlobals({ window: {}, navigator: { language: 'es-AR' } });
    try {
      const withNavigator = new OwnRewardedAdService(fakePresenter().presenter);
      await expect(withNavigator.getUserLocale()).resolves.toBe('es-AR');
    } finally {
      restore();
    }

    const restoreNoNavigator = installGlobals({ window: {}, navigator: undefined });
    try {
      const withoutNavigator = new OwnRewardedAdService(fakePresenter().presenter);
      await expect(withoutNavigator.getUserLocale()).resolves.toBeNull();
    } finally {
      restoreNoNavigator();
    }
  });

  it('la telemetría de gameplay es no-op y no lanza (en modo portal no hay a quién reportar)', () => {
    const { presenter } = fakePresenter();
    const service = new OwnRewardedAdService(presenter);

    expect(() => {
      service.reportGameplayStart();
      service.reportGameplayStop();
    }).not.toThrow();
  });
});
