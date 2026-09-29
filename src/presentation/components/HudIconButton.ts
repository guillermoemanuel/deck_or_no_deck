import Phaser from 'phaser';
import { getTouchHitSize } from '../../shared/utils/CompactScreen';

/** Misma paleta "Casino de Lujo" que el resto del HUD (ver createCasinoButton
 * en MainMenuScene.ts) — panel carbón + borde dorado + halo en hover. */
const PANEL_FILL = 0x121218;
const PANEL_FILL_ALPHA = 0.95;
const PANEL_BORDER = 0xffd76a;
const PANEL_BORDER_ALPHA = 0.85;
const PANEL_INNER_BORDER = 0xffd76a;
const PANEL_INNER_BORDER_ALPHA = 0.25;
const GLOW_COLOR = 0xffd76a;
const GLOW_ALPHA = 0.35;
const PANEL_RADIUS = 10;

/** REQ (accesibilidad táctil): toda zona interactiva del HUD debe medir
 * al menos 44x44 px, aunque el panel visual se pida más chico — el
 * tamaño de toque nunca baja de este piso. */
const MIN_TOUCH_SIZE = 44;

const HOVER_SCALE = 1.05;
const PRESSED_SCALE = 0.95;
const HOVER_TWEEN_MS = 120;
const PRESS_TWEEN_MS = 70;

/** Descripción DEBAJO del ícono, centrada horizontalmente — antes vivía a
 * la izquierda; se movió acá para que el HUD lea más como un tab bar
 * (ícono arriba, texto abajo) y para no competir en ancho contra el
 * botón vecino del mismo renglón. `LABEL_GAP` ahora es el espacio
 * VERTICAL entre el borde inferior del panel y el texto. */
const LABEL_GAP = 6;
// QA de legibilidad (requisitos de CrazyGames: iframes chicos de hasta
// 800x450) — 13px sobre el lienzo virtual de 1280x720 terminaba
// renderizando ~8px reales en ese tamaño, por debajo de lo cómodo. Sigue
// la misma política de piso que el resto del proyecto (13px -> 16px, ver
// el resto de fontSize del código): ~10px reales en el peor caso.
const LABEL_FONT_SIZE = '16px';
const LABEL_FONT_FAMILY = 'Arial';
const LABEL_COLOR = '#ffffff';
/** Ancho máximo del texto antes de partir en una segunda línea — evita
 * que descripciones largas ("Pantalla Completa") se disparen de ancho y
 * empujen al botón vecino mucho más de lo necesario. */
const LABEL_WRAP_WIDTH = 78;

export interface HudIconButtonConfig {
  /** Lado del panel cuadrado en px. Se fuerza un mínimo de 44px (REQ móvil). */
  readonly size?: number;
  /** Proporción del panel que ocupa el ícono (0–1). Default 0.6. */
  readonly iconScale?: number;
  /** Texto inicial de la descripción debajo del ícono. Si se omite, el
   * botón no lleva descripción (queda solo el ícono). */
  readonly label?: string;
}

/**
 * Botón-ícono estándar del HUD: panel de fondo + ícono + zona interactiva
 * amigable para móvil (mín. 44x44px), con feedback de hover/press vía
 * tweens de Phaser 3 (REQ 2). Reemplaza a los antiguos botones de texto
 * plano de Tienda/Salir/Bono/Sonido/Pantalla en UIScene.ts.
 *
 * El ícono se puede reemplazar en caliente con `setIconTexture()` — lo
 * usan los toggles de Sonido (soundon/soundoff) y Pantalla Completa
 * (fullscreen/windows) sin necesidad de crear un botón nuevo.
 */
