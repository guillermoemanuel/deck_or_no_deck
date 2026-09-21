import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect, hasCardPositionSource } from './DeckCelebrationEffect';

/**
 * Estrategia del mazo Tarot: se crea un ambiente esotérico — la luz baja
 * de golpe y luego "sube" parpadeando de forma irregular, como una vela
 * inestable — mientras un aura mística (anillos concéntricos pulsantes +
 * un halo de chispas orbitando) envuelve la carta que disparó la
 * celebración, sea que esté en el tablero o sea la carta secreta del
 * pedestal.
 *
 * Igual que TheaterSpotlightsEffect (Basic) y MedievalSiegeEffect
 * (Medieval), necesita la posición REAL en pantalla de esa carta, así
 * que resuelve `card.id` vía `hasCardPositionSource` — ver ese type
 * guard en DeckCelebrationEffect.ts para el porqué no hace falta ningún
 * cast a `any` ni un import circular a GameScene.
 *
 * Vive en su propio archivo (GRASP Polymorphism / Strategy) para que
 * pueda crecer o afinarse sin tocar GameScene.ts ni las estrategias de
 * otros mazos.
 */
export class TarotAuraEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, card: Card): void {
    const { width, height } = scene.cameras.main;
    const container = scene.add.container(0, 0);

    // Posición real de la carta que disparó el festejo — sea del tablero
    // o la secreta. Si por algún motivo no está disponible (defensivo),
    // cae al centro de la pantalla como resultado seguro.
    const target = (hasCardPositionSource(scene) ? scene.getCardScreenPosition(card.id) : null) ?? {
      x: width / 2,
      y: height / 2
    };

    // La luz "baja" de golpe...
    const darken = scene.add.rectangle(width / 2, height / 2, width, height, 0x120a1f, 0).setAlpha(0);
    container.add(darken);
    scene.tweens.add({
      targets: darken,
      alpha: 0.7,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => this.flickerLight(scene, darken, 9)
    });

    // El aura envuelve la carta desde el principio — anillos concéntricos
    // pulsantes + halo de chispas orbitando.
    this.spawnAura(scene, container, target.x, target.y);

    // Restauración suave: todo se desvanece junto y se destruye. Sin
    // `setDepth()` explícito, mismo criterio que el resto de los
    // efectos — ver el comentario correspondiente en SpotlightSweepEffect
    // (evita taparle el modal a una oferta del banquero que coincida).
    scene.time.delayedCall(3200, () => {
      scene.tweens.add({
        targets: container,
        alpha: 0,
        duration: 500,
        ease: 'Cubic.easeIn',
        onComplete: () => container.destroy()
      });
    });
  }

  /**
   * "...y sube parpadeando": la luz no vuelve de forma pareja, titila
   * como una vela inestable — una serie de saltos de alpha aleatorios y
   * breves, encadenados recursivamente, hasta asentarse en un nivel
   * ambiente tenue pero estable.
   */
  private flickerLight(scene: Phaser.Scene, darken: Phaser.GameObjects.Rectangle, stepsRemaining: number): void {
    const isLastStep = stepsRemaining <= 0;
    const targetAlpha = isLastStep ? 0.45 : 0.32 + Math.random() * 0.3;

    scene.tweens.add({
      targets: darken,
      alpha: targetAlpha,
      duration: isLastStep ? 260 : 70 + Math.random() * 110,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        if (!isLastStep) {
          this.flickerLight(scene, darken, stepsRemaining - 1);
        }
      }
    });
  }

  /** Aura mística: anillos concéntricos pulsantes + un halo de chispas orbitando la carta. */
  private spawnAura(scene: Phaser.Scene, container: Phaser.GameObjects.Container, x: number, y: number): void {
    const colors = [0x9b5de5, 0xf4c95d, 0x4cc9f0]; // violeta / dorado / celeste esotéricos

    colors.forEach((color, i) => {
      const ring = scene.add
        .circle(x, y, 115 + i * 16, color, 0)
        .setStrokeStyle(2.5, color, 0.7)
        .setBlendMode(Phaser.BlendModes.ADD);
      container.add(ring);

      scene.tweens.add({
        targets: ring,
        scale: { from: 0.85, to: 1.15 },
        alpha: { from: 0.75, to: 0.15 },
        duration: 1100 + i * 200,
        delay: i * 150,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    });

    // Núcleo suave sobre la carta.
    const core = scene.add.circle(x, y, 46, 0xffffff, 0.18).setBlendMode(Phaser.BlendModes.ADD);
    container.add(core);
    scene.tweens.add({
      targets: core,
      alpha: { from: 0.1, to: 0.28 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Halo de chispas orbitando alrededor de la carta.
    const sparkCount = 6;
    for (let i = 0; i < sparkCount; i++) {
      const orbitRadius = 68 + Math.random() * 14;
      const startAngle = (i / sparkCount) * Math.PI * 2;
      const spark = scene.add
        .circle(x + Math.cos(startAngle) * orbitRadius, y + Math.sin(startAngle) * orbitRadius, 3, colors[i % colors.length], 0.9)
        .setBlendMode(Phaser.BlendModes.ADD);
      container.add(spark);

      this.orbitSpark(scene, spark, x, y, orbitRadius, startAngle, i % 2 === 0);
    }
  }

  /**
   * Hace orbitar una chispa alrededor de `(cx, cy)` en pasos pequeños de
   * ángulo, encadenados con tweens sucesivos (Phaser no tweenea un
   * "ángulo orbital" nativamente, así que se recalcula la posición en
   * cada paso). Se corta sola cuando `spark` deja de estar activa —
   * ocurre cuando `container.destroy()` la destruye al final del efecto
   * — en vez de necesitar algún cleanup manual aparte.
   */
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
      duration: 90,
      ease: 'Linear',
      onComplete: () => {
        if (spark.active) {
          this.orbitSpark(scene, spark, cx, cy, radius, nextAngle, clockwise);
        }
      }
    });
  }
}