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
}
