import { SimpleEventEmitter } from '../utils/EventEmitter';
import {
  TRANSLATIONS,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE,
  SupportedLanguage,
  TranslationKey
} from './LanguageData';

const STORAGE_KEY = 'speculation_game_language';

export interface LanguageChangedEvent {
  readonly language: SupportedLanguage;
}

/**
 * Valores dinámicos interpolables dentro de un texto (ej. `{amount}`,
 * `{percent}`). Solo string/number a propósito — un texto de UI nunca
 * debería necesitar interpolar un objeto u otra estructura.
 */
export type TranslationParams = Record<string, string | number>;

/**
 * LanguageManager: administra el idioma activo del juego.
 *
 * DESACOPLAMIENTO (restricción arquitectónica #1): esta clase SOLO
 * resuelve texto para mostrar en pantalla. Nunca debe usarse su idioma
 * activo para ramificar lógica de negocio (ej. "si currentLanguage==='es'
 * entonces...") — el idioma es un detalle puramente visual. El dominio
 * del juego (GameSession, DeckManager, etc.) no importa ni conoce esta
 * clase, ni debería hacerlo jamás.
 */
class LanguageManager {
  private currentLanguage: SupportedLanguage;
  private readonly eventBus = new SimpleEventEmitter<LanguageChangedEvent>();

  constructor() {
    this.currentLanguage = this.resolveInitialLanguage();
  }

