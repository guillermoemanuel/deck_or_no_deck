import {
  ICrazyGamesService,
  AdResult,
  AdType,
  AdLifecycleListener,
  AdLifecyclePhase,
  RewardedAdStatus
} from '../../domain/ports/ICrazyGamesService';
import { RewardCooldownTracker } from './RewardCooldownTracker';

declare global {
  interface Window {
    CrazyGames?: {
      SDK?: {
        /**
         * BUGFIX (crash "SDK is not initialized yet" / Uncaught GeneralError):
         * el SDK v3 requiere llamar a esto UNA vez, antes de tocar
         * `SDK.ad`/`SDK.game` — acceder a esas propiedades antes de que
         * esta Promise resuelva hace que el SDK tire un GeneralError (el
         * trace `get ad @ crazygames-sdk-v3.js` confirma que `.ad` está
         * implementado como un getter que revienta si todavía no se
         * inicializó, no como un objeto plano). Ver CrazyGamesService.init().
         */
        init: () => Promise<void>;
        ad: {
          requestAd: (
            type: 'rewarded' | 'midgame',
            callbacks: {
              adFinished: () => void;
              adError: (error: unknown) => void;
              adStarted?: () => void;
            }
          ) => void;
          hasAdblock?: () => Promise<boolean>;
        };
        game: {
          gameplayStart: () => void;
          gameplayStop: () => void;
        };
        user: {
          /**
           * Propiedad SÍNCRONA (no un método/Promise) del SDK v3 — a
           * diferencia de `SDK.init()`/`SDK.ad`/`SDK.game`, no hace falta
           * "esperarla", solo leerla una vez que `init()` resolvió.
           */
          systemInfo: {
            countryCode: string;
            /** BCP-47, ej. "es-AR", "en-US". */
            locale: string;
            device: { type: 'desktop' | 'tablet' | 'mobile' };
            os: { name: string; version: string };
            browser: { name: string; version: string };
            applicationType: string;
          };
        };
      };
    };
  }
}

/**
 * Adapter: implementa el puerto del dominio (ICrazyGamesService) y encapsula
 * TODO el acoplamiento con el objeto global window.CrazyGames.
 *
 * Caracteristicas de robustez:
 * 1. Deteccion segura de entorno: no crashea en SSR, Node/Jest o local dev sin SDK.
 * 2. Ciclo de init() del SDK v3 respetado ANTES de tocar `.ad`/`.game`
 *    (ver el comentario en la declaración de tipos de `SDK.init` más
 *    arriba) — `reportGameplayStart/Stop()` y `showRewardedAd/MidgameAd()`
 *    esperan internamente la Promise de init pendiente, sin que quien
 *    los llama (main.ts, los use cases) tenga que saber nada de esto ni
 *    cambiar su propia firma.
 * 3. Timeout de seguridad (15s): previene promesas colgadas si un callback no dispara.
 * 4. Notificacion de inicio/fin de gameplay tolerante a fallos.
 * 5. Manejo defensivo de excepciones durante la invocacion del SDK.
 * 6. Lectura del locale del jugador (systemInfo.locale) para auto-detectar
 *    idioma — ver getUserLocale() y LanguageManager.applyDetectedLocale().
 */
export class CrazyGamesService implements ICrazyGamesService {
  /**
   * Tiempo máximo de espera hasta que el SDK CONFIRME el inicio del anuncio
   * (`adStarted`) o falle (`adError`). Antes este timeout corría sobre el
   * anuncio ENTERO: un rewarded de 20-30 s vencía a mitad de reproducción,
   * se resolvía como error y el `adFinished` posterior se ignoraba — el
   * jugador veía el anuncio completo y no recibía la recompensa.
   */
  private static readonly AD_START_TIMEOUT_MS = 15000;
  /**
   * Red de seguridad DESPUÉS de `adStarted`: si el SDK nunca reporta
   * `adFinished`/`adError`, se libera el juego (audio + promesa) pasado este
   * tiempo, muy por encima de la duración de cualquier anuncio real.
   */
  private static readonly AD_PLAYBACK_SAFETY_TIMEOUT_MS = 120000;

