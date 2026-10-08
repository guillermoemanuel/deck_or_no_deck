/**
 * Política económica del Banquero y del arranque de energía — FUENTE ÚNICA
 * de las constantes del rebalance (ADR-013). Ningún otro archivo debe
 * hardcodear estos números.
 *
 * La fórmula completa vive en `OfferCalculator.calculate()`; acá solo están
 * los números que la gobiernan para que cambiar la política sea un solo
 * edit en un solo archivo y los specs puedan importarlos sin duplicación.
 */

/** Multiplicador del promedio por ronda de oferta: 1ª, 2ª y 3ª (las que siguen usan la última). */
export const OFFER_ROUND_FACTORS: readonly number[] = [0.75, 0.85, 0.95];

/** Ruido uniforme por oferta: la muestra cae en ±OFFER_NOISE (es decir, ±20 %). */
export const OFFER_NOISE = 0.2;

/** Piso del oferta: nunca menos que 50 % del promedio de las cartas cerradas. */
export const OFFER_MIN_RATIO = 0.5;

/** Techo de la oferta: nunca más que 120 % del promedio (aplica tras el bono del Negociador). */
export const OFFER_MAX_RATIO = 1.2;

/** Energía inicial (y al revivir) = 60 % del techo vigente (antes era 50 %). */
export const STARTING_ENERGY_RATIO = 0.6;
