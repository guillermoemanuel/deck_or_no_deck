import Phaser from 'phaser';
import languageManager, { TranslationParams } from '../../shared/i18n/LanguageManager';
import { TranslationKey } from '../../shared/i18n/LanguageData';

/**
 * LocalizedText: un Phaser.GameObjects.Text que se re-renderiza SOLO a sí
 * mismo cuando el idioma cambia — nunca destruye ni duplica nada, nunca
 * reinicia la escena que lo contiene.
 *
 * Patrón reutilizable pedido por module_all_scenes_integration: en vez de
 * que cada escena escriba su propio "onLanguageChanged -> buscar mis
 * textos -> setText(...)", cada texto se suscribe A SÍ MISMO al crearse
 * y se desuscribe A SÍ MISMO al destruirse (via el evento nativo
 * `Phaser.GameObjects.Events.DESTROY`, que Phaser dispara automáticamente
 * al llamar a `.destroy()` — incluye la limpieza que ocurre cuando una
 * escena entera se detiene y Phaser destruye su display list). Así,
 * cualquier escena solo necesita reemplazar:
 *
 *   this.add.text(x, y, 'Jugar', style)
 *
 * por:
 *
 *   new LocalizedText(this, x, y, 'MENU_PLAY_BUTTON', style)
 *
 * sin ningún wiring adicional de suscripción/limpieza en la propia escena.
 *
 * Los `params` (para claves con interpolación, ej. `{amount}`) se pueden
 * actualizar en caliente con `setParams()` sin tocar la clave ni el
 * idioma — útil para textos que combinan i18n con datos dinámicos del
 * juego (ej. el contador de monedas).
 */
export class LocalizedText extends Phaser.GameObjects.Text {
  private translationKey: TranslationKey;
  private translationParams: TranslationParams;
  private readonly unsubscribeLanguageChanged: () => void;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    key: TranslationKey,
    style: Phaser.Types.GameObjects.Text.TextStyle,
    params: TranslationParams = {}
  ) {
    super(scene, x, y, languageManager.getText(key, params), style);
    this.translationKey = key;
    this.translationParams = params;

    scene.add.existing(this);

    this.unsubscribeLanguageChanged = languageManager.onLanguageChanged(() => this.refreshText());

    // Limpieza automática: cuando ESTE objeto se destruye (manualmente, o
    // porque Phaser destruye toda la display list al detener la escena),
    // se desuscribe — evita listeners huérfanos apuntando a un
    // Phaser.GameObjects.Text ya destruido.
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.unsubscribeLanguageChanged());
  }

  /** Cambia la clave semántica mostrada (ej. un botón que alterna entre dos estados/textos). */
  setTranslationKey(key: TranslationKey, params: TranslationParams = this.translationParams): this {
    this.translationKey = key;
    this.translationParams = params;
    this.refreshText();
    return this;
  }

  /** Actualiza solo los parámetros de interpolación, manteniendo la misma clave (ej. un monto que cambia). */
  setParams(params: TranslationParams): this {
    this.translationParams = params;
    this.refreshText();
    return this;
  }

  private refreshText(): void {
    this.setText(languageManager.getText(this.translationKey, this.translationParams));
  }
}
