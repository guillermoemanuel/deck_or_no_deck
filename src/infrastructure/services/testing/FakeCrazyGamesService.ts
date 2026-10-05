import {
  ICrazyGamesService,
  AdResult,
  AdType,
  AdLifecycleListener,
  AdLifecyclePhase,
  RewardedAdStatus
} from '../../../domain/ports/ICrazyGamesService';

/**
 * Fake controlable: el test decide de antemano que resultado devolvera
 * cada llamada a showRewardedAd(), sin depender de window.CrazyGames.
 */
export class FakeCrazyGamesService implements ICrazyGamesService {
  private available = true;
  /** Estado configurable de rewardedAdStatus() — el test simula adblock, cooldown, etc. */
  private rewardedStatus: RewardedAdStatus = 'available';
  /** Ver setRewardedStatusAfterNextAd(). */
  private statusAfterNextAd: RewardedAdStatus | null = null;
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

  /**
   * Compatibilidad con los specs existentes (firma intacta — la usan
   * Multiply/Revive/Purchase/List): `false` pasa a setear `'adblock'`,
   * no `'cooldown_retryable'`. Motivo exacto: `'adblock'` es un estado
   * PERMANENTE que REEMBOLSA según ADR-006, así todos los tests viejos de
   * "ads caídos → refunded" siguen verdes sin tocarlos; `'cooldown_retryable'`
   * NO reembolsa y los rompería. Para simular otros estados (p. ej.
   * cooldown reintentable) usar setRewardedStatus().
   */
  setRewardedAvailable(available: boolean): void {
    this.rewardedStatus = available ? 'available' : 'adblock';
  }

  /** Setter explícito del estado que reporta rewardedAdStatus() (ADR-006). */
  setRewardedStatus(status: RewardedAdStatus): void {
    this.rewardedStatus = status;
  }

  /** Permite a los tests simular las fases started/ended que emitiría el SDK real. */
  emitAdLifecycle(phase: AdLifecyclePhase, type: AdType = 'midgame'): void {
    this.lifecycleListeners.forEach(listener => listener(phase, type));
  }

  /**
   * Mismo criterio que el adapter: sin SDK manda `'sdk_unavailable'`
   * (prioridad idéntica a CrazyGamesService.rewardedAdStatus()).
   */
  rewardedAdStatus(): RewardedAdStatus {
    if (!this.available) {
      return 'sdk_unavailable';
    }
    return this.rewardedStatus;
  }

  isRewardedAdAvailable(): boolean {
    return this.rewardedAdStatus() === 'available';
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

  /**
   * Simula el SDK REAL de CG-PUB-003: un adError puede VOLVERSE
   * PERMANENTE al fallar (`adsDisabledBasicLaunch` o `adblock` llegan
   * cuando `showRewardedAd()` ya estaba en vuelo, así que el status
   * PREVIO al consumo era 'available'). Si se setea y el próximo
   * rewarded FALLA, el fake pasa el estado antes de resolver, igual que
   * el adapter real (adError → estado permanente → status nuevo).
   * Solo aplica cuando `nextAdResult.success === false`.
   */
  setRewardedStatusAfterNextAd(status: RewardedAdStatus): void {
    this.statusAfterNextAd = status;
  }

  isAvailable(): boolean {
    return this.available;
  }

  async showRewardedAd(): Promise<AdResult> {
    this.rewardedAdCallCount += 1;
    if (!this.nextAdResult.success && this.statusAfterNextAd !== null) {
      this.rewardedStatus = this.statusAfterNextAd;
    }
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