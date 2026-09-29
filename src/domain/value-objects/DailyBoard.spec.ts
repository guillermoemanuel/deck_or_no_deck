import { CASE_VALUES } from './CaseValues';
import { generateDailyBoardValues, getUtcDateKey, msUntilNextUtcDay, shiftDateKey } from './DailyBoard';

describe('generateDailyBoardValues', () => {
  it('es determinista: mismo día, mismo tablero', () => {
    expect(generateDailyBoardValues('2026-09-28')).toEqual(generateDailyBoardValues('2026-09-28'));
  });

  it('es una permutación completa de los valores del juego', () => {
    const values = generateDailyBoardValues('2026-09-28');

    expect([...values].sort((a, b) => a - b)).toEqual([...CASE_VALUES].sort((a, b) => a - b));
  });

  it('cambia de un día a otro', () => {
    const boards = new Set<string>();
    for (let day = 1; day <= 20; day++) {
      boards.add(generateDailyBoardValues(`2026-10-${String(day).padStart(2, '0')}`).join(','));
    }

    // 20 días distintos deberían dar (casi) 20 tableros distintos.
    expect(boards.size >= 19).toBe(true);
  });

  it('no muta CASE_VALUES', () => {
    const before = [...CASE_VALUES];
    generateDailyBoardValues('2026-09-28');

    expect([...CASE_VALUES]).toEqual(before);
  });

  it('mantiene un tablero de referencia fijo (detecta cambios accidentales del algoritmo o la sal)', () => {
    // Si este test falla, TODOS los tableros diarios cambiaron para todos los jugadores.
    expect(generateDailyBoardValues('2026-09-28')).toEqual([25, 250, 1000, 25000, 5, 10, 750, 100, 10000, 500, 1, 50, 5000]);
  });
});

describe('utilidades de fecha UTC', () => {
  it('getUtcDateKey usa UTC, no la zona horaria local', () => {
    expect(getUtcDateKey(Date.parse('2026-09-28T23:59:59.999Z'))).toBe('2026-09-28');
    expect(getUtcDateKey(Date.parse('2026-09-29T00:00:00.000Z'))).toBe('2026-09-29');
  });

  it('shiftDateKey cruza meses y años', () => {
    expect(shiftDateKey('2026-09-30', 1)).toBe('2026-10-01');
    expect(shiftDateKey('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftDateKey('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('msUntilNextUtcDay cuenta hasta la medianoche UTC', () => {
    expect(msUntilNextUtcDay(Date.parse('2026-09-28T23:00:00.000Z'))).toBe(60 * 60 * 1000);
    expect(msUntilNextUtcDay(Date.parse('2026-09-28T00:00:00.000Z'))).toBe(24 * 60 * 60 * 1000);
  });
});
