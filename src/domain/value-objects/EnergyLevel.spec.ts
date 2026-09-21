import { EnergyLevel } from './EnergyLevel';

describe('EnergyLevel', () => {
  describe('full', () => {
    // BUGFIX (nivel de energía): el punto de partida ahora es 50, no 100 —
    // arrancar a mitad de la barra permite que una racha de cartas altas
    // pueda agotarla de verdad y hacer perder al jugador.
    it('starts at 50 with no bonus', () => {
      expect(EnergyLevel.full().toNumber()).toBe(50);
    });

    it('starts above 50 with a positive bonus (ej. "Tanque de Reserva")', () => {
      expect(EnergyLevel.full(10).toNumber()).toBe(60);
    });

    it('ignores a negative bonus (clamped to 0 extra)', () => {
      expect(EnergyLevel.full(-20).toNumber()).toBe(50);
    });

    it('never starts above 100, even with an unrealistically large bonus', () => {
      expect(EnergyLevel.full(500).toNumber()).toBe(100);
    });
  });

  describe('toPercentageOfBase', () => {
    it('reports 50% at the starting point, with no bonus', () => {
      expect(EnergyLevel.full().toPercentageOfBase()).toBe(50);
    });

    it('reports 100% at the true maximum', () => {
      expect(EnergyLevel.of(100).toPercentageOfBase()).toBe(100);
    });

    it('never reports more than 100%, even with a large bonus', () => {
      expect(EnergyLevel.full(50).toPercentageOfBase()).toBeLessThanOrEqual(100);
    });

    it('reports proportionally for partial energy', () => {
      const quarter = EnergyLevel.of(25);
      expect(quarter.toPercentageOfBase()).toBe(25);
    });
  });

  describe('drain', () => {
    it('reduces the raw value by the given amount', () => {
      const drained = EnergyLevel.full().drain(20);
      expect(drained.toNumber()).toBe(30);
    });

    it('does not go below 0', () => {
      const drained = EnergyLevel.full().drain(500);
      expect(drained.toNumber()).toBe(0);
    });

    it('can reduce a bonus-inflated value below the starting point', () => {
      const drained = EnergyLevel.full(10).drain(50); // 60 - 50
      expect(drained.toNumber()).toBe(10);
    });

    // BUGFIX: drain() con un monto NEGATIVO (carta protectora) ahora
    // acota tambien el TECHO en 100 — antes solo se acotaba el piso (0),
    // permitiendo un "colchon" invisible por encima de 100 que hacia mas
    // dificil perder mas adelante en la partida tras una buena racha.
    it('caps at 100 when a negative amount (energy gain) would exceed it', () => {
      const nearlyFull = EnergyLevel.of(90);
      const gained = nearlyFull.drain(-50); // gana 50, pero 90+50=140 -> tope 100
      expect(gained.toNumber()).toBe(100);
    });

    it('applies a negative amount as a real gain, below the cap', () => {
      const half = EnergyLevel.of(50);
      const gained = half.drain(-20); // gana 20
      expect(gained.toNumber()).toBe(70);
    });
  });

  describe('restore', () => {
    it('increases the raw value by the given amount', () => {
      const restored = EnergyLevel.of(50).restore(20);
      expect(restored.toNumber()).toBe(70);
    });

    it('caps at 100, even if bonus energy had exceeded it previously', () => {
      const restored = EnergyLevel.of(95).restore(50);
      expect(restored.toNumber()).toBe(100);
    });

    it('does not restore a bonus-inflated session back above 100', () => {
      const afterBonusDrained = EnergyLevel.full(10).drain(15); // 60 - 15 = 45
      const restored = afterBonusDrained.restore(200);
      expect(restored.toNumber()).toBe(100);
    });
  });

  describe('isDepleted', () => {
    it('is false when energy is above 0', () => {
      expect(EnergyLevel.of(1).isDepleted()).toBe(false);
    });

    it('is true exactly at 0', () => {
      expect(EnergyLevel.of(0).isDepleted()).toBe(true);
    });

    it('is true when drained past 0 from the starting point', () => {
      expect(EnergyLevel.full().drain(1000).isDepleted()).toBe(true);
    });
  });

  // Upgrade de partida "Tanque de Energía": sube el techo dinamicamente.
  describe('withNewCeiling ("Tanque de Energía")', () => {
    it('increases the ceiling reported by getCeiling()', () => {
      const upgraded = EnergyLevel.full().withNewCeiling(125);
      expect(upgraded.getCeiling()).toBe(125);
    });

    it('grants the capacity delta as immediate energy, keeping the percentage from dropping', () => {
      const before = EnergyLevel.full(); // 50/100 = 50%
      const upgraded = before.withNewCeiling(125); // +25 de capacidad -> 75/125

      expect(upgraded.toNumber()).toBe(75);
      expect(upgraded.toPercentageOfBase()).toBe(60); // 75/125*100 — nunca baja del 50% original
      expect(upgraded.toPercentageOfBase()).toBeGreaterThanOrEqual(before.toPercentageOfBase());
    });

    it('applies the level-2 multiplier (+50%) correctly from a fresh 100-ceiling energy', () => {
      const before = EnergyLevel.full(); // 50/100
      const upgraded = before.withNewCeiling(150); // +50 de capacidad -> 100/150

      expect(upgraded.toNumber()).toBe(100);
      expect(upgraded.getCeiling()).toBe(150);
    });

    it('still respects the new ceiling as the upper clamp for future drains/restores', () => {
      const upgraded = EnergyLevel.full().withNewCeiling(125); // 75/125
      const restored = upgraded.restore(1000);
      expect(restored.toNumber()).toBe(125);
    });

    it('throws if the new ceiling is not strictly greater than the current one', () => {
      const level = EnergyLevel.of(50);
      expect(() => level.withNewCeiling(100)).toThrow();
      expect(() => level.withNewCeiling(50)).toThrow();
    });
  });

  describe('getCeiling', () => {
    it('defaults to 100', () => {
      expect(EnergyLevel.full().getCeiling()).toBe(100);
    });
  });
});
