/**
 * AdOverlayScene.resolution.ts — lógica de resolución de la promise del
 * presenter del anuncio propio (ADR-007), separada del módulo de la escena
 * para poder testearla SIN montar Phaser (jest no unit-testea escenas:
 * ver `docs/testing.md` §5 — esta pieza es lógica pura, no ciclo de vida).
 *
 * Regla central: resolución ÚNICA. La promise que recibe el adapter nunca
 * puede quedarse colgada, y tampoco puede resolverse dos veces — un
 * `onDone` doble es bug, así que el segundo resultado se descarta en
 * silencio y el primero gana.
 */

/** Resultado estructural que espera el adapter (infra):
 * `(type: AdType) => Promise<{ completed: boolean }>`. */
export interface AdOverlayResult {
  readonly completed: boolean;
}

export interface AdOverlayResolution {
  /** Promise que el presenter devuelve al adapter (inyectado desde main.ts, ADR-007). */
  readonly promise: Promise<AdOverlayResult>;

  /**
   * Resuelve solo la PRIMERA vez que se le llama; las llamadas siguientes
   * se descartan y devuelven `false`.
   *
   * Hace falta porque la escena dispara `onDone` desde varios caminos
   * (contador llega a 0, botón ✕, y los SHUTDOWN/DESTROY de seguridad) y
   * el apagado NORMAL de la escena ocurre DESPUÉS de resolverse — sin
   * este guard, el SHUTDOWN posterior pisaría `{ completed: true }` con
   * `{ completed: false }` y el adapter reportaría cancelación de un
   * anuncio que en realidad se completó.
   *
   * @returns `true` si esta llamada fue la que resolvió.
   */
  resolveOnce(result: AdOverlayResult): boolean;
}

/**
 * Crea la resolución single-shot de un anuncio.
 *
 * @param onResolved Se invoca EXACTAMENTE una vez, justo después de la
 * resolución que gana — el presenter lo usa para desuscribir sus
 * listeners de seguridad (DESTROY del juego) y así no acumularlos entre
 * un anuncio y el siguiente.
 */
export function createAdOverlayResolution(onResolved?: () => void): AdOverlayResolution {
  let settled = false;
  let settle: ((result: AdOverlayResult) => void) | undefined;

  const promise = new Promise<AdOverlayResult>(resolve => {
    // El executor de Promise corre sincrónicamente al construirse:
    // `settle` queda asignado antes de que cualquier consumidor pueda
    // llegar a llamar a resolveOnce().
    settle = resolve;
  });

  return {
    promise,
    resolveOnce(result) {
      if (settled) {
        return false;
      }
      settled = true;
      settle?.(result);
      onResolved?.();
      return true;
    }
  };
}
