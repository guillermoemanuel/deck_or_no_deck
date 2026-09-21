import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect } from './DeckCelebrationEffect';

/**
 * Estrategia del mazo WW2: un combate estalla en pantalla — ráfagas de
 * metralla cruzando de lado a lado, bombas explotando en puntos
 * aleatorios (flash + onda expansiva + metralla radial + humo), y un
 * temblor de cámara tipo terremoto que se reactiva con cada impacto.
 *
 * Vive en su propio archivo (GRASP Polymorphism / Strategy) para que
 * pueda crecer o afinarse sin tocar GameScene.ts ni las estrategias de
 * otros mazos.
 */
export class WW2CombatEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, _card: Card): void {
    const { width, height } = scene.cameras.main;
    const container = scene.add.container(0, 0);

    // Flash inicial, como el primer disparo/explosión del combate.
    const flash = scene.add.rectangle(width / 2, height / 2, width, height, 0xfff0c8, 0.55);
    container.add(flash);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 260, ease: 'Cubic.easeOut' });

    // Humo de fondo: un tinte grisáceo cubre la pantalla, como polvo y
    // humo de combate en el aire.
    const smokeTint = scene.add.rectangle(width / 2, height / 2, width, height, 0x2a2a28, 0).setAlpha(0);
    container.add(smokeTint);
    scene.tweens.add({ targets: smokeTint, alpha: 0.3, duration: 300, ease: 'Cubic.easeOut' });

    // --- Ráfagas de metralla: líneas rápidas cruzando la pantalla ---
    const burstCount = 4;
    for (let burst = 0; burst < burstCount; burst++) {
      const y = height * (0.15 + Math.random() * 0.7);
      const fromLeft = Math.random() < 0.5;
      const tracersInBurst = 5 + Math.floor(Math.random() * 3);

      for (let t = 0; t < tracersInBurst; t++) {
        scene.time.delayedCall(burst * 350 + t * 45, () => {
          this.spawnTracer(scene, container, width, y + (Math.random() - 0.5) * 40, fromLeft);
        });
      }
    }

    // --- Bombas: explosiones en puntos aleatorios, con temblor cada vez ---
    const explosionCount = 5;
    for (let i = 0; i < explosionCount; i++) {
      const x = width * (0.15 + Math.random() * 0.7);
      const y = height * (0.2 + Math.random() * 0.55);

      scene.time.delayedCall(200 + i * 380 + Math.random() * 150, () => {
        this.spawnExplosion(scene, container, x, y);
        // Temblor de cámara: se relanza con cada bomba, así el "terremoto"
        // se siente continuo mientras el combate dura, en vez de un único
        // sacudón al principio.
        scene.cameras.main.shake(280, 0.012);
      });
    }

    // Restauración suave: todo se desvanece junto y se destruye. Sin
    // `setDepth()` explícito, mismo criterio que el resto de los
    // efectos — ver el comentario correspondiente en SpotlightSweepEffect
    // (evita taparle el modal a una oferta del banquero que coincida).
    scene.time.delayedCall(3000, () => {
      scene.tweens.add({
        targets: container,
        alpha: 0,
        duration: 450,
        ease: 'Cubic.easeIn',
        onComplete: () => container.destroy()
      });
    });
  }

  /** Dispara una traza de metralla cruzando horizontalmente la pantalla. */
  private spawnTracer(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    width: number,
    y: number,
    fromLeft: boolean
  ): void {
    const length = 70 + Math.random() * 50;
    const tracer = scene.add
      .rectangle(fromLeft ? -length : width + length, y, length, 3, 0xffdd66, 0.95)
      .setBlendMode(Phaser.BlendModes.ADD);
    container.add(tracer);

    scene.tweens.add({
      targets: tracer,
      x: fromLeft ? width + length : -length,
      duration: 180 + Math.random() * 80,
      ease: 'Linear',
      onComplete: () => tracer.destroy()
    });
  }

  /**
   * Explosión de bomba: flash + onda expansiva + metralla radial + humo.
   * El flash y la onda se dibujan ya a su tamaño FINAL con `scale`
   * chico, y se revelan animando `scale` hasta 1 — mismo criterio que el
   * resto de los "glow"/pulsos de esta carpeta, más robusto que animar
   * `radius` directamente en un Arc.
   */
  private spawnExplosion(scene: Phaser.Scene, container: Phaser.GameObjects.Container, x: number, y: number): void {
    // Flash del impacto.
    const flash = scene.add.circle(x, y, 46, 0xfff2c0, 1).setBlendMode(Phaser.BlendModes.ADD).setScale(0.1);
    container.add(flash);
    scene.tweens.add({
      targets: flash,
      scale: 1,
      alpha: 0,
      duration: 220,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy()
    });

    // Onda expansiva (solo contorno).
    const shockwave = scene.add.circle(x, y, 60, 0x000000, 0).setStrokeStyle(3, 0xffcf8a, 0.8).setScale(0.05);
    container.add(shockwave);
    scene.tweens.add({
      targets: shockwave,
      scale: 1,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => shockwave.destroy()
    });

    // Metralla radial: fragmentos disparados en todas direcciones.
    const shrapnelCount = 10;
    for (let i = 0; i < shrapnelCount; i++) {
      const angle = (i / shrapnelCount) * Math.PI * 2 + Math.random() * 0.4;
      const travel = 40 + Math.random() * 50;
      const shard = scene.add.rectangle(x, y, 6 + Math.random() * 4, 2, 0xffb347, 0.9);
      shard.setAngle(Phaser.Math.RadToDeg(angle));
      container.add(shard);

      scene.tweens.add({
        targets: shard,
        x: x + Math.cos(angle) * travel,
        y: y + Math.sin(angle) * travel,
        alpha: 0,
        duration: 300 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => shard.destroy()
      });
    }

    // Humo: un par de bocanadas grises que suben y se disipan despacio.
    for (let i = 0; i < 3; i++) {
      const puff = scene.add.circle(x + (Math.random() - 0.5) * 20, y, 10 + Math.random() * 8, 0x555550, 0.4);
      container.add(puff);

      scene.tweens.add({
        targets: puff,
        y: y - 40 - Math.random() * 30,
        scale: 2,
        alpha: 0,
        duration: 900 + Math.random() * 400,
        delay: i * 80,
        ease: 'Sine.easeOut',
        onComplete: () => puff.destroy()
      });
    }
  }
}