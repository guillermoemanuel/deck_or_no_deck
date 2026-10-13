import {
  createScaleRefreshRetry,
  RETRY_DELAYS_MS,
  ScaleRetryScheduler,
  ScaleRefreshRetry
} from './scaleResizeRetry';

/**
 * `scaleResizeRetry` — helper puro de re-agendado del refresh de escala (FIT
 * del canvas), sin Phaser y sin timers reales: el scheduler se inyecta.
 *
 * CAUSA RAÍZ del bug que motiva el módulo: en los builds de CrazyGames el
 * fullscreen lo dispara el portal sobre el iframe — Phaser nunca pide
 * fullscreen, así que nunca emite `ENTER_FULLSCREEN`/`LEAVE_FULLSCREEN` y los
 * `window.setTimeout(refreshScale, 100/350)` de `main.ts` no corren. El FIT
 * se calcula con el tamaño viejo y el canvas queda chico con barras negras.
 * Este helper concentra el re-armado (cancela lo pendiente y programa el
 * refresh en los dos delays) para poder colgarlo también de `window.resize`
 * y `visualViewport.resize`.
 *
 * Garantías que fija el spec:
 * 1. `retry()` cancela ANTES de programar (si no, quedan timers apilados).
 * 2. Los delays son exactamente 100 y 350 ms (los de `main.ts`).
 * 3. Dos `retry()` seguidos dejan vigente SOLO la última tanda.
 * 4. `dispose()` cancela sin programar, y un `retry()` posterior re-armea.
 * 5. El scheduler default delega en `window.setTimeout`/`window.clearTimeout`
 *    y en node sin `window` el constructor lanza un `Error` explicativo.
 */

/** Entrada registrada por el fake scheduler: queda "viva" hasta que un `cancelPending` la marca. */
interface ScheduledRetry {
  callback: () => void;
  delayMs: number;
  canceled: boolean;
}

interface FakeScheduler {
  scheduler: ScaleRetryScheduler;
  /** Historial completo de programaciones (ambas tandas), con su estado de cancelación. */
  scheduled: ScheduledRetry[];
  /** Solo las entradas aún vigentes — lo que un timer real dispararía. */
  live(): ScheduledRetry[];
  cancelPending: jest.Mock;
  schedule: jest.Mock;
}

/**
 * Scheduler falso controlable: `cancelPending` marca todo lo pendiente como
 * cancelado (como haría `clearTimeout`) pero NO borra el historial, así el
 * spec puede verificar que la 1.ª tanda quedó irrelevante y ejecutar solo la
 * vigente. Los mocks exponen `invocationCallOrder` para assert de orden.
 */
function createFakeScheduler(): FakeScheduler {
  const scheduled: ScheduledRetry[] = [];
  const cancelPending = jest.fn(() => {
    for (const entry of scheduled) {
      entry.canceled = true;
    }
  });
  const schedule = jest.fn((callback: () => void, delayMs: number) => {
    scheduled.push({ callback, delayMs, canceled: false });
  });
  return {
    scheduler: { schedule, cancelPending },
    scheduled,
    live: () => scheduled.filter(entry => !entry.canceled),
    cancelPending,
    schedule
  };
}

/** Borra `window` de `globalThis` (node puro) y devuelve la restauración del descriptor original. */
function removeWindow(): () => void {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  delete (globalThis as Record<string, unknown>)['window'];
  return () => {
    if (original) {
      Object.defineProperty(globalThis, 'window', original);
    }
  };
}

/** Instala un `window` falso y devuelve la restauración (mismo patrón que `installGlobals` de OwnRewardedAdService.spec). */
function installWindow(value: unknown): () => void {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { value, configurable: true, writable: true });
  return () => {
    if (original) {
      Object.defineProperty(globalThis, 'window', original);
    } else {
      delete (globalThis as Record<string, unknown>)['window'];
    }
  };
}

