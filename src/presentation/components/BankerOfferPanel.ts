import Phaser from 'phaser';
import { BankerOffer } from '../../domain/services/Banker';
import { LocalizedText } from './LocalizedText';
import { TranslationKey } from '../../shared/i18n/LanguageData';
import { IAudioService } from '../../domain/ports/IAudioService';

/** Misma paleta "Casino de Lujo" que MainMenuScene.ts / DeckSelectionScene.ts —
 * mismos valores hex, para que el modal del banquero se sienta parte del
 * mismo producto en vez de un estilo "arcade neón" aislado. */
const COLOR_GOLD = 0xffd76a;
const COLOR_GOLD_DIM = 0xd4af37;
const COLOR_GOLD_HEX = '#ffd76a';
const COLOR_WHITE_HEX = '#ffffff';
const COLOR_PANEL_BG = 0x0a0e17;
const FONT_FAMILY = 'Georgia, "Times New Roman", serif';

/**
 * BankerOfferPanel: modal de decision DEAL / NO DEAL.
 *
 * Características:
 * - Backdrop oscuro translúcido a pantalla completa.
 * - Marco "Casino de Lujo" (fondo carbón + doble borde dorado/metálico),
 *   coherente con MainMenuScene/DeckSelectionScene en vez del look
 *   "arcade neón" anterior.
 * - Animación elástica de entrada (pop-in con Back.easeOut).
 * - Monto de la oferta con conteo progresivo desde $0 + destello/pulso
 *   continuo al terminar, para ser el foco visual del modal.
 * - Botones DEAL / NO DEAL con la misma construcción (panel + halo + hover)
 *   que los botones del menú principal, diferenciados por colorimetría.
 */
export class BankerOfferPanel extends Phaser.GameObjects.Container {
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  private readonly panelBg: Phaser.GameObjects.Rectangle;
  // Clean Architecture: solo se conoce el puerto IAudioService, nunca la
  // clase concreta de infraestructura.
  private readonly audioService?: IAudioService;

  constructor(scene: Phaser.Scene, offer: BankerOffer, audioService?: IAudioService, cappedRemainingGames: number | null = null) {
    const cx = scene.cameras.main.centerX;
    const cy = scene.cameras.main.centerY;

    super(scene, cx, cy);

    //Audio
    this.audioService = audioService;

    // Fondo atenuador de pantalla completa
    this.backdrop = scene.add
      .rectangle(0, 0, scene.cameras.main.width * 2, scene.cameras.main.height * 2, 0x000000, 0.75)
      .setInteractive();

    // Contenedor principal del modal: fondo carbón translúcido con borde
    // dorado — mismo lenguaje visual que los paneles del menú principal y
    // de selección de mazo, en vez del contorno neón verde anterior.
    this.panelBg = scene.add
      .rectangle(0, 0, 453, 453, COLOR_PANEL_BG, 0.98)
      .setStrokeStyle(3, COLOR_GOLD_DIM, 0.9);

    // Segundo borde interior, más fino, para un acabado "metálico" en
    // capas (misma técnica que el filo interior de los botones casino).
    const innerFrame = scene.add
      .rectangle(0, 0, 436, 436, 0x000000, 0)
      .setStrokeStyle(1, COLOR_GOLD, 0.35);

    // Resplandor exterior dorado
    const outerGlow = scene.add
      .rectangle(0, 0, 460, 460, COLOR_GOLD, 0)
      .setStrokeStyle(1, COLOR_GOLD, 0.4);

    // Retrato del banquero
    const portrait = scene.add.image(0, 0, 'banker-portrait').setScale(0.85);

    // Título con tipografía elegante, coherente con el resto de la UI.
    const titleText = new LocalizedText(this.scene, 0, 60, 'BANKER_OFFER_TITLE', {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        fontStyle: 'bold',
        color: COLOR_GOLD_HEX,
        backgroundColor: '#000000'
      })
      .setOrigin(0.5);

    // Halo detrás del monto — ver startOfferAmountPulse() para el pulso
    // continuo que lo convierte en el foco de atención inmediato.
    const offerGlow = scene.add.graphics();
    offerGlow.fillStyle(COLOR_GOLD, 0.48);
    offerGlow.fillRoundedRect(-110, 80, 220, 50, 20);
    offerGlow.lineStyle(2, COLOR_GOLD, 0.5);
    offerGlow.strokeRoundedRect(-110, 80, 220, 50, 20);

    const offerText = scene.add
      .text(0, 100, '$0', {
        fontFamily: FONT_FAMILY,
        fontSize: '38px',
        fontStyle: 'bold',
        color: COLOR_GOLD_HEX,
        stroke: '#000000',
        strokeThickness: 4
      })
      .setOrigin(0.5);

    this.animateOfferAmountCounter(offerGlow, offerText, offer.amount);

    // Botones DEAL / NO DEAL — misma construcción visual (panel + halo +
    // hover) que los botones casino de MainMenuScene, diferenciados por
    // colorimetría: verde esmeralda para DEAL, rojo carmesí (con halo
    // dorado en hover) para NO DEAL.
    const dealBtn = this.createArcadeButton(
      scene,
      -110,
      165,
      'BANKER_DEAL_BUTTON',
      0x00e676,
      0x5cffb0,
      () => this.onDealAccepted()
    );

    const noDealBtn = this.createArcadeButton(
      scene,
      110,
      165,
      'BANKER_NO_DEAL_BUTTON',
      0xff1744,
      0xff4d6d,
      () => this.onDealRejected()
    );

    // Aviso de la regla anti-farmeo (ADR-014): línea chica debajo de los
    // botones (terminan en y=189; el marco interior llega a 218) que avisa
    // que la oferta de la 1ª ronda está topeada y cuántas partidas más lo
    // estará. Solo lo envía GameSceneController cuando el monto es
    // realmente un valor del catálogo topado (ver ese archivo).
    const cappedNotice =
      cappedRemainingGames !== null && cappedRemainingGames > 0
        ? new LocalizedText(
            this.scene,
            0,
            204,
            cappedRemainingGames === 1 ? 'BANKER_CAPPED_NOTICE_SINGULAR' : 'BANKER_CAPPED_NOTICE_PLURAL',
            {
              fontFamily: FONT_FAMILY,
              fontSize: '13px',
              color: COLOR_GOLD_HEX,
              align: 'center',
              wordWrap: { width: 430 }
            },
            { n: cappedRemainingGames }
          ).setOrigin(0.5)
        : null;

    this.add([
      this.backdrop,
      this.panelBg,
      innerFrame,
      outerGlow,
      portrait,
      titleText,
      offerGlow,
      offerText,
      dealBtn,
      noDealBtn,
      ...(cappedNotice ? [cappedNotice] : [])
    ]);
    scene.add.existing(this);

    // Animación de entrada
    this.setScale(0.2);
    this.setAlpha(0);
    scene.tweens.add({
      targets: this,
      scale: 1,
      alpha: 1,
      duration: 250,
      ease: 'Back.easeOut'
    });

    try {
      this.audioService?.play('sfx-offer');
    } catch {
      // Ignorar fallback de audio
    }
  }

