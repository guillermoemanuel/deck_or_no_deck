import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect, getCelebrationTargetPosition } from './DeckCelebrationEffect';

/**
 * Estrategia del mazo WW2:
 * 1. Combate bélico en pantalla con ráfagas de balas trazadoras y bombardeos.
 * 2. El último disparo de proyectil pesado (artillería / obús) cruza la pantalla
 *    e impacta directa y contundentemente sobre la carta de mayor valor (25,000),
 *    desatando una explosión masiva con onda de choque, metralla, humo y fuerte sacudida de cámara.
 */
export class WW2CombatEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, card: Card): void {
    const { width, height } = scene.cameras.main;
    const container = scene.add.container(0, 0);

    // Posición global de la carta objetivo de 25k
    const target = getCelebrationTargetPosition(scene, card);

    // Flash inicial
    const flash = scene.add.rectangle(width / 2, height / 2, width, height, 0xfff0c8, 0.55);
    container.add(flash);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 260, ease: 'Cubic.easeOut' });

    // Humo y polvo de fondo
    const smokeTint = scene.add.rectangle(width / 2, height / 2, width, height, 0x2a2a28, 0).setAlpha(0);
    container.add(smokeTint);
    scene.tweens.add({ targets: smokeTint, alpha: 0.3, duration: 300, ease: 'Cubic.easeOut' });

    // --- Ráfagas de metralla ambiental ---
    const burstCount = 3;
    for (let burst = 0; burst < burstCount; burst++) {
      const y = height * (0.15 + Math.random() * 0.7);
      const fromLeft = Math.random() < 0.5;
      const tracersInBurst = 4 + Math.floor(Math.random() * 3);

      for (let t = 0; t < tracersInBurst; t++) {
        scene.time.delayedCall(burst * 350 + t * 45, () => {
          this.spawnTracer(scene, container, width, y + (Math.random() - 0.5) * 40, fromLeft);
        });
      }
    }

    // --- Bombas ambientales previas ---
    const explosionCount = 4;
    for (let i = 0; i < explosionCount; i++) {
      const x = width * (0.15 + Math.random() * 0.7);
      const y = height * (0.2 + Math.random() * 0.55);

      scene.time.delayedCall(200 + i * 320 + Math.random() * 120, () => {
        this.spawnExplosion(scene, container, x, y);
        scene.cameras.main.shake(220, 0.008);
      });
    }

    // --- Último disparo: proyectil pesado directo hacia la carta de 25,000 ---
    scene.time.delayedCall(1450, () => {
      this.spawnFinalArtilleryStrike(scene, container, width, target.x, target.y);
    });

    // Restauración y limpieza
    scene.time.delayedCall(3400, () => {
      scene.tweens.add({
        targets: container,
        alpha: 0,
        duration: 450,
        ease: 'Cubic.easeIn',
        onComplete: () => container.destroy()
      });
    });
  }

  /** Proyectil de artillería pesada que viaja e impacta directamente sobre la carta */
  private spawnFinalArtilleryStrike(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    width: number,
    tx: number,
    ty: number
  ): void {
    const fromLeft = tx > width / 2;
    const startX = fromLeft ? -60 : width + 60;
    const startY = Math.max(30, ty - 220);

    const projectile = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    // Núcleo incandescente del obús
    projectile.fillStyle(0xfff5cc, 1);
    projectile.fillCircle(0, 0, 7);
    projectile.fillStyle(0xff6600, 0.85);
    projectile.fillCircle(fromLeft ? -5 : 5, 0, 11);
    projectile.setPosition(startX, startY);
    container.add(projectile);

    // Ángulo hacia el objetivo
    const angle = Phaser.Math.Angle.Between(startX, startY, tx, ty);
    projectile.setRotation(angle);

    scene.tweens.add({
      targets: projectile,
      x: tx,
      y: ty,
      duration: 340,
      ease: 'Quad.easeIn',
      onComplete: () => {
        projectile.destroy();
        this.spawnHeavyTargetedExplosion(scene, container, tx, ty);
      }
    });
  }

  /** Gran explosión concentrada y claramente notoria sobre la carta */
  private spawnHeavyTargetedExplosion(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    x: number,
    y: number
  ): void {
    // 1. Doble destello de fuego
    const coreFlash = scene.add.circle(x, y, 70, 0xffffff, 1).setBlendMode(Phaser.BlendModes.ADD).setScale(0.1);
    const fireFlash = scene.add.circle(x, y, 90, 0xff6b1a, 0.85).setScale(0.1);
    container.add([fireFlash, coreFlash]);

    scene.tweens.add({
      targets: [coreFlash, fireFlash],
      scale: 1.3,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        coreFlash.destroy();
        fireFlash.destroy();
      }
    });

    // 2. Onda expansiva contundente sobre la carta
    const shockwave = scene.add
      .circle(x, y, 85, 0x000000, 0)
      .setStrokeStyle(4, 0xffd54f, 0.95)
      .setScale(0.1);
    container.add(shockwave);

    scene.tweens.add({
      targets: shockwave,
      scale: 1.15,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => shockwave.destroy()
    });

    // 3. Metralla radial abundante
    for (let i = 0; i < 16; i++) {
      const shrapnelAngle = (i / 16) * Math.PI * 2 + Math.random() * 0.3;
      const travel = 50 + Math.random() * 65;
      const shard = scene.add.rectangle(x, y, 8, 3, 0xffb74d, 0.95);
      shard.setAngle(Phaser.Math.RadToDeg(shrapnelAngle));
      container.add(shard);

      scene.tweens.add({
        targets: shard,
        x: x + Math.cos(shrapnelAngle) * travel,
        y: y + Math.sin(shrapnelAngle) * travel,
        alpha: 0,
        scale: 0.3,
        duration: 380 + Math.random() * 220,
        ease: 'Cubic.easeOut',
        onComplete: () => shard.destroy()
      });
    }

    // 4. Bocanadas de humo negro/gris
    for (let i = 0; i < 5; i++) {
      const puff = scene.add.circle(x + (Math.random() - 0.5) * 30, y, 14 + Math.random() * 10, 0x3e3e3e, 0.65);
      container.add(puff);

      scene.tweens.add({
        targets: puff,
        y: y - 55 - Math.random() * 40,
        scale: 2.2,
        alpha: 0,
        duration: 950 + Math.random() * 400,
        delay: i * 70,
        ease: 'Sine.easeOut',
        onComplete: () => puff.destroy()
      });
    }

    // Sacudida de cámara reforzada para el impacto final
    scene.cameras.main.shake(320, 0.016);
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