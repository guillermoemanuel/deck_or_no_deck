import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect, getCelebrationTargetPosition } from './DeckCelebrationEffect';

/**
 * Estrategia del mazo Egypt:
 * 1. Tormenta de arena del desierto cruzando la pantalla con ráfagas y polvo en suspensión.
 * 2. Al finalizar la tormenta, las partículas de arena convergen en un vórtice hacia la
 *    carta de mayor valor (25,000) y se depositan/acumulan sobre ella formando un cúmulo
 *    dorado resplandeciente.
 */
export class EgyptSandstormEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, card: Card): void {
    const { width, height } = scene.cameras.main;
    const container = scene.add.container(0, 0);

    // Posición global de la carta objetivo de mayor valor
    const target = getCelebrationTargetPosition(scene, card);

    // Flash inicial cálido
    const flash = scene.add.rectangle(width / 2, height / 2, width, height, 0xffdca0, 0.55);
    container.add(flash);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 300, ease: 'Cubic.easeOut' });

    // Tinte ambarino turbulento
    const sandTint = scene.add.rectangle(width / 2, height / 2, width, height, 0xc2914a, 0).setAlpha(0);
    container.add(sandTint);
    scene.tweens.add({ targets: sandTint, alpha: 0.32, duration: 260, ease: 'Cubic.easeOut' });
    scene.tweens.add({
      targets: sandTint,
      alpha: { from: 0.24, to: 0.38 },
      duration: 320,
      delay: 260,
      yoyo: true,
      repeat: 4,
      ease: 'Sine.easeInOut'
    });

    // Franjas de arena cruzando la pantalla
    const streakCount = 14;
    for (let i = 0; i < streakCount; i++) {
      const y = Math.random() * height;
      const streakLength = 160 + Math.random() * 220;
      const streakColor = [0xe8c07d, 0xd2a679, 0xb98a4a][i % 3];
      const fromLeft = Math.random() < 0.5;

      const streak = scene.add.rectangle(
        fromLeft ? -streakLength : width + streakLength,
        y,
        streakLength,
        3 + Math.random() * 3,
        streakColor,
        0.5 + Math.random() * 0.3
      );
      streak.setAngle(-6 + Math.random() * 12);
      container.add(streak);

      scene.tweens.add({
        targets: streak,
        x: fromLeft ? width + streakLength : -streakLength,
        y: y + (Math.random() - 0.5) * 60,
        duration: 900 + Math.random() * 700,
        delay: Math.random() * 500,
        ease: 'Sine.easeInOut'
      });
    }

    // Granos ambientales
    const grainCount = 50;
    for (let i = 0; i < grainCount; i++) {
      const y = Math.random() * height;
      const fromLeft = Math.random() < 0.5;

      const grain = scene.add.circle(fromLeft ? -10 : width + 10, y, 1 + Math.random() * 1.5, 0xd9b06b, 0.6 + Math.random() * 0.3);
      container.add(grain);

      scene.tweens.add({
        targets: grain,
        x: fromLeft ? width + 10 : -10,
        y: y + (Math.random() - 0.5) * 100,
        duration: 1100 + Math.random() * 900,
        delay: Math.random() * 700,
        ease: 'Linear'
      });
    }

    scene.cameras.main.shake(550, 0.004);

    // --- Al finalizar la tormenta: vórtice que acumula y deposita arena sobre la carta ---
    scene.time.delayedCall(1350, () => {
      this.spawnSandAccumulation(scene, container, target.x, target.y);
    });

    // Restauración y limpieza
    scene.time.delayedCall(3400, () => {
      scene.tweens.add({
        targets: container,
        alpha: 0,
        duration: 500,
        ease: 'Cubic.easeIn',
        onComplete: () => container.destroy()
      });
    });
  }

  /** Convergencia y depósito de arena sobre la carta objetivo */
  private spawnSandAccumulation(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    tx: number,
    ty: number
  ): void {
    const convergeGrains = 28;

    for (let i = 0; i < convergeGrains; i++) {
      const angle = (i / convergeGrains) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
      const spawnRadius = 140 + Math.random() * 90;
      const sx = tx + Math.cos(angle) * spawnRadius;
      const sy = ty + Math.sin(angle) * spawnRadius;

      const grain = scene.add.circle(sx, sy, 2 + Math.random() * 2.5, 0xf5d061, 0.9);
      grain.setBlendMode(Phaser.BlendModes.ADD);
      container.add(grain);

      // Espiralan y convergen hacia la carta
      scene.tweens.add({
        targets: grain,
        x: tx + (Math.random() - 0.5) * 45,
        y: ty + 40 + (Math.random() - 0.5) * 20, // Se asientan hacia la base de la carta
        duration: 550 + Math.random() * 250,
        ease: 'Cubic.easeOut',
        delay: Math.random() * 200,
        onComplete: () => {
          // Micro-destello al asentarse
          scene.tweens.add({
            targets: grain,
            alpha: 0.4,
            scale: 0.6,
            duration: 900,
            ease: 'Sine.easeOut'
          });
        }
      });
    }

    // Cúmulo / montículo de arena dorada acumulada sobre la base de la carta
    const sandMound = scene.add.graphics();
    sandMound.fillStyle(0xd4af37, 0.7);
    sandMound.fillEllipse(0, 0, 80, 22);
    sandMound.fillStyle(0xffe88a, 0.85);
    sandMound.fillEllipse(0, -3, 50, 12);
    sandMound.setPosition(tx, ty + 50);
    sandMound.setScale(0);
    container.add(sandMound);

    scene.tweens.add({
      targets: sandMound,
      scaleX: 1,
      scaleY: 1,
      duration: 650,
      delay: 450,
      ease: 'Back.easeOut'
    });

    // Halo dorado místico sobre la carta
    const halo = scene.add
      .circle(tx, ty, 68, 0x000000, 0)
      .setStrokeStyle(2.5, 0xf6c85f, 0.9)
      .setScale(0.3);
    container.add(halo);

    scene.tweens.add({
      targets: halo,
      scale: 1.15,
      alpha: 0,
      duration: 750,
      delay: 550,
      ease: 'Cubic.easeOut',
      onComplete: () => halo.destroy()
    });
  }
}