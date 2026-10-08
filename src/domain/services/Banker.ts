import { Card } from '../entities/Card';
import { OfferCalculator } from './OfferCalculator';

export interface BankerOffer {
  readonly amount: number;
  readonly roundNumber: number;
  readonly timestamp: number;
}

/**
 * SRP estricto: el Banker SOLO decide cuando y cuanto ofrecer.
 * No sabe nada de UI, animaciones ni de como se presenta la oferta.
 */
export class Banker {
  private static readonly OFFER_INTERVAL = 3;
  private offersGiven = 0;

  constructor(private readonly calculator: OfferCalculator) {}

  shouldMakeOffer(cardsOpenedCount: number): boolean {
    return cardsOpenedCount > 0 && cardsOpenedCount % Banker.OFFER_INTERVAL === 0;
  }

  /**
   * Cuántas cartas faltan por abrir para la PRÓXIMA oferta, a partir de
   * `cardsOpenedCount` actual. 
   */
  cardsUntilNextOffer(cardsOpenedCount: number, totalBoardCards: number): number  {
    const remaining = Banker.OFFER_INTERVAL - (cardsOpenedCount % Banker.OFFER_INTERVAL);
    const nextCheckpoint = cardsOpenedCount + remaining;
 
    if (nextCheckpoint >= totalBoardCards) {
      return 0;
    }
    return remaining;
  }

  /**
   * Genera la oferta de la PRÓXIMA ronda (contador interno). La carta
   * secreta ya no se pasa: el cálculo es solo sobre las cartas cerradas
   * del tablero (ADR-013); el ruido lo aporta el generador inyectado en
   * el OfferCalculator.
   */
  makeOffer(closedCards: Card[], negotiatorBonusPercentage = 0): BankerOffer {
    this.offersGiven += 1;
    return {
      amount: this.calculator.calculate(closedCards, this.offersGiven, negotiatorBonusPercentage),
      roundNumber: this.offersGiven,
      timestamp: Date.now()
    };
  }
}