  /**
   * Estado inicial: lo persistido en localStorage si es válido, o
   * DEFAULT_LANGUAGE. Nunca lanza — un localStorage inaccesible (modo
   * incógnito estricto, iframe con storage bloqueado, etc.) degrada
   * silenciosamente al idioma por defecto en vez de romper el arranque.
   */
  private resolveInitialLanguage(): SupportedLanguage {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored && this.isSupportedLanguage(stored)) {
        return stored;
      }
    } catch (error) {
      console.warn('[LanguageManager] No se pudo leer el idioma guardado, se usa el idioma por defecto.', error);
    }
    return DEFAULT_LANGUAGE;
  }

  private isSupportedLanguage(value: string): value is SupportedLanguage {
    return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
  }

  /** true si ya hay CUALQUIER idioma persistido — sin importar si llegó por una elección manual (el toggle de MainMenuScene) o por una detección automática previa (ver applyDetectedLocale). Una detección automática nunca debe pisar un estado que el jugador ya tiene funcionando. */
  private hasStoredLanguage(): boolean {
    try {
      return window.localStorage.getItem(STORAGE_KEY) !== null;
    } catch {
      return false; // storage bloqueado: tratamos como "nada guardado todavía"
    }
  }

  /** Idioma activo en este momento. */
  getCurrentLanguage(): SupportedLanguage {
    return this.currentLanguage;
  }

  /** Códigos de idioma disponibles — útil para renderizar un selector de idioma genérico. */
  getSupportedLanguages(): readonly SupportedLanguage[] {
    return SUPPORTED_LANGUAGES;
  }

  /**
   * Cambia el idioma activo y lo persiste. Ignora silenciosamente (con
   * warning) un código no soportado, en vez de dejar el estado en un
   * idioma inexistente — cumple "cambia el idioma SI está en
   * SUPPORTED_LANGUAGES" de forma defensiva.
   */
  setLanguage(langCode: string): boolean {
    if (!this.isSupportedLanguage(langCode)) {
      console.warn(`[LanguageManager] Idioma no soportado: "${langCode}". Soportados: ${SUPPORTED_LANGUAGES.join(', ')}`);
      return false;
    }

    if (langCode === this.currentLanguage) {
      return true; // no-op: ya está en ese idioma, no hace falta emitir evento
    }

    this.currentLanguage = langCode;

    try {
      window.localStorage.setItem(STORAGE_KEY, langCode);
    } catch (error) {
      console.warn('[LanguageManager] No se pudo persistir el idioma elegido.', error);
    }

    // Notifica a quien esté escuchando (ver onLanguageChanged) — así una
    // escena de Phaser ya construida puede refrescar sus textos en
    // caliente sin tener que recrearse.
    this.eventBus.emit({ language: this.currentLanguage });
    return true;
  }

  /**
   * Auto-detección de idioma (requisito de CrazyGames: "the game should
   * use the user's language based on locale info provided through the
   * system info method in our SDK, and fallback to English").
   *
   * Recibe un locale BCP-47 crudo (ej. "es-AR", "en-US", tal como lo
   * reporta `SDK.user.systemInfo.locale`) y, SOLO si el jugador todavía
   * no tiene ningún idioma persistido en esta máquina, lo aplica como
   * idioma inicial. Si ya hay algo guardado —sea porque tocó el toggle
   * manual alguna vez, o porque una detección anterior ya corrió—, esta
   * llamada es un no-op: una detección automática nunca debe pisar un
   * estado que el jugador ya tiene.
   *
   * Si el subtag de idioma del locale no está soportado (ej. "fr-FR"),
   * también es un no-op — el idioma activo ya es DEFAULT_LANGUAGE
   * ('en'), que es exactamente el fallback a inglés que exige el
   * requisito de arriba, sin necesitar código extra para lograrlo.
   *
   * DESACOPLAMIENTO: este método no sabe qué es CrazyGames ni de dónde
   * viene el string — solo entiende "locale BCP-47 opcional". Mantiene
   * la restricción arquitectónica #1 de esta clase (nunca conoce
   * ICrazyGamesService); la orquestación real ("preguntale al SDK,
   * después llamá acá") vive en el Composition Root — ver main.ts.
   */
  applyDetectedLocale(locale: string): void {
    if (this.hasStoredLanguage()) {
      return;
    }

    // BCP-47: el subtag de idioma es el primer segmento, separado por
    // '-' o '_' ("es-AR" -> "es", "en_US" -> "en").
    const languageSubtag = locale.split(/[-_]/)[0]?.toLowerCase();
    if (!languageSubtag || !this.isSupportedLanguage(languageSubtag)) {
      return;
    }

    // Persiste SIEMPRE que el subtag sea válido (incluso si coincide con
    // el idioma ya activo) — así una próxima carga de página encuentra
    // `hasStoredLanguage()` en true y no vuelve a pasar por acá. Pero el
    // evento de cambio solo se emite si realmente HAY un cambio (mismo
    // criterio de no-op que setLanguage()) — el caso más común en la
    // práctica es un jugador angloparlante cuyo locale detectado ("en-US")
    // coincide con DEFAULT_LANGUAGE, y ahí no tiene sentido notificar un
    // "cambio" de idioma que no cambió nada.
    const languageActuallyChanged = languageSubtag !== this.currentLanguage;
    this.currentLanguage = languageSubtag;

    try {
      window.localStorage.setItem(STORAGE_KEY, languageSubtag);
    } catch (error) {
      console.warn('[LanguageManager] No se pudo persistir el idioma auto-detectado.', error);
    }

    if (languageActuallyChanged) {
      console.info(`[LanguageManager] Idioma auto-detectado vía SDK: "${locale}" -> "${languageSubtag}".`);
      this.eventBus.emit({ language: this.currentLanguage });
    }
  }

  /**
   * Resuelve una clave semántica al texto del idioma activo, con
   * interpolación de parámetros dinámicos (ej. `{amount}` -> 5000).
   *
   * Cadena de fallback (nunca crashea, nunca deja un hueco en pantalla):
   *   1. Clave en el idioma activo.
   *   2. Clave en DEFAULT_LANGUAGE (ej. la clave existe en inglés pero
   *      todavía no se tradujo al idioma nuevo agregado).
   *   3. La clave misma, tal cual, como último rescate visible/depurable.
   */
  getText(key: TranslationKey, params: TranslationParams = {}): string {
    const activeDictionary = TRANSLATIONS[this.currentLanguage] as Record<string, string>;
    const fallbackDictionary = TRANSLATIONS[DEFAULT_LANGUAGE] as Record<string, string>;

    const template = activeDictionary[key] ?? fallbackDictionary[key] ?? key;

    return this.interpolate(template, params);
  }

  /** Reemplaza cada `{nombre}` en el texto por params.nombre, dejando el placeholder intacto si falta. */
  private interpolate(template: string, params: TranslationParams): string {
    return template.replace(/\{(\w+)\}/g, (fullMatch, paramName: string) => {
      const value = params[paramName];
      return value !== undefined ? String(value) : fullMatch;
    });
  }

  /**
   * Suscribe un listener a los cambios de idioma. Retorna una función de
   * desuscripción (mismo patrón que ProgressionManager.onEvent) — una
   * escena de Phaser debe llamarla en su evento SHUTDOWN para no dejar
   * listeners huérfanos apuntando a GameObjects ya destruidos.
   */
  onLanguageChanged(listener: (event: LanguageChangedEvent) => void): () => void {
    return this.eventBus.subscribe(listener);
  }
}

/**
 * Singleton de módulo: Node/ES Modules cachea el módulo la primera vez
 * que se importa, así que CUALQUIER `import languageManager from
 * './LanguageManager'` en todo el proyecto recibe la MISMA instancia.
 *
 * Esto es lo que garantiza la restricción #4 (estado global persistente):
 * el idioma sobrevive a scene.start()/scene.restart() de Phaser sin
 * ningún wiring adicional (nunca pasa por game.registry ni por
 * GameServices) — a diferencia de GameSession, que sí se destruye y
 * recrea entre partidas, LanguageManager vive mientras la pestaña del
 * navegador siga cargada.
 */
const languageManager = new LanguageManager();
export default languageManager;