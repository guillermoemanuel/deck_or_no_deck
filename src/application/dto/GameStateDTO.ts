import { GameSession, GameStatus } from '../../domain/entities/GameSession';

export interface CardDTO {
  readonly id: string;
  readonly isOpen: boolean;
  readonly value: number | null;
}

export interface GameStateDTO {
  readonly status: GameStatus;
  readonly energyPercentage: number;
  readonly cardsOpenedCount: number;
  readonly isMidgameSwapAvailable: boolean;
}

/**
 * Mapper puro: traduce la entidad de dominio a un snapshot serializable.
 * Evita que GameSceneController reciba una referencia mutable a GameSession
 * y termine llamando metodos de negocio directamente desde la UI.
 */
export class GameStateMapper {
  static toDTO(session: GameSession): GameStateDTO {
    return {
      status: session.getStatus(),
      energyPercentage: session.getEnergyPercentage(),
      cardsOpenedCount: session.getCardsOpenedCount(),
      isMidgameSwapAvailable: session.isMidgameSwapAvailable()
    };
  }
}