  private ready = false;
  private initPromise: Promise<void> | null = null;
  private adblockDetected = false;
  /**
   * Ver notePermanentError(): cachea el adError del SDK
   * `{code: 'adsDisabledBasicLaunch'}` de Basic Launch (ADR-009).
   */
  private adsDisabled = false;
  private adInProgress = false;
  /**
   * Cooldown de 60 s del rewarded y el motivo del último fallo, extraídos
   * a `RewardCooldownTracker` (fuente única de esa semántica — también la
   * consume el próximo adapter de ads propio para portales externos).
   * Este servicio solo traduce el `AdResult` al lenguaje del tracker.
   */
  private readonly rewardCooldown = new RewardCooldownTracker();
  private readonly lifecycleListeners = new Set<AdLifecycleListener>();

  /**
   * Dispara `SDK.init()` UNA vez. Debe llamarse apenas se instancia el
   * servicio (ver main.ts, Composition Root) — ANTES de que cualquier
   * otro método de esta clase pueda ejecutarse con sentido. No hace
   * falta esperarla desde afuera: los demás métodos públicos esperan
   * internamente esta misma Promise antes de tocar el SDK real.
   *
   * Llamarla más de una vez es un no-op seguro (no relanza `SDK.init()`).
   */
  init(): void {
    if (this.initPromise) {
      return;
    }

    if (typeof window === 'undefined' || !window.CrazyGames?.SDK) {
      // Sin script del SDK cargado (dev local fuera de CrazyGames, SSR,
      // tests) — no hay nada que inicializar; `ready` queda en `false` y
      // todo lo demás se degrada a no-op de forma segura.
      this.initPromise = Promise.resolve();
      return;
    }

    this.initPromise = window.CrazyGames.SDK.init()
      .then(() => {
        this.ready = true;
        this.detectAdblock();
      })
      .catch((error: unknown) => {
        console.warn('[CrazyGamesService] SDK.init() failed — ads/telemetry quedan deshabilitados esta sesión.', error);
      });
  }

  isAvailable(): boolean {
    // Depende de DOS cosas: que el arranque haya cargado el script del
    // SDK (ADR-007: ya NO vive en index.html — lo inyecta
    // `main.ts → loadCrazyGamesSdk()`, solo en modo 'crazygames'; sin
    // eso, `window.CrazyGames` nunca existe) Y que `init()` ya
    // haya resuelto con éxito (`this.ready`) — acceder a `SDK.ad` antes
    // de eso tira un GeneralError síncrono no capturado (confirmado por
    // el trace `get ad @ crazygames-sdk-v3.js`), así que el `try/catch`
    // de acá abajo es una segunda red de seguridad, no el chequeo
    // principal: `this.ready` ya debería evitar llegar a ese caso.
    if (typeof window === 'undefined' || !this.ready) {
      return false;
    }
    try {
      return Boolean(window.CrazyGames?.SDK?.ad);
    } catch (error) {
      console.warn('[CrazyGamesService] Unexpected error reading SDK.ad', error);
      return false;
    }
  }

  /**
   * `true` solo si `rewardedAdStatus() === 'available'` — fuente única de
   * la lógica (SDK listo, sin adblock, sin cooldown), sin duplicarla acá.
   * Ver el JSDoc del puerto para qué se ofrece/oculta un rewarded.
   */
  isRewardedAdAvailable(): boolean {
    return this.rewardedAdStatus() === 'available';
  }

  /**
   * Motivo por el que hoy NO se puede ofrecer un rewarded (o
   * `'available'`). El orden importa y es contrato del puerto:
   * lo permanente (sin SDK, adblock, ads deshabilitados por Basic
   * Launch) manda sobre el cooldown de 60 s, porque solo eso define si
   * al consumir una mejora se reembolsa (política ADR-006 — ver
   * ICrazyGamesService.rewardedAdStatus).
   */
  rewardedAdStatus(): RewardedAdStatus {
    if (!this.isAvailable()) {
      return 'sdk_unavailable';
    }
    if (this.adblockDetected) {
      return 'adblock';
    }
    if (this.adsDisabled) {
      return 'ads_disabled';
    }
    const cooldown = this.rewardCooldown.cooldownState();
    if (cooldown !== null) {
      return cooldown;
    }
    return 'available';
  }

  onAdLifecycle(listener: AdLifecycleListener): () => void {
    this.lifecycleListeners.add(listener);
    return () => {
      this.lifecycleListeners.delete(listener);
    };
  }

  showRewardedAd(): Promise<AdResult> {
    return this.requestAd('rewarded');
  }

  showMidgameAd(): Promise<AdResult> {
    return this.requestAd('midgame');
  }

