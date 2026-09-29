import { GameEvent } from '../../domain/events/GameEvents';
import { GameResult } from '../../domain/value-objects/PlayerRecords';

/**
 * Convierte el flujo de eventos de UNA partida en UN resultado final.
 * Puro (sin Phaser ni storage): la escena le pasa los eventos y un callback.
 *
 * Reglas que evita romper:
 * - 'GameWon' ya llega también tras aceptar una oferta (junto a
 *   'DealAccepted'): solo se mira 'GameWon' → una victoria cuenta una vez.
 * - 'GameLost' NO es definitivo: el jugador puede revivir (upgrade + anuncio)
 *   y seguir. La derrota se confirma recién en `flush()` (al cerrar la
 *   escena) y solo si no hubo revive posterior.
 * - Abandonar a mitad de partida (sin ganar ni perder) no cuenta.
 * - Cada partida reporta como máximo una vez.
 */
export class GameResultTracker {
  private pendingLoss = false;
  private reported = false;

  constructor(private readonly onFinished: (result: GameResult) => void) {}

  onGameEvent(event: GameEvent): void {
    switch (event.type) {
      case 'GameWon':
        this.pendingLoss = false;
        this.report({ outcome: 'won', amount: event.finalAmount });
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
      this.report({ outcome: 'lost', amount: 0 });
    }
  }

  private report(result: GameResult): void {
    if (this.reported) {
      return;
    }
    this.reported = true;
    this.onFinished(result);
  }
}
