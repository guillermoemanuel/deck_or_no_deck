import { GameSession } from '../../domain/entities/GameSession';
import { IProgressionService } from '../../domain/ports/IProgressionService';
import { GameEvent } from '../../domain/events/GameEvents';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';

/**
 * Encapsula el upgrade "Cambio de Carta Secreta": disponible SOLO en la
 * última jugada de la partida (una única carta cerrada restante). A
 * diferencia del intercambio de mitad de juego, este termina la partida
 * de inmediato — el valor de la carta elegida pasa a ser el premio
 * definitivo (ver GameSession.swapFinalSecretCard).
 */
export class SwapFinalSecretCardUseCase {
  constructor(
    private readonly session: GameSession,
    private readonly progressionService: IProgressionService,
    private readonly eventBus: SimpleEventEmitter<GameEvent>
  ) {}

  isAvailable(): boolean {
    return this.session.canSwapFinalSecretCard();
  }

  execute(): void {
    const { oldSecret, newSecret, finalPrize } = this.session.swapFinalSecretCard();

    this.progressionService.awardGameplayCoins(finalPrize);

    this.eventBus.emit({
      type: 'FinalSecretCardSwapped',
      oldSecretCard: oldSecret,
      newSecretCard: newSecret,
      finalPrize
    });
    this.eventBus.emit({ type: 'GameWon', finalAmount: finalPrize });
  }
}
