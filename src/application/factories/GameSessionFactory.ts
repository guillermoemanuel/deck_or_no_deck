import { GameSession, DefaultEnergyDrainRule } from '../../domain/entities/GameSession';
import { Banker } from '../../domain/services/Banker';
import { OfferCalculator } from '../../domain/services/OfferCalculator';
import { Card } from '../../domain/entities/Card';
import { IRandomProvider } from '../../domain/ports/IRandomProvider';

/**
 * Ya NO recibe IProgressionService: los upgrades persistentes que antes
 * modificaban la sesión al crearla (energy_shield, master_negotiator,
 * reserve_tank) quedaron retirados — toda mejora ahora es un consumible
 * de PARTIDA ÚNICA, comprado y aplicado DURANTE la partida ya en curso
 * (ver PurchaseSessionUpgradeUseCase), nunca antes de que exista.
 * Una partida siempre arranca "limpia", sin modificadores.
 */
export function createGameSessionWithSelection(values: number[], secretIndex: number): GameSession {
  const secretValue = values[secretIndex];
  const secretCard = Card.create(`card_${secretIndex}`, secretValue, true);

  const boardCards: Card[] = [];
  values.forEach((v, idx) => {
    if (idx !== secretIndex) {
      boardCards.push(Card.create(`card_${idx}`, v, false));
    }
  });

  const banker = new Banker(new OfferCalculator());
  const drainRule = new DefaultEnergyDrainRule();

  return new GameSession(boardCards, secretCard, banker, drainRule);
}

export function createGameSession(randomProvider: IRandomProvider): GameSession {
  const values = randomProvider.generateBoardValues();
  return createGameSessionWithSelection(values, 12);
}
