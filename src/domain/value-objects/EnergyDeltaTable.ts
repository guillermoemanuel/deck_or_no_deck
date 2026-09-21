import { CASE_VALUES } from './CaseValues';

/**
 * Tabla de impacto en la barra de energía para cada uno de los 13 valores
 * posibles del mazo. Reemplaza la fórmula anterior (normalizada contra el
 * valor máximo del tablero), que en la práctica dejaba casi todos los
 * valores dentro del rango "protector" — con eso, la energía casi nunca
 * bajaba y el jugador prácticamente no podía perder por agotamiento.
 *
 * Convención:
 *   - Positivo = DRENA esa cantidad de puntos (carta "peligrosa").
 *   - Negativo = SUMA esa cantidad de puntos (carta "protectora").
 *   - Cero     = neutro.
 *
 * Los puntos son absolutos sobre una escala de 0 a 100 (ver EnergyLevel),
 * que ahora arranca en 50 — así una racha de cartas altas puede agotarla
 * y una racha de cartas bajas puede llevarla al tope, dándole sentido real
 * a mejoras de tienda como "Blindaje de Energía" o "Tanque de Reserva".
 */
export const ENERGY_DELTA_BY_VALUE: ReadonlyMap<number, number> = new Map([
  [25000, 40],
  [10000, 30],
  [5000, 20],
  [1000, 10],
  [750, 5],
  [500, 0],
  [250, 0],
  [100, -5],
  [50, -10],
  [25, -5],
  [10, -20],
  [5, -25],
  [1, -30]
]);

// Verificación de integridad en tiempo de carga: la tabla debe cubrir
// EXACTAMENTE los 13 valores de CASE_VALUES, ni más ni menos. Si alguna
// vez se cambia el mazo (CASE_VALUES) sin actualizar esta tabla — o
// viceversa — el juego falla rápido y ruidosamente en vez de drenar mal
// la energía en silencio, como pasaba con el bug original.
if (ENERGY_DELTA_BY_VALUE.size !== CASE_VALUES.length) {
  throw new Error(
    `ENERGY_DELTA_BY_VALUE debe tener exactamente ${CASE_VALUES.length} entradas (una por cada CASE_VALUES), tiene ${ENERGY_DELTA_BY_VALUE.size}`
  );
}
for (const value of CASE_VALUES) {
  if (!ENERGY_DELTA_BY_VALUE.has(value)) {
    throw new Error(`ENERGY_DELTA_BY_VALUE no define una entrada para el valor ${value} de CASE_VALUES`);
  }
}

/**
 * Resuelve el delta de energía para un valor de carta. Lanza si el valor
 * no pertenece a CASE_VALUES — un valor "desconocido" siempre es un error
 * de programación (todas las cartas del juego se generan a partir de
 * CASE_VALUES), nunca un caso válido a tolerar en silencio.
 */
export function getEnergyDeltaForValue(cardValue: number): number {
  const delta = ENERGY_DELTA_BY_VALUE.get(cardValue);
  if (delta === undefined) {
    throw new Error(`No hay un delta de energía definido para el valor de carta ${cardValue} — se esperaba uno de CASE_VALUES`);
  }
  return delta;
}
