import { IRecordsRepository } from '../../domain/ports/IRecordsRepository';
import { EMPTY_RECORDS, PlayerRecords } from '../../domain/value-objects/PlayerRecords';
import { readJson, removeKey, toCount, writeJson } from './jsonStorage';

const STORAGE_KEY = 'speculation_game_records_v1';

export class LocalStorageRecordsRepository implements IRecordsRepository {
  private records: PlayerRecords;

  constructor() {
    this.records = this.load();
  }

  get(): PlayerRecords {
    return this.records;
  }

  save(records: PlayerRecords): void {
    this.records = records;
    writeJson(STORAGE_KEY, records);
  }

  reset(): void {
    this.records = EMPTY_RECORDS;
    removeKey(STORAGE_KEY);
  }

  private load(): PlayerRecords {
    const raw = readJson(STORAGE_KEY);
    if (typeof raw !== 'object' || raw === null) {
      return EMPTY_RECORDS;
    }
    const data = raw as Record<string, unknown>;
    const wins = toCount(data.wins);
    const losses = toCount(data.losses);
    return {
      // Se recalcula desde wins+losses: un valor suelto corrupto no puede desincronizar el total.
      gamesPlayed: wins + losses,
      wins,
      losses,
      bestPayout: toCount(data.bestPayout),
      currentWinStreak: toCount(data.currentWinStreak),
      bestWinStreak: toCount(data.bestWinStreak)
    };
  }
}
