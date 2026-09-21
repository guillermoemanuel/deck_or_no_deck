import { GameSession } from '../../domain/entities/GameSession';
import { ICrazyGamesService } from '../../domain/ports/ICrazyGamesService';
import { GameEvent } from '../../domain/events/GameEvents';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';

export type ReviveResult =
  | { revived: true }
  | { revived: false; reason: 'ad_failed' | 'sdk_unavailable' | 'not_eligible' };

/**
 * Coordina un efecto secundario (anuncio recompensado) con una regla de
 * dominio (revivir). El dominio permanece ignorante de que existio un anuncio.
 */
export class ReviveWithAdUseCase {
  constructor(
    private readonly session: GameSession,
    private readonly crazyGamesService: ICrazyGamesService,
    private readonly eventBus: SimpleEventEmitter<GameEvent>
  ) {}

  async execute(): Promise<ReviveResult> {
    if (this.session.getStatus() !== 'lost') {
      return { revived: false, reason: 'not_eligible' };
    }

    if (!this.crazyGamesService.isAvailable()) {
      return { revived: false, reason: 'sdk_unavailable' };
    }

    const adResult = await this.crazyGamesService.showRewardedAd();

    if (!adResult.success) {
      return { revived: false, reason: 'ad_failed' };
    }

    this.session.reviveWithFullEnergy();
    // BUGFIX (nivel de energía): el porcentaje post-revive ya NO es
    // necesariamente 100 (EnergyLevel.STARTING = 50, + bonus de tienda si
    // aplica) — se lee del dominio en vez de que la presentación asuma un
    // valor fijo.
    this.eventBus.emit({ type: 'GameRevived', energyPercentage: this.session.getEnergyPercentage() });

    return { revived: true };
  }
}
