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
