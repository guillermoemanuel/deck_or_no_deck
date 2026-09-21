import { ICrazyGamesService } from '../../domain/ports/ICrazyGamesService';
import { IProgressionService } from '../../domain/ports/IProgressionService';

export type RewardMultiplier = 2 | 3;

export type MultiplyRewardResult =
  | { success: true; bonusAwarded: number; newTotal: number }
  | { success: false; reason: 'ad_failed' | 'sdk_unavailable' | 'already_claimed' };

/**
 * Coordina "ver anuncio -> si tiene exito, otorgar la diferencia entre premio
 * base y premio multiplicado". El monto BASE ya fue acreditado por
 * ResolveDealUseCase al aceptar el DEAL — aqui solo se otorga la DIFERENCIA.
 *
 * Aplica Dependency Inversion recibiendo IProgressionService e ICrazyGamesService.
 */
export class MultiplyRewardUseCase {
  private claimed = false;
  private isProcessing = false;

  constructor(
    private readonly baseAmount: number,
    private readonly crazyGamesService: ICrazyGamesService,
    private readonly progressionService: IProgressionService
  ) {}

  async execute(multiplier: RewardMultiplier): Promise<MultiplyRewardResult> {
    if (this.claimed || this.isProcessing) {
      return { success: false, reason: 'already_claimed' };
    }

    if (!this.crazyGamesService.isAvailable()) {
      return { success: false, reason: 'sdk_unavailable' };
    }

    // Marcado SINCRONICO, antes de cualquier `await`: cierra la ventana de
    // carrera para llamadas concurrentes sin necesidad de un mutex real.
    this.isProcessing = true;

    try {
      const adResult = await this.crazyGamesService.showRewardedAd();
      if (!adResult.success) {
        return { success: false, reason: 'ad_failed' };
      }

      const bonusAwarded = this.baseAmount * (multiplier - 1);
      this.progressionService.awardGameplayCoins(bonusAwarded);
      this.claimed = true;

      return { success: true, bonusAwarded, newTotal: this.progressionService.getCoins() };
    } finally {
      this.isProcessing = false;
    }
  }

  isClaimed(): boolean {
    return this.claimed;
  }
}
