import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect } from './DeckCelebrationEffect';

/**
 * Estrategia del mazo Drácula: un puñado de murciélagos (siluetas
 * dibujadas con Graphics, sin assets) cruzando la pantalla con aleteo.
 *
 * Vive en su propio archivo (GRASP Polymorphism / Strategy) para que
 * pueda crecer o afinarse sin tocar GameScene.ts ni las estrategias de
 * otros mazos.
 */
export class BatSwarmEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, _card: Card): void {
    const { width, height } = scene.cameras.main;
    const container = scene.add.container(0, 0);

    for (let i = 0; i < 666; i++) {
      const bat = scene.add.graphics();
      bat.fillStyle(0x1a1a1a, 0.9);
      // Silueta simple: dos triángulos como alas + un cuerpo circular.
      bat.fillTriangle(-14, 0, 0, -6, 0, 6);
      bat.fillTriangle(14, 0, 0, -6, 0, 6);
      bat.fillCircle(0, 0, 3);

      const startY = height * (0.2 + Math.random() * 0.5);
      bat.setPosition(-40 - i * 60, startY);
      container.add(bat);

      scene.tweens.add({
        targets: bat,
        x: width + 60,
        y: startY + (Math.random() - 0.5) * 80,
        duration: 1500 + Math.random() * 500,
        delay: i * 90,
        ease: 'Sine.easeInOut'
      });

      // Aleteo: escala vertical oscilante.
      scene.tweens.add({ targets: bat, scaleY: 0.4, duration: 120, yoyo: true, repeat: -1 });
    }

    // Sin `setDepth()` explícito, mismo criterio que el resto de los
    // efectos — ver el comentario correspondiente en SpotlightSweepEffect.
    scene.time.delayedCall(2200, () => container.destroy());
  }
}