import { LocalStorageOnboardingRepository } from './LocalStorageOnboardingRepository';

const KEY = 'speculation_game_onboarding_v1';

function installStorage(initial?: string | (() => never)): Map<string, string> {
  const data = new Map<string, string>();
  if (typeof initial === 'string') {
    data.set(KEY, initial);
  }
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => {
        if (typeof initial === 'function') initial();
        return data.get(k) ?? null;
      },
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

describe('LocalStorageOnboardingRepository', () => {
  afterEach(() => {
    delete (globalThis as unknown as { window?: unknown }).window;
  });

  it('arranca vacío sin datos previos', () => {
    installStorage();
    const repo = new LocalStorageOnboardingRepository();

    expect(repo.getSeenHints()).toEqual([]);
    expect(repo.isSkipped()).toBe(false);
  });

  it('persiste lo visto y lo omitido entre instancias', () => {
    installStorage();
    const first = new LocalStorageOnboardingRepository();
    first.markSeen('open_card');
    first.markSeen('open_card'); // idempotente
    first.markSkipped();

    const second = new LocalStorageOnboardingRepository();
    expect(second.getSeenHints()).toEqual(['open_card']);
    expect(second.isSkipped()).toBe(true);
  });

  it('descarta ids desconocidos y datos corruptos sin romper', () => {
    installStorage(JSON.stringify({ seen: ['energy', 'inventado', 42], skipped: 'si' }));
    const repo = new LocalStorageOnboardingRepository();

    expect(repo.getSeenHints()).toEqual(['energy']);
    expect(repo.isSkipped()).toBe(false);

    installStorage('{no es json');
    expect(new LocalStorageOnboardingRepository().getSeenHints()).toEqual([]);
  });

  it('si localStorage lanza, sigue funcionando en memoria', () => {
    const data = installStorage(() => {
      throw new Error('SecurityError');
    });
    (globalThis as unknown as { window: { localStorage: { setItem: () => never } } }).window.localStorage.setItem = () => {
      throw new Error('QuotaExceeded');
    };
    const repo = new LocalStorageOnboardingRepository();

    expect(() => repo.markSeen('energy')).not.toThrow();
    expect(repo.getSeenHints()).toEqual(['energy']);
    expect(data.size).toBe(0);
  });
});
