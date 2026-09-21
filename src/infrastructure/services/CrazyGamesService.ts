import { ICrazyGamesService, AdResult } from '../../domain/ports/ICrazyGamesService';

declare global {
  interface Window {
    CrazyGames?: {
      SDK?: {
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
 * 2. Timeout de seguridad (15s): previene promesas colgadas si un callback no dispara.
 * 3. Notificacion de inicio/fin de gameplay tolerante a fallos.
 * 4. Manejo defensivo de excepciones durante la invocacion del SDK.
 */
export class CrazyGamesService implements ICrazyGamesService {
  private static readonly AD_TIMEOUT_MS = 15000;

  isAvailable(): boolean {
    return typeof window !== 'undefined' && Boolean(window.CrazyGames?.SDK?.ad);
  }

  showRewardedAd(): Promise<AdResult> {
    return this.requestAd('rewarded');
  }

  showMidgameAd(): Promise<AdResult> {
    return this.requestAd('midgame');
  }

  reportGameplayStart(): void {
    if (!this.isAvailable()) {
      return;
    }
    try {
      window.CrazyGames?.SDK?.game?.gameplayStart();
    } catch (error) {
      console.warn('[CrazyGamesService] gameplayStart failed', error);
    }
  }

  reportGameplayStop(): void {
    if (!this.isAvailable()) {
      return;
    }
    try {
      window.CrazyGames?.SDK?.game?.gameplayStop();
    } catch (error) {
      console.warn('[CrazyGamesService] gameplayStop failed', error);
    }
  }

  private requestAd(type: 'rewarded' | 'midgame'): Promise<AdResult> {
    if (!this.isAvailable()) {
      console.info(`[CrazyGamesService] SDK not available. Ad request for "${type}" resolved as sdk_unavailable.`);
      return Promise.resolve({ success: false, reason: 'sdk_unavailable' });
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
