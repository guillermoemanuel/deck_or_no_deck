import { SFX } from '../../shared/audio/AudioData';

// Único lugar donde viven los umbrales e intervalos del latido y del
// momento de derrota — no re-hardcodear estos números en escenas ni en el
// controlador.

/** Umbral crítico (%): por debajo empieza a latir. */
export const HEARTBEAT_CRITICAL_PERCENT = 25;
/** Umbral de peligro (%): el latido se acelera. */
export const HEARTBEAT_DANGER_PERCENT = 12;
/** Intervalo del latido en zona crítica (ms). */
export const HEARTBEAT_INTERVAL_MS = 900;
/** Intervalo del latido en zona de peligro (ms). */
export const HEARTBEAT_FAST_INTERVAL_MS = 650;
/** Pausa entre el sonido de energía agotada y el de derrota (ms). */
export const LOSE_AFTER_DEPLETED_DELAY_MS = 900;

/**
 * Elige el sfx de volteo según el valor de la carta. Los cortes siguen la
 * tabla de energía del juego: los valores BAJOS restauran energía (tono
 * suave), los ALTOS drenan (tono tenso) y el jackpot queda en su propia
 * categoría.
 *
 * Rangos (los 13 valores de CASE_VALUES caen siempre donde corresponde):
 * - ≤ 100   → CARD_LOW   (1, 5, 10, 25, 50, 100 — restauran)
 * - ≤ 750   → CARD_MID   (250, 500, 750)
 * - ≤ 10000 → CARD_HIGH  (1000, 5000, 10000 — drenan)
 * - resto   → CARD_JACKPOT (25000)
 */
export function cardSfxKeyForValue(value: number): string {
  if (value <= 100) return SFX.CARD_LOW;
  if (value <= 750) return SFX.CARD_MID;
  if (value <= 10000) return SFX.CARD_HIGH;
  return SFX.CARD_JACKPOT;
}

/**
 * Intervalo del latido para un porcentaje de energía dado, o `null` si
 * estamos fuera de zona crítica (no debe latir).
 */
export function heartbeatIntervalFor(percentage: number): number | null {
  if (percentage <= HEARTBEAT_DANGER_PERCENT) return HEARTBEAT_FAST_INTERVAL_MS;
  if (percentage <= HEARTBEAT_CRITICAL_PERCENT) return HEARTBEAT_INTERVAL_MS;
  return null;
}