describe('createScaleRefreshRetry — re-armado del refresh de escala (scheduler inyectado)', () => {
  it('retry() cancels pending callbacks BEFORE scheduling and arms refresh at exactly 100 and 350 ms', () => {
    const fake = createFakeScheduler();
    const refresh = jest.fn();
    const retry: ScaleRefreshRetry = createScaleRefreshRetry(refresh, fake.scheduler);

    retry.retry();

    expect(fake.cancelPending).toHaveBeenCalledTimes(1);
    expect(fake.schedule).toHaveBeenCalledTimes(2);
    expect(fake.scheduled.map(entry => entry.delayMs)).toEqual([100, 350]);
    // Los delays salen de la constante del contrato, no de un literal suelto.
    expect([...RETRY_DELAYS_MS]).toEqual([100, 350]);
    // Orden: cancelar PRIMERO, armar DESPUÉS — al revés quedan timers apilados.
    expect(fake.cancelPending.mock.invocationCallOrder[0]).toBeLessThan(
      fake.schedule.mock.invocationCallOrder[0]
    );
    // Ambas programaciones apuntan al refresh inyectado.
    for (const entry of fake.scheduled) {
      expect(entry.callback).toBe(refresh);
    }
  });

  it('two consecutive retry() calls leave only the second batch armed: refresh runs twice, not four times', () => {
    const fake = createFakeScheduler();
    const refresh = jest.fn();
    const retry = createScaleRefreshRetry(refresh, fake.scheduler);

    retry.retry();
    retry.retry();

    expect(fake.cancelPending).toHaveBeenCalledTimes(2);
    expect(fake.scheduled).toHaveLength(4); // ambas tandas quedaron registradas…
    expect(fake.live()).toHaveLength(2); // …pero solo la 2.ª sigue vigente
    expect(fake.live().map(entry => entry.delayMs)).toEqual([100, 350]);

    // Ejecutamos SOLO la tanda vigente: la 1.ª fue cancelada, sus callbacks
    // son irrelevantes (un timer real ya no los dispararía).
    for (const entry of fake.live()) {
      entry.callback();
    }
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('running a scheduled callback invokes refresh exactly once', () => {
    const fake = createFakeScheduler();
    const refresh = jest.fn();
    const retry = createScaleRefreshRetry(refresh, fake.scheduler);

    retry.retry();

    const [first] = fake.live();
    first.callback();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('dispose() cancels without scheduling anything, and a later retry() re-arms', () => {
    const fake = createFakeScheduler();
    const refresh = jest.fn();
    const retry = createScaleRefreshRetry(refresh, fake.scheduler);

    retry.retry();
    retry.dispose();

    expect(fake.cancelPending).toHaveBeenCalledTimes(2);
    expect(fake.schedule).toHaveBeenCalledTimes(2); // solo la tanda del primer retry
    expect(fake.live()).toHaveLength(0);

    // El re-armado sigue vivo después del dispose.
    retry.retry();

    expect(fake.cancelPending).toHaveBeenCalledTimes(3);
    expect(fake.schedule).toHaveBeenCalledTimes(4);
    expect(fake.live().map(entry => entry.delayMs)).toEqual([100, 350]);
    for (const entry of fake.live()) {
      entry.callback();
    }
    expect(refresh).toHaveBeenCalledTimes(2);
  });
});

describe('createScaleRefreshRetry — scheduler default (depende de window)', () => {
  let restoreWindow: (() => void) | undefined;

  afterEach(() => {
    restoreWindow?.();
    restoreWindow = undefined;
  });

  it('without a window (node test environment) the constructor throws an Error mentioning window', () => {
    restoreWindow = removeWindow();

    expect(() => createScaleRefreshRetry(() => undefined)).toThrow(/window/);
  });

  it('with a stubbed window the default scheduler delegates to window.setTimeout and window.clearTimeout', () => {
    let nextId = 1;
    const setTimeoutMock = jest.fn(() => nextId++);
    const clearTimeoutMock = jest.fn();
    restoreWindow = installWindow({ setTimeout: setTimeoutMock, clearTimeout: clearTimeoutMock });

    const refresh = jest.fn();
    const retry = createScaleRefreshRetry(refresh);

    retry.retry();

    expect(setTimeoutMock).toHaveBeenCalledTimes(2);
    expect(setTimeoutMock).toHaveBeenNthCalledWith(1, refresh, 100);
    expect(setTimeoutMock).toHaveBeenNthCalledWith(2, refresh, 350);

    // Un segundo retry cancela los timers de la tanda anterior vía window.
    retry.retry();

    expect(setTimeoutMock).toHaveBeenCalledTimes(4);
    expect(clearTimeoutMock).toHaveBeenCalled();
  });
});
