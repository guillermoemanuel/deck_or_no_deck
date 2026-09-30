import { CASE_VALUES, HIGH_CASE_VALUE_MIN, TOP_CASE_VALUE, isHighCaseValue } from './CaseValues';

describe('CaseValues', () => {
  describe('isHighCaseValue', () => {
    it('considera alta a partir del valor frontera inclusive', () => {
      expect(isHighCaseValue(999)).toBe(false);
      expect(isHighCaseValue(1000)).toBe(true);
    });

    it('filtra exactamente las cartas altas del mazo', () => {
      expect(CASE_VALUES.filter(isHighCaseValue)).toEqual([1000, 5000, 10000, 25000]);
    });

    it('el umbral es un valor real del mazo, no un numero inventado', () => {
      expect(CASE_VALUES).toContain(HIGH_CASE_VALUE_MIN);
    });

    it('el valor más alto del mazo sí es alta, el más bajo no', () => {
      expect(isHighCaseValue(TOP_CASE_VALUE)).toBe(true);
      expect(isHighCaseValue(Math.min(...CASE_VALUES))).toBe(false);
    });
  });
});
