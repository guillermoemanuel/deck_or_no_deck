/**
 * Fase 1 de controles de teclado — núcleo puro de la navegación por foco para
 * escenas en PC (1280×720 fijo, coordenadas de diseño). Sin Phaser ni DOM: el
 * wiring por escena viene en fases posteriores.
 *
 * Regla geométrica: de un item actual se elige el candidato HABILITADO del
 * lado correcto del eje primario con MENOR distancia euclídea (`Math.hypot`),
 * no el de menor índice — así "abajo" desde la esquina superior derecha de una
 * grilla cae en la celda directamente debajo y no en la primera de la fila.
 */

/** Item de foco mínimo: centro en coordenadas de diseño + estado activable. */
export interface FocusItem {
  readonly x: number;
  readonly y: number;
  readonly enabled: boolean;
}

/** Cardinal de movimiento del foco de teclado (flechas). */
export type FocusDirection = 'up' | 'down' | 'left' | 'right';

/**
 * Índice del primer item habilitado de la lista, o -1 si la lista está vacía
 * o todos los items están deshabilitados.
 */
export function firstEnabledIndex(items: readonly FocusItem[]): number {
  return items.findIndex((current) => current.enabled);
}

/**
 * Siguiente índice de foco al pulsar una dirección de teclado.
 *
 * - Candidatos: items `enabled` estrictamente del lado correcto del eje
 *   primario respecto del item actual (`right`: x > actual.x, etc.).
 * - Ganador: menor distancia euclídea al item actual; empate → menor índice.
 * - `currentIndex` fuera de `[0, items.length)` (nada enfocado `-1`, o índice
 *   residual tras un re-render que cambió el tamaño de la lista) →
 *   `firstEnabledIndex`. Contrato con test: un índice válido nunca "cae" así.
 * - Sin candidatos (borde de la grilla, o los del lado pedido están todos
 *   deshabilitados) → devuelve `currentIndex` sin cambios.
 * - Lista vacía → -1.
 *
 * El item ACTUAL puede estar deshabilitado sin bloquear el movimiento: solo
 * se filtran los candidatos.
 */
export function nextFocusIndex(
  items: readonly FocusItem[],
  currentIndex: number,
  direction: FocusDirection
): number {
  if (items.length === 0) return -1;
  // Fuera de rango (incluye -1): nada enfocado → primer habilitado.
  if (currentIndex < 0 || currentIndex >= items.length) return firstEnabledIndex(items);

  const current = items[currentIndex];
  let bestIndex = currentIndex;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 0; index < items.length; index++) {
    const candidate = items[index];
    if (!candidate.enabled) continue;

    // Eje primario: el candidato debe estar estrictamente del lado pedido.
    const onPrimaryAxis =
      direction === 'right'
        ? candidate.x > current.x
        : direction === 'left'
          ? candidate.x < current.x
          : direction === 'down'
            ? candidate.y > current.y
            : candidate.y < current.y;
    if (!onPrimaryAxis) continue;

    const distance = Math.hypot(candidate.x - current.x, candidate.y - current.y);
    // Empate euclídeo → gana el menor índice (bucle en orden ascendente).
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  // Sin candidatos (bestDistance sigue infinito) → se conserva el actual.
  return bestIndex;
}