  reportGameplayStart(): void {
    // Firma pública sigue siendo síncrona (`void`) — nadie que la llama
    // (main.ts) necesita cambiar ni esperar nada — pero la ejecución
    // real espera adentro a que termine `init()` si todavía está en
    // curso, en vez de arriesgarse a la carrera de "esto corre en la
    // línea siguiente a `new CrazyGamesService()` + `init()`, mucho
    // antes de que esa Promise pueda haber resuelto".
    void this.afterReady(() => {
      try {
        window.CrazyGames?.SDK?.game?.gameplayStart();
      } catch (error) {
        console.warn('[CrazyGamesService] gameplayStart failed', error);
      }
    });
  }

  reportGameplayStop(): void {
    void this.afterReady(() => {
      try {
        window.CrazyGames?.SDK?.game?.gameplayStop();
      } catch (error) {
        console.warn('[CrazyGamesService] gameplayStop failed', error);
      }
    });
  }

  /**
   * Auto-detección de idioma (ver LanguageManager.applyDetectedLocale()
   * del lado del dominio de presentación): espera a que `init()` termine
   * y devuelve `SDK.user.systemInfo.locale` tal cual lo reporta el SDK
   * ("es-AR", "en-US", etc.), o `null` si el SDK no está disponible o no
   * expone un locale — nunca lanza, mismo criterio defensivo que el
   * resto de esta clase.
   */
  async getUserLocale(): Promise<string | null> {
    if (this.initPromise) {
      await this.initPromise;
    }

    if (!this.isAvailable()) {
      return null;
    }

    try {
      return window.CrazyGames?.SDK?.user?.systemInfo?.locale ?? null;
    } catch (error) {
      console.warn('[CrazyGamesService] Unexpected error reading SDK.user.systemInfo', error);
      return null;
    }
  }