export class HudIconButton extends Phaser.GameObjects.Container {
  private readonly glow: Phaser.GameObjects.Graphics;
  private readonly icon: Phaser.GameObjects.Image;
  private readonly hitZone: Phaser.GameObjects.Zone;
  private readonly iconTargetSize: number;
  private readonly onClickCallback: () => void;
  private readonly panelSize: number;
  private readonly labelText: Phaser.GameObjects.Text | null;
  private enabled = true;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    textureKey: string,
    onClick: () => void,
    config: HudIconButtonConfig = {}
  ) {
    super(scene, x, y);
    this.onClickCallback = onClick;

    const size = Math.max(config.size ?? 48, MIN_TOUCH_SIZE);
    this.panelSize = size;
    const iconScale = config.iconScale ?? 0.6;
    this.iconTargetSize = size * iconScale;

    // Halo externo, invisible en reposo, que se enciende en hover — misma
    // convención visual que createCasinoButton() en MainMenuScene.ts.
    this.glow = scene.add.graphics();
    this.glow.fillStyle(GLOW_COLOR, GLOW_ALPHA);
    this.glow.fillRoundedRect(-size / 2 - 6, -size / 2 - 6, size + 12, size + 12, PANEL_RADIUS + 2);
    this.glow.setAlpha(0);

    const panel = scene.add.graphics();
    panel.fillStyle(PANEL_FILL, PANEL_FILL_ALPHA);
    panel.fillRoundedRect(-size / 2, -size / 2, size, size, PANEL_RADIUS);
    panel.lineStyle(2, PANEL_BORDER, PANEL_BORDER_ALPHA);
    panel.strokeRoundedRect(-size / 2, -size / 2, size, size, PANEL_RADIUS);
    panel.lineStyle(1, PANEL_INNER_BORDER, PANEL_INNER_BORDER_ALPHA);
    panel.strokeRoundedRect(-size / 2 + 3, -size / 2 + 3, size - 6, size - 6, PANEL_RADIUS - 2);

    this.icon = scene.add.image(0, 0, textureKey);
    this.applyIconScale();

    this.add([this.glow, panel, this.icon]);

    // Descripción DEBAJO del ícono, centrada horizontalmente — ancla su
    // borde SUPERIOR a `size/2 + LABEL_GAP` (justo debajo del panel) y
    // usa `wordWrap` para que un texto largo ("Pantalla Completa") baje
    // a una segunda línea en vez de dispararse de ancho hacia los lados
    // (ver getTotalWidth(), usado por UIScene/SoundFullscreenControls
    // para no superponer el botón vecino del renglón).
    if (config.label !== undefined) {
      this.labelText = scene.add
        .text(0, size / 2 + LABEL_GAP, config.label, {
          fontSize: LABEL_FONT_SIZE,
          fontFamily: LABEL_FONT_FAMILY,
          color: LABEL_COLOR,
          align: 'center',
          wordWrap: { width: LABEL_WRAP_WIDTH, useAdvancedWrap: true }
        })
        .setOrigin(0.5, 0);
      this.add(this.labelText);
    } else {
      this.labelText = null;
    }

    scene.add.existing(this);

    // Zona interactiva propia (no la Graphics/Image) — el tamaño de toque
    // nunca es menor a MIN_TOUCH_SIZE aunque `size` se pida más chico
    // (REQ 2: "target amplio de al menos 44x44 px"). Cubre solo el ícono
    // a propósito: la descripción es una etiqueta informativa debajo, no
    // una segunda zona de click — mantiene el área táctil simple y
    // predecible sin importar cuánto texto tenga la descripción.
    // En pantallas chicas (teléfono en horizontal, factor ~0.54) 48 px de
    // diseño son ~26 px físicos: se agranda el área TÁCTIL (no el dibujo) hasta
    // ~44 px físicos, con tope para no solaparse con el botón vecino.
    const hitSize = getTouchHitSize(Math.max(size, MIN_TOUCH_SIZE), scene.scale.displayScale.x);
    this.hitZone = scene.add.zone(0, 0, hitSize, hitSize).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.add(this.hitZone);

    this.hitZone.on('pointerover', this.handlePointerOver, this);
    this.hitZone.on('pointerout', this.handlePointerOut, this);
    this.hitZone.on('pointerdown', this.handlePointerDown, this);
    this.hitZone.on('pointerup', this.handlePointerUp, this);
  }

  /** Cambia el texto de la descripción (toggles de Sonido/Pantalla
   * Completa, countdown de Bono). No-op si el botón se creó sin `label`.
   * Como el ancho puede cambiar, quien llame a esto en UIScene debe
   * volver a invocar el layout del renglón correspondiente después (ver
   * getTotalWidth()). */
  setLabel(text: string): void {
    this.labelText?.setText(text);
  }

  /** Cambia el color de la descripción (p. ej. dorado cuando "Bono" pasa
   * a 'available'). No-op si el botón se creó sin `label`. */
  setLabelColor(color: string): void {
    this.labelText?.setColor(color);
  }

  /** Ancho total ("huella" horizontal) del botón — el mayor entre el
   * ícono y la descripción ya renderizada (que puede haber bajado a dos
   * líneas por `wordWrap`, ver constructor). Lo usan UIScene/
   * SoundFullscreenControls para centrar cada botón dentro de su renglón
   * sin que la descripción de uno choque con el botón vecino. */
  getTotalWidth(): number {
    return this.labelText ? Math.max(this.panelSize, this.labelText.width) : this.panelSize;
  }

  /** Distancia vertical desde el centro del ícono (la `y` que se le pasa
   * a `setPosition()`) hasta el borde INFERIOR de la descripción — o
   * hasta el borde inferior del propio ícono si no tiene `label`. Lo usa
   * un renglón anclado al borde INFERIOR de la cámara (Sonido/Pantalla
   * Completa) para calcular la `y` del ícono de forma que la descripción
   * —que puede ocupar una o dos líneas según el texto— nunca quede
   * cortada por el borde de la pantalla. */
  getBottomOffset(): number {
    return this.labelText ? this.panelSize / 2 + LABEL_GAP + this.labelText.height : this.panelSize / 2;
  }

  /** Reemplaza el ícono mostrado (toggles de Sonido/Pantalla Completa),
   * preservando el tamaño objetivo aunque la textura nueva tenga otra
   * relación de aspecto. */
  setIconTexture(textureKey: string): void {
    this.icon.setTexture(textureKey);
    this.applyIconScale();
  }

  /** Tinte/atenuación del ícono sin afectar el panel ni el halo — lo usa
   * el botón de Bono para distinguir 'available' (ícono a color pleno)
   * de 'locked' (ícono atenuado), sin interferir con el feedback de
   * hover/press del panel completo. */
  setIconAlpha(alpha: number): void {
    this.icon.setAlpha(alpha);
  }

  /** Habilita/deshabilita el botón: sin esto, un click en Bono mientras
   * está 'locked' seguiría animando el hover/press aunque la acción sea
   * un no-op — dejarlo deshabilitado comunica visualmente que no hay
   * nada para hacer ahí ahora mismo. */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (enabled) {
      this.hitZone.setInteractive({ useHandCursor: true });
    } else {
      this.hitZone.disableInteractive();
      this.scene.tweens.add({ targets: this, scale: 1, duration: HOVER_TWEEN_MS });
      this.scene.tweens.add({ targets: this.glow, alpha: 0, duration: HOVER_TWEEN_MS });
    }
  }

  private applyIconScale(): void {
    const largestSide = Math.max(this.icon.width, this.icon.height, 1);
    this.icon.setScale(this.iconTargetSize / largestSide);
  }

  private handlePointerOver(): void {
    if (!this.enabled) return;
    this.scene.tweens.add({ targets: this, scale: HOVER_SCALE, duration: HOVER_TWEEN_MS, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({ targets: this.glow, alpha: 1, duration: HOVER_TWEEN_MS, ease: 'Cubic.easeOut' });
  }

  private handlePointerOut(): void {
    if (!this.enabled) return;
    this.scene.tweens.add({ targets: this, scale: 1, duration: HOVER_TWEEN_MS, ease: 'Cubic.easeOut' });
    this.scene.tweens.add({ targets: this.glow, alpha: 0, duration: HOVER_TWEEN_MS, ease: 'Cubic.easeOut' });
  }

  private handlePointerDown(): void {
    if (!this.enabled) return;
    this.scene.tweens.add({ targets: this, scale: PRESSED_SCALE, duration: PRESS_TWEEN_MS, ease: 'Quad.easeOut' });
  }

  private handlePointerUp(): void {
    if (!this.enabled) return;
    // Vuelve al estado hover (el puntero sigue arriba del botón al
    // soltar) — `pointerout` es quien baja a escala 1 cuando el cursor
    // realmente se retira.
    this.scene.tweens.add({ targets: this, scale: HOVER_SCALE, duration: PRESS_TWEEN_MS, ease: 'Quad.easeOut' });
    this.onClickCallback();
  }

  /**
   * REQ: limpieza explícita de los listeners táctiles al destruir, para
   * prevenir fugas de memoria. Phaser ya destruye en cascada los hijos
   * del Container (incluida `hitZone`) al llamar a `destroy()`, pero se
   * desenganchan acá explícitamente para dejar el contrato pedido sin
   * depender de ese comportamiento implícito.
   */
  destroy(fromScene?: boolean): void {
    this.hitZone.off('pointerover', this.handlePointerOver, this);
    this.hitZone.off('pointerout', this.handlePointerOut, this);
    this.hitZone.off('pointerdown', this.handlePointerDown, this);
    this.hitZone.off('pointerup', this.handlePointerUp, this);
    super.destroy(fromScene);
  }
}