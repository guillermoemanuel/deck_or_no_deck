import Phaser from 'phaser';
import { TranslationKey } from '../../shared/i18n/LanguageData';
import { TranslationParams } from '../../shared/i18n/LanguageManager';
import { LocalizedText } from './LocalizedText';
import { IAudioService } from '../../domain/ports/IAudioService';
import { bindUiClick, playUiClick } from '../audio/UiSfx';
import { FocusDirection } from '../input/KeyboardNavigation';

const COLOR_GOLD = 0xffd76a;
const COLOR_GOLD_DIM = 0xd4af37;
const COLOR_GOLD_HEX = '#ffd76a';
const COLOR_PANEL_BG = 0x0a0e17;
const COLOR_NEUTRAL = 0x8b949e;
const FONT_FAMILY = 'Georgia, "Times New Roman", serif';
const DEPTH = 1000;

export interface ConfirmDialogConfig {
  readonly titleKey: TranslationKey;
  readonly bodyKey: TranslationKey;
  readonly bodyParams?: TranslationParams;
  readonly cancelKey: TranslationKey;
  readonly confirmKey: TranslationKey;
  /** Color de acento del botón de confirmar (rojo para acciones destructivas). */
  readonly confirmColor: number;
  readonly onConfirm: () => void;
  /** Se llama al cancelar (botón, ESC). */
  readonly onCancel?: () => void;
}

/**
 * Diálogo modal de confirmación con el estilo "Casino de Lujo" del resto del
 * juego. Bloquea todo lo que hay debajo (fondo interactivo a mayor depth), y
 * se cierra solo tras elegir. "Cancelar" es el botón por defecto: ESC también
 * cancela, nunca confirma.
 *
 * Navegación de teclado (Fase 7g-4): flechas para posicionarse entre
 * Cancelar / Confirmar (← Cancelar, → Confirmar, ↑/↓ alternan) + ENTER para
 * activar el enfocado + ESC para cancelar directo. El foco inicial es
 * VISIBLE sobre Cancelar: sin mover las flechas, ENTER cancela (acción
 * segura); para confirmar hay que mover a Confirmar con →.
 */
export class ConfirmDialog {
  private container: Phaser.GameObjects.Container | null = null;
  // Handlers de teclado con REFERENCIA NOMBRADA de clase (Fase 7g-4): los
  // closures anónimos de la Fase 7e eran imposibles de desenganchar en
  // destroy() — ver ahí el BUGFIX de la fuga de listeners.
  private readonly onEscape = (): void => this.cancel();
  private readonly onFocusLeft = (): void => this.moveFocus('left');
  private readonly onFocusRight = (): void => this.moveFocus('right');
  private readonly onFocusUp = (): void => this.moveFocus('up');
  private readonly onFocusDown = (): void => this.moveFocus('down');
  private readonly onActivateFocused = (): void => this.activateFocusedButton();
  // Teclado PC (Fase 7): índice de botón enfocado (0 = Cancelar, 1 = Confirmar).
  private focusedButtonIndex = 0;
  // Dueño único del efecto visual de encendido/apagado de cada botón (mismo
  // closure que usa el hover del ratón), guardado en orden de creación:
  // 0 = Cancelar, 1 = Confirmar. Así flechas y puntero comparten UN solo
  // efecto (mismo glow, misma duración 150 ms) — patrón idéntico al de
  // BankerOfferPanel.createArcadeButton (Fase 7g-1).
  private readonly buttonHighlights: ((on: boolean) => void)[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly config: ConfirmDialogConfig,
    private readonly audio?: IAudioService
  ) {
    this.build();
  }

  isOpen(): boolean {
    return this.container !== null;
  }

  /**
   * Destruye el diálogo y desengancha TODOS sus listeners de teclado.
   *
   * BUGFIX (Fase 7g-4): antes solo se desenganchaba ESC y los handlers de
   * flechas/ENTER eran closures anónimos imposibles de desenganchar — cada
   * apertura del diálogo acumulaba 5 listeners muertos en el keyboard
   * plugin (que sobrevive al ciclo de vida de los objetos de la escena).
   * Ahora todos los handlers son referencias nombradas de clase y destroy()
   * desengancha cada par EXACTO (tipo, misma referencia) que registró
   * build() (AGENTS §5: pares exactos, sin anónimos).
   */
  destroy(): void {
    const keyboard = this.scene.input.keyboard;
    keyboard?.off('keydown-LEFT', this.onFocusLeft);
    keyboard?.off('keydown-RIGHT', this.onFocusRight);
    keyboard?.off('keydown-UP', this.onFocusUp);
    keyboard?.off('keydown-DOWN', this.onFocusDown);
    keyboard?.off('keydown-ENTER', this.onActivateFocused);
    keyboard?.off('keydown-ESC', this.onEscape);
    this.container?.destroy();
    this.container = null;
  }

  /**
   * Fase 7g-4 (teclado PC): mueve el foco entre Cancelar / Confirmar con
   * las flechas. Posicionamiento absoluto sin wrap en ←/→ (left = Cancelar
   * 0, right = Confirmar 1: en el borde no hace nada) y alternancia en ↑/↓
   * (eje ambiguo entre dos botones, mismo precedente que BankerOfferPanel
   * y el modal de salida de UIScene). Si el índice resultante no cambia es
   * no-op: no se re-apaga/re-enciende nada.
   */
  moveFocus(dir: FocusDirection): void {
    let nextIndex: number;
    if (dir === 'left') nextIndex = 0;
    else if (dir === 'right') nextIndex = 1;
    else nextIndex = this.focusedButtonIndex === 0 ? 1 : 0;
    if (nextIndex === this.focusedButtonIndex) return;
    this.buttonHighlights[this.focusedButtonIndex]?.(false);
    this.buttonHighlights[nextIndex]?.(true);
    this.focusedButtonIndex = nextIndex;
  }

  /**
   * Fase 7g (teclado PC): activa el botón enfocado — ENTER delega en
   * cancelar o confirmar según el botón activo (ambas con el guard de
   * container: tras un destroy() es no-op). ESC siempre cancela y ya
   * está gestionado por `this.onEscape` (build).
   *
   * ADR-015 (paridad de audio): ENTER reproduce el MISMO click de UI que el
   * `pointerup` del ratón (bindUiClick → playUiClick, punto único), mismo
   * precedente que SwapEventModal.activateFocusedButton. ESC queda
   * deliberadamente SILENCIOSO por ser cancelación (onEscape → cancel sin
   * sonido) — mismo precedente que UIScene/SwapEventModal.declineFromKeyboard.
   */
  activateFocusedButton(): void {
    // Guard temprano sobre el container: un ENTER sobre un diálogo ya
    // destruido no debe ni sonar ni delegar (evita SFX fantasma).
    if (!this.container) return;
    playUiClick(this.audio);
    if (this.focusedButtonIndex === 0) this.cancel();
    else this.confirm();
  }

  /**
   * Fase 7g-4 (teclado PC): observabilidad del índice con foco (0 = Cancelar,
   * 1 = Confirmar) para specs y escenas — la lógica de decisión vive en
   * moveFocus/activateFocusedButton, acá solo se lee el estado.
   */
  getFocusedButtonIndex(): number {
    return this.focusedButtonIndex;
  }

  private cancel(): void {
    if (!this.container) return;
    this.destroy();
    this.config.onCancel?.();
  }

  private confirm(): void {
    if (!this.container) return;
    this.destroy();
    this.config.onConfirm();
  }

