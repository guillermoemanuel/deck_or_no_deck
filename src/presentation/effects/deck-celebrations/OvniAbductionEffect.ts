import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect, getCelebrationTargetPosition } from './DeckCelebrationEffect';

/**
 * Estrategia del mazo OVNI: "abducción" —
 * 1. Flash inicial y oscurecimiento de fondo.
 * 2. El rayo abductor final (haz exterior celeste + núcleo brillante) enfoca e ilumina
 *    la columna exacta donde se encuentra la carta de mayor valor (25,000).
 * 3. En la base del rayo, la carta queda envuelta en un óvalo de luz tractora con
 *    partículas y anillos de energía ascendiendo hacia la nave.
 */
export class OvniAbductionEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, card: Card): void {
    const { width, height } = scene.cameras.main;
    const container = scene.add.container(0, 0);

    // Posición global de la carta objetivo de mayor valor (columna X y altura Y)
    const target = getCelebrationTargetPosition(scene, card);

    // Flash inicial, como el destello de teleportación / inicio del rapto
    const flash = scene.add.rectangle(target.x, height / 2, width, height, 0xffffff, 0.7);
    container.add(flash);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 300, ease: 'Cubic.easeOut' });

    // Oscurecimiento de la pantalla
    const darken = scene.add.rectangle(width / 2, height / 2, width, height, 0x010810, 0).setAlpha(0);
    container.add(darken);
    scene.tweens.add({ targets: darken, alpha: 0.72, duration: 300, delay: 100, ease: 'Cubic.easeOut' });

    // Rayo tractor enfocado exactamente en la columna de la carta de mayor valor
    const outerBeam = this.createBeam(scene, target.x, 170, 0x8fe3ff, 0.4);
    const innerBeam = this.createBeam(scene, target.x, 80, 0xffffff, 0.65);
    container.add([outerBeam, innerBeam]);

    [outerBeam, innerBeam].forEach((beam, i) => {
      scene.tweens.add({
        targets: beam,
        scaleY: 1,
        duration: 680,
        delay: 150 + i * 80,
        ease: 'Cubic.easeIn'
      });
    });

    // Pulso de energía viva en el haz
    scene.tweens.add({
      targets: [outerBeam, innerBeam],
      alpha: { from: 0.7, to: 1 },
      duration: 240,
      delay: 850,
      yoyo: true,
      repeat: 3,
      ease: 'Sine.easeInOut'
    });

    // Halo tractor / elipse de luz iluminando directamente sobre la carta
    scene.time.delayedCall(450, () => {
      const puddle = scene.add
        .ellipse(target.x, target.y + 10, 130, 48, 0x90f0ff, 0.65)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(0);
      container.add(puddle);

      scene.tweens.add({
        targets: puddle,
        scale: 1,
        duration: 350,
        ease: 'Back.easeOut'
      });

      // Anillos de abducción que se elevan desde la carta
      for (let r = 0; r < 3; r++) {
        const ring = scene.add
          .ellipse(target.x, target.y + 10, 110, 36, 0x000000, 0)
          .setStrokeStyle(2, 0xffffff, 0.85)
          .setBlendMode(Phaser.BlendModes.ADD);
        container.add(ring);

        scene.tweens.add({
          targets: ring,
          y: -50,
          scaleX: 0.5,
          scaleY: 0.5,
          alpha: 0,
          duration: 1100,
          delay: 700 + r * 280,
          ease: 'Cubic.easeIn',
          onComplete: () => ring.destroy()
        });
      }
    });

    // Motas de luz y energía ascendiendo desde la carta hacia la nave
    for (let i = 0; i < 12; i++) {
      const speck = scene.add.circle(
        target.x + (Math.random() - 0.5) * 80,
        target.y + 20 + Math.random() * 40,
        2 + Math.random() * 2.5,
        0xe8faff,
        0.95
      );
      speck.setBlendMode(Phaser.BlendModes.ADD);
      container.add(speck);

      scene.tweens.add({
        targets: speck,
        y: -30,
        alpha: 0,
        duration: 1000 + Math.random() * 450,
        delay: 500 + i * 90,
        ease: 'Cubic.easeIn',
        onComplete: () => speck.destroy()
      });
    }

    // Restauración y limpieza
    scene.time.delayedCall(2700, () => {
      scene.tweens.add({
        targets: container,
        alpha: 0,
        duration: 450,
        ease: 'Cubic.easeIn',
        onComplete: () => container.destroy()
      });
    });
  }

  /**
   * Dibuja un haz vertical centrado en la columna `targetX`, anclado arriba (y=0)
   */
  private createBeam(
    scene: Phaser.Scene,
    targetX: number,
    beamWidth: number,
    color: number,
    alpha: number
  ): Phaser.GameObjects.Graphics {
    const { height } = scene.cameras.main;
    const beam = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    beam.fillStyle(color, alpha);
    beam.fillRect(-beamWidth / 2, 0, beamWidth, height);
    beam.setPosition(targetX, 0);
    beam.setScale(1, 0);
    return beam;
  }
}