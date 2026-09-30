import { BankerOffer } from '../services/Banker';
import { Card } from '../entities/Card';

/**
 * Eventos de dominio: hechos que YA ocurrieron (verbo en pasado).
 * La capa de presentacion se suscribe a estos para animar/reaccionar,
 * pero el dominio nunca sabe quien los escucha.
 */
export type GameEvent =
  | { type: 'SecretCardChosen'; secretCard: Card }
  | {
    type: 'CardOpened';
    card: Card;
    energyRemaining: number;
    /** Contador de turnos (REQ transparencia de mecánicas): cartas que faltan abrir para la próxima oferta del Banquero. */
    cardsUntilNextOffer: number;
  }
  | { type: 'EnergyDepleted' }
  | { type: 'BankerOfferMade'; offer: BankerOffer }
  | { type: 'DealAccepted'; amount: number; secretCardValue: number }
  | { type: 'DealRejected' }
  | { type: 'MidgameSwapAvailable' }
  | { type: 'SecretCardSwapped'; newSecretCard: Card; oldSecretCard?: Card }
  // `lastBoardCard` es opcional: ningún listener actual lo lee (solo
  // `secretCard` importa para la animación de revelado), y el caso de
  // victoria inmediata al revivir con el tablero ya vacío (ver
  // GameSession.reviveWithFullEnergy) no tiene una carta de tablero
  // recién abierta para informar — esa carta ya se había abierto (y
  // animado) ANTES de la derrota que llevó al revive.
  | { type: 'LastCardRevealed'; lastBoardCard?: Card; secretCard: Card }
  | { type: 'GameRevived'; energyPercentage: number }
  | { type: 'GameWon'; finalAmount: number }
  | { type: 'GameLost' }
  | { type: 'EnergyTankUpgraded'; capacityMultiplier: number; energyPercentage: number }
  | { type: 'FinalCardSwapAvailable' }
  | { type: 'FinalSecretCardSwapped'; oldSecretCard: Card; newSecretCard: Card; finalPrize: number }
  | { type: 'TopValueCardRevealed'; card: Card };

export type GameEventListener = (event: GameEvent) => void;