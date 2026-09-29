/** Récords personales del jugador (se guardan en el dispositivo, no hay ranking online). */
export interface PlayerRecords {
  readonly gamesPlayed: number;
  readonly wins: number;
  readonly losses: number;
  /** Mayor premio ganado en una sola partida. */
  readonly bestPayout: number;
  readonly currentWinStreak: number;
  readonly bestWinStreak: number;
}

export const EMPTY_RECORDS: PlayerRecords = {
  gamesPlayed: 0,
  wins: 0,
  losses: 0,
  bestPayout: 0,
  currentWinStreak: 0,
  bestWinStreak: 0
};

export interface GameResult {
  readonly outcome: 'won' | 'lost';
  /** Premio de la partida (solo relevante si ganó). */
  readonly amount: number;
}

export interface RecordsUpdate {
  readonly records: PlayerRecords;
  /** `true` si esta victoria superó el mejor premio anterior (y ya había uno). */
  readonly isNewBestPayout: boolean;
}

/**
 * Aplica el resultado de una partida a los récords. Un primer premio nunca se
 * marca como "nuevo récord" (no hay nada que superar): evita festejar en la
 * primera victoria de cada jugador.
 */
export function applyGameResult(records: PlayerRecords, result: GameResult): RecordsUpdate {
  if (result.outcome === 'lost') {
    return {
      isNewBestPayout: false,
      records: {
        ...records,
        gamesPlayed: records.gamesPlayed + 1,
        losses: records.losses + 1,
        currentWinStreak: 0
      }
    };
  }

  const amount = Math.max(0, Math.floor(result.amount));
  const currentWinStreak = records.currentWinStreak + 1;
  return {
    isNewBestPayout: records.bestPayout > 0 && amount > records.bestPayout,
    records: {
      ...records,
      gamesPlayed: records.gamesPlayed + 1,
      wins: records.wins + 1,
      bestPayout: Math.max(records.bestPayout, amount),
      currentWinStreak,
      bestWinStreak: Math.max(records.bestWinStreak, currentWinStreak)
    }
  };
}

/** Porcentaje entero de victorias (0 si todavía no jugó). */
export function getWinRatePercent(records: PlayerRecords): number {
  return records.gamesPlayed === 0 ? 0 : Math.round((records.wins / records.gamesPlayed) * 100);
}
