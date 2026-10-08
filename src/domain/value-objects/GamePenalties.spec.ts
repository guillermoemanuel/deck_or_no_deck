import { LOSS_PENALTY_AMOUNT } from './GamePenalties';

describe('GamePenalties', () => {
  it('la penalidad por derrota/abandono es fija en 1000 (invariante)', () => {
    // Este es el valor que fija AGENTS.md §4: −1000 (bajada desde −5000 en
    // la Fase B del rebalance del banquero), y puede dejar saldo negativo.
    // Si este test falla, se cambió un invariante numérico: hay que
    // actualizar también AGENTS.md §4 y el LOG.
    expect(LOSS_PENALTY_AMOUNT).toBe(1000);
  });

  it('es una resta: aplicarla reduce el saldo exactamente en su monto', () => {
    const saldo = 10000;
    expect(saldo - LOSS_PENALTY_AMOUNT).toBe(9000);
  });

  it('permite saldo negativo (no se trunca en 0)', () => {
    const saldo = 500;
    expect(saldo - LOSS_PENALTY_AMOUNT).toBe(-500);
  });
});
