import Phaser from 'phaser';
/**
 * SRP: solo carga los assets MINIMOS para pintar una pantalla de carga.
 * El resto de assets pesados se cargan en PreloadScene.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload(): void {
    this.load.image('loading-bg', 'assets/ui/loading-bg.webp');
    this.load.image('loading-bar', 'assets/ui/loading-bar.webp');
  }

  create(): void {
    this.scene.start('PreloadScene');
  }
}
