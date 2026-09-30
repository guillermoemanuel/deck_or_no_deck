/**
 * LanguageManager toca `window.localStorage` directamente (mismo patrón
 * que LocalStorageProgressionRepository en infrastructure/, que tampoco
 * tiene spec propio en este proyecto por la misma razón: el resto de la
 * suite corre con testEnvironment: 'node', sin `window` global).
 *
 * En vez de agregar jsdom a todo el proyecto solo por este archivo, se
 * define acá un polyfill mínimo de localStorage — suficiente para
 * ejercitar la lógica real de LanguageManager sin tocar la config global
 * de Jest.
 *
 * Como LanguageManager es un singleton de módulo (una sola instancia
 * construida al importar el archivo), cada test necesita una instancia
 * FRESCA para poder probar `resolveInitialLanguage()` de forma aislada
 * — se logra con jest.resetModules() + require() dinámico en cada test.
 */

class FakeLocalStorage {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

let fakeLocalStorage: FakeLocalStorage;

beforeEach(() => {
  fakeLocalStorage = new FakeLocalStorage();
  (global as unknown as { window: { localStorage: FakeLocalStorage } }).window = {
    localStorage: fakeLocalStorage
  };
  jest.resetModules();
});

/** Importa una instancia NUEVA del singleton, tal como quedaría tras (re)cargar la app. */
function freshLanguageManager(): typeof import('./LanguageManager').default {
  return require('./LanguageManager').default;
}

describe('LanguageManager', () => {
  describe('estado inicial', () => {
    it('defaults to DEFAULT_LANGUAGE when localStorage is empty', () => {
      const languageManager = freshLanguageManager();
      expect(languageManager.getCurrentLanguage()).toBe('en');
    });

    it('restores a previously saved, supported language from localStorage', () => {
      fakeLocalStorage.setItem('speculation_game_language', 'es');
      const languageManager = freshLanguageManager();
      expect(languageManager.getCurrentLanguage()).toBe('es');
    });

    it('falls back to DEFAULT_LANGUAGE if localStorage has an unsupported/corrupted value', () => {
      fakeLocalStorage.setItem('speculation_game_language', 'klingon');
      const languageManager = freshLanguageManager();
      expect(languageManager.getCurrentLanguage()).toBe('en');
    });

    it('does not crash if window.localStorage throws (e.g. blocked storage)', () => {
      (global as unknown as { window: { localStorage: unknown } }).window = {
        localStorage: {
          getItem: () => {
            throw new Error('storage blocked');
          }
        }
      };
      expect(() => freshLanguageManager()).not.toThrow();
    });
  });

  describe('getSupportedLanguages', () => {
    it('includes both "en" and "es"', () => {
      const languageManager = freshLanguageManager();
      expect([...languageManager.getSupportedLanguages()].sort()).toEqual(['en', 'es']);
    });
  });

  describe('setLanguage', () => {
    it('changes the current language for a supported code', () => {
      const languageManager = freshLanguageManager();
      const result = languageManager.setLanguage('es');

      expect(result).toBe(true);
      expect(languageManager.getCurrentLanguage()).toBe('es');
    });

    it('persists the choice to localStorage', () => {
      const languageManager = freshLanguageManager();
      languageManager.setLanguage('es');

      expect(fakeLocalStorage.getItem('speculation_game_language')).toBe('es');
    });

    it('rejects an unsupported language code and leaves the current one unchanged', () => {
      const languageManager = freshLanguageManager();
      const result = languageManager.setLanguage('fr');

      expect(result).toBe(false);
      expect(languageManager.getCurrentLanguage()).toBe('en');
    });

    it('emits onLanguageChanged exactly once when the language actually changes', () => {
      const languageManager = freshLanguageManager();
      const listener = jest.fn();
      languageManager.onLanguageChanged(listener);

      languageManager.setLanguage('es');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ language: 'es' });
    });

    it('does NOT emit onLanguageChanged when setting the same language already active', () => {
      const languageManager = freshLanguageManager();
      const listener = jest.fn();
      languageManager.onLanguageChanged(listener);

      languageManager.setLanguage('en'); // ya está en 'en' por defecto

      expect(listener).not.toHaveBeenCalled();
    });

    it('the unsubscribe function returned by onLanguageChanged stops further notifications', () => {
      const languageManager = freshLanguageManager();
      const listener = jest.fn();
      const unsubscribe = languageManager.onLanguageChanged(listener);

      unsubscribe();
      languageManager.setLanguage('es');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('applyDetectedLocale', () => {
    it('applies the primary language subtag of a supported locale when nothing is stored yet', () => {
      const languageManager = freshLanguageManager();
      languageManager.applyDetectedLocale('es-AR');

      expect(languageManager.getCurrentLanguage()).toBe('es');
    });

    it('persists the detected language, same storage key as a manual choice', () => {
      const languageManager = freshLanguageManager();
      languageManager.applyDetectedLocale('es-AR');

      expect(fakeLocalStorage.getItem('speculation_game_language')).toBe('es');
    });

    it('emits onLanguageChanged when the detected language actually changes', () => {
      const languageManager = freshLanguageManager();
      const listener = jest.fn();
      languageManager.onLanguageChanged(listener);

      languageManager.applyDetectedLocale('es-AR');

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith({ language: 'es' });
    });

    it('does NOT emit onLanguageChanged when the detected locale matches the language already active (default "en")', () => {
      const languageManager = freshLanguageManager();
      const listener = jest.fn();
      languageManager.onLanguageChanged(listener);

      languageManager.applyDetectedLocale('en-US');

      expect(listener).not.toHaveBeenCalled();
      expect(languageManager.getCurrentLanguage()).toBe('en');
    });

    it('falls back to English (no-op) for an unsupported locale, leaving DEFAULT_LANGUAGE active', () => {
      const languageManager = freshLanguageManager();
      languageManager.applyDetectedLocale('fr-FR');

      expect(languageManager.getCurrentLanguage()).toBe('en');
      expect(fakeLocalStorage.getItem('speculation_game_language')).toBeNull();
    });

    it('does NOT override a language the player already picked manually', () => {
      const languageManager = freshLanguageManager();
      languageManager.setLanguage('en'); // elección explícita del jugador (aunque coincida con el default)

      languageManager.applyDetectedLocale('es-AR');

      expect(languageManager.getCurrentLanguage()).toBe('en');
    });

    it('does NOT override a language restored from a previous session (already in localStorage)', () => {
      fakeLocalStorage.setItem('speculation_game_language', 'es');
      const languageManager = freshLanguageManager();

      languageManager.applyDetectedLocale('en-US');

      expect(languageManager.getCurrentLanguage()).toBe('es');
    });

    it('is idempotent on a second call once a language is already stored from a first detection', () => {
      const languageManager = freshLanguageManager();
      languageManager.applyDetectedLocale('es-AR');

      const listener = jest.fn();
      languageManager.onLanguageChanged(listener);
      languageManager.applyDetectedLocale('en-US'); // ya hay algo guardado -> no-op

      expect(listener).not.toHaveBeenCalled();
      expect(languageManager.getCurrentLanguage()).toBe('es');
    });

    it('does not crash on a locale with an underscore separator instead of a hyphen', () => {
      const languageManager = freshLanguageManager();
      expect(() => languageManager.applyDetectedLocale('es_AR')).not.toThrow();
      expect(languageManager.getCurrentLanguage()).toBe('es');
    });
  });

  describe('getText', () => {
    it('returns the text in the current language', () => {
      const languageManager = freshLanguageManager();
      languageManager.setLanguage('es');

      expect(languageManager.getText('MENU_PLAY_AGAIN_BUTTON')).toBe('JUGAR DE NUEVO');
    });

    it('reflects a language change immediately for the same key', () => {
      const languageManager = freshLanguageManager();

      expect(languageManager.getText('MENU_PLAY_AGAIN_BUTTON')).toBe('PLAY AGAIN');
      languageManager.setLanguage('es');
      expect(languageManager.getText('MENU_PLAY_AGAIN_BUTTON')).toBe('JUGAR DE NUEVO');
    });

    it('interpolates a single numeric param', () => {
      const languageManager = freshLanguageManager();
      expect(languageManager.getText('BANKER_OFFER_AMOUNT', { amount: 5000 })).toBe('$5000');
    });

    it('interpolates a string param', () => {
      const languageManager = freshLanguageManager();
      expect(languageManager.getText('MENU_COINS_LABEL', { amount: '12,000' })).toBe('💰 12,000');
    });

    it('interpolates multiple params in the same template', () => {
      const languageManager = freshLanguageManager();
      expect(languageManager.getText('TUTORIAL_STEP_COUNTER', { current: 2, total: 5 })).toBe('2 / 5');
    });

    it('leaves a placeholder untouched if the matching param is missing', () => {
      const languageManager = freshLanguageManager();
      expect(languageManager.getText('BANKER_OFFER_AMOUNT')).toBe('${amount}');
    });

    it('falls back to DEFAULT_LANGUAGE text when a key is missing in the active language (data drift when adding a language)', () => {
      // Simula el escenario real: se agrega un idioma nuevo y todavía no
      // se tradujo el 100% de las claves — no debe verse un hueco vacío.
      const languageDataModule = require('./LanguageData') as {
        TRANSLATIONS: Record<string, Record<string, string>>;
      };
      delete languageDataModule.TRANSLATIONS.es.MENU_PLAY_AGAIN_BUTTON;

      const languageManager = freshLanguageManager();
      languageManager.setLanguage('es');

      expect(languageManager.getText('MENU_PLAY_AGAIN_BUTTON')).toBe('PLAY AGAIN'); // fallback a 'en'
    });

    it('falls back to the key itself if missing in BOTH the active and default language (never crashes)', () => {
      const languageManager = freshLanguageManager();
      expect(languageManager.getText('NON_EXISTENT_KEY' as never)).toBe('NON_EXISTENT_KEY');
    });
  });
});