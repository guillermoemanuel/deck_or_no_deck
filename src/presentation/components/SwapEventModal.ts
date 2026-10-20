import Phaser from 'phaser';
import { LocalizedText } from './LocalizedText';
import { TranslationKey } from '../../shared/i18n/LanguageData';
import { IAudioService } from '../../domain/ports/IAudioService';
import { bindUiClick, playUiClick } from '../audio/UiSfx';
import { FocusDirection } from '../input/KeyboardNavigation';

/** Misma paleta "Casino de Lujo" que MainMenuScene.ts / DeckSelectionScene.ts /
 * BankerOfferPanel.ts / ResultScene.ts — mismos valores hex, para que este
 * modal se sienta parte del mismo producto en vez de un estilo aislado. */
const COLOR_GOLD = 0xffd76a;
const COLOR_GOLD_DIM = 0xd4af37;
const COLOR_GOLD_HEX = '#ffd76a';
const COLOR_NEUTRAL = 0x00e676; // metálico neutro — "conservar carta"
const COLOR_NEUTRAL_GLOW = 0x5cffb0;
const COLOR_PANEL_BG = 0x0a0e17;
const FONT_FAMILY = 'Georgia, "Times New Roman", serif';

/**
 * SwapEventModal: Modal de mitad de partida (Midgame Swap).
 * Presenta dos opciones claras al jugador:
 * 1. "Mantener mi carta secreta": declina y continúa la partida.
 * 2. "Cambiar mi carta secreta": cierra el modal y permite elegir una carta del tablero para reemplazarla.
 *
 * Estética "Casino de Lujo" coherente con MainMenuScene / DeckSelectionScene /
 * BankerOfferPanel / ResultScene: marco carbón con doble borde dorado,
 * botones con panel + halo de hover, y un pequeño ícono de carta —con su
 * propio pulso continuo— junto a cada opción, ya que este modal no recibe
 * ninguna textura de carta real (se instancia solo con `scene`, ver
 * GameSceneController) y por eso el "resaltado de las cartas" se resuelve
 * de forma simbólica en vez de sobre un sprite concreto.
 *
 * Navegación por teclado (Fase 7g-2): ←/→ posicionan el foco de forma
 * absoluta (0 = Mantener, 1 = Cambiar), ↑/↓ alternan (eje ambiguo entre dos
 * botones, mismo precedente que BankerOfferPanel), ENTER activa el botón
 * enfocado con el sonido de click (paridad con el ratón) y ESC declina en
 * silencio — el foco inicial visible es la opción segura "Mantener".
 */
export class SwapEventModal extends Phaser.GameObjects.Container {
  // Teclado PC (Fase 7): índice de botón enfocado (0 = Mantener, 1 = Cambiar).
  private focusedButtonIndex = 0;
  // Fase 7g: dueño único del efecto de encendido por botón — el MISMO
  // closure sirve al hover del ratón y al foco de las flechas, así no hay
  // dos lógicas compitiendo por el halo ni escalas/duraciones distintas
  // (mismo patrón que BankerOfferPanel.buttonHighlights de la 7g-1). El
  // orden del push es el índice de foco: 0 = Mantener (se crea primero),
  // 1 = Cambiar.
  private readonly buttonHighlights: Array<(on: boolean) => void> = [];
  // Guard de salida única (patrón BUGFIX de BankerOfferPanel.spec): seteada
  // en onDecline/onAcceptSwap ANTES de arrancar animateExit — sin ella, un
  // doble ENTER (o Enter+ESC) durante los 150 ms de salida emitiría
  // 'swap-declined' Y 'swap-accepted-choose-card' en la misma partida: el
  // controller tiene `.once` POR evento, así que las DOS ramas se
  // dispararían a la vez.
  private exitStarted = false;
  constructor(scene: Phaser.Scene, private readonly audio?: IAudioService) {
    const cx = scene.cameras.main.centerX;
    const cy = scene.cameras.main.centerY;

    super(scene, cx, cy);

    const backdrop = scene.add
      .rectangle(0, 0, scene.cameras.main.width * 2, scene.cameras.main.height * 2, 0x000000, 0.7)
      .setInteractive();

    // Panel carbón translúcido con borde dorado — mismo lenguaje visual
    // que el resto de los modales del juego, en vez del morado/naranja
    // anterior.
    const panelBg = scene.add
      .rectangle(0, 0, 560, 260, COLOR_PANEL_BG, 0.98)
      .setStrokeStyle(3, COLOR_GOLD_DIM, 0.9);

    // Filo interior fino, acabado "metálico" en capas.
    const innerFrame = scene.add
      .rectangle(0, 0, 540, 240, 0x000000, 0)
      .setStrokeStyle(1, COLOR_GOLD, 0.35);

    const glow = scene.add
      .rectangle(0, 0, 568, 268, COLOR_GOLD, 0)
      .setStrokeStyle(1, COLOR_GOLD, 0.4);

    const titleText = new LocalizedText(scene, 0, -75, 'MIDGAME_SWAP_TITLE', {
        fontSize: '22px',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        color: COLOR_GOLD_HEX,
        align: 'center',
        wordWrap: { width: 520 }
    }).setOrigin(0.5);


    const bodyText = new LocalizedText(scene, 0, -22, 'MIDGAME_SWAP_PROMPT', {
      fontSize: '16px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: '#e6e6ea',
      align: 'center',
      wordWrap: { width: 520 }
    }).setOrigin(0.5);

    // Botón 1: Mantener mi carta secreta — acento metálico/neutro.
    const keepBtn = this.createButton(
      scene,
      -130,
      50,
      'MIDGAME_SWAP_DECLINE',
      COLOR_NEUTRAL,
      COLOR_NEUTRAL_GLOW,
      0xffffff,
      () => this.onDecline()
    );

    // Botón 2: Cambiar mi carta secreta — acento dorado, la decisión de
    // mayor peso en este evento.
    const swapBtn = this.createButton(
      scene,
      130,
      50,
      'MIDGAME_SWAP_ACCEPT',
      COLOR_GOLD_DIM,
      COLOR_GOLD,
      0xffffff,
      () => this.onAcceptSwap()
    );

    this.add([backdrop, panelBg, innerFrame, glow, titleText, bodyText, keepBtn, swapBtn]);
    scene.add.existing(this);

    // Foco inicial visible (Fase 7g-2): la opción segura "Mantener"
    // (índice 0) arranca encendida desde que el modal se abre — mismo
    // efecto que el pointerover del ratón (halo + scale 1.05, 120 ms).
    this.buttonHighlights[0]?.(true);

    // Animación de entrada
    this.setScale(0.2);
    this.setAlpha(0);
    scene.tweens.add({
      targets: this,
      scale: 1,
      alpha: 1,
      duration: 220,
      ease: 'Back.easeOut'
    });
  }

