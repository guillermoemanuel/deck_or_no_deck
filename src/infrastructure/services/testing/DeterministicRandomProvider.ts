import { IRandomProvider } from '../../../domain/ports/IRandomProvider';
import { CASE_VALUES } from '../../../domain/value-objects/CaseValues';

/**
 * Test double: NO baraja aleatoriamente — retorna un orden fijo y predecible
 * (o el orden explicito pasado al constructor). Nunca debe importarse desde
 * codigo de produccion.
 */
export class DeterministicRandomProvider implements IRandomProvider {
  constructor(private readonly fixedOrder?: readonly number[]) {}

  shuffle<T>(items: readonly T[]): T[] {
    return [...items].reverse();
  }

  generateBoardValues(): number[] {
    return this.fixedOrder ? [...this.fixedOrder] : this.shuffle(CASE_VALUES);
  }

  /**
   * Siempre 0.5 → ruido de oferta EXACTO 0 (ver OfferCalculator).
   * Determinista a propósito: los tests quieren montos predecibles.
   */
  nextFloat(): number {
    return 0.5;
  }
}
