import { CASE_VALUES } from './CaseValues';

/**
 * Tablero del Desafío Diario: todos los jugadores del mundo reciben el MISMO
 * orden de valores en un mismo día (UTC). Es puro y determinista — depende
 * solo de la fecha — para poder testearlo y para que dos navegadores distintos
 * generen exactamente el mismo tablero.
 */

/** Cambiar esta sal cambia TODOS los tableros diarios (útil si alguna vez se quiere "reiniciar" el calendario). */
const DAILY_SEED_SALT = 'deck-or-no-deck:daily:v1';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Clave de día en UTC con formato `YYYY-MM-DD`. */
export function getUtcDateKey(nowMs: number): string {
  return new Date(nowMs).toISOString().slice(0, 10);
}

/** Suma (o resta) días enteros a una clave `YYYY-MM-DD`. */
export function shiftDateKey(dateKey: string, days: number): string {
  const base = Date.parse(`${dateKey}T00:00:00.000Z`);
  return getUtcDateKey(base + days * MS_PER_DAY);
}

/** Milisegundos que faltan para que empiece el próximo día UTC (siempre > 0). */
export function msUntilNextUtcDay(nowMs: number): number {
  const startOfToday = Date.parse(`${getUtcDateKey(nowMs)}T00:00:00.000Z`);
  return startOfToday + MS_PER_DAY - nowMs;
}

/** Hash FNV-1a de 32 bits: barato y estable entre navegadores. */
function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** PRNG mulberry32: devuelve floats en [0, 1). Determinista dada la semilla. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Los 13 valores de la partida, en el orden fijo del día indicado. */
export function generateDailyBoardValues(dateKey: string): number[] {
  const random = createSeededRandom(hashString(`${DAILY_SEED_SALT}:${dateKey}`));
  const values = [...CASE_VALUES];
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}
