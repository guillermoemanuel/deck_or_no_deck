import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect, getCelebrationTargetPosition } from './DeckCelebrationEffect';

/**
 * Estrategia del mazo Drácula:
 * 1. Relámpago inicial en pantalla con destellos estroboscópicos.
 * 2. Múltiples filas de murciélagos volando en bandada a distintas alturas.
 * 3. El último murciélago vuela con retraso (delay) y se precipita directamente
 *    para impactar sobre la carta de mayor valor (25,000), detonando un estallido de sombras.
 */
export class BatSwarmEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, card: Card): void {
    const { width, height } = scene.cameras.main;
    const container = scene.add.container(0, 0);

    // Posición global de la carta objetivo de mayor valor
    const target = getCelebrationTargetPosition(scene, card);

    // 1. --- Relámpago inicial en pantalla (strobe flash) ---
    const flash = scene.add.rectangle(width / 2, height / 2, width, height, 0xecf8ff, 0);
    container.add(flash);

    scene.tweens.add({
      targets: flash,
      alpha: { from: 0.85, to: 0.2 },
      duration: 70,
      yoyo: true,
      repeat: 2,
      ease: 'Linear',
      onComplete: () => {
        scene.tweens.add({
          targets: flash,
          alpha: 0,
          duration: 180,
          ease: 'Cubic.easeOut'
        });
      }
    });

    // Rayo eléctrico descendente
    const lightning = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    lightning.lineStyle(3, 0xffffff, 0.9);
    let lx = width * (0.3 + Math.random() * 0.4);
    let ly = 0;
    lightning.beginPath();
    lightning.moveTo(lx, ly);
    while (ly < height * 0.85) {
      ly += 25 + Math.random() * 35;
      lx += (Math.random() - 0.5) * 60;
      lightning.lineTo(lx, ly);
    }
    lightning.strokePath();
    container.add(lightning);

    scene.tweens.add({
      targets: lightning,
      alpha: 0,
      duration: 220,
      delay: 90,
      ease: 'Cubic.easeOut',
      onComplete: () => lightning.destroy()
    });

    // 2. --- Filas de murciélagos en bandada (4-5 filas a diferentes alturas) ---
    const rowCount = 5;
    const batsPerRow = 5;

    for (let r = 0; r < rowCount; r++) {
      const rowY = height * (0.18 + (r / (rowCount - 1)) * 0.58);

      for (let b = 0; b < batsPerRow; b++) {
        const batIndex = r * batsPerRow + b;
        const bat = this.createBat(scene, 1.0);
        const startY = rowY + (Math.random() - 0.5) * 45;
        const startX = -50 - b * 55 - Math.random() * 40;
        bat.setPosition(startX, startY);
        container.add(bat);

        // Vuelo horizontal con fluctuación vertical
        scene.tweens.add({
          targets: bat,
          x: width + 70,
          y: startY + (Math.random() - 0.5) * 70,
          duration: 1400 + Math.random() * 450,
          delay: 150 + (batIndex * 50) + (Math.random() * 90),
          ease: 'Sine.easeInOut'
        });

        // Aleteo continuo
        scene.tweens.add({
          targets: bat,
          scaleY: 0.35,
          duration: 90 + Math.random() * 40,
          yoyo: true,
          repeat: -1
        });
      }
    }

    // 3. --- El último murciélago: vuela con delay e impacta sobre la carta de 25k ---
    scene.time.delayedCall(1100, () => {
      const finalBat = this.createBat(scene, 1.4, true);
      const startX = -60;
      const startY = Math.max(50, target.y - 180);
      finalBat.setPosition(startX, startY);
      container.add(finalBat);

      // Aleteo rápido
      const flapTween = scene.tweens.add({
        targets: finalBat,
        scaleY: 0.3,
        duration: 80,
        yoyo: true,
        repeat: -1
      });

      // Vuelo directo hacia la carta objetivo
      scene.tweens.add({
        targets: finalBat,
        x: target.x,
        y: target.y,
        duration: 650,
        ease: 'Quad.easeInOut',
        onComplete: () => {
          flapTween.stop();
          finalBat.destroy();
          this.spawnBatImpact(scene, container, target.x, target.y);
        }
      });
    });

    // Restauración y limpieza
    scene.time.delayedCall(2800, () => {
      scene.tweens.add({
        targets: container,
        alpha: 0,
        duration: 400,
        ease: 'Cubic.easeIn',
        onComplete: () => container.destroy()
      });
    });
  }

  private createBat(scene: Phaser.Scene, scale: number, isLeader = false): Phaser.GameObjects.Graphics {
    const bat = scene.add.graphics();
    bat.fillStyle(isLeader ? 0x120a1c : 0x1f1f24, 0.95);
    // Alas angulares + cabeza
    bat.fillTriangle(-16, 0, 0, -8, 0, 8);
    bat.fillTriangle(16, 0, 0, -8, 0, 8);
    bat.fillCircle(0, 0, 4);

    if (isLeader) {
      // Ojos carmesí / aura de líder
      bat.fillStyle(0xff1744, 1);
      bat.fillCircle(-2, -2, 1.5);
      bat.fillCircle(2, -2, 1.5);
    }

    bat.setScale(scale);
    return bat;
  }

  private spawnBatImpact(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    x: number,
    y: number
  ): void {
    // Onda expansiva de impacto oscuro
    const shockwave = scene.add
      .circle(x, y, 65, 0x000000, 0)
      .setStrokeStyle(3, 0x7b1fa2, 0.9)
      .setScale(0.1);
    container.add(shockwave);

    scene.tweens.add({
      targets: shockwave,
      scale: 1,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => shockwave.destroy()
    });

    // Destello de energía carmesí/violeta
    const flash = scene.add.circle(x, y, 42, 0xba68c8, 0.75).setScale(0.2);
    container.add(flash);

    scene.tweens.add({
      targets: flash,
      scale: 1.2,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy()
    });

    // Chispas de sombra
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const dist = 30 + Math.random() * 35;
      const spark = scene.add.circle(x, y, 2.5 + Math.random() * 2, 0x240046, 0.9);
      container.add(spark);

      scene.tweens.add({
        targets: spark,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.3,
        duration: 350 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy()
      });
    }

    // Leve temblor
    scene.cameras.main.shake(160, 0.007);
  }
}