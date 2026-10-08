import { Banker } from './Banker';
import { OfferCalculator } from './OfferCalculator';
import { Card } from '../entities/Card';

describe('Banker', () => {
  describe('shouldMakeOffer', () => {
    const banker = new Banker(new OfferCalculator(() => 0.5));

    it('returns false at 0 cards opened', () => {
      expect(banker.shouldMakeOffer(0)).toBe(false);
    });

    it('returns false at 1 and 2 cards opened', () => {
      expect(banker.shouldMakeOffer(1)).toBe(false);
      expect(banker.shouldMakeOffer(2)).toBe(false);
    });

    it('returns true exactly at 3 cards opened', () => {
      expect(banker.shouldMakeOffer(3)).toBe(true);
    });

    it('returns true at every multiple of 3 (6, 9, 12)', () => {
      expect(banker.shouldMakeOffer(6)).toBe(true);
      expect(banker.shouldMakeOffer(9)).toBe(true);
      expect(banker.shouldMakeOffer(12)).toBe(true);
    });

    it('returns false at non-multiples of 3 between offers', () => {
      expect(banker.shouldMakeOffer(4)).toBe(false);
      expect(banker.shouldMakeOffer(7)).toBe(false);
      expect(banker.shouldMakeOffer(10)).toBe(false);
    });
  });

  describe('makeOffer', () => {
    it('increments its internal round counter on each call', () => {
      const banker = new Banker(new OfferCalculator(() => 0.5));
      const closedCards = [Card.create('a', 100), Card.create('b', 200)];
      const firstOffer = banker.makeOffer(closedCards);
      const secondOffer = banker.makeOffer(closedCards);

      expect(firstOffer.roundNumber).toBe(1);
      expect(secondOffer.roundNumber).toBe(2);
    });

    it('includes a timestamp close to now', () => {
      const banker = new Banker(new OfferCalculator(() => 0.5));
      const before = Date.now();
      const offer = banker.makeOffer([Card.create('a', 100)]);
      const after = Date.now();

      expect(offer.timestamp).toBeGreaterThanOrEqual(before);
      expect(offer.timestamp).toBeLessThanOrEqual(after);
    });

    it('passes negotiatorBonusPercentage through to the calculator (upgrade "Negociador")', () => {
      const banker = new Banker(new OfferCalculator(() => 0.5));
      const closedCards = [Card.create('a', 100), Card.create('b', 200), Card.create('c', 300)];
      const withoutBonus = banker.makeOffer(closedCards, 0);
      const withBonus = banker.makeOffer(closedCards, 0.15);

      expect(withBonus.amount).toBeGreaterThanOrEqual(withoutBonus.amount);
    });

    it('defaults negotiatorBonusPercentage to 0 when omitted', () => {
      const bankerA = new Banker(new OfferCalculator(() => 0.5));
      const bankerB = new Banker(new OfferCalculator(() => 0.5));
      const closedCards = [Card.create('a', 100), Card.create('b', 200)];
      const omitted = bankerA.makeOffer(closedCards);
      const explicit = bankerB.makeOffer(closedCards, 0);

      expect(omitted.amount).toBe(explicit.amount);
    });
  });
});
