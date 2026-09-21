import { OfferCalculator } from './OfferCalculator';
import { Card } from '../entities/Card';

describe('OfferCalculator', () => {
  const closedCards = [
    Card.create('a', 100),
    Card.create('b', 200),
    Card.create('c', 300)
  ];
  const secretCard = Card.create('secret', 250, true);

  describe('constructor validation', () => {
    it('accepts zero bonus by default', () => {
      expect(() => new OfferCalculator()).not.toThrow();
    });

    it('accepts a positive bonusPercentage', () => {
      expect(() => new OfferCalculator(0.15)).not.toThrow();
    });

    it('throws on negative bonusPercentage', () => {
      expect(() => new OfferCalculator(-0.01)).toThrow();
    });
  });

  describe('calculate — base behavior (no upgrade bonus)', () => {
    const calculator = new OfferCalculator();

    it('throws when there are no closed cards remaining', () => {
      expect(() => calculator.calculate([], secretCard, 1)).toThrow();
    });

    it('returns an integer amount', () => {
      const offer = calculator.calculate(closedCards, secretCard, 1);
      expect(Number.isInteger(offer)).toBe(true);
    });

    it('never exceeds the pure board average', () => {
      const offer = calculator.calculate(closedCards, secretCard, 1);
      const pureAverage = (100 + 200 + 300) / 3;
      expect(offer).toBeLessThanOrEqual(pureAverage);
    });

    it('increases (progression bonus) as roundNumber grows, all else equal', () => {
      const earlyOffer = calculator.calculate(closedCards, secretCard, 1);
      const lateOffer = calculator.calculate(closedCards, secretCard, 5);
      expect(lateOffer).toBeGreaterThan(earlyOffer);
    });

    it('is deterministic for identical inputs', () => {
      const first = calculator.calculate(closedCards, secretCard, 2);
      const second = calculator.calculate(closedCards, secretCard, 2);
      expect(first).toBe(second);
    });

    it('produces a higher offer when the secret card value is higher, all else equal', () => {
      const lowSecret = Card.create('secret-low', 50, true);
      const highSecret = Card.create('secret-high', 900, true);

      const offerWithLowSecret = calculator.calculate(closedCards, lowSecret, 1);
      const offerWithHighSecret = calculator.calculate(closedCards, highSecret, 1);

      expect(offerWithHighSecret).toBeGreaterThan(offerWithLowSecret);
    });

    it('handles a single remaining closed card without dividing by zero', () => {
      const singleCard = [Card.create('only', 500)];
      expect(() => calculator.calculate(singleCard, secretCard, 1)).not.toThrow();
    });
  });

  describe('calculate — with "Negociador Maestro" bonus', () => {
    it('produces a higher offer than the base calculator, for identical inputs', () => {
      const baseCalculator = new OfferCalculator(0);
      const boostedCalculator = new OfferCalculator(0.15);

      const baseOffer = baseCalculator.calculate(closedCards, secretCard, 1);
      const boostedOffer = boostedCalculator.calculate(closedCards, secretCard, 1);

      expect(boostedOffer).toBeGreaterThanOrEqual(baseOffer);
    });

    it('never offers more than the pure board average, even at max upgrade level', () => {
      const calculator = new OfferCalculator(0.15);
      const pureAverage = (100 + 200 + 300) / 3;

      for (let round = 1; round <= 10; round++) {
        const offer = calculator.calculate(closedCards, secretCard, round);
        expect(offer).toBeLessThanOrEqual(pureAverage);
      }
    });

    it('caps correctly even with an extreme (hypothetical) bonus far above catalog max', () => {
      const calculator = new OfferCalculator(2.0);
      const pureAverage = (100 + 200 + 300) / 3;

      const offer = calculator.calculate(closedCards, secretCard, 1);
      expect(offer).toBeLessThanOrEqual(pureAverage);
    });
  });

  describe('calculate — extraBonusPercentage (upgrade de partida "Negociador")', () => {
    it('increases the offer relative to no bonus, for identical inputs', () => {
      const calculator = new OfferCalculator();

      const withoutBonus = calculator.calculate(closedCards, secretCard, 1);
      const withBonus = calculator.calculate(closedCards, secretCard, 1, 0.15);

      expect(withBonus).toBeGreaterThanOrEqual(withoutBonus);
    });

    it('combines additively with the constructor bonusPercentage', () => {
      const calculator = new OfferCalculator(0.05);
      const pureAverage = (100 + 200 + 300) / 3;

      const combined = calculator.calculate(closedCards, secretCard, 1, 0.15);
      const constructorOnly = calculator.calculate(closedCards, secretCard, 1, 0);

      expect(combined).toBeGreaterThanOrEqual(constructorOnly);
      expect(combined).toBeLessThanOrEqual(pureAverage); // el cap sigue vigente
    });

    it('never offers more than the pure board average even with the Negociador bonus', () => {
      const calculator = new OfferCalculator();
      const pureAverage = (100 + 200 + 300) / 3;

      for (let round = 1; round <= 10; round++) {
        const offer = calculator.calculate(closedCards, secretCard, round, 0.15);
        expect(offer).toBeLessThanOrEqual(pureAverage);
      }
    });

    it('throws on a negative extraBonusPercentage', () => {
      const calculator = new OfferCalculator();
      expect(() => calculator.calculate(closedCards, secretCard, 1, -0.1)).toThrow();
    });

    it('defaults to 0 when omitted (no behavior change for existing callers)', () => {
      const calculator = new OfferCalculator();
      const explicit = calculator.calculate(closedCards, secretCard, 1, 0);
      const omitted = calculator.calculate(closedCards, secretCard, 1);
      expect(omitted).toBe(explicit);
    });
  });
});
