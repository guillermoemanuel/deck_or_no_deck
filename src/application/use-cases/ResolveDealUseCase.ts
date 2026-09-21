import { GameSession } from '../../domain/entities/GameSession';
import { GameEvent } from '../../domain/events/GameEvents';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
import { IProgressionService } from '../../domain/ports/IProgressionService';

/**
 * Orquesta la aceptacion/rechazo de la oferta del banquero.
 * Depende de la abstraccion IProgressionService (SOLID - Dependency Inversion).
 */
export class ResolveDealUseCase {
  constructor(
    private readonly session: GameSession,
    private readonly progressionService: IProgressionService,
    private readonly eventBus: SimpleEventEmitter<GameEvent>
  ) {}

  acceptDeal(): void {
    const amount = this.session.acceptDeal();
    this.progressionService.awardGameplayCoins(amount);

    // BUGFIX (bug_deal_modal_reveal): se captura el valor de la Carta Secreta
    // que el jugador reservó al inicio ANTES de emitir el evento, para que la
    // capa de presentación pueda revelarla junto con el premio en el modal
    // final — sin esto, el modal de "DEAL" solo mostraba el monto ganado.
    const secretCardValue = this.session.getSecretCard().value;

    this.eventBus.emit({ type: 'DealAccepted', amount, secretCardValue });
    this.eventBus.emit({ type: 'GameWon', finalAmount: amount });
  }

  rejectDeal(): void {
    this.session.rejectDeal();
    this.eventBus.emit({ type: 'DealRejected' });

    // Si coincide con la mitad del juego (carta 6), el evento de intercambio aparece tras rechazar la oferta
    if (this.session.isMidgameSwapAvailable()) {
      this.eventBus.emit({ type: 'MidgameSwapAvailable' });
    }
  }
}
