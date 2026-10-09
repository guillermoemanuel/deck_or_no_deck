import { SFX } from '../../shared/audio/AudioData';
import { CASE_VALUES } from '../../domain/value-objects/CaseValues';
import {
  cardSfxKeyForValue,
  heartbeatIntervalFor,
  HEARTBEAT_CRITICAL_PERCENT,
  HEARTBEAT_DANGER_PERCENT,
  HEARTBEAT_INTERVAL_MS,
  HEARTBEAT_FAST_INTERVAL_MS
} from './GameplaySfx';

describe('GameplaySfx', () => {
  describe('cardSfxKeyForValue (los 13 valores de CASE_VALUES)', () => {
    const table: Array<[number, string]> = [
      [1, SFX.CARD_LOW],
      [5, SFX.CARD_LOW],
      [10, SFX.CARD_LOW],
      [25, SFX.CARD_LOW],
      [50, SFX.CARD_LOW],
      [100, SFX.CARD_LOW],
      [250, SFX.CARD_MID],
      [500, SFX.CARD_MID],
      [750, SFX.CARD_MID],
      [1000, SFX.CARD_HIGH],
      [5000, SFX.CARD_HIGH],
      [10000, SFX.CARD_HIGH],
      [25000, SFX.CARD_JACKPOT]
    ];

    it.each(table)('cardSfxKeyForValue(%d) → %s', (value, expected) => {
      expect(cardSfxKeyForValue(value)).toBe(expected);
    });

    // Guardián contra deriva: si mañana se agrega/quita un valor en
    // CaseValues, ESTE test falla y obliga a decidir su banda de sonido —
    // la tabla de arriba quedaría desactualizada en silencio.
    it('la tabla fija cubre exactamente los valores actuales de CASE_VALUES', () => {
      const tableValues = table.map(([value]) => value).sort((a, b) => a - b);
      expect(tableValues).toEqual([...CASE_VALUES].sort((a, b) => a - b));
    });
  });

  describe('heartbeatIntervalFor', () => {
    it('26% → null (latido fuera de zona crítica)', () => {
      expect(heartbeatIntervalFor(26)).toBeNull();
    });

    it('25% → HEARTBEAT_INTERVAL_MS (900)', () => {
      expect(heartbeatIntervalFor(HEARTBEAT_CRITICAL_PERCENT)).toBe(HEARTBEAT_INTERVAL_MS);
      expect(heartbeatIntervalFor(25)).toBe(900);
    });

    it('13% → HEARTBEAT_INTERVAL_MS (900)', () => {
      expect(heartbeatIntervalFor(13)).toBe(HEARTBEAT_INTERVAL_MS);
    });

    it('12% → HEARTBEAT_FAST_INTERVAL_MS (650)', () => {
      expect(heartbeatIntervalFor(HEARTBEAT_DANGER_PERCENT)).toBe(HEARTBEAT_FAST_INTERVAL_MS);
      expect(heartbeatIntervalFor(12)).toBe(650);
    });

    it('0% → HEARTBEAT_FAST_INTERVAL_MS (650)', () => {
      expect(heartbeatIntervalFor(0)).toBe(HEARTBEAT_FAST_INTERVAL_MS);
    });
  });
});
