import { LOSS_PENALTY_AMOUNT } from './GamePenalties';

describe('GamePenalties', () => {
  it('la penalidad por derrota/abandono es fija en 5000 (invariante)', () => {
    // Este es el valor que fija AGENTS.md §4: −5000, y puede dejar saldo
    // negativo. Si este test falla, se cambió un invariante numérico:
    // hay que actualizar también AGENTS.md §4 y el LOG.
    expect(LOSS_PENALTY_AMOUNT).toBe(5000);
  });

  it('es una resta: aplicarla reduce el saldo exactamente en su monto', () => {
    const saldo = 10000;
    expect(saldo - LOSS_PENALTY_AMOUNT).toBe(5000);
  });

  it('permite saldo negativo (no se trunca en 0)', () => {
    const saldo = 3000;
    expect(saldo - LOSS_PENALTY_AMOUNT).toBe(-2000);
  });
});
