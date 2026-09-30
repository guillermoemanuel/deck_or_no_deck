import { GameSession } from '../../domain/entities/GameSession';
import { ICrazyGamesService } from '../../domain/ports/ICrazyGamesService';
import { GameEvent } from '../../domain/events/GameEvents';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
import { IProgressionService } from '../../domain/ports/IProgressionService';
import { TOP_CASE_VALUE } from '../../domain/value-objects/CaseValues';

export type ReviveResult =
  | { revived: true }
  | { revived: false; reason: 'ad_failed' | 'sdk_unavailable' | 'not_eligible' };

/**
 * Coordina un efecto secundario (anuncio recompensado) con una regla de
 * dominio (revivir). El dominio permanece ignorante de que existio un anuncio.
 */
export class ReviveWithAdUseCase {
  constructor(
    private readonly session: GameSession,
    private readonly crazyGamesService: ICrazyGamesService,
    private readonly eventBus: SimpleEventEmitter<GameEvent>,
    // Opcional por lo mismo que en OpenCardUseCase: solo hace falta para el
    // caso límite de "victoria inmediata al revivir" (ver más abajo), que
    // necesita acreditar el premio exactamente como una victoria normal.
    private readonly progressionService?: IProgressionService
  ) {}

  async execute(): Promise<ReviveResult> {
    // BUGFIX (revive infinito): faltaba el chequeo de `hasRevive()` acá.
    // "Revivir" es un consumible de UNA sola vez (se compra por 1.250
    // monedas en la Tienda), pero como nada lo consumía, una única compra
    // permitía revivir un número ilimitado de veces en la misma partida —
    // ver el comentario en SessionUpgrades.consumeRevive().
    if (this.session.getStatus() !== 'lost' || !this.session.getSessionUpgrades().hasRevive()) {
      return { revived: false, reason: 'not_eligible' };
    }

    if (!this.crazyGamesService.isAvailable()) {
      return { revived: false, reason: 'sdk_unavailable' };
    }

    const adResult = await this.crazyGamesService.showRewardedAd();

    if (!adResult.success) {
      return { revived: false, reason: 'ad_failed' };
    }

    // Se consume ANTES de revivir (no después): si por algún motivo
    // `reviveWithFullEnergy()` lanzara, es más seguro fallar con el
    // consumible ya gastado que dejarlo reutilizable indefinidamente.
    this.session.getSessionUpgrades().consumeRevive();
    const outcome = this.session.reviveWithFullEnergy();

    // BUGFIX (partida trabada): la carta que causó la derrota era la
    // última cerrada del tablero — no queda ninguna carta más para abrir,
    // así que esto NO es un revive normal: se resuelve como victoria
    // inmediata, con el mismo evento (`GameWon`) y la misma acreditación
    // de premio que usa OpenCardUseCase cuando el tablero se vacía
    // abriendo una carta. Sin esto, la partida quedaba en 'playing' sin
    // ninguna jugada posible (ver el comentario en GameSession).
    if (outcome.wonImmediately && outcome.secretCard) {
      const prize = outcome.secretCard.value;
      this.progressionService?.awardGameplayCoins(prize);
      this.eventBus.emit({ type: 'LastCardRevealed', secretCard: outcome.secretCard });
      if (outcome.secretCard.value === TOP_CASE_VALUE) {
        this.eventBus.emit({ type: 'TopValueCardRevealed', card: outcome.secretCard });
      }
      this.eventBus.emit({ type: 'GameWon', finalAmount: prize });
      return { revived: true };
    }

    // BUGFIX (nivel de energía): el porcentaje post-revive ya NO es
    // necesariamente 100 (EnergyLevel.STARTING = 50, + bonus de tienda si
    // aplica) — se lee del dominio en vez de que la presentación asuma un
    // valor fijo.
    this.eventBus.emit({ type: 'GameRevived', energyPercentage: this.session.getEnergyPercentage() });

    return { revived: true };
  }
}
