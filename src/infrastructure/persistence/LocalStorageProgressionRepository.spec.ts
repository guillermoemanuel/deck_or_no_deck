import { LocalStorageProgressionRepository } from './LocalStorageProgressionRepository';

const KEY = 'speculation_game_progression_v1';

function installStorage(initial?: string): void {
  const data = new Map<string, string>();
  if (typeof initial === 'string') {
    data.set(KEY, initial);
  }
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
}

/** Save v4 completo (esquema anterior al anti-farmeo): sin firstRoundDealStreak. */
function saveV4(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    schemaVersion: 4,
    coins: 1234,
    ownedDeckIds: ['basic', 'cyberpunk'],
    selectedDeckId: 'cyberpunk',
    periodicBonusCycleStart: 1700000000000,
    ...overrides
  });
}

describe('LocalStorageProgressionRepository', () => {
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  describe('arranque y saneo básico', () => {
    it('arranca con valores por defecto sin datos previos', () => {
      installStorage();
      const repo = new LocalStorageProgressionRepository();

      expect(repo.getCoins()).toBe(0);
      expect(repo.getOwnedDeckIds()).toEqual(['basic']);
      expect(repo.getFirstRoundDealStreak().consecutiveFirstRoundDeals).toBe(0);
      expect(repo.getFirstRoundDealStreak().cappedGamesRemaining).toBe(0);
      expect(repo.getFirstRoundDealStreak().isActive).toBe(false);
    });

    it('resets on corrupted JSON without throwing', () => {
      installStorage('{no es json');
      const repo = new LocalStorageProgressionRepository();

      expect(repo.getCoins()).toBe(0);
      expect(repo.getFirstRoundDealStreak().isActive).toBe(false);
    });
  });

  describe('esquema v5 — firstRoundDealStreak', () => {
    it('round-trips the streak between instances (persistencia real en localStorage)', () => {
      installStorage();
      const first = new LocalStorageProgressionRepository();
      first.setFirstRoundDealStreak(first.getFirstRoundDealStreak().withGameEnd({
        firstRoundDealAccepted: true,
        rejectedRound1Offer: false
      }));

      const second = new LocalStorageProgressionRepository();
      expect(second.getFirstRoundDealStreak().consecutiveFirstRoundDeals).toBe(1);
    });

    it('migrates a v4 save non-destructively (backfill 0/0, preserva monedas y mazos)', () => {
      installStorage(saveV4());
      const repo = new LocalStorageProgressionRepository();

      expect(repo.getCoins()).toBe(1234);
      expect(repo.getOwnedDeckIds()).toEqual(['basic', 'cyberpunk']);
      expect(repo.getSelectedDeckId()).toBe('cyberpunk');
      expect(repo.getFirstRoundDealStreak().consecutiveFirstRoundDeals).toBe(0);
      expect(repo.getFirstRoundDealStreak().cappedGamesRemaining).toBe(0);
    });

    it('persists the migrated save as schemaVersion 5 after any write', () => {
      const stored = new Map<string, string>();
      const initial = saveV4();
      (globalThis as unknown as { window: unknown }).window = {
        localStorage: {
          getItem: (k: string) => (k === KEY ? initial : stored.get(k) ?? null),
          setItem: (k: string, v: string) => stored.set(k, v),
          removeItem: (k: string) => stored.delete(k)
        }
      };
      const repo = new LocalStorageProgressionRepository();
      repo.addCoins(1);

      const persisted = JSON.parse(stored.get(KEY) ?? '{}') as { schemaVersion: number };
      expect(persisted.schemaVersion).toBe(5);
    });

    it('sanitizes corrupt streak values on load (fuera de rango o no numéricos => 0)', () => {
      installStorage(saveV4({ firstRoundDealStreak: { consecutiveFirstRoundDeals: 99, cappedGamesRemaining: -2 } }));
      const repo = new LocalStorageProgressionRepository();

      expect(repo.getFirstRoundDealStreak().consecutiveFirstRoundDeals).toBe(0);
      expect(repo.getFirstRoundDealStreak().cappedGamesRemaining).toBe(0);
    });

    it('resets the streak along with clearAll (reset completo del progreso)', () => {
      installStorage();
      const repo = new LocalStorageProgressionRepository();
      repo.setFirstRoundDealStreak(repo.getFirstRoundDealStreak().withGameEnd({
        firstRoundDealAccepted: true,
        rejectedRound1Offer: false
      }));
      expect(repo.getFirstRoundDealStreak().consecutiveFirstRoundDeals).toBe(1);

      repo.clearAll();

      expect(repo.getFirstRoundDealStreak().consecutiveFirstRoundDeals).toBe(0);
      expect(repo.getFirstRoundDealStreak().cappedGamesRemaining).toBe(0);
    });
  });
});
