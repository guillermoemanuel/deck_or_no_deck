import { TRANSLATIONS, SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from './LanguageData';
import { SESSION_UPGRADE_CATALOG } from '../../domain/value-objects/SessionUpgradeCatalog';

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

  // CG-MON-005 (auditoría de publicación 2026-10-04): la tienda no
  // advertía que Duplicar/Triplicar/Revivir exigen mirar un anuncio —
  // el "(Ad)" solo aparecía en los botones de ResultScene, ya DENTRO del
  // flujo de uso. Requisito de CrazyGames: los rewarded no pueden
  // dispararse "deceptively" — el aviso tiene que estar donde se compra.
  // La descripción es lo visible en cada fila de ShopScene (wordWrap
  // 280px, hasta 3 líneas), por eso vive ahí el marcador, en ambos
  // idiomas.
  it('every upgrade that requires a rewarded ad declares the requirement in its description (EN and ES)', () => {
    const marcadorPorIdioma: Record<string, RegExp> = {
      en: /\(requires ad\)/,
      es: /\(requiere anuncio\)/
    };

    const rewarded = SESSION_UPGRADE_CATALOG.filter(upgrade => upgrade.requiresRewardedAd === true);
    expect(rewarded.length).toBeGreaterThan(0); // el contrato tiene qué cubrir

    const sinAviso: string[] = [];
    for (const upgrade of rewarded) {
      for (const lang of SUPPORTED_LANGUAGES) {
        const descripcion = (TRANSLATIONS[lang] as Record<string, string>)[upgrade.description];
        if (!marcadorPorIdioma[lang].test(descripcion)) {
          sinAviso.push(`${lang}:${upgrade.id}`);
        }
      }
    }

    expect(sinAviso).toEqual([]);
  });
});
