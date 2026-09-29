import { GameEvent } from '../../domain/events/GameEvents';
import { IOnboardingRepository, OnboardingHintId, ONBOARDING_HINT_IDS } from '../../domain/ports/IOnboardingRepository';

/**
 * Qué debe hacer la capa visual tras un evento:
 * - 'show': mostrar (o reemplazar por) este consejo.
 * - 'hide': ocultar el consejo actual.
 * - 'none': no hacer nada.
 */
export type OnboardingAction =
  | { readonly kind: 'show'; readonly hint: OnboardingHintId }
  | { readonly kind: 'hide' }
  | { readonly kind: 'none' };

const NONE: OnboardingAction = { kind: 'none' };
const HIDE: OnboardingAction = { kind: 'hide' };

/**
 * Decide, de forma pura (sin Phaser), QUÉ consejo mostrar y CUÁNDO, a partir
 * de los eventos de la partida. La escena solo dibuja lo que este flujo
 * devuelve — misma separación que el resto del proyecto.
 *
 * Reglas:
 * - Cada consejo se muestra UNA sola vez en la vida del jugador (se marca
 *   como visto al mostrarlo, no al cerrarlo: si cierra la pestaña con el
 *   consejo en pantalla, no se lo repite).
 * - "Omitir consejos" desactiva todo el flujo de forma permanente.
 * - Secuencia: abrir carta → energía (1ª carta abierta) → banquero (1ª oferta).
 */
export class OnboardingFlow {
  private current: OnboardingHintId | null = null;

  constructor(private readonly repository: IOnboardingRepository) {}

  /** `true` si todavía queda algún consejo por mostrar y el jugador no los omitió. */
  isActive(): boolean {
    if (this.repository.isSkipped()) {
      return false;
    }
    const seen = new Set(this.repository.getSeenHints());
    return ONBOARDING_HINT_IDS.some(id => !seen.has(id));
  }

  getCurrentHint(): OnboardingHintId | null {
    return this.current;
  }

  /** El tablero terminó de acomodarse y ya se puede abrir cartas. */
  onBoardReady(): OnboardingAction {
    return this.tryShow('open_card');
  }

  onGameEvent(event: GameEvent): OnboardingAction {
    switch (event.type) {
      case 'CardOpened':
        // Con la 1ª carta abierta se explica la energía; con cualquier
        // carta posterior, el consejo de energía ya cumplió su función.
        if (this.current === 'open_card' || this.current === null) {
          const action = this.tryShow('energy');
          return action.kind === 'show' ? action : this.hideIfShowing();
        }
        return this.hideIfShowing();

      case 'BankerOfferMade':
        return this.tryShow('banker_offer');

      case 'DealAccepted':
      case 'DealRejected':
      case 'GameWon':
      case 'GameLost':
      case 'EnergyDepleted':
        return this.hideIfShowing();

      default:
        return NONE;
    }
  }

  /** El jugador tocó "Omitir consejos". */
  skipAll(): OnboardingAction {
    this.repository.markSkipped();
    return this.hideIfShowing();
  }

  private tryShow(hint: OnboardingHintId): OnboardingAction {
    if (this.repository.isSkipped()) {
      return NONE;
    }
    if (this.repository.getSeenHints().includes(hint)) {
      return NONE;
    }
    this.repository.markSeen(hint);
    this.current = hint;
    return { kind: 'show', hint };
  }

  private hideIfShowing(): OnboardingAction {
    if (this.current === null) {
      return NONE;
    }
    this.current = null;
    return HIDE;
  }
}