  private onDealAccepted(): void {
    this.animateExit(() => this.emit('deal-accepted'));
  }

  private onDealRejected(): void {
    this.animateExit(() => this.emit('deal-rejected'));
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
   * Revelado del monto: arranca en $0 y hace un conteo progresivo
   * (`counter tween` sobre un objeto plano) hasta `offer.amount`,
   * actualizando el texto en cada `onUpdate` — misma técnica que
   * `GameSceneController.animateRevealedValueCounter()` para la cifra de
   * la carta descartada, ahora también acá. Al terminar el conteo arranca
   * el pulso continuo (`startOfferAmountPulse`) que mantiene la cifra
   * como foco de atención mientras el modal sigue en pantalla.
   */
  private animateOfferAmountCounter(
    glow: Phaser.GameObjects.Graphics,
    amountText: Phaser.GameObjects.Text,
    targetAmount: number
  ): void {
    const counter = { value: 0 };

    this.scene.tweens.add({
      targets: counter,
      value: targetAmount,
      duration: 500,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        amountText.setText(`$${Math.round(counter.value).toLocaleString()}`);
      },
      onComplete: () => {
        amountText.setText(`$${targetAmount.toLocaleString()}`);
        this.startOfferAmountPulse(glow, amountText);
      }
    });
  }

  /**
   * Destello/pulso continuo del monto de la oferta: el halo dorado detrás
   * del texto respira en alpha mientras el propio texto escala levemente,
   * en loop infinito (`yoyo`, `repeat: -1`) — convierte la cifra en el
   * punto focal inmediato del modal, tal como pide el diseño.
   */
  private startOfferAmountPulse(glow: Phaser.GameObjects.Graphics, amountText: Phaser.GameObjects.Text): void {
    this.scene.tweens.add({
      targets: glow,
      alpha: { from: 0.55, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.scene.tweens.add({
      targets: amountText,
      scale: { from: 1, to: 1.06 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  private createArcadeButton(
    scene: Phaser.Scene,
    x: number,
    y: number,
    title: TranslationKey,
    primaryColor: number,
    hoverGlowColor: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const width = 200;
    const height = 48;

    const btnContainer = scene.add.container(x, y);

    // Halo externo, invisible en reposo, que se enciende en hover — misma
    // construcción que los botones casino de MainMenuScene/DeckSelectionScene.
    const glow = scene.add.graphics();
    glow.fillStyle(hoverGlowColor, 0.45);
    glow.fillRoundedRect(-width / 2 - 8, -height / 2 - 8, width + 16, height + 16, 16);
    glow.setAlpha(0);

    // Panel oscuro con borde de acento (color propio de cada acción) y un
    // filo dorado interior muy fino para el mismo acabado "premium".
    const bg = scene.add.graphics();
    bg.fillStyle(0x121218, 0.95);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 10);
    bg.lineStyle(2, primaryColor, 0.9);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 10);
    bg.lineStyle(1, COLOR_GOLD, 0.25);
    bg.strokeRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, height - 8, 8);

    const btnText = new LocalizedText(this.scene, 0, 0, title, {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        fontStyle: 'bold',
        color: COLOR_WHITE_HEX
      })
      .setOrigin(0.5);

    btnContainer.add([glow, bg, btnText]);

    // Zona interactiva invisible del tamaño exacto del botón — reemplaza
    // al rectángulo de fondo interactivo anterior, ahora que el fondo
    // visual es Graphics (que no ofrece un hit-area rectangular directo
    // tan simple de mantener sincronizado).
    const hitZone = scene.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btnContainer.add(hitZone);

    hitZone.on('pointerover', () => {
      scene.tweens.add({ targets: btnContainer, scale: 1.05, duration: 120, ease: 'Cubic.easeOut' });
      scene.tweens.add({ targets: glow, alpha: 1, duration: 120, ease: 'Cubic.easeOut' });
    });

    hitZone.on('pointerout', () => {
      scene.tweens.add({ targets: btnContainer, scale: 1, duration: 120, ease: 'Cubic.easeOut' });
      scene.tweens.add({ targets: glow, alpha: 0, duration: 120, ease: 'Cubic.easeOut' });
    });

    hitZone.on('pointerup', () => {
      scene.tweens.add({
        targets: btnContainer,
        scale: 0.95,
        duration: 50,
        yoyo: true,
        onComplete: onClick
      });
    });

    return btnContainer;
  }
}