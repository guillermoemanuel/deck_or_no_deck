import { IAudioService } from '../../domain/ports/IAudioService';
import { GameEvent } from '../../domain/events/GameEvents';
import { SFX } from '../../shared/audio/AudioData';
import { HeartbeatLoop, HeartbeatScheduler } from './HeartbeatLoop';
import { LOSE_AFTER_DEPLETED_DELAY_MS } from './GameplaySfx';

/**
 * GameplaySoundtrack: traductor de eventos de dominio a sfx de la partida.
 *
 * Clase PURA (sin Phaser): recibe el puerto `IAudioService` y un scheduler
 * de temporización — el mismo que usa HeartbeatLoop para el latido. El
 * controlador la alimenta con cada GameEvent y la detiene en SHUTDOWN.
 */
export class GameplaySoundtrack {
  /** Deal aceptado: GameWon viene en tándem (ADR-001) — evita la 2ª fanfarria. */
  private dealAccepted = false;
  /** EnergyDepleted visto: el sfx de derrota debe demorarse tras el de drenaje. */
  private pendingLose = false;
  private loseTimerCancel: (() => void) | null = null;
  private readonly heartbeat: HeartbeatLoop;

  constructor(
    private readonly audio: IAudioService | undefined,
    private readonly scheduler: HeartbeatScheduler
  ) {
    this.heartbeat = new HeartbeatLoop(() => this.playSound(SFX.HEARTBEAT), scheduler);
  }

  onEvent(event: GameEvent): void {
    switch (event.type) {
      case 'CardOpened':
        // NO reproduce acá: las variantes de carta (low/mid/high/jackpot) las
        // reproduce CardView al revelar — acá solo se sigue la energía para
        // el latido (mismo campo 0-100 que energyBar.setPercentage).
        this.heartbeat.update(event.energyRemaining);
        break;

      case 'DealAccepted':
        this.playSound(SFX.DEAL);
        this.dealAccepted = true;
        break;

      case 'DealRejected':
        this.playSound(SFX.NO_DEAL);
        break;

      case 'SecretCardSwapped':
      case 'FinalSecretCardSwapped':
        this.playSound(SFX.SWAP);
        break;

      case 'GameWon':
        // BUGFIX (bug_deal_win_fanfare): ResolveDealUseCase emite
        // DealAccepted y GameWon juntos al aceptar una oferta (ADR-001) —
        // sin este flag sonaría sfx-deal y sfx-win encima para la misma
        // victoria. La fanfarria de win queda SOLO para el camino "se abrió
        // la última carta sin oferta aceptada".
        if (!this.dealAccepted) {
          this.playSound(SFX.WIN);
        }
        this.heartbeat.stop();
        break;

      case 'EnergyDepleted':
        this.playSound(SFX.ENERGY_DEPLETED);
        this.pendingLose = true;
        break;

      case 'GameLost': {
        this.heartbeat.stop();
        const delayed = this.pendingLose;
        this.pendingLose = false;
        if (delayed) {
          // El sfx de derrota espera a que termine el de energía agotada:
          // pisarlos en el mismo instante ahogaba ambos.
          this.cancelLoseTimer();
          this.loseTimerCancel = this.scheduler.add(LOSE_AFTER_DEPLETED_DELAY_MS, () => {
            this.loseTimerCancel = null;
            this.playSound(SFX.LOSE);
          });
        } else {
          this.playSound(SFX.LOSE);
        }
        break;
      }

      case 'GameRevived':
        // Un revive invalida la derrota: si el lose diferido seguía armado,
        // hay que cancelarlo antes de que suene.
        this.cancelLoseTimer();
        this.playSound(SFX.REVIVE);
        this.heartbeat.update(event.energyPercentage);
        break;

      case 'EnergyTankUpgraded':
        // Subir el techo puede BAJAR el porcentaje (misma energía sobre un
        // tanque más grande) — hay que re-evaluar el latido igual que en
        // CardOpened/GameRevived.
        this.heartbeat.update(event.energyPercentage);
        break;

      // Resto de eventos (SecretCardChosen, BankerOfferMade, LastCardRevealed,
      // etc.): sin sonido propio a cargo de esta clase — no-op.
    }
  }

  /** Detiene el latido y cualquier lose pendiente — llamado en SHUTDOWN. */
  stop(): void {
    this.heartbeat.stop();
    this.cancelLoseTimer();
  }

  private playSound(key: string): void {
    try {
      this.audio?.play(key);
    } catch {
      // Audio best-effort: un fallo del reproductor nunca debe romper la
      // partida (mismo patrón silencioso que CardView.reveal()).
    }
  }

  private cancelLoseTimer(): void {
    this.loseTimerCancel?.();
    this.loseTimerCancel = null;
  }
}
