import Phaser from 'phaser';
import { LocalizedText } from './LocalizedText';
import { TranslationKey } from '../../shared/i18n/LanguageData';
import { IAudioService } from '../../domain/ports/IAudioService';
import { bindUiClick } from '../audio/UiSfx';

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
 */
export class SwapEventModal extends Phaser.GameObjects.Container {
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

  private onDecline(): void {
    this.animateExit(() => this.emit('swap-declined'));
  }

  private onAcceptSwap(): void {
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

    hitZone.on('pointerover', () => {
      scene.tweens.add({ targets: container, scale: 1.05, duration: 120, ease: 'Cubic.easeOut' });
      scene.tweens.add({ targets: hoverGlow, alpha: 1, duration: 120, ease: 'Cubic.easeOut' });
    });

    hitZone.on('pointerout', () => {
      scene.tweens.add({ targets: container, scale: 1, duration: 120, ease: 'Cubic.easeOut' });
      scene.tweens.add({ targets: hoverGlow, alpha: 0, duration: 120, ease: 'Cubic.easeOut' });
    });

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