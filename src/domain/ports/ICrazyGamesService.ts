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
 * Estado del rewarded ad AHORA, con el motivo que le interesa a la
 * política de reembolso (ver ICrazyGamesService.rewardedAdStatus).
 * El cooldown de 60 s SIEMPRE vence (no es permanente); los únicos
 * estados permanentes en la sesión son `sdk_unavailable`, `adblock` y
 * `ads_disabled` (Basic Launch, ADR-009).
 */
export type RewardedAdStatus =
  | 'available'
  | 'sdk_unavailable'
  | 'adblock'
  | 'ads_disabled'
  | 'cooldown_no_fill'
  | 'cooldown_retryable';

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
   * Azúcar: equivalente a `rewardedAdStatus() === 'available'`.
   */
  isRewardedAdAvailable(): boolean;
  /**
   * Por qué hoy NO se puede ofrecer un rewarded ad (o `'available'` si
   * se puede). A diferencia del booleano, el motivo determina la
   * POLÍTICA de reembolso al consumir una mejora comprada (ADR-006):
   *
   * - `sdk_unavailable` / `adblock` / `ads_disabled` → permanente en la
   *   sesión: se reembolsa (el jugador nunca podría recibir el efecto).
   *   `ads_disabled` es Basic Launch: el SDK reporta los rewarded con
   *   adError `{code: 'adsDisabledBasicLaunch'}` y el adapter lo cachea
   *   como estado definitivo (ADR-009) — sin esto caía como un fallo
   *   genérico reintentable y el jugador pagaba monedas por un botón
   *   que nunca funciona (criterio de rechazo QA de la auditoría
   *   CG-PUB-003).
   * - `cooldown_no_fill` → el cooldown de 60 s viene de un fallo
   *   AMBIENTAL (sin fill): se reembolsa — reintentar no promete nada.
   * - `cooldown_retryable` → el cooldown viene de cualquier otro fallo,
   *   p. ej. la cancelación del propio jugador: NO se reembolsa; se
   *   muestra "probá en unos segundos" y a los 60 s el anuncio vuelve.
   *   Reembolsar acá sería un forfeit autoinfligido (ver ADR-006).
   */
  rewardedAdStatus(): RewardedAdStatus;
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