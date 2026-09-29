import { IOnboardingRepository, OnboardingHintId, ONBOARDING_HINT_IDS } from '../../domain/ports/IOnboardingRepository';

const STORAGE_KEY = 'speculation_game_onboarding_v1';

interface PersistedOnboarding {
  seen: OnboardingHintId[];
  skipped: boolean;
}

/**
 * Adapter localStorage del onboarding. Igual que el repositorio de
 * progresión: si el storage no está disponible o lanza (iframes con
 * cookies de terceros bloqueadas, modo privado de algunos navegadores),
 * el estado sigue funcionando EN MEMORIA durante la sesión — nunca rompe
 * el juego, en el peor caso los consejos reaparecen en la próxima visita.
 */
export class LocalStorageOnboardingRepository implements IOnboardingRepository {
  private state: PersistedOnboarding;

  constructor() {
    this.state = this.load();
  }

  getSeenHints(): OnboardingHintId[] {
    return [...this.state.seen];
  }

  markSeen(hint: OnboardingHintId): void {
    if (this.state.seen.includes(hint)) {
      return;
    }
    this.state = { ...this.state, seen: [...this.state.seen, hint] };
    this.persist();
  }

  isSkipped(): boolean {
    return this.state.skipped;
  }

  markSkipped(): void {
    if (this.state.skipped) {
      return;
    }
    this.state = { ...this.state, skipped: true };
    this.persist();
  }

  private load(): PersistedOnboarding {
    const empty: PersistedOnboarding = { seen: [], skipped: false };
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return empty;
      }
      const parsed = JSON.parse(raw) as Partial<PersistedOnboarding>;
      // Se filtran ids desconocidos: un valor viejo/corrupto no debe
      // colarse como "consejo visto" ni romper el flujo.
      const seen = Array.isArray(parsed.seen)
        ? parsed.seen.filter((id): id is OnboardingHintId => ONBOARDING_HINT_IDS.includes(id as OnboardingHintId))
        : [];
      return { seen, skipped: parsed.skipped === true };
    } catch (error) {
      console.warn('[LocalStorageOnboardingRepository] No se pudo leer el estado; se usa memoria.', error);
      return empty;
    }
  }

  private persist(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch (error) {
      console.warn('[LocalStorageOnboardingRepository] No se pudo guardar el estado (solo memoria).', error);
    }
  }
}
