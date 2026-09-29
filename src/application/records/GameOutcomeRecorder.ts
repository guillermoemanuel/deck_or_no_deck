import { IDailyChallengeRepository } from '../../domain/ports/IDailyChallengeRepository';
import { IRecordsRepository } from '../../domain/ports/IRecordsRepository';
import { completeDaily, markDailyStarted } from '../../domain/value-objects/DailyChallenge';
import { applyGameResult, GameResult } from '../../domain/value-objects/PlayerRecords';

/** Lo que el jugador debe ver al terminar (lo lee ResultScene). */
export interface GameSummary {
  readonly isNewBestPayout: boolean;
  readonly daily?: {
    readonly reward: number;
    readonly streak: number;
  };
}

interface CoinsAwarder {
  awardGameplayCoins(amount: number): void;
}

/**
 * Registra el resultado final de una partida: actualiza los récords y, si era
 * el Desafío Diario, lo completa y acredita la recompensa. Tiempo y storage
 * llegan por parámetro/puerto, así que es totalmente testeable.
 */
export class GameOutcomeRecorder {
  constructor(
    private readonly records: IRecordsRepository,
    private readonly daily: IDailyChallengeRepository,
    private readonly coins: CoinsAwarder
  ) {}

  /** Consume el intento diario de `dateKey` (idempotente). Llamar al empezar la partida. */
  startDaily(dateKey: string): void {
    this.daily.save(markDailyStarted(this.daily.get(), dateKey));
  }

  record(result: GameResult, dailyDateKey: string | null): GameSummary {
    const update = applyGameResult(this.records.get(), result);
    this.records.save(update.records);

    if (dailyDateKey === null) {
      return { isNewBestPayout: update.isNewBestPayout };
    }

    const completion = completeDaily(this.daily.get(), dailyDateKey, result.outcome === 'won' ? result.amount : 0);
    this.daily.save(completion.state);
    if (completion.reward > 0) {
      this.coins.awardGameplayCoins(completion.reward);
    }
    return {
      isNewBestPayout: update.isNewBestPayout,
      daily: completion.reward > 0 ? { reward: completion.reward, streak: completion.streak } : undefined
    };
  }
}
