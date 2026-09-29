import {
  ICrazyGamesService,
  AdResult,
  AdType,
  AdLifecycleListener,
  AdLifecyclePhase
} from '../../../domain/ports/ICrazyGamesService';

/**
 * Fake controlable: el test decide de antemano que resultado devolvera
 * cada llamada a showRewardedAd(), sin depender de window.CrazyGames.
 */
export class FakeCrazyGamesService implements ICrazyGamesService {
  private available = true;
  private rewardedAvailable = true;
  private readonly lifecycleListeners = new Set<AdLifecycleListener>();
  private nextAdResult: AdResult = { success: true };
  // `null` por defecto: mismo comportamiento que el servicio real cuando
  // el SDK no está disponible o no expone locale — ejercita el "no-op,
  // se queda en DEFAULT_LANGUAGE" de LanguageManager.applyDetectedLocale()
  // sin que cada test tenga que configurar un locale explícito.
  private userLocale: string | null = null;
  public rewardedAdCallCount = 0;
  public midgameAdCallCount = 0;
  public gameplayStartCalled = false;
  public gameplayStopCalled = false;

  setAvailable(available: boolean): void {
    this.available = available;
  }

  setRewardedAvailable(available: boolean): void {
    this.rewardedAvailable = available;
  }

  /** Permite a los tests simular las fases started/ended que emitiría el SDK real. */
  emitAdLifecycle(phase: AdLifecyclePhase, type: AdType = 'midgame'): void {
    this.lifecycleListeners.forEach(listener => listener(phase, type));
  }

  isRewardedAdAvailable(): boolean {
    return this.available && this.rewardedAvailable;
  }

  onAdLifecycle(listener: AdLifecycleListener): () => void {
    this.lifecycleListeners.add(listener);
    return () => {
      this.lifecycleListeners.delete(listener);
    };
  }

  setUserLocale(locale: string | null): void {
    this.userLocale = locale;
  }

  setNextAdResult(result: AdResult): void {
    this.nextAdResult = result;
  }

  isAvailable(): boolean {
    return this.available;
  }

  async showRewardedAd(): Promise<AdResult> {
    this.rewardedAdCallCount += 1;
    return this.nextAdResult;
  }

  async showMidgameAd(): Promise<AdResult> {
    this.midgameAdCallCount += 1;
    return this.nextAdResult;
  }

  reportGameplayStart(): void {
    this.gameplayStartCalled = true;
  }

  reportGameplayStop(): void {
    this.gameplayStopCalled = true;
  }

  async getUserLocale(): Promise<string | null> {
    return this.userLocale;
  }
}