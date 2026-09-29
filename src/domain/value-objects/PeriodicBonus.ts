/**
 * PeriodicBonus: reglas puras (sin Phaser, sin storage) del bono de "elegí
 * una carta" que el jugador puede reclamar cada cierto tiempo mientras
 * está jugando una partida.
 *
 * Ciclo de vida de un bono, en términos de `cycleStart` (epoch ms — el
 * instante en que arrancó el ciclo actual, ya sea porque se reclamó el
 * anterior o porque el anterior expiró sin reclamarse):
 *
 *   cycleStart            availableAt (+12h)         expiresAt (+24h más)
 *   |------- locked -------|------- available -------|------- expired ------->
 *
 * - 'locked': todavía no pasaron las 12hs desde el último ciclo.
 * - 'available': el jugador puede reclamarlo — tiene una ventana de 24hs
 *   para hacerlo antes de perder la oportunidad.
 * - 'expired': dejó pasar la ventana de 24hs sin reclamar. Esto es
 *   intencional ("obligarlo a jugar"): no reclamar no lo deja disponible
 *   para siempre, sino que fuerza un nuevo ciclo completo de 12hs de
 *   espera — ver `ProgressionManager.resolvePeriodicBonusExpiry()`, quien
 *   es responsable de reiniciar `cycleStart` cuando detecta este estado.
 */

/** Rango de valores posibles: uno por carta, sin repetir (6 valores para 6 cartas). */
export const PERIODIC_BONUS_VALUES: readonly number[] = [500, 1000, 2000, 3000, 4000, 5000];

export const PERIODIC_BONUS_CARD_COUNT = PERIODIC_BONUS_VALUES.length;

export const PERIODIC_BONUS_COOLDOWN_MS = 12 * 60 * 60 * 1000;
export const PERIODIC_BONUS_EXPIRY_WINDOW_MS = 24 * 60 * 60 * 1000;

export type PeriodicBonusState = 'locked' | 'available' | 'expired';

export interface PeriodicBonusStatus {
  readonly state: PeriodicBonusState;
  /** Epoch ms en que este ciclo pasa (o pasó) a 'available'. */
  readonly availableAt: number;
  /** Epoch ms en que este ciclo pasa (o pasó) a 'expired' si no se reclama. */
  readonly expiresAt: number;
}

/** Calcula el estado del bono en un instante dado, a partir de cuándo arrancó el ciclo actual. */
export function computePeriodicBonusStatus(cycleStart: number, now: number): PeriodicBonusStatus {
  const availableAt = cycleStart + PERIODIC_BONUS_COOLDOWN_MS;
  const expiresAt = availableAt + PERIODIC_BONUS_EXPIRY_WINDOW_MS;

  if (now < availableAt) {
    return { state: 'locked', availableAt, expiresAt };
  }
  if (now < expiresAt) {
    return { state: 'available', availableAt, expiresAt };
  }
  return { state: 'expired', availableAt, expiresAt };
}

/**
 * `cycleStart` de arranque para una partida/jugador nuevo: se calcula
 * "como si" el ciclo hubiera empezado hace exactamente `COOLDOWN_MS`, de
 * forma que `computePeriodicBonusStatus` lo reporte 'available' de
 * inmediato (con su ventana completa de 24hs para reclamarlo) — un
 * jugador nuevo no debería tener que esperar 12hs para ver el bono por
 * primera vez.
 */
export function freshPeriodicBonusCycleStart(now: number): number {
  return now - PERIODIC_BONUS_COOLDOWN_MS;
}
