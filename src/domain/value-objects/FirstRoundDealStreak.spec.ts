import { FirstRoundDealStreak } from './FirstRoundDealStreak';
import { CAPPED_GAMES_DURATION, CAPPED_OFFER_VALUES, FIRST_ROUND_STREAK_TRIGGER } from './BankerPolicy';

describe('FirstRoundDealStreak', () => {
  describe('invariantes del constructor', () => {
    it('starts inactive with both counters at zero', () => {
      const streak = new FirstRoundDealStreak(0, 0);
      expect(streak.isActive).toBe(false);
    });

    it('rejects negative counters', () => {
      expect(() => new FirstRoundDealStreak(-1, 0)).toThrow();
      expect(() => new FirstRoundDealStreak(0, -1)).toThrow();
    });

    it('rejects non-integer counters', () => {
      expect(() => new FirstRoundDealStreak(1.5, 0)).toThrow();
      expect(() => new FirstRoundDealStreak(0, 2.7)).toThrow();
    });

    it('rejects consecutive deals beyond the trigger (4 se activa y resetea, nunca se persiste)', () => {
      expect(() => new FirstRoundDealStreak(FIRST_ROUND_STREAK_TRIGGER, 0)).toThrow();
    });

    it('rejects capped games remaining beyond the duration', () => {
      expect(() => new FirstRoundDealStreak(0, CAPPED_GAMES_DURATION + 1)).toThrow();
    });
  });

  describe('restore (carga persistida)', () => {
    it('round-trips valid values', () => {
      const streak = FirstRoundDealStreak.restore(3, 2);
      expect(streak.consecutiveFirstRoundDeals).toBe(3);
      expect(streak.cappedGamesRemaining).toBe(2);
    });

    it('backfills an old save without the fields with zeros', () => {
      const streak = FirstRoundDealStreak.restore(undefined, undefined);
      expect(streak.consecutiveFirstRoundDeals).toBe(0);
      expect(streak.cappedGamesRemaining).toBe(0);
      expect(streak.isActive).toBe(false);
    });

    it('sanitizes out-of-range values to zero', () => {
      expect(FirstRoundDealStreak.restore(9, 0).consecutiveFirstRoundDeals).toBe(0);
      expect(FirstRoundDealStreak.restore(0, 99).cappedGamesRemaining).toBe(0);
      expect(FirstRoundDealStreak.restore(-3, -1).consecutiveFirstRoundDeals).toBe(0);
      expect(FirstRoundDealStreak.restore(-3, -1).cappedGamesRemaining).toBe(0);
    });

    it('sanitizes non-integer or non-numeric values to zero', () => {
      expect(FirstRoundDealStreak.restore('2', 1).consecutiveFirstRoundDeals).toBe(0);
      expect(FirstRoundDealStreak.restore(1, null).cappedGamesRemaining).toBe(0);
      expect(FirstRoundDealStreak.restore(1.5, 2.5).consecutiveFirstRoundDeals).toBe(0);
      expect(FirstRoundDealStreak.restore(1.5, 2.5).cappedGamesRemaining).toBe(0);
    });
  });

  describe('regla 1 — activación tras 4 tratos de 1ª ronda seguidos', () => {
    it('increments the streak on a first-round deal while inactive', () => {
      const streak = new FirstRoundDealStreak(0, 0).withGameEnd({
        firstRoundDealAccepted: true,
        rejectedRound1Offer: false
      });
      expect(streak.consecutiveFirstRoundDeals).toBe(1);
      expect(streak.isActive).toBe(false);
    });

    it('activates exactly on the 4th consecutive first-round deal', () => {
      let streak = new FirstRoundDealStreak(0, 0);
      for (let i = 0; i < FIRST_ROUND_STREAK_TRIGGER - 1; i++) {
        streak = streak.withGameEnd({ firstRoundDealAccepted: true, rejectedRound1Offer: false });
      }
      expect(streak.isActive).toBe(false);
      expect(streak.consecutiveFirstRoundDeals).toBe(FIRST_ROUND_STREAK_TRIGGER - 1);

      streak = streak.withGameEnd({ firstRoundDealAccepted: true, rejectedRound1Offer: false });
      expect(streak.isActive).toBe(true);
      expect(streak.cappedGamesRemaining).toBe(CAPPED_GAMES_DURATION);
      expect(streak.consecutiveFirstRoundDeals).toBe(0);
    });
  });

  describe('regla 2 — reinicio sin trato de 1ª ronda', () => {
    it('resets the streak when a game does not end in a first-round deal', () => {
      const streak = new FirstRoundDealStreak(2, 0).withGameEnd({
        firstRoundDealAccepted: false,
        rejectedRound1Offer: true
      });
      expect(streak.consecutiveFirstRoundDeals).toBe(0);
      expect(streak.isActive).toBe(false);
    });

    it('resets the streak when the player lost before the first offer', () => {
      const streak = new FirstRoundDealStreak(3, 0).withGameEnd({
        firstRoundDealAccepted: false,
        rejectedRound1Offer: false
      });
      expect(streak.consecutiveFirstRoundDeals).toBe(0);
    });
  });

  describe('regla 4 — cuenta regresiva solo al rechazar la oferta topada', () => {
    it('decrements remaining games when the capped first-round offer was rejected', () => {
      const streak = new FirstRoundDealStreak(0, 5).withGameEnd({
        firstRoundDealAccepted: false,
        rejectedRound1Offer: true
      });
      expect(streak.cappedGamesRemaining).toBe(4);
      expect(streak.isActive).toBe(true);
    });

    it('does NOT decrement when the capped offer was accepted', () => {
      const streak = new FirstRoundDealStreak(0, 5).withGameEnd({
        firstRoundDealAccepted: true,
        rejectedRound1Offer: false
      });
      expect(streak.cappedGamesRemaining).toBe(5);
    });

    it('does NOT decrement when the player lost before the first offer', () => {
      const streak = new FirstRoundDealStreak(0, 5).withGameEnd({
        firstRoundDealAccepted: false,
        rejectedRound1Offer: false
      });
      expect(streak.cappedGamesRemaining).toBe(5);
    });

    it('does not accumulate streak while the rule is active', () => {
      const streak = new FirstRoundDealStreak(0, 3).withGameEnd({
        firstRoundDealAccepted: true,
        rejectedRound1Offer: false
      });
      expect(streak.consecutiveFirstRoundDeals).toBe(0);
    });

    it('deactivates when the countdown reaches zero', () => {
      const streak = new FirstRoundDealStreak(0, 1).withGameEnd({
        firstRoundDealAccepted: false,
        rejectedRound1Offer: true
      });
      expect(streak.cappedGamesRemaining).toBe(0);
      expect(streak.isActive).toBe(false);
    });
  });

  describe('sorteo del tope', () => {
    it('draws only values from CAPPED_OFFER_VALUES', () => {
      for (let sample = 0; sample < 1000; sample++) {
        const u = (sample + 0.5) / 1000;
        const cap = FirstRoundDealStreak.drawCappedOfferValue(u);
        expect(CAPPED_OFFER_VALUES).toContain(cap);
      }
    });

    it('maps every band of the [0,1) sample uniformly onto the four values', () => {
      expect(FirstRoundDealStreak.drawCappedOfferValue(0)).toBe(CAPPED_OFFER_VALUES[0]);
      expect(FirstRoundDealStreak.drawCappedOfferValue(0.24)).toBe(CAPPED_OFFER_VALUES[0]);
      expect(FirstRoundDealStreak.drawCappedOfferValue(0.25)).toBe(CAPPED_OFFER_VALUES[1]);
      expect(FirstRoundDealStreak.drawCappedOfferValue(0.5)).toBe(CAPPED_OFFER_VALUES[2]);
      expect(FirstRoundDealStreak.drawCappedOfferValue(0.75)).toBe(CAPPED_OFFER_VALUES[3]);
      expect(FirstRoundDealStreak.drawCappedOfferValue(0.999)).toBe(CAPPED_OFFER_VALUES[3]);
    });
  });
});