  /**
   * Fase 7g (teclado PC): mueve el foco entre "Mantener" (0) y "Cambiar" (1)
   * con las flechas. Posicionamiento absoluto sin wrap en ←/→ (left = índice
   * 0, right = índice 1: en el borde no hace nada) y alternancia en ↑/↓ (eje
   * ambiguo entre dos botones, mismo precedente que BankerOfferPanel de la
   * 7g-1). Si el índice resultante no cambia es no-op: no se re-apaga ni
   * re-enciende nada. Una vez arrancada la salida (exitStarted) las flechas
   * quedan inertes, igual que los clicks.
   */
  moveFocus(dir: FocusDirection): void {
    if (this.exitStarted) return;
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
   * Fase 7g (teclado PC): ENTER activa el botón enfocado — idéntico efecto
   * que el `pointerup` del ratón: emite el evento correspondiente ('swap-declined'
   * o 'swap-accepted-choose-card') y cierra el modal. El sonido va por
   * `playUiClick` (punto único ADR-015), paridad con el click del ratón
   * (bindUiClick). El guard exitStarted va ANTES del playUiClick para que un
   * segundo ENTER durante la salida tampoco suene dos veces.
   */
  activateFocusedButton(): void {
    if (this.exitStarted) return;
    playUiClick(this.audio);
    if (this.focusedButtonIndex === 0) {
      this.onDecline();
    } else {
      this.onAcceptSwap();
    }
  }

  /**
   * Fase 7g (teclado PC): ESC = declinar silencioso — MISMA cadena que el
   * botón "Mantener" (onDecline → animateExit → emit 'swap-declined'), pero
   * SIN `playUiClick`: cancelar no confirma (ADR-015; mismo precedente que
   * UIScene.handleEscapeKey, que siempre cierra SIN sonido).
   */
  declineFromKeyboard(): void {
    if (this.exitStarted) return;
    this.onDecline();
  }

  /**
   * Fase 7g (teclado PC): observabilidad del índice con foco (0 = Mantener,
   * 1 = Cambiar) para specs y escenas — la lógica de decisión vive en
   * moveFocus/activateFocusedButton, acá solo se lee el estado.
   */
  getFocusedButtonIndex(): number {
    return this.focusedButtonIndex;
  }

  private onDecline(): void {
    // Guard de salida única (patrón BUGFIX de BankerOfferPanel): cubre tanto
    // el click del ratón como ENTER/ESC — durante los 150 ms del tween de
    // salida el modal sigue vivo y un segundo intento no debe emitir
    // 'swap-declined' ni iniciar una segunda salida.
    if (this.exitStarted) return;
    this.exitStarted = true;
    this.animateExit(() => this.emit('swap-declined'));
  }

  private onAcceptSwap(): void {
    // Misma guarda de salida única que onDecline: también evita emitir
    // 'swap-accepted-choose-card' cuando ya hay una salida en curso (en
    // particular, una iniciada por 'swap-declined').
    if (this.exitStarted) return;
    this.exitStarted = true;
    this.animateExit(() => this.emit('swap-accepted-choose-card'));
  }

  private animateExit(onComplete: () => void): void {
    this.scene.tweens.add({
      targets: this,
      scale: 0.8,
      alpha: 0,
      duration: 150,
      ease: 'Quad.easeIn',
      onComplete
    });
  }

  /**
   * Botón estilo "Casino de Lujo": panel oscuro + borde de acento + halo
   * de hover + microinteracción de escala — misma construcción que
   * MainMenuScene.createCasinoButton() / BankerOfferPanel.createArcadeButton()
   * / ResultScene.createActionButton(). Incluye además un pequeño ícono de
   * carta con resplandor propio en loop infinito, para que la decisión se
   * sienta anclada a "las dos cartas en juego" (la actual vs. la nueva)
   * aun cuando este modal no dibuja sprites de carta reales.
   *
   * El halo lo enciende y apaga UN único closure por botón (`highlight`),
   * dueño compartido por el hover del ratón y el foco de las flechas
   * (Fase 7g-2) — nunca se toca el alpha de los demás children.
   */
  private createButton(
    scene: Phaser.Scene,
    x: number,
    y: number,
    labelKey: TranslationKey,
    primaryColor: number,
    hoverColor: number,
    textColor: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    // QA de legibilidad (fontSize del label 14px -> 17px, ver
    // LanguageManager/todo el resto del proyecto): a 230px el label más
    // largo ("Mantener mi carta"/"Keep my card") quedaba con muy poco
    // margen contra el borde derecho del botón — se ensancha a 250px
    // (el hueco entre los dos botones baja de 30px a 10px, pero siguen
    // sin tocarse ni salirse del panel de 560px).
    const width = 250;
    const height = 48;

    const container = scene.add.container(x, y);

    // Halo externo, invisible en reposo, que se enciende en hover.
    const hoverGlow = scene.add.graphics();
    hoverGlow.fillStyle(hoverColor, 0.4);
    hoverGlow.fillRoundedRect(-width / 2 - 8, -height / 2 - 8, width + 16, height + 16, 16);
    hoverGlow.setAlpha(0);

    // Panel oscuro con borde de acento y filo dorado interior muy fino.
    const bg = scene.add.graphics();
    bg.fillStyle(0x121218, 0.95);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 10);
    bg.lineStyle(2, primaryColor, 0.9);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 10);
    bg.lineStyle(1, COLOR_GOLD, 0.25);
    bg.strokeRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, height - 8, 8);

    // Ícono de carta simbólico junto al texto, con su propio resplandor
    // pulsante (yoyo, repeat: -1) — ver comentario de clase.
    const iconX = -width / 2 + 26;
    const iconWidth = 20;
    const iconHeight = 28;

    const iconGlow = scene.add.graphics();
    iconGlow.fillStyle(primaryColor, 0.45);
    iconGlow.fillRoundedRect(iconX - iconWidth / 2 - 5, -iconHeight / 2 - 5, iconWidth + 10, iconHeight + 10, 8);

    const cardIcon = scene.add.graphics();
    cardIcon.fillStyle(0x0d0d12, 0.9);
    cardIcon.fillRoundedRect(iconX - iconWidth / 2, -iconHeight / 2, iconWidth, iconHeight, 4);
    cardIcon.lineStyle(1.5, COLOR_GOLD, 0.85);
    cardIcon.strokeRoundedRect(iconX - iconWidth / 2, -iconHeight / 2, iconWidth, iconHeight, 4);
    cardIcon.fillStyle(COLOR_GOLD, 0.9);
    cardIcon.fillCircle(iconX, 0, 2.6);

    scene.tweens.add({
      targets: iconGlow,
      alpha: { from: 0.4, to: 1 },
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    const text = new LocalizedText(scene, 14, 0, labelKey, {
      fontFamily: FONT_FAMILY,
      fontSize: '17px',
      fontStyle: 'bold',
      color: `#${textColor.toString(16).padStart(6, '0')}`
    }).setOrigin(0.5);

    container.add([hoverGlow, bg, iconGlow, cardIcon, text]);

    // Zona interactiva invisible del tamaño exacto del botón.
    const hitZone = scene.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add(hitZone);
    // Click genérico de UI (punto único: UiSfx.bindUiClick).
    bindUiClick(hitZone, this.audio);

    // Dueño único del efecto visual de encendido/apagado (Fase 7g-2): el
    // MISMO closure sirve al hover del ratón y al foco de las flechas
    // (buttonHighlights), así no hay dos lógicas compitiendo por el halo ni
    // escalas/duraciones distintas. `on` true = encendido (scale 1.05 +
    // halo alpha 1), false = reposo — duración 120 ms en ambos sentidos,
    // idéntico a los pointerover/pointerout previos de este mismo modal.
    const highlight = (on: boolean): void => {
      scene.tweens.add({ targets: container, scale: on ? 1.05 : 1, duration: 120, ease: 'Cubic.easeOut' });
      scene.tweens.add({ targets: hoverGlow, alpha: on ? 1 : 0, duration: 120, ease: 'Cubic.easeOut' });
    };
    // Orden de creación = índice de foco (ver buttonHighlights).
    this.buttonHighlights.push(highlight);

    hitZone.on('pointerover', () => highlight(true));

    hitZone.on('pointerout', () => highlight(false));

    hitZone.on('pointerup', () => {
      scene.tweens.add({
        targets: container,
        scale: 0.95,
        duration: 50,
        yoyo: true,
        onComplete: onClick
      });
    });

    return container;
  }
}