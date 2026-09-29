import { IDailyChallengeRepository } from '../../domain/ports/IDailyChallengeRepository';
import { DailyChallengeState, EMPTY_DAILY_STATE } from '../../domain/value-objects/DailyChallenge';
import { readJson, toCount, writeJson } from './jsonStorage';

const STORAGE_KEY = 'speculation_game_daily_v1';
const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toDateKey(value: unknown): string | null {
  return typeof value === 'string' && DATE_KEY_PATTERN.test(value) ? value : null;
}

export class LocalStorageDailyChallengeRepository implements IDailyChallengeRepository {
  private state: DailyChallengeState;

  constructor() {
    this.state = this.load();
  }

  get(): DailyChallengeState {
    return this.state;
  }

  save(state: DailyChallengeState): void {
    this.state = state;
    writeJson(STORAGE_KEY, state);
  }

  private load(): DailyChallengeState {
    const raw = readJson(STORAGE_KEY);
    if (typeof raw !== 'object' || raw === null) {
      return EMPTY_DAILY_STATE;
    }
    const data = raw as Record<string, unknown>;
    return {
      lastStartedDate: toDateKey(data.lastStartedDate),
      lastCompletedDate: toDateKey(data.lastCompletedDate),
      currentStreak: toCount(data.currentStreak),
      bestStreak: toCount(data.bestStreak),
      totalCompleted: toCount(data.totalCompleted),
      bestPayout: toCount(data.bestPayout)
    };
  }
}