  /** Espera el `init()` pendiente (si lo hay) y sólo entonces ejecuta `action`, si el SDK terminó disponible. */
  private async afterReady(action: () => void): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
    if (!this.isAvailable()) {
      return;
    }
    action();
  }

  private detectAdblock(): void {
    try {
      const check = window.CrazyGames?.SDK?.ad?.hasAdblock;
      if (typeof check !== 'function') {
        return;
      }
      void check
        .call(window.CrazyGames!.SDK!.ad)
        .then((hasAdblock: boolean) => {
          this.adblockDetected = Boolean(hasAdblock);
        })
        .catch(() => {
          // Sin dato fiable: se asume "sin adblock" y el fallo real (si lo
          // hubiera) lo resuelve el cooldown de rewarded.
        });
    } catch (error) {
      console.warn('[CrazyGamesService] hasAdblock() failed', error);
    }
  }

  private emitLifecycle(phase: AdLifecyclePhase, type: AdType): void {
    this.lifecycleListeners.forEach(listener => {
      try {
        listener(phase, type);
      } catch (error) {
        console.warn('[CrazyGamesService] Ad lifecycle listener threw', error);
      }
    });
  }

  /**
   * Lee el código del adError del SDK: el mismo dato puede llegar en
   * `code` o en `reason` (tolerancia heredada de cómo se detectaba
   * 'unfilled'). Devuelve `null` si no hay ningún código legible.
   */
  private static errorCodeOf(error: unknown): string | null {
    if (typeof error !== 'object' || error === null) {
      return null;
    }
    const data = error as { code?: unknown; reason?: unknown };
    if (typeof data.code === 'string' && data.code !== '') {
      return data.code;
    }
    if (typeof data.reason === 'string' && data.reason !== '') {
      return data.reason;
    }
    return null;
  }

  private static isUnfilled(error: unknown): boolean {
    return CrazyGamesService.errorCodeOf(error) === 'unfilled';
  }

  /**
   * CG-PUB-003 (auditoría de publicación 2026-10-04): dos códigos de
   * adError del SDK son ESTADOS PERMANENTES, no fallos genéricos:
   *
   * - `adsDisabledBasicLaunch`: Basic Launch deshabilita los rewarded.
   *   Sin cachearlo cada intento se cobraba y fallaba como 'error'
   *   reintentable → el jugador perdía monedas cada 60 s en un botón que
   *   nunca funciona (criterio de rechazo QA "no rewarded buttons
   *   without effect"). Cachearlo hace que `rewardedAdStatus()` lo
   *   reporte como `'ads_disabled'`: filas de la tienda ocultas +
   *   política 2 de reembolso al consumir (ADR-009).
   * - `adblock`: `hasAdblock()` puede no detectar la extensión (corre en
   *   `init`, antes de que exista) y el SDK avisa recién acá. Mapearlo a
   *   `adblockDetected` respeta ADR-006: permanencia → reembolsa — antes
   *   caía en 'error' → cooldown reintentable → SIN reembolso.
   */
  private notePermanentError(error: unknown): void {
    const code = CrazyGamesService.errorCodeOf(error);
    if (code === 'adsDisabledBasicLaunch') {
      this.adsDisabled = true;
    } else if (code === 'adblock') {
      this.adblockDetected = true;
    }
  }

  private async requestAd(type: AdType): Promise<AdResult> {
    if (this.initPromise) {
      await this.initPromise;
    }

    if (!this.isAvailable()) {
      console.info(`[CrazyGamesService] SDK not available. Ad request for "${type}" resolved as sdk_unavailable.`);
      return { success: false, reason: 'sdk_unavailable' };
    }

    // Un solo anuncio a la vez: el SDK no admite requests solapados y, sin
    // este guard, dos llamadas romperían el par started/ended del audio.
    if (this.adInProgress) {
      return { success: false, reason: 'error' };
    }
    this.adInProgress = true;

    return new Promise<AdResult>((resolve) => {
      let isSettled = false;
      // `true` desde `adStarted` hasta que se emite 'ended'. Es independiente
      // de `isSettled`: si el start-timeout ya resolvió la promesa pero el SDK
      // arranca el anuncio igual, el audio se silencia Y se restaura igual.
      let lifecycleOpen = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const closeLifecycle = (): void => {
        if (lifecycleOpen) {
          lifecycleOpen = false;
          this.emitLifecycle('ended', type);
        }
      };

      const settle = (result: AdResult): void => {
        if (isSettled) {
          return;
        }
        isSettled = true;
        if (timer !== undefined) {
          clearTimeout(timer);
        }
        this.adInProgress = false;
        if (type === 'rewarded') {
          // Éxito → limpia cooldown Y motivo (status vuelve a 'available');
          // fallo → arranca el cooldown de 60 s y registra el motivo que
          // decide la política de reembolso (ADR-006): sin fill reembolsa,
          // cualquier otro fallo es reintentable y NO reembolsa. Esa
          // semántica vive en RewardCooldownTracker (fuente única, también
          // la usa el segundo adapter de ads); acá solo se traduce el
          // resultado del SDK a su lenguaje.
          if (result.success) {
            this.rewardCooldown.noteSuccess();
          } else {
            this.rewardCooldown.noteFailure(result.reason === 'ad_unavailable' ? 'no_fill' : 'other');
          }
        }
        resolve(result);
      };

      timer = setTimeout(() => {
        console.warn(`[CrazyGamesService] Ad "${type}" did not start within ${CrazyGamesService.AD_START_TIMEOUT_MS}ms.`);
        settle({ success: false, reason: 'error' });
      }, CrazyGamesService.AD_START_TIMEOUT_MS);

      try {
        window.CrazyGames!.SDK!.ad.requestAd(type, {
          adStarted: () => {
            if (!lifecycleOpen) {
              lifecycleOpen = true;
              this.emitLifecycle('started', type);
            }
            if (!isSettled) {
              // Ya empezó: el timeout de arranque deja de aplicar.
              if (timer !== undefined) {
                clearTimeout(timer);
              }
              timer = setTimeout(() => {
                console.warn(`[CrazyGamesService] Ad "${type}" never reported end; releasing the game.`);
                closeLifecycle();
                settle({ success: false, reason: 'error' });
              }, CrazyGamesService.AD_PLAYBACK_SAFETY_TIMEOUT_MS);
            }
          },
          adFinished: () => {
            closeLifecycle();
            settle({ success: true });
          },
          adError: (error: unknown) => {
            console.warn('[CrazyGamesService] Ad error received from SDK:', error);
            closeLifecycle();
            // ANTES de settle: el settle de rewarded arranca el cooldown
            // de 60 s, y el status nuevo ('ads_disabled'/'adblock') tiene
            // que mandar sobre ese cooldown — ver notePermanentError.
            this.notePermanentError(error);
            settle({
              success: false,
              reason: CrazyGamesService.isUnfilled(error) ? 'ad_unavailable' : 'error'
            });
          }
        });
      } catch (error) {
        console.error('[CrazyGamesService] Unexpected exception requesting ad:', error);
        closeLifecycle();
        settle({ success: false, reason: 'error' });
      }
    });
  }
}
