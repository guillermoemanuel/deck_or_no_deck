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

// --- Regla anti-farmeo de la 1ª ronda (ADR-014) ---

/** Tratos de 1ª ronda seguidos que activan la regla (al 4º, se topa el juego siguiente). */
export const FIRST_ROUND_STREAK_TRIGGER = 4;

/** Partidas con la oferta de la 1ª ronda topada que siguen tras activarse la regla. */
export const CAPPED_GAMES_DURATION = 5;

/** Valores entre los que se sortea el tope de la oferta de la 1ª ronda (una vez por partida). */
export const CAPPED_OFFER_VALUES: readonly number[] = [1, 2, 5, 10];
