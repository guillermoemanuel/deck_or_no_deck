import Phaser from 'phaser';

/** Misma paleta "Casino de Lujo" que el resto de los modales del juego. */
const COLOR_GOLD = 0xffd76a;
const COLOR_GOLD_DIM = 0xd4af37;
const COLOR_GOLD_HEX = '#ffd76a';
const COLOR_WHITE_HEX = '#ffffff';
const COLOR_PANEL_BG = 0x0a0e17;
const FONT_FAMILY = 'Georgia, "Times New Roman", serif';

interface CardSlot {
  readonly container: Phaser.GameObjects.Container;
  readonly back: Phaser.GameObjects.Image;
  readonly front: Phaser.GameObjects.Image;
  readonly valueText: Phaser.GameObjects.Text;
  readonly glow: Phaser.GameObjects.Graphics;
  readonly hitZone: Phaser.GameObjects.Zone;
}

export interface PeriodicBonusModalCallbacks {
  /**
   * Se dispara UNA vez, en el instante en que el jugador elige una carta
   * (antes de que cierre el modal) — quien orqueste (UIScene) debe
   * acreditar `value` de inmediato acá, no esperar a "Cerrar".
   */
  onCardChosen: (value: number) => void;
  /** Se dispara al presionar "Cerrar", ya con el premio revelado y acreditado. */
  onClose: () => void;
}

/**
 * PeriodicBonusModal: el modal de "elegí una carta" del bono periódico.
 *
 * Reutiliza las texturas GENÉRICAS 'card-back'/'card-front' — las mismas
 * que ya están cargadas para el mazo activo del jugador (ver
 * PreloadScene.preload()) — en vez de instanciar `CardView` (esa clase
 * está pensada para el tablero de juego real: conoce audio de
 * apertura, numeración de posición, y su ciclo de vida está atado a
 * GameSceneController; reutilizarla acá para 6 cartas puramente
 * decorativas de un modal de HUD sería acoplar dos responsabilidades
 * que no tienen por qué conocerse). Acá se implementa un flip mínimo y
 * autocontenido, suficiente para este único uso.
 */
export class PeriodicBonusModal extends Phaser.GameObjects.Container {
  private readonly slots: CardSlot[] = [];
  private resolved = false;

