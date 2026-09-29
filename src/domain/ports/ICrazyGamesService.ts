/**
 * Puerto (contrato) que el dominio define pero NO implementa.
 * Aplica Dependency Inversion: el dominio no conoce el SDK de CrazyGames,
 * solo esta abstraccion. La implementacion real vive en infrastructure/.
 */
export interface AdResult {
  readonly success: boolean;
  readonly reason?: 'user_cancelled' | 'sdk_unavailable' | 'ad_unavailable' | 'error';
}

export type AdType = 'rewarded' | 'midgame';

/**
 * Fases reales del ciclo de vida de un anuncio en pantalla:
 * - 'started': el SDK confirmó (adStarted) que el anuncio EMPEZÓ a
 *   reproducirse — recién ahí corresponde silenciar el juego. Pedir el
 *   anuncio NO es empezarlo: puede terminar sin fill (adError) y silenciar
 *   antes sería un corte de audio sin cambio visual (lo penaliza QA).
 * - 'ended': terminó (adFinished) o falló (adError) DESPUÉS de haber
 *   empezado — es el momento de restaurar el audio.
 */
export type AdLifecyclePhase = 'started' | 'ended';
export type AdLifecycleListener = (phase: AdLifecyclePhase, type: AdType) => void;

export interface ICrazyGamesService {
  isAvailable(): boolean;
  /**
   * `true` si tiene sentido OFRECER una acción con rewarded ad (botón,
   * upgrade de tienda): el SDK está listo, no hay adblock detectado y el
   * último rewarded no falló hace poco (cooldown). Evita mostrar botones
   * que no hacen nada — requisito de QA de CrazyGames, sobre todo en
   * Basic Launch, donde los anuncios están deshabilitados.
   */
  isRewardedAdAvailable(): boolean;
  /** Suscribe a las fases 'started'/'ended' de cualquier anuncio. Devuelve la función para desuscribirse. */
  onAdLifecycle(listener: AdLifecycleListener): () => void;
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