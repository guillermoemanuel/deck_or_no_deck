import { OfferCalculator } from './OfferCalculator';
import { Card } from '../entities/Card';

describe('OfferCalculator', () => {
  // promedio de estas 3 cartas cerradas = 200 (la carta secreta ya no
  // participa del cálculo — ver ADR-013).
  const closedCards = [
    Card.create('a', 100),
    Card.create('b', 200),
    Card.create('c', 300)
  ];
  const AVERAGE = 200;

  describe('constructor — generador inyectado (sin Math.random en dominio)', () => {
    it('throws when there are no closed cards remaining', () => {
      const calculator = new OfferCalculator(() => 0.5);
      expect(() => calculator.calculate([], 1)).toThrow();
    });

    it('throws when the generator returns a value outside [0,1)', () => {
      // Un generador fuera de rango rompe el ruido de ±OFFER_NOISE y con él
      // los topes de la política: se trata como error de programación.
      expect(() => new OfferCalculator(() => 1).calculate(closedCards, 1)).toThrow();
      expect(() => new OfferCalculator(() => 1.5).calculate(closedCards, 1)).toThrow();
      expect(() => new OfferCalculator(() => -0.01).calculate(closedCards, 1)).toThrow();
    });
  });

  describe('calculate — fórmula de la política (BankerPolicy.ts)', () => {
    // u = 0.5 → ruido exacto 0 → oferta = promedio × factor
    const noiseless = () => 0.5;

    it('returns an integer amount', () => {
      const calculator = new OfferCalculator(noiseless);
      expect(Number.isInteger(calculator.calculate(closedCards, 1))).toBe(true);
    });

    it('throws on a negative negotiator bonus', () => {
      const calculator = new OfferCalculator(noiseless);
      expect(() => calculator.calculate(closedCards, 1, -0.01)).toThrow();
    });

    it('applies the per-round factor: ronda 1 ×0.75, ronda 2 ×0.85, ronda 3 ×0.95', () => {
      const calculator = new OfferCalculator(noiseless);
      expect(calculator.calculate(closedCards, 1)).toBe(150); // 200 × 0.75
      expect(calculator.calculate(closedCards, 2)).toBe(170); // 200 × 0.85
      expect(calculator.calculate(closedCards, 3)).toBe(190); // 200 × 0.95
    });

    it('uses the LAST factor for rounds beyond the table (rondas > 3)', () => {
      const calculator = new OfferCalculator(noiseless);
      expect(calculator.calculate(closedCards, 4)).toBe(190); // ×0.95
      expect(calculator.calculate(closedCards, 99)).toBe(190);
    });

    it('consumes EXACTLY one generator sample per offer', () => {
      const generator = jest.fn(() => 0.5);
      const calculator = new OfferCalculator(generator);

      calculator.calculate(closedCards, 1);
      calculator.calculate(closedCards, 2);

      expect(generator).toHaveBeenCalledTimes(2); // uno por oferta, ni más ni menos
    });

    it('maps u=0 to −20 % of noise (borde inferior del ruido)', () => {
      const calculator = new OfferCalculator(() => 0);
      // 200 × 0.75 × 0.8 = 120
      expect(calculator.calculate(closedCards, 1)).toBe(120);
    });

    it('maps u→1 to +20 % of noise (borde superior del ruido)', () => {
      const calculator = new OfferCalculator(() => 0.999999999);
      // 200 × 0.75 × 1.2 = 180 (el redondeo llega al techo del ruido)
      expect(calculator.calculate(closedCards, 1)).toBe(180);
    });

    it('applies the Negociador +15 % BEFORE the clamp', () => {
      const calculator = new OfferCalculator(noiseless);
      const base = calculator.calculate(closedCards, 1); // 150
      const withBonus = calculator.calculate(closedCards, 1, 0.15); // 200 × 0.75 × 1.15 = 172.5 → 173

      expect(withBonus).toBe(173);
      expect(withBonus).toBeGreaterThan(base);
    });

    it('caps the offer at 1.2 × average when the bonus would exceed it', () => {
      const calculator = new OfferCalculator(() => 0.999999999);
      // 200 × 0.95 × 1.2 × 1.15 = 263.4 → tope 1.2 × 200 = 240
      expect(calculator.calculate(closedCards, 3, 0.15)).toBe(240);
    });

    it('keeps every offer inside [0.5 × average, 1.2 × average] for any sample, round and bonus', () => {
      for (const u of [0, 0.1, 0.25, 0.5, 0.75, 0.9, 0.999999999]) {
        for (const round of [1, 2, 3, 4]) {
          for (const bonus of [0, 0.15]) {
            const offer = new OfferCalculator(() => u).calculate(closedCards, round, bonus);
            expect(offer).toBeGreaterThanOrEqual(0.5 * AVERAGE);
            expect(offer).toBeLessThanOrEqual(1.2 * AVERAGE);
          }
        }
      }
    });

    it('is independent of any secret card (la secreta salió de la fórmula)', () => {
      // Misma entrada → misma salida, sin ningún parámetro de carta secreta
      // en la firma: el promedio es SOLO de las cartas cerradas del tablero.
      const a = new OfferCalculator(noiseless).calculate(closedCards, 2);
      const b = new OfferCalculator(noiseless).calculate(
        [Card.create('a', 100), Card.create('b', 200), Card.create('c', 300)],
        2
      );
      expect(a).toBe(b);
      expect(a).toBe(170);
    });
  });
});