  constructor(scene: Phaser.Scene, values: readonly number[], callbacks: PeriodicBonusModalCallbacks) {
    const cx = scene.cameras.main.centerX;
    const cy = scene.cameras.main.centerY;
    super(scene, cx, cy);

    const backdrop = scene.add.rectangle(0, 0, scene.cameras.main.width * 2, scene.cameras.main.height * 2, 0x000000, 0.78).setInteractive();

    const panelWidth = Math.min(620, scene.cameras.main.width - 60);
    const panelBg = scene.add
      .rectangle(0, 0, panelWidth, 360, COLOR_PANEL_BG, 0.98)
      .setStrokeStyle(3, COLOR_GOLD_DIM, 0.9);

    const innerFrame = scene.add
      .rectangle(0, 0, panelWidth - 20, 280, 0x000000, 0)
      .setStrokeStyle(1, COLOR_GOLD, 0.35);

    const titleText = scene.add
      .text(0, -115, '🎁 Bono Periódico', {
        fontSize: '24px',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        color: COLOR_GOLD_HEX
      })
      .setOrigin(0.5);

    const subtitleText = scene.add
      .text(0, -82, 'Elegí una carta — te llevás lo que tenga.', {
        fontSize: '17px',
        fontFamily: FONT_FAMILY,
        color: '#cbd5e1'
      })
      .setOrigin(0.5);

    this.add([backdrop, panelBg, innerFrame, titleText, subtitleText]);

    const cardSpacing = Math.min(95, (panelWidth - 60) / (values.length - 1));
    const startX = -((values.length - 1) * cardSpacing) / 2;

    values.forEach((value, index) => {
      const x = startX + index * cardSpacing;
      const slot = this.createCardSlot(scene, x, 20, value, () => this.handleCardPicked(scene, index, value, callbacks));
      this.slots.push(slot);
      this.add(slot.container);
    });

    scene.add.existing(this);

    // Animación de entrada, misma familia que el resto de los modales del juego.
    this.setScale(0.2).setAlpha(0);
    scene.tweens.add({ targets: this, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
  }

  private createCardSlot(scene: Phaser.Scene, x: number, y: number, value: number, onPick: () => void): CardSlot {
    const w = 78;
    const h = 108;

    const container = scene.add.container(x, y);

    const glow = scene.add.graphics();
    glow.fillStyle(COLOR_GOLD, 0.35);
    glow.fillRoundedRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12, 12);
    glow.setAlpha(0);

    const back = scene.add.image(0, 0, 'card-back').setDisplaySize(w, h);
    const front = scene.add.image(0, 0, 'card-front').setDisplaySize(w, h).setVisible(false);

    const valueText = scene.add
      .text(0, 0, `+$${value.toLocaleString()}`, {
        // QA de legibilidad: se queda en 16px (no 17, como el resto de
        // los textos "14px->17px" de este archivo) a propósito — la
        // carta mide apenas 78px de ancho y "+$5.000" (el valor más alto
        // del catálogo, ver PERIODIC_BONUS_VALUES) ya casi la llena a
        // 17px; 16px sigue muy por encima del piso de legibilidad
        // (10px reales @800x450) sin arriesgar que el número se salga
        // del borde de la carta.
        fontSize: '16px',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        color: COLOR_GOLD_HEX,
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center'
      })
      .setOrigin(0.5)
      .setVisible(false);

    container.add([glow, back, front, valueText]);

    const hitZone = scene.add.zone(0, 0, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add(hitZone);

    hitZone.on('pointerover', () => {
      if (this.resolved) return;
      scene.tweens.add({ targets: container, scale: 1.08, duration: 100, ease: 'Cubic.easeOut' });
      scene.tweens.add({ targets: glow, alpha: 0.7, duration: 100 });
    });
    hitZone.on('pointerout', () => {
      if (this.resolved) return;
      scene.tweens.add({ targets: container, scale: 1, duration: 100, ease: 'Cubic.easeOut' });
      scene.tweens.add({ targets: glow, alpha: 0, duration: 100 });
    });
    hitZone.on('pointerup', () => {
      if (this.resolved) return;
      onPick();
    });

    return { container, back, front, valueText, glow, hitZone };
  }

  private handleCardPicked(scene: Phaser.Scene, chosenIndex: number, value: number, callbacks: PeriodicBonusModalCallbacks): void {
    if (this.resolved) return; // Doble click protegido — solo se resuelve una vez.
    this.resolved = true;

    this.slots.forEach((slot, index) => {
      slot.hitZone.disableInteractive();
      if (index === chosenIndex) {
        this.flipCard(scene, slot);
      } else {
        // El resto de las cartas se apaga sin revelar su valor — el
        // jugador eligió una sola, no se muestra "lo que se perdió"
        // (mantiene la mecánica simple, tal como se pidió).
        scene.tweens.add({ targets: slot.container, alpha: 0.3, scale: 0.94, duration: 200 });
      }
    });

    // El premio se acredita YA, en el instante de la elección — "Cerrar"
    // más abajo solo cierra el modal, no condiciona si el premio se otorga.
    callbacks.onCardChosen(value);

    scene.time.delayedCall(420, () => this.showResult(scene, value, callbacks.onClose));
  }

  private flipCard(scene: Phaser.Scene, slot: CardSlot): void {
    scene.tweens.add({
      targets: slot.container,
      scaleX: 0,
      duration: 140,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        slot.back.setVisible(false);
        slot.front.setVisible(true);
        slot.valueText.setVisible(true);
        scene.tweens.add({ targets: slot.container, scaleX: 1.08, duration: 140, ease: 'Cubic.easeOut' });
        // Un par de pulsos de brillo, no infinitos (el modal cierra pronto).
        scene.tweens.add({
          targets: slot.glow,
          alpha: { from: 0.3, to: 0.9 },
          duration: 260,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeInOut'
        });
      }
    });
  }

  private showResult(scene: Phaser.Scene, value: number, onClose: () => void): void {
    const resultText = scene.add
      .text(0, 120, value > 0 ? `¡Ganaste $${value.toLocaleString()}!` : 'Sin premio esta vez — probá en 12hs.', {
        fontSize: '18px',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        color: value > 0 ? COLOR_GOLD_HEX : '#cbd5e1'
      })
      .setOrigin(0.5)
      .setAlpha(0);

    const closeBtn = this.createCloseButton(scene, 0, 160, onClose);

    this.add([resultText, closeBtn]);
    scene.tweens.add({ targets: resultText, alpha: 1, duration: 200 });
  }

  private createCloseButton(scene: Phaser.Scene, x: number, y: number, onClick: () => void): Phaser.GameObjects.Container {
    const width = 160;
    const height = 44;
    const container = scene.add.container(x, y).setScale(0).setAlpha(0);

    const glow = scene.add.graphics();
    glow.fillStyle(COLOR_GOLD, 0.4);
    glow.fillRoundedRect(-width / 2 - 8, -height / 2 - 8, width + 16, height + 16, 14);
    glow.setAlpha(0);

    const bg = scene.add.graphics();
    bg.fillStyle(0x121218, 0.95);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 10);
    bg.lineStyle(2, COLOR_GOLD_DIM, 0.9);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 10);

    const label = scene.add
      .text(0, 0, 'Cerrar', { fontFamily: FONT_FAMILY, fontSize: '16px', fontStyle: 'bold', color: COLOR_WHITE_HEX })
      .setOrigin(0.5);

    container.add([glow, bg, label]);

    const hitZone = scene.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add(hitZone);

    hitZone.on('pointerover', () => {
      scene.tweens.add({ targets: container, scale: 1.05, duration: 120 });
      scene.tweens.add({ targets: glow, alpha: 1, duration: 120 });
    });
    hitZone.on('pointerout', () => {
      scene.tweens.add({ targets: container, scale: 1, duration: 120 });
      scene.tweens.add({ targets: glow, alpha: 0, duration: 120 });
    });
    hitZone.on('pointerup', () => onClick());

    scene.tweens.add({ targets: container, scale: 1, alpha: 1, duration: 180, ease: 'Back.easeOut' });

    return container;
  }
}