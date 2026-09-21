import Phaser from 'phaser';

/**
 * Boton "maletin" para la fase de seleccion de Carta Secreta, previa a
 * GameScene. Puramente visual: el numero mostrado es solo la posicion
 * en la grilla (1..13), NUNCA el valor real de la carta — ese valor
 * permanece oculto para el jugador durante toda la partida (salvo que
 * la carta termine siendo intercambiada o revelada al cerrar el juego).
 */
export class CaseCardButton extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private locked = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly cardId: string,
    displayNumber: number
  ) {
    super(scene, x, y);

    this.bg = scene.add
      .rectangle(0, 0, 90, 120, 0x1a1a2e)
      .setStrokeStyle(3, 0xf39c12)
      .setInteractive({ useHandCursor: true });

    const label = scene.add
      .text(0, 0, `#${displayNumber}`, {
        fontSize: '22px',
        fontFamily: 'Arial',
        color: '#f39c12'
      })
      .setOrigin(0.5);

    this.add([this.bg, label]);
    scene.add.existing(this);

    this.bg.on('pointerup', () => {
      if (this.locked) return;
      this.emit('case-selected', this.cardId);
    });
    this.bg.on('pointerover', () => {
      if (!this.locked) this.bg.setStrokeStyle(3, 0x58a6ff);
    });
    this.bg.on('pointerout', () => {
      if (!this.locked) this.bg.setStrokeStyle(3, 0xf39c12);
    });
  }

  /** Deshabilita el input tras la eleccion — se llama sobre TODOS los botones, elegido o no. */
  setLocked(locked: boolean): void {
    this.locked = locked;
    if (locked) {
      this.bg.disableInteractive();
    } else {
      this.bg.setInteractive({ useHandCursor: true });
    }
  }

  /** Resalte visual del maletin efectivamente elegido por el jugador. */
  markAsChosen(): void {
    this.bg.setFillStyle(0x2ecc71, 0.35);
    this.bg.setStrokeStyle(4, 0x2ecc71);
  }
}
