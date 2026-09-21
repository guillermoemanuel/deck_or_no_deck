import { GameSession } from '../../domain/entities/GameSession';
import { CardId } from '../../domain/entities/Card';
import { GameEvent } from '../../domain/events/GameEvents';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';

/**
 * Encapsula el evento de mitad de juego (carta 6). Separado de OpenCardUseCase
 * porque es una decision OPCIONAL del jugador, disparada por UI, no automatica.
 */
export class SwapSecretCardUseCase {
  constructor(
    private readonly session: GameSession,
    private readonly eventBus: SimpleEventEmitter<GameEvent>
  ) {}

  execute(boardCardId: CardId): void {
    const { oldSecret, newSecret } = this.session.swapSecretCard(boardCardId);

    this.eventBus.emit({
      type: 'SecretCardSwapped',
      newSecretCard: newSecret,
      oldSecretCard: oldSecret
    });
  }

  isAvailable(): boolean {
    return this.session.isMidgameSwapAvailable();
  }
}
