import { LocalStorageDailyChallengeRepository } from './LocalStorageDailyChallengeRepository';
import { LocalStorageRecordsRepository } from './LocalStorageRecordsRepository';
import { EMPTY_DAILY_STATE } from '../../domain/value-objects/DailyChallenge';
import { EMPTY_RECORDS } from '../../domain/value-objects/PlayerRecords';

function installStorage(initial: Record<string, string> = {}): Map<string, string> {
  const data = new Map<string, string>(Object.entries(initial));
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => data.get(k) ?? null,
      setItem: (k: string, v: string) => {
        data.set(k, v);
      },
      removeItem: (k: string) => {
        data.delete(k);
      }
    }
  };
  return data;
}

describe('LocalStorageRecordsRepository', () => {
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('arranca vacío, persiste y se puede reiniciar', () => {
    installStorage();
    const repo = new LocalStorageRecordsRepository();
    expect(repo.get()).toEqual(EMPTY_RECORDS);

    repo.save({ gamesPlayed: 3, wins: 2, losses: 1, bestPayout: 900, currentWinStreak: 1, bestWinStreak: 2 });
    expect(new LocalStorageRecordsRepository().get().bestPayout).toBe(900);

    repo.reset();
    expect(new LocalStorageRecordsRepository().get()).toEqual(EMPTY_RECORDS);
  });

  it('sanea datos corruptos y recalcula el total de partidas', () => {
    installStorage({
      speculation_game_records_v1: JSON.stringify({ wins: 4, losses: 1, gamesPlayed: 999, bestPayout: -5, bestWinStreak: 'x' })
    });
    const records = new LocalStorageRecordsRepository().get();

    expect(records).toMatchObject({ gamesPlayed: 5, wins: 4, losses: 1, bestPayout: 0, bestWinStreak: 0 });
  });

  it('un JSON inválido no rompe: vuelve a vacío', () => {
    installStorage({ speculation_game_records_v1: '{roto' });

    expect(new LocalStorageRecordsRepository().get()).toEqual(EMPTY_RECORDS);
  });
});

describe('LocalStorageDailyChallengeRepository', () => {
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('persiste entre instancias', () => {
    installStorage();
    new LocalStorageDailyChallengeRepository().save({
      ...EMPTY_DAILY_STATE,
      lastStartedDate: '2026-09-28',
      lastCompletedDate: '2026-09-28',
      currentStreak: 2,
      bestStreak: 2,
      totalCompleted: 2
    });

    expect(new LocalStorageDailyChallengeRepository().get()).toMatchObject({
      lastCompletedDate: '2026-09-28',
      currentStreak: 2
    });
  });

  it('descarta fechas con formato inválido y contadores negativos', () => {
    installStorage({
      speculation_game_daily_v1: JSON.stringify({ lastStartedDate: 'ayer', lastCompletedDate: '2026-9-1', currentStreak: -3 })
    });
    const state = new LocalStorageDailyChallengeRepository().get();

    expect(state).toEqual(EMPTY_DAILY_STATE);
  });
});
