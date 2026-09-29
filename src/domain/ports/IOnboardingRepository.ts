/**
 * Puerto de persistencia del onboarding in-game (consejos contextuales).
 *
 * Es DELIBERADAMENTE independiente de `IProgressionRepository`: "NUEVO
 * JUEGO" (`resetAllProgress`) borra monedas y mazos, pero un jugador que ya
 * aprendió a jugar no debería volver a ver los consejos por haber
 * reiniciado su progreso.
 */
export type OnboardingHintId = 'open_card' | 'energy' | 'banker_offer';

/** Orden en el que se presentan los consejos durante la primera partida. */
export const ONBOARDING_HINT_IDS: readonly OnboardingHintId[] = ['open_card', 'energy', 'banker_offer'];

export interface IOnboardingRepository {
  /** Consejos que el jugador ya vio (o se le mostraron) en sesiones previas o en la actual. */
  getSeenHints(): OnboardingHintId[];
  markSeen(hint: OnboardingHintId): void;
  /** `true` si el jugador eligió "Omitir consejos": no se le muestra ninguno más. */
  isSkipped(): boolean;
  markSkipped(): void;
}
