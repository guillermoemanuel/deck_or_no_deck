import { GameEvent } from '../../domain/events/GameEvents';
import { FirstRoundDealGameOutcome } from '../../domain/value-objects/FirstRoundDealStreak';

/** Alias local: lo que el tracker le entrega al use case al cerrar la partida. */
export type FirstRoundDealOutcomeRecorded = FirstRoundDealGameOutcome;

/**
 * Convierte el flujo de eventos de UNA partida en el desenlace que necesita
 * la regla anti-farmeo (ADR-014). Puro (sin Phaser ni storage): la escena
 * le pasa los eventos y un callback — mismo molde que GameResultTracker.
 *
 * Reglas que evita romper:
 * - La ronda del ofrecimiento viaja en `BankerOfferMade.offer.roundNumber`;
 *   `DealAccepted` no la trae, así que se retiene del último ofrecimiento
 *   (solo puede haber una oferta pendiente a la vez).
 * - "Superó la 1ª oferta" = se MOSTRÓ la oferta de ronda 1 y NO se aceptó
 *   (se rechazó y el juego siguió). Perder en las cartas 1-3 nunca la mostró.
 * - `GameLost` NO es definitivo (revive posible): se confirma en `flush()`
 *   (SHUTDOWN de la escena), idéntico a GameResultTracker.
 * - Abandonar (cierre sin GameWon/GameLost) no reporta nada.
 * - Cada partida reporta como máximo una vez.
 */
export class FirstRoundDealStreakTracker {
  private lastOfferRound: number | null = null;
  private acceptedFirstRoundDeal = false;
  private sawFirstRoundOffer = false;
  private pendingLoss = false;
  private reported = false;

  constructor(private readonly onGameEnd: (outcome: FirstRoundDealOutcomeRecorded) => void) {}

  onGameEvent(event: GameEvent): void {
    switch (event.type) {
      case 'BankerOfferMade':
        this.lastOfferRound = event.offer.roundNumber;
        if (event.offer.roundNumber === 1) {
          this.sawFirstRoundOffer = true;
        }
        return;
      case 'DealAccepted':
        this.acceptedFirstRoundDeal = this.lastOfferRound === 1;
        this.pendingLoss = false;
        // Aceptar un trato SIEMPRE termina la partida (DealAccepted + GameWon
        // son el par contrato de ResolveDealUseCase): se reporta acá y el
        // GameWon siguiente queda cubierto por la guarda `reported`.
        this.report();
        return;
      case 'GameWon':
        this.pendingLoss = false;
        this.report();
        return;
      case 'GameLost':
        this.pendingLoss = true;
        return;
      case 'GameRevived':
        this.pendingLoss = false;
        return;
      default:
        return;
    }
  }

  /** Confirma una derrota pendiente. Llamar al cerrar la escena de juego. */
  flush(): void {
    if (this.pendingLoss) {
      this.pendingLoss = false;
      this.report();
    }
  }

  private report(): void {
    if (this.reported) {
      return;
    }
    this.reported = true;
    this.onGameEnd({
      firstRoundDealAccepted: this.acceptedFirstRoundDeal,
      rejectedRound1Offer: this.sawFirstRoundOffer && !this.acceptedFirstRoundDeal
    });
  }
}
