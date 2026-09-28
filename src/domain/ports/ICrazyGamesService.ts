/**
 * Puerto (contrato) que el dominio define pero NO implementa.
 * Aplica Dependency Inversion: el dominio no conoce el SDK de CrazyGames,
 * solo esta abstraccion. La implementacion real vive en infrastructure/.
 */
export interface AdResult {
  readonly success: boolean;
  readonly reason?: 'user_cancelled' | 'sdk_unavailable' | 'ad_unavailable' | 'error';
}

export interface ICrazyGamesService {
  isAvailable(): boolean;
  showRewardedAd(): Promise<AdResult>;
  showMidgameAd(): Promise<AdResult>;
  reportGameplayStart(): void;
  reportGameplayStop(): void;
  /**
   * Locale BCP-47 reportado por el SDK (ej. "es-AR", "en-US"), leído de
   * `SDK.user.systemInfo.locale` — usado para auto-detectar el idioma del
   * juego (ver LanguageManager.applyDetectedLocale()) en vez de arrancar
   * siempre en un idioma fijo. Resuelve a `null` si el SDK no está
   * disponible, todavía no terminó de inicializar, o no expone un locale
   * (nunca lanza).
   */
  getUserLocale(): Promise<string | null>;
}