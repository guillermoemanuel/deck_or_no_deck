import { GameSession } from '../../domain/entities/GameSession';
import { CardId } from '../../domain/entities/Card';
import { GameEvent, GameEventListener } from '../../domain/events/GameEvents';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
import { IProgressionService } from '../../domain/ports/IProgressionService';
import { TOP_CASE_VALUE } from '../../domain/value-objects/CaseValues';
import { LOSS_PENALTY_AMOUNT } from '../../domain/value-objects/GamePenalties';

/**
 * SRP: coordina UNA accion del jugador (abrir carta) y traduce
 * el resultado de GameSession en eventos consumibles por la UI.
 * No contiene reglas de negocio — esas viven en GameSession/Banker.
 */
export class OpenCardUseCase {
  constructor(
    private readonly session: GameSession,
    private readonly eventBus: SimpleEventEmitter<GameEvent>,
    private readonly progressionService?: IProgressionService
  ) {}

  execute(cardId: CardId): void {
    const result = this.session.openCard(cardId);

    this.eventBus.emit({
      type: 'CardOpened',
      card: result.card,
      energyRemaining: this.session.getEnergyPercentage(),
      cardsUntilNextOffer: this.session.getCardsUntilNextBankerOffer()
    });

    if (this.session.getStatus() === 'lost') {
      // REQ (penalización por pérdida): perder por agotamiento de energía
      // descuenta la penalidad fija del dominio (LOSS_PENALTY_AMOUNT, −1000)
      // del acumulado global persistente — puede dejarlo en negativo
      // (ver IProgressionService.applyLossPenalty).
      this.progressionService?.applyLossPenalty(LOSS_PENALTY_AMOUNT);
      this.eventBus.emit({ type: 'EnergyDepleted' });
      this.eventBus.emit({ type: 'GameLost' });
      return;
    }

    // Momento de celebración (REQ): se chequea DESPUÉS de descartar el
    // camino de derrota, a propósito. Las cartas de mayor valor son
    // también las que más energía consumen (ver EnergyDeltaTable), así
    // que abrir la de 25000 puede agotarla en la misma jugada — festejar
    // con reflectores un instante antes de la pantalla de "Game Over"
    if (result.card.value === TOP_CASE_VALUE) {
      this.eventBus.emit({ type: 'TopValueCardRevealed', card: result.card });
    }

    // Si se abrio la ultima carta del tablero, la carta secreta se revela y el jugador gana su valor
    if (result.isLastCard && result.secretCard) {
      const prize = result.secretCard.value;
      this.progressionService?.awardGameplayCoins(prize);
      this.eventBus.emit({
        type: 'LastCardRevealed',
        lastBoardCard: result.card,
        secretCard: result.secretCard
      });

      // La CARTA SECRETA nunca pasa por CardOpened (arriba) — es una
      // carta distinta a `result.card`, así que necesita su propio chequeo
      // acá para no perderse el caso en que la de 25000 era justo la
      // secreta, no una del tablero.
      if (result.secretCard.value === TOP_CASE_VALUE) {
        this.eventBus.emit({ type: 'TopValueCardRevealed', card: result.secretCard });
      }

      this.eventBus.emit({ type: 'GameWon', finalAmount: prize });
      return;
    }

    // La oferta del banquero tiene prioridad. El evento de mitad de juego solo ocurrira si rechaza la oferta (NO DEAL).
    if (result.offer) {
      this.eventBus.emit({ type: 'BankerOfferMade', offer: result.offer });
      return;
    }

    if (this.session.isMidgameSwapAvailable()) {
      this.eventBus.emit({ type: 'MidgameSwapAvailable' });
      return;
    }

    // Upgrade "Cambio de Carta Secreta": avisa a la presentación que ya
    // queda una única carta cerrada y el jugador tiene el upgrade — recien
    // ahi tiene sentido ofrecer la opcion de intercambio final.
    if (this.session.canSwapFinalSecretCard()) {
      this.eventBus.emit({ type: 'FinalCardSwapAvailable' });
    }
  }

  onEvent(listener: GameEventListener): () => void {
    return this.eventBus.subscribe(listener);
  }
}