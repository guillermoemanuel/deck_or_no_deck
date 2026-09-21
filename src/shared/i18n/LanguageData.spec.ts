import { TRANSLATIONS, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from './LanguageData';

describe('LanguageData', () => {
  it('SUPPORTED_LANGUAGES matches the keys actually defined in TRANSLATIONS', () => {
    expect(SUPPORTED_LANGUAGES.sort()).toEqual(Object.keys(TRANSLATIONS).sort());
  });

  it('DEFAULT_LANGUAGE is one of the supported languages', () => {
    expect(SUPPORTED_LANGUAGES).toContain(DEFAULT_LANGUAGE);
  });

  it('every supported language defines every key present in DEFAULT_LANGUAGE (no missing translations)', () => {
    const referenceKeys = Object.keys(TRANSLATIONS[DEFAULT_LANGUAGE]).sort();

    for (const lang of SUPPORTED_LANGUAGES) {
      const langKeys = Object.keys(TRANSLATIONS[lang]).sort();
      expect(langKeys).toEqual(referenceKeys);
    }
  });

  it('no translation value is an empty string (a blank key usually means a forgotten placeholder)', () => {
    for (const lang of SUPPORTED_LANGUAGES) {
      for (const value of Object.values(TRANSLATIONS[lang])) {
        expect(value.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('every {placeholder} used in DEFAULT_LANGUAGE also appears in every other language for the same key', () => {
    // Evita que una traducción se "olvide" de interpolar una variable
    // dinámica (ej. {amount}) que el texto original sí usaba.
    const extractPlaceholders = (text: string): string[] => Array.from(text.matchAll(/\{(\w+)\}/g)).map(m => m[1]).sort();

    for (const [key, referenceText] of Object.entries(TRANSLATIONS[DEFAULT_LANGUAGE])) {
      const referencePlaceholders = extractPlaceholders(referenceText);
      if (referencePlaceholders.length === 0) continue;

      for (const lang of SUPPORTED_LANGUAGES) {
        const translatedText = (TRANSLATIONS[lang] as Record<string, string>)[key];
        expect(extractPlaceholders(translatedText)).toEqual(referencePlaceholders);
      }
    }
  });
});
