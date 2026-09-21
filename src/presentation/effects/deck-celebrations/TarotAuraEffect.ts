import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect, getCelebrationTargetPosition } from './DeckCelebrationEffect';

/**
 * Estrategia del mazo Tarot:
 * 1. Ambiente esotérico con luz tenue y titilante.
 * 2. Una esfera y aura mística de luz se concentra y genera directamente
 *    sobre la carta de mayor valor (25,000), con geometría arcana, anillos pulsantes
 *    y chispas estelares en órbita.
 */
export class TarotAuraEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, card: Card): void {
    const { width, height } = scene.cameras.main;
    const container = scene.add.container(0, 0);

    // Posición global de la carta objetivo de 25k
    const target = getCelebrationTargetPosition(scene, card);

    // Luz ambiental baja de golpe
    const darken = scene.add.rectangle(width / 2, height / 2, width, height, 0x120a1f, 0).setAlpha(0);
    container.add(darken);
    scene.tweens.add({
      targets: darken,
      alpha: 0.72,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => this.flickerLight(scene, darken, 8)
    });

    // Generación y concentración de la esfera y aura mística sobre la carta
    this.spawnAura(scene, container, target.x, target.y);

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

  private flickerLight(scene: Phaser.Scene, darken: Phaser.GameObjects.Rectangle, stepsRemaining: number): void {
    const isLastStep = stepsRemaining <= 0;
    const targetAlpha = isLastStep ? 0.45 : 0.32 + Math.random() * 0.3;

    scene.tweens.add({
      targets: darken,
      alpha: targetAlpha,
      duration: isLastStep ? 260 : 70 + Math.random() * 110,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        if (!isLastStep && darken.active) {
          this.flickerLight(scene, darken, stepsRemaining - 1);
        }
      }
    });
  }

  /** Aura mística y esfera de luz concentrada sobre la carta objetivo */
  private spawnAura(scene: Phaser.Scene, container: Phaser.GameObjects.Container, x: number, y: number): void {
    const colors = [0x9b5de5, 0xf4c95d, 0x4cc9f0]; // Violeta, oro y cyan esotéricos

    // 1. Esfera de luz mística concentrándose sobre la carta
    const sphereGlow = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    sphereGlow.fillStyle(0xfff2a8, 0.4);
    sphereGlow.fillCircle(0, 0, 75);
    sphereGlow.fillStyle(0xd580ff, 0.5);
    sphereGlow.fillCircle(0, 0, 50);
    sphereGlow.fillStyle(0xffffff, 0.85);
    sphereGlow.fillCircle(0, 0, 25);
    sphereGlow.setPosition(x, y);
    sphereGlow.setScale(0.1);
    sphereGlow.setAlpha(0);
    container.add(sphereGlow);

    // La esfera se condensa y luego pulsa
    scene.tweens.add({
      targets: sphereGlow,
      scale: 1,
      alpha: 1,
      duration: 500,
      ease: 'Back.easeOut',
      onComplete: () => {
        scene.tweens.add({
          targets: sphereGlow,
          scale: { from: 0.92, to: 1.12 },
          alpha: { from: 0.7, to: 1 },
          duration: 700,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      }
    });

    // 2. Geometría arcana (estrella de 8 puntas / rombo místico) sobre la carta
    const runeGeometry = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    runeGeometry.lineStyle(2, 0xffd76a, 0.8);
    const radius = 60;
    runeGeometry.strokeRect(-radius * 0.7, -radius * 0.7, radius * 1.4, radius * 1.4);
    runeGeometry.beginPath();
    runeGeometry.moveTo(0, -radius);
    runeGeometry.lineTo(radius, 0);
    runeGeometry.lineTo(0, radius);
    runeGeometry.lineTo(-radius, 0);
    runeGeometry.closePath();
    runeGeometry.strokePath();
    runeGeometry.setPosition(x, y);
    runeGeometry.setScale(0);
    container.add(runeGeometry);

    scene.tweens.add({
      targets: runeGeometry,
      scale: 1,
      angle: 180,
      duration: 1800,
      ease: 'Cubic.easeOut'
    });

    // 3. Anillos concéntricos pulsantes
    colors.forEach((color, i) => {
      const ring = scene.add
        .circle(x, y, 90 + i * 22, color, 0)
        .setStrokeStyle(2.5, color, 0.8)
        .setBlendMode(Phaser.BlendModes.ADD);
      container.add(ring);

      scene.tweens.add({
        targets: ring,
        scale: { from: 0.82, to: 1.18 },
        alpha: { from: 0.8, to: 0.15 },
        duration: 1000 + i * 220,
        delay: i * 140,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    });

    // 4. Chispas estelares orbitando la carta
    const sparkCount = 8;
    for (let i = 0; i < sparkCount; i++) {
      const orbitRadius = 65 + Math.random() * 20;
      const startAngle = (i / sparkCount) * Math.PI * 2;
      const spark = scene.add
        .circle(
          x + Math.cos(startAngle) * orbitRadius,
          y + Math.sin(startAngle) * orbitRadius,
          3,
          colors[i % colors.length],
          0.95
        )
        .setBlendMode(Phaser.BlendModes.ADD);
      container.add(spark);

      this.orbitSpark(scene, spark, x, y, orbitRadius, startAngle, i % 2 === 0);
    }
  }

  private orbitSpark(
    scene: Phaser.Scene,
    spark: Phaser.GameObjects.Arc,
    cx: number,
    cy: number,
    radius: number,
    angle: number,
    clockwise: boolean
  ): void {
    const step = 0.14 * (clockwise ? 1 : -1);
    const nextAngle = angle + step;
    const nextX = cx + Math.cos(nextAngle) * radius;
    const nextY = cy + Math.sin(nextAngle) * radius;

    scene.tweens.add({
      targets: spark,
      x: nextX,
      y: nextY,
      duration: 85,
      ease: 'Linear',
      onComplete: () => {
        if (spark.active) {
          this.orbitSpark(scene, spark, cx, cy, radius, nextAngle, clockwise);
        }
      }
    });
  }
}