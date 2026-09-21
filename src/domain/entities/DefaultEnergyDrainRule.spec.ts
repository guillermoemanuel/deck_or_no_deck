import { DefaultEnergyDrainRule } from './GameSession';
import { CASE_VALUES } from '../value-objects/CaseValues';

describe('DefaultEnergyDrainRule', () => {
  describe('tabla de valores (sin multiplicador)', () => {
    const rule = new DefaultEnergyDrainRule();

    // Tabla exacta pedida: valores altos drenan, valores bajos protegen,
    // 250 y 500 son neutros. drainFor() usa la convención positivo=drena,
    // negativo=suma — por eso "aumenta 30%" en la especificación original
    // se verifica aquí como -30.
    it.each([
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
    ])('drainFor(%i) === %i', (cardValue, expectedDelta) => {
      expect(rule.drainFor(cardValue)).toBe(expectedDelta);
    });

    it('covers every value in CASE_VALUES — ninguno queda sin definir', () => {
      for (const value of CASE_VALUES) {
        expect(() => rule.drainFor(value)).not.toThrow();
      }
    });

    it('throws for a value that is not part of CASE_VALUES (falla rápido, no en silencio)', () => {
      expect(() => rule.drainFor(999)).toThrow();
    });
  });

  describe('drainMultiplier ("Blindaje de Energía")', () => {
    it('reduces the drain of a HIGH (dangerous) value proportionally', () => {
      const baseRule = new DefaultEnergyDrainRule(1);
      const shieldedRule = new DefaultEnergyDrainRule(0.85); // nivel 1 de la mejora

      expect(shieldedRule.drainFor(25000)).toBeCloseTo(baseRule.drainFor(25000) * 0.85, 5);
      expect(shieldedRule.drainFor(10000)).toBeCloseTo(baseRule.drainFor(10000) * 0.85, 5);
    });

    it('does NOT reduce the protection of a LOW (beneficial) value', () => {
      // BUGFIX: el multiplicador solo debe atenuar el DAÑO de las cartas
      // altas — nunca debe reducir el beneficio de las cartas bajas, o
      // "Blindaje de Energía" perjudicaría paradójicamente a la mejor
      // racha posible del jugador.
      const baseRule = new DefaultEnergyDrainRule(1);
      const shieldedRule = new DefaultEnergyDrainRule(0.5); // multiplicador agresivo, a proposito

      expect(shieldedRule.drainFor(1)).toBe(baseRule.drainFor(1));
      expect(shieldedRule.drainFor(5)).toBe(baseRule.drainFor(5));
    });

    it('leaves neutral values (250, 500) unaffected regardless of multiplier', () => {
      const shieldedRule = new DefaultEnergyDrainRule(0.5);
      expect(shieldedRule.drainFor(250)).toBe(0);
      expect(shieldedRule.drainFor(500)).toBe(0);
    });
  });

  describe('never produces NaN or Infinity', () => {
    it('for every value in CASE_VALUES, with and without multiplier', () => {
      const rule = new DefaultEnergyDrainRule(0.85);
      for (const value of CASE_VALUES) {
        expect(Number.isFinite(rule.drainFor(value))).toBe(true);
      }
    });
  });
});
