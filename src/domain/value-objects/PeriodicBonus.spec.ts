import {
  computePeriodicBonusStatus,
  freshPeriodicBonusCycleStart,
  PERIODIC_BONUS_COOLDOWN_MS,
  PERIODIC_BONUS_EXPIRY_WINDOW_MS,
  PERIODIC_BONUS_VALUES
} from './PeriodicBonus';

describe('PeriodicBonus', () => {
  describe('computePeriodicBonusStatus', () => {
    const cycleStart = 1_000_000;

    it('is "locked" right at cycleStart', () => {
      const status = computePeriodicBonusStatus(cycleStart, cycleStart);
      expect(status.state).toBe('locked');
    });

    it('is "locked" one millisecond before the 12h cooldown ends', () => {
      const now = cycleStart + PERIODIC_BONUS_COOLDOWN_MS - 1;
      expect(computePeriodicBonusStatus(cycleStart, now).state).toBe('locked');
    });

    it('becomes "available" exactly at the 12h mark', () => {
      const now = cycleStart + PERIODIC_BONUS_COOLDOWN_MS;
      expect(computePeriodicBonusStatus(cycleStart, now).state).toBe('available');
    });

    it('stays "available" right up to (but not including) the 24h expiry window', () => {
      const now = cycleStart + PERIODIC_BONUS_COOLDOWN_MS + PERIODIC_BONUS_EXPIRY_WINDOW_MS - 1;
      expect(computePeriodicBonusStatus(cycleStart, now).state).toBe('available');
    });

    it('becomes "expired" exactly when the 24h claim window elapses', () => {
      const now = cycleStart + PERIODIC_BONUS_COOLDOWN_MS + PERIODIC_BONUS_EXPIRY_WINDOW_MS;
      expect(computePeriodicBonusStatus(cycleStart, now).state).toBe('expired');
    });

    it('remains "expired" well beyond the window (does not silently become available again)', () => {
      const now = cycleStart + PERIODIC_BONUS_COOLDOWN_MS + PERIODIC_BONUS_EXPIRY_WINDOW_MS + 10_000_000;
      expect(computePeriodicBonusStatus(cycleStart, now).state).toBe('expired');
    });

    it('reports the correct availableAt/expiresAt timestamps', () => {
      const status = computePeriodicBonusStatus(cycleStart, cycleStart);
      expect(status.availableAt).toBe(cycleStart + PERIODIC_BONUS_COOLDOWN_MS);
      expect(status.expiresAt).toBe(cycleStart + PERIODIC_BONUS_COOLDOWN_MS + PERIODIC_BONUS_EXPIRY_WINDOW_MS);
    });
  });

  describe('freshPeriodicBonusCycleStart', () => {
    it('produces a cycleStart that is immediately "available"', () => {
      const now = 5_000_000;
      const cycleStart = freshPeriodicBonusCycleStart(now);
      expect(computePeriodicBonusStatus(cycleStart, now).state).toBe('available');
    });

    it('gives the full 24h claim window from "now", not less', () => {
      const now = 5_000_000;
      const cycleStart = freshPeriodicBonusCycleStart(now);
      const status = computePeriodicBonusStatus(cycleStart, now);
      expect(status.expiresAt - now).toBe(PERIODIC_BONUS_EXPIRY_WINDOW_MS);
    });
  });

  describe('PERIODIC_BONUS_VALUES', () => {
    it('has exactly 6 values, one per card', () => {
      expect(PERIODIC_BONUS_VALUES).toHaveLength(6);
    });

    it('matches the agreed value range', () => {
      expect([...PERIODIC_BONUS_VALUES].sort((a, b) => a - b)).toEqual([0, 1000, 2000, 3000, 4000, 5000]);
    });
  });
});
