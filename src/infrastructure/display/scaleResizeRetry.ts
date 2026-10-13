/**
 * `scaleResizeRetry` — helper puro de re-agendado del refresh de escala (FIT
 * del canvas), sin Phaser: el scheduler de timers se inyecta (o usa `window`).
 *
 * CAUSA RAÍZ del bug que motiva el módulo: en los builds de CrazyGames el
 * fullscreen lo dispara el PORTAL sobre el iframe — Phaser nunca pide
 * fullscreen, así que nunca emite `ENTER_FULLSCREEN`/`LEAVE_FULLSCREEN` y los
 * `window.setTimeout(refreshScale, 100/350)` de `main.ts` no corren. El FIT
 * se calcula contra el tamaño viejo del iframe y el canvas queda chico,
 * centrado con barras negras. Este helper concentra el re-armado (cancela lo
 * pendiente y programa el refresh en los dos delays) para poder colgarlo
 * también de `window.resize` y `visualViewport.resize`, donde sí llega la
 * señal cuando el fullscreen es del portal.
 *
 * Garantías:
 * 1. `retry()` cancela ANTES de programar (si no, quedan timers apilados).
 * 2. Los delays son exactamente 100 y 350 ms (`RETRY_DELAYS_MS`).
 * 3. Dos `retry()` seguidos dejan vigente SOLO la última tanda.
 * 4. `dispose()` cancela sin programar; un `retry()` posterior re-armea.
 * 5. El scheduler default delega en `window.setTimeout`/`window.clearTimeout`
 *    y en entornos sin `window` el constructor lanza un `Error` explicativo.
 */

/** Delays del re-agendado: los dos que históricamente cubrían el caso rápido y el lento. */
export const RETRY_DELAYS_MS: readonly number[] = [100, 350];

/** Scheduler de timers inyectable (para tests: se finge; en producción: `window`). */
export interface ScaleRetryScheduler {
  schedule(callback: () => void, delayMs: number): void;
  cancelPending(): void;
}

/** Contrato del helper: re-armar el refresh demorado o soltar los timers pendientes. */
export interface ScaleRefreshRetry {
  retry(): void;
  dispose(): void;
}

/**
 * Crea el helper de re-armado.
 *
 * @param refresh - el refresh de escala a demorar (típicamente `game.scale.refresh`).
 * @param scheduler - opcional; sin él se usa `window.setTimeout`/`window.clearTimeout`
 *   (por eso el constructor exige `window`).
 * @throws {Error} si no hay scheduler inyectado y el entorno no expone `window`.
 */
export function createScaleRefreshRetry(
  refresh: () => void,
  scheduler?: ScaleRetryScheduler
): ScaleRefreshRetry {
  const active = scheduler ?? createWindowScheduler();
  return {
    retry(): void {
      // Cancelar PRIMERO: si no, cada retry apila timers sobre los anteriores.
      active.cancelPending();
      for (const delayMs of RETRY_DELAYS_MS) {
        active.schedule(refresh, delayMs);
      }
    },
    dispose(): void {
      // Solo suelta lo pendiente; re-armar después sigue siendo válido.
      active.cancelPending();
    }
  };
}

/**
 * Scheduler default: delega en `window.setTimeout`/`window.clearTimeout` y
 * recuerda los ids para poder cancelar la tanda vigente.
 */
function createWindowScheduler(): ScaleRetryScheduler {
  if (typeof window === 'undefined') {
    throw new Error(
      'createScaleRefreshRetry: sin window no hay scheduler default — ' +
        'inyectá un ScaleRetryScheduler explícito (el default usa window.setTimeout/window.clearTimeout).'
    );
  }
  const pendingIds = new Set<number>();
  return {
    schedule(callback: () => void, delayMs: number): void {
      // Sin wrapper: el callback que ve `window.setTimeout` debe ser el original.
      pendingIds.add(window.setTimeout(callback, delayMs));
    },
    cancelPending(): void {
      for (const id of pendingIds) {
        window.clearTimeout(id);
      }
      pendingIds.clear();
    }
  };
}
