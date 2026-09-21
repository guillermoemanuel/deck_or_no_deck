export type GameStatus =
  | 'idle'
  | 'playing'
  | 'awaiting_offer_response'
  | 'won'
  | 'lost'
  | 'deal_accepted';

/**
 * GameStateMachine: Maquina de estados formal que controla las fases de la partida
 * y garantiza transiciones validas segun las reglas del juego.
 * Previene estados ilegales o dobles ejecuciones.
 */
export class GameStateMachine {
  private currentStatus: GameStatus;

  constructor(initialStatus: GameStatus = 'playing') {
    this.currentStatus = initialStatus;
  }

  getStatus(): GameStatus {
    return this.currentStatus;
  }

  is(status: GameStatus): boolean {
    return this.currentStatus === status;
  }

  isPlayable(): boolean {
    return this.currentStatus === 'playing';
  }

  start(): void {
    if (this.currentStatus !== 'idle') {
      throw new Error(`Cannot start game from state "${this.currentStatus}"`);
    }
    this.currentStatus = 'playing';
  }

  waitForOffer(): void {
    if (this.currentStatus !== 'playing') {
      throw new Error(`Cannot transition to offer from state "${this.currentStatus}"`);
    }
    this.currentStatus = 'awaiting_offer_response';
  }

  rejectOffer(): void {
    if (this.currentStatus !== 'awaiting_offer_response') {
      throw new Error(`Cannot reject offer from state "${this.currentStatus}"`);
    }
    this.currentStatus = 'playing';
  }

  acceptOffer(): void {
    if (this.currentStatus !== 'awaiting_offer_response') {
      throw new Error(`Cannot accept offer from state "${this.currentStatus}"`);
    }
    this.currentStatus = 'deal_accepted';
  }

  lose(): void {
    if (this.currentStatus === 'won' || this.currentStatus === 'deal_accepted') {
      throw new Error(`Cannot lose game after victory in state "${this.currentStatus}"`);
    }
    this.currentStatus = 'lost';
  }

  win(): void {
    if (this.currentStatus === 'lost') {
      throw new Error(`Cannot win game when already lost`);
    }
    this.currentStatus = 'won';
  }

  revive(): void {
    if (this.currentStatus !== 'lost') {
      throw new Error(`Revive is only allowed from "lost" state, current is "${this.currentStatus}"`);
    }
    this.currentStatus = 'playing';
  }
}
