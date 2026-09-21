import { Card } from '../entities/Card';

/**
 * Funcion pura. No tiene estado ni efectos secundarios: facilita testing
 * unitario exhaustivo del "corazon" economico del juego.
 *
 * Regla de negocio: La oferta nunca puede superar el promedio puro del tablero
 * (boardAverage), preservando la tension deal/no deal inclusive con el bonus
 * maximo de "Negociador Maestro".
 */
export class OfferCalculator {
  private static readonly SECRET_CARD_WEIGHT = 0.5;
  private static readonly RISK_DISCOUNT_FACTOR = 0.85;

  constructor(private readonly bonusPercentage: number = 0) {
    if (bonusPercentage < 0) {
      throw new Error('bonusPercentage cannot be negative');
    }
  }

  calculate(closedCards: Card[], secretCard: Card, roundNumber: number, extraBonusPercentage = 0): number {
    if (closedCards.length === 0) {
      throw new Error('Cannot calculate offer with no closed cards remaining');
    }
    if (extraBonusPercentage < 0) {
      throw new Error('extraBonusPercentage cannot be negative');
    }

    const boardAverage = this.average(closedCards.map(c => c.value));
    const secretEstimate =
      secretCard.value * OfferCalculator.SECRET_CARD_WEIGHT +
      boardAverage * (1 - OfferCalculator.SECRET_CARD_WEIGHT);

    const blendedValue = (boardAverage + secretEstimate) / 2;
    const progressionBonus = 1 + roundNumber * 0.02;

    const baseOffer = blendedValue * OfferCalculator.RISK_DISCOUNT_FACTOR * progressionBonus;
    // Upgrade de partida "Negociador": bonus adicional inyectado por
    // GameSession en el momento de la oferta (ver Banker.makeOffer), sin
    // acoplar esta clase pura al estado de SessionUpgrades.
    const totalBonus = this.bonusPercentage + extraBonusPercentage;
    const withUpgradeBonus = baseOffer * (1 + totalBonus);

    // Capeado estricto contra el promedio puro del tablero
    const cappedOffer = Math.min(withUpgradeBonus, boardAverage);

    return Math.round(cappedOffer);
  }

  private average(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
}
