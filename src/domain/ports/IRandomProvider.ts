/**
 * Puerto de aleatoriedad. El dominio depende de esta abstraccion, nunca
 * de Math.random() ni de window.crypto directamente — permite:
 *   1. Tests deterministas (inyectando un fake que retorna un orden fijo).
 *   2. Cambiar la fuente de aleatoriedad sin tocar domain/ ni application/.
 */
export interface IRandomProvider {
  /**
   * Baraja un array sin mutar el original. Debe ser una permutacion
   * uniforme (cada orden posible con igual probabilidad).
   */
  shuffle<T>(items: readonly T[]): T[];

  /**
   * Conveniencia: retorna los 13 valores del mazo ya barajados,
   * listos para repartir (12 tablero + 1 secreta).
   */
  generateBoardValues(): number[];

  /**
   * Muestra uniforme en [0, 1) — la usa OfferCalculator para el ruido de
   * la oferta del Banquero (ADR-013). Nunca Math.random() en dominio.
   */
  nextFloat(): number;
}
