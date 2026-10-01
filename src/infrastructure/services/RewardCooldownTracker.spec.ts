import { RewardCooldownTracker } from './RewardCooldownTracker';

/**
 * Reloj controlable: el tracker acepta la fábrica `now` para no depender
 * de `Date.now` en los specs y poder vencer la ventana milisegundo a
 * milisegundo (el límite de 60 s es exacto, no aproximado).
 */
function createClock(startMs = 0): { now: () => number; advance: (ms: number) => void } {
  let current = startMs;
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms;
    }
  };
}

describe('RewardCooldownTracker — semántica del cooldown de rewarded (ADR-006)', () => {
  it('arranca sin cooldown y sin motivo', () => {
    const tracker = new RewardCooldownTracker(createClock().now);
    expect(tracker.cooldownState()).toBeNull();
  });

  it('un fallo "no_fill" arma el cooldown como cooldown_no_fill durante toda la ventana', () => {
    const clock = createClock();
    const tracker = new RewardCooldownTracker(clock.now);

    tracker.noteFailure('no_fill');
    expect(tracker.cooldownState()).toBe('cooldown_no_fill');

    clock.advance(59_999); // un milisegundo antes del vencimiento: sigue activo
    expect(tracker.cooldownState()).toBe('cooldown_no_fill');
  });

  it('un fallo "other" (error, cancelación del jugador) arma cooldown_retryable', () => {
    const clock = createClock();
    const tracker = new RewardCooldownTracker(clock.now);

    tracker.noteFailure('other');
    expect(tracker.cooldownState()).toBe('cooldown_retryable');

    clock.advance(59_999);
    expect(tracker.cooldownState()).toBe('cooldown_retryable');
  });

  it('la ventana dura exactamente 60 s: al vencer, el estado vuelve a null', () => {
    const clock = createClock();
    const tracker = new RewardCooldownTracker(clock.now);

    tracker.noteFailure('no_fill');
    clock.advance(60_000);
    expect(tracker.cooldownState()).toBeNull();
  });

  it('un éxito limpia cooldown Y motivo: vuelve a null sin avanzar el reloj', () => {
    const clock = createClock();
    const tracker = new RewardCooldownTracker(clock.now);

    tracker.noteFailure('no_fill');
    expect(tracker.cooldownState()).toBe('cooldown_no_fill');

    tracker.noteSuccess();
    expect(tracker.cooldownState()).toBeNull();
  });

  it('un éxito no deja motivo residual: el siguiente fallo define su propio estado', () => {
    const clock = createClock();
    const tracker = new RewardCooldownTracker(clock.now);

    tracker.noteFailure('no_fill');
    tracker.noteSuccess();
    tracker.noteFailure('other');

    expect(tracker.cooldownState()).toBe('cooldown_retryable');
  });

  it('un nuevo fallo rearma la ventana COMPLETA desde el momento del fallo', () => {
    const clock = createClock();
    const tracker = new RewardCooldownTracker(clock.now);

    tracker.noteFailure('other');
    clock.advance(30_000);
    tracker.noteFailure('no_fill'); // re-armado: los 60 s corren de nuevo

    clock.advance(30_000); // 60 s desde el primer fallo, 30 s desde el segundo
    expect(tracker.cooldownState()).toBe('cooldown_no_fill');

    clock.advance(30_000); // 60 s desde el segundo fallo
    expect(tracker.cooldownState()).toBeNull();
  });

  it('sin reloj inyectado usa Date.now() (el camino del adapter real)', () => {
    const tracker = new RewardCooldownTracker();

    expect(tracker.cooldownState()).toBeNull();
    tracker.noteFailure('no_fill');
    expect(tracker.cooldownState()).toBe('cooldown_no_fill');
    tracker.noteSuccess();
    expect(tracker.cooldownState()).toBeNull();
  });
});