  private build(): void {
    const { width, height } = this.scene.cameras.main;
    const cx = width / 2;
    const cy = height / 2;

    const backdrop = this.scene.add.rectangle(cx, cy, width * 2, height * 2, 0x000000, 0.75).setInteractive();

    const panelBg = this.scene.add
      .rectangle(cx, cy, 560, 280, COLOR_PANEL_BG, 0.98)
      .setStrokeStyle(3, COLOR_GOLD_DIM, 0.9);
    const innerFrame = this.scene.add.rectangle(cx, cy, 540, 260, 0x000000, 0).setStrokeStyle(1, COLOR_GOLD, 0.35);

    const title = new LocalizedText(this.scene, cx, cy - 100, this.config.titleKey, {
      fontFamily: FONT_FAMILY,
      fontSize: '24px',
      fontStyle: 'bold',
      color: COLOR_GOLD_HEX
    }).setOrigin(0.5);

    const body = new LocalizedText(
      this.scene,
      cx,
      cy - 50,
      this.config.bodyKey,
      {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        color: '#ffb4c0',
        align: 'center',
        wordWrap: { width: 480 }
      },
      this.config.bodyParams
    ).setOrigin(0.5, 0);

    const buttonY = cy + 90;
    const cancelBtn = this.createButton(cx - 130, buttonY, this.config.cancelKey, COLOR_NEUTRAL, () => this.cancel());
    const confirmBtn = this.createButton(cx + 130, buttonY, this.config.confirmKey, this.config.confirmColor, () =>
      this.confirm()
    );

    // Fase 7g-4: foco de teclado VISIBLE desde la apertura sobre Cancelar
    // (índice 0) — ENTER sin mover las flechas cancela, que es la acción
    // segura; para confirmar hay que mover con → y recién ahí ENTER. El
    // encendido va por el MISMO closure highlight que el hover del ratón.
    this.buttonHighlights[this.focusedButtonIndex]?.(true);

    const container = this.scene.add
      .container(0, 0, [backdrop, panelBg, innerFrame, title, body, cancelBtn, confirmBtn])
      .setDepth(DEPTH)
      .setScale(0.2)
      .setAlpha(0);
    // El escalado nace en el origen (0,0): se compensa para que el panel crezca desde el centro.
    container.setPosition(cx * 0.8, cy * 0.8);
    this.container = container;

    this.scene.tweens.add({
      targets: container,
      scale: 1,
      alpha: 1,
      x: 0,
      y: 0,
      duration: 200,
      ease: 'Back.easeOut'
    });

    // Teclado PC (Fase 7g-4): flechas/ENTER/ESC sobre el diálogo de
    // confirmación. BUGFIX (Fase 7g-4): la Fase 7e bindeaba
    // 'keydown-Left'/'keydown-Right'/'keydown-Enter' en MINÚSCULAS, pero el
    // KeyMap de Phaser emite las teclas en MAYÚSCULA
    // ('keydown-LEFT'/'keydown-RIGHT'/'keydown-ENTER') — una clave
    // equivocada es un listener que NUNCA dispara, y por eso flechas y
    // Enter no hacían nada en el diálogo (solo ESC, que estaba en mayúscula,
    // funcionaba). Los handlers son referencias nombradas de clase para que
    // destroy() desenganche cada par exacto (AGENTS §5).
    const keyboard = this.scene.input.keyboard;
    keyboard?.on('keydown-LEFT', this.onFocusLeft);
    keyboard?.on('keydown-RIGHT', this.onFocusRight);
    keyboard?.on('keydown-UP', this.onFocusUp);
    keyboard?.on('keydown-DOWN', this.onFocusDown);
    keyboard?.on('keydown-ENTER', this.onActivateFocused);
    keyboard?.on('keydown-ESC', this.onEscape);
  }

  private createButton(
    x: number,
    y: number,
    label: TranslationKey,
    accent: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const w = 220;
    const h = 50;
    const container = this.scene.add.container(x, y);

    const glow = this.scene.add.graphics();
    glow.fillStyle(accent, 0.4);
    glow.fillRoundedRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16, 16);
    glow.setAlpha(0);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x121218, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    bg.lineStyle(2, accent, 0.9);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    bg.lineStyle(1, COLOR_GOLD, 0.25);
    bg.strokeRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 8);

    const text = new LocalizedText(this.scene, 0, 0, label, {
      fontFamily: FONT_FAMILY,
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);

    const hit = this.scene.add.zone(0, 0, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add([glow, bg, text, hit]);
    // Click genérico de UI (punto único: UiSfx.bindUiClick).
    bindUiClick(hit, this.audio);

    // Dueño único del efecto visual de encendido/apagado (Fase 7g-4): el
    // MISMO closure sirve al hover del ratón y al foco de teclado
    // (buttonHighlights), patrón idéntico a BankerOfferPanel.createArcadeButton
    // — así flechas y puntero comparten UN solo efecto (mismo glow, misma
    // duración 150 ms) en vez de dos lógicas compitiendo por el resaltado.
    const highlight = (on: boolean): void => {
      this.scene.tweens.add({ targets: glow, alpha: on ? 1 : 0, duration: 150 });
    };
    // Orden de creación = índice de foco: 0 = Cancelar, 1 = Confirmar.
    this.buttonHighlights.push(highlight);

    hit.on('pointerover', () => highlight(true));
    hit.on('pointerout', () => highlight(false));
    hit.on('pointerup', onClick);

    return container;
  }
}
