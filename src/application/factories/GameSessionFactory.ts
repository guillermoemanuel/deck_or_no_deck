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
export function createGameSessionWithSelection(
  values: number[],
  secretIndex: number,
  offerRandom: () => number
): GameSession {
  const secretValue = values[secretIndex];
  const secretCard = Card.create(`card_${secretIndex}`, secretValue, true);

  const boardCards: Card[] = [];
  values.forEach((v, idx) => {
    if (idx !== secretIndex) {
      boardCards.push(Card.create(`card_${idx}`, v, false));
    }
  });

  // Generador de ruido de la oferta (ADR-013): lo inyecta el caller —
  // partida normal con `randomProvider.nextFloat()` (crypto), Desafío
  // Diario con la semilla del día. Nunca Math.random() en dominio.
  const banker = new Banker(new OfferCalculator(offerRandom));
  const drainRule = new DefaultEnergyDrainRule();

  return new GameSession(boardCards, secretCard, banker, drainRule);
}

export function createGameSession(randomProvider: IRandomProvider): GameSession {
  const values = randomProvider.generateBoardValues();
  return createGameSessionWithSelection(values, 12, () => randomProvider.nextFloat());
}
