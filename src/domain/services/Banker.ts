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

  makeOffer(closedCards: Card[], secretCard: Card, negotiatorBonusPercentage = 0): BankerOffer {
    this.offersGiven += 1;
    return {
      amount: this.calculator.calculate(closedCards, secretCard, this.offersGiven, negotiatorBonusPercentage),
      roundNumber: this.offersGiven,
      timestamp: Date.now()
    };
  }
}
