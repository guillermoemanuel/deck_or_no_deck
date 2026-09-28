import { ICrazyGamesService, AdResult } from '../../domain/ports/ICrazyGamesService';

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
  private static readonly AD_TIMEOUT_MS = 15000;

  private ready = false;
  private initPromise: Promise<void> | null = null;

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
      })
      .catch((error: unknown) => {
        console.warn('[CrazyGamesService] SDK.init() failed — ads/telemetry quedan deshabilitados esta sesión.', error);
      });
  }

  isAvailable(): boolean {
    // Depende de DOS cosas: que `index.html` haya cargado el script del
    // SDK (sin eso, `window.CrazyGames` nunca existe) Y que `init()` ya
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

  private async requestAd(type: 'rewarded' | 'midgame'): Promise<AdResult> {
    // Ya era async/Promise (y ya se espera con `await` en los use cases
    // que la llaman), así que agregar este `await` acá es un cambio
    // totalmente compatible: nadie afuera nota la diferencia salvo que
    // ahora, si `init()` sigue en curso, esto espera a que termine en
    // vez de fallar de una con `sdk_unavailable` por una carrera de timing.
    if (this.initPromise) {
      await this.initPromise;
    }

    if (!this.isAvailable()) {
      console.info(`[CrazyGamesService] SDK not available. Ad request for "${type}" resolved as sdk_unavailable.`);
      return { success: false, reason: 'sdk_unavailable' };
    }

    return new Promise<AdResult>((resolve) => {
      let isSettled = false;

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          console.warn(`[CrazyGamesService] Ad request for "${type}" timed out after ${CrazyGamesService.AD_TIMEOUT_MS}ms.`);
          resolve({ success: false, reason: 'error' });
        }
      }, CrazyGamesService.AD_TIMEOUT_MS);

      try {
        window.CrazyGames!.SDK!.ad.requestAd(type, {
          adFinished: () => {
            if (!isSettled) {
              isSettled = true;
              clearTimeout(timer);
              resolve({ success: true });
            }
          },
          adError: (error: unknown) => {
            if (!isSettled) {
              isSettled = true;
              clearTimeout(timer);
              console.warn('[CrazyGamesService] Ad error received from SDK:', error);
              resolve({ success: false, reason: 'ad_unavailable' });
            }
          }
        });
      } catch (error) {
        if (!isSettled) {
          isSettled = true;
          clearTimeout(timer);
          console.error('[CrazyGamesService] Unexpected exception requesting ad:', error);
          resolve({ success: false, reason: 'error' });
        }
      }
    });
  }
}