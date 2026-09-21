/**
 * Los 13 valores monetarios fijos del mazo (12 tablero + 1 secreta).
 * Es un dato de DISEÑO del juego, no aleatorio en si mismo — lo que varia
 * entre partidas es el ORDEN en que se reparten, via IRandomProvider.shuffle().
 */
export const CASE_VALUES: readonly number[] = [
  1, 5, 10, 25, 50,
  100, 250, 500, 750, 1000,
  5000, 10000, 25000
] as const;

/**
 * El valor más alto del mazo activo. Derivado de CASE_VALUES en vez de
 * hardcodear "25000" en cada lugar que lo necesita (OpenCardUseCase,
 * futuros efectos) — si algún día los mazos temáticos tuvieran tablas de
 * valores propias en vez de compartir esta única, este sería el punto a
 * generalizar (ej. `getTopCaseValueForDeck(deckId)`), sin tocar a los
 * consumidores.
 */
export const TOP_CASE_VALUE: number = Math.max(...CASE_VALUES);

if (CASE_VALUES.length !== 13) {
  throw new Error('CASE_VALUES must contain exactly 13 values (12 board + 1 secret)');
}