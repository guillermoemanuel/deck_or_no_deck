import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect, getCelebrationTargetPosition } from './DeckCelebrationEffect';

/**
 * Estrategia del mazo Glacier:
 * 1. Congelación súbita de pantalla y red de grietas general con fragmentos de hielo dispersos.
 * 2. Un segundo efecto localizado de hielo roto/grieta sobre la carta de mayor valor (25,000)
 *    con una fractura cristalina concéntrica y fragmentos gélidos desprendiéndose de ella.
 */
export class GlacierShatterEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, card: Card): void {
    const { width, height } = scene.cameras.main;
    const centerX = width / 2;
    const centerY = height / 2;
    const container = scene.add.container(0, 0);

    // Posición global de la carta objetivo de 25k
    const target = getCelebrationTargetPosition(scene, card);

    // Flash inicial general
    const flash = scene.add.rectangle(centerX, centerY, width, height, 0xeaffff, 0.6);
    container.add(flash);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 220, ease: 'Cubic.easeOut' });

    // Escarcha general
    const frost = scene.add.rectangle(centerX, centerY, width, height, 0xbdeeff, 0).setAlpha(0);
    container.add(frost);
    scene.tweens.add({ targets: frost, alpha: 0.28, duration: 180, ease: 'Cubic.easeOut' });

    // Red de grietas principal en pantalla
    const cracks = this.drawCrackWeb(scene, centerX, centerY, width, height);
    container.add(cracks);
    cracks.setScale(0.15);
    scene.tweens.add({ targets: cracks, scale: 1, duration: 260, ease: 'Cubic.easeOut' });

    // Estallido principal de fragmentos de hielo
    const shards = this.createIceShards(scene, width, height);
    shards.forEach(shard => container.add(shard));

    scene.time.delayedCall(300, () => {
      shards.forEach(shard => {
        const dx = shard.x - centerX;
        const dy = shard.y - centerY;
        const distance = Math.max(1, Math.hypot(dx, dy));
        const travel = 70 + Math.random() * 90;

        scene.tweens.add({
          targets: shard,
          x: shard.x + (dx / distance) * travel,
          y: shard.y + (dy / distance) * travel,
          angle: shard.angle + (Math.random() - 0.5) * 140,
          alpha: 0,
          duration: 650 + Math.random() * 350,
          delay: (distance / Math.max(width, height)) * 200 + Math.random() * 120,
          ease: 'Cubic.easeIn'
        });
      });
    });

    // --- Segundo efecto: grieta y estallido localizado sobre la carta de 25,000 ---
    scene.time.delayedCall(550, () => {
      this.spawnLocalizedIceShatter(scene, container, target.x, target.y);
    });

    // Restauración y limpieza
    scene.time.delayedCall(1900, () => {
      scene.tweens.add({ targets: [frost, cracks], alpha: 0, duration: 400, ease: 'Cubic.easeIn' });
    });

    scene.time.delayedCall(2500, () => container.destroy());
  }

  /** Genera la segunda grieta y fragmentación localizada sobre la carta objetivo */
  private spawnLocalizedIceShatter(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    tx: number,
    ty: number
  ): void {
    // Destello de escarcha concentrado
    const pinFlash = scene.add
      .circle(tx, ty, 50, 0xffffff, 0.9)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.2);
    container.add(pinFlash);

    scene.tweens.add({
      targets: pinFlash,
      scale: 1.2,
      alpha: 0,
      duration: 250,
      ease: 'Cubic.easeOut',
      onComplete: () => pinFlash.destroy()
    });

    // Grieta localizada a la escala de la carta
    const localCrack = scene.add.graphics();
    localCrack.lineStyle(2.5, 0xffffff, 0.95);
    const rayCount = 8;
    const crackRadius = 65;

    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
      localCrack.beginPath();
      localCrack.moveTo(0, 0);
      const midDist = crackRadius * 0.55;
      const midX = Math.cos(angle + (Math.random() - 0.5) * 0.3) * midDist;
      const midY = Math.sin(angle + (Math.random() - 0.5) * 0.3) * midDist;
      localCrack.lineTo(midX, midY);
      const endX = Math.cos(angle) * crackRadius;
      const endY = Math.sin(angle) * crackRadius;
      localCrack.lineTo(endX, endY);
      localCrack.strokePath();
    }

    // Anillo de hielo fracturado alrededor de la carta
    localCrack.lineStyle(1.5, 0xd0f4ff, 0.8);
    localCrack.strokeCircle(0, 0, crackRadius * 0.65);
    localCrack.setPosition(tx, ty);
    localCrack.setScale(0.1);
    container.add(localCrack);

    scene.tweens.add({
      targets: localCrack,
      scale: 1,
      duration: 180,
      ease: 'Back.easeOut'
    });

    // Microfragmentos de hielo desprendiéndose de la carta
    const shardCount = 8;
    for (let i = 0; i < shardCount; i++) {
      const angle = (i / shardCount) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 35 + Math.random() * 45;
      const shard = scene.add.graphics();
      shard.fillStyle(0xd5f6ff, 0.85);
      shard.lineStyle(1, 0xffffff, 0.9);
      shard.fillTriangle(-4, -6, 5, -2, 0, 7);
      shard.strokeTriangle(-4, -6, 5, -2, 0, 7);
      shard.setPosition(tx, ty);
      container.add(shard);

      scene.tweens.add({
        targets: shard,
        x: tx + Math.cos(angle) * dist,
        y: ty + Math.sin(angle) * dist,
        angle: (Math.random() - 0.5) * 180,
        alpha: 0,
        scale: 0.3,
        duration: 400 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => shard.destroy()
      });
    }

    // Desvanecimiento de la grieta localizada
    scene.time.delayedCall(1200, () => {
      scene.tweens.add({
        targets: localCrack,
        alpha: 0,
        duration: 350,
        ease: 'Cubic.easeIn',
        onComplete: () => localCrack.destroy()
      });
    });

    scene.cameras.main.shake(140, 0.006);
  }

  /** Dibuja la red de grietas irradiando desde el punto de impacto (el centro). */
  private drawCrackWeb(scene: Phaser.Scene, cx: number, cy: number, width: number, height: number): Phaser.GameObjects.Graphics {
    const graphics = scene.add.graphics();
    graphics.lineStyle(3, 0xffffff, 0.85);

    const maxRadius = Math.hypot(width, height) / 2;
    const rayCount = 10;

    for (let i = 0; i < rayCount; i++) {
      const angle = (i / rayCount) * Math.PI * 2 + Math.random() * 0.3;
      let x = cx;
      let y = cy;
      graphics.beginPath();
      graphics.moveTo(x, y);

      // Cada grieta avanza en segmentos con quiebres aleatorios, para que
      // no se vea una línea recta sino una fractura real.
      const segments = 4 + Math.floor(Math.random() * 3);
      for (let s = 1; s <= segments; s++) {
        const radius = (maxRadius * s) / segments;
        const jitterAngle = angle + (Math.random() - 0.5) * 0.35;
        x = cx + Math.cos(jitterAngle) * radius;
        y = cy + Math.sin(jitterAngle) * radius;
        graphics.lineTo(x, y);
      }
      graphics.strokePath();
    }

    // Un par de anillos quebrados, para reforzar la sensación de vidrio/hielo.
    graphics.lineStyle(2, 0xffffff, 0.5);
    [0.3, 0.55].forEach(ratio => {
      const points = 14;
      graphics.beginPath();
      for (let p = 0; p <= points; p++) {
        const a = (p / points) * Math.PI * 2;
        const r = maxRadius * ratio * (0.9 + Math.random() * 0.2);
        const px = cx + Math.cos(a) * r;
        const py = cy + Math.sin(a) * r;
        if (p === 0) {
          graphics.moveTo(px, py);
        } else {
          graphics.lineTo(px, py);
        }
      }
      graphics.strokePath();
    });

    return graphics;
  }

  /**
   * Divide la pantalla en una grilla y, dentro de cada celda, dibuja 4
   * triángulos irregulares (fanning desde un punto interno con jitter)
   * — el patrón clásico de un vidrio/hielo roto.
   */
  private createIceShards(scene: Phaser.Scene, width: number, height: number): Phaser.GameObjects.Graphics[] {
    const cols = 6;
    const rows = 4;
    const cellWidth = width / cols;
    const cellHeight = height / rows;
    const shards: Phaser.GameObjects.Graphics[] = [];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const x0 = col * cellWidth;
        const y0 = row * cellHeight;
        const x1 = x0 + cellWidth;
        const y1 = y0 + cellHeight;
        // Punto interno con jitter: el corte de cada celda no queda
        // perfecto/prolijo, se ve más como una fractura real.
        const midX = (x0 + x1) / 2 + (Math.random() - 0.5) * cellWidth * 0.3;
        const midY = (y0 + y1) / 2 + (Math.random() - 0.5) * cellHeight * 0.3;

        shards.push(
          this.createShard(scene, [
            [x0, y0],
            [x1, y0],
            [midX, midY]
          ]),
          this.createShard(scene, [
            [x1, y0],
            [x1, y1],
            [midX, midY]
          ]),
          this.createShard(scene, [
            [x1, y1],
            [x0, y1],
            [midX, midY]
          ]),
          this.createShard(scene, [
            [x0, y1],
            [x0, y0],
            [midX, midY]
          ])
        );
      }
    }

    return shards;
  }

  /**
   * Dibuja un triángulo en coordenadas LOCALES relativas a su propio
   * centroide, y posiciona el Graphics ahí — así rotar (`angle`) gira
   * el fragmento alrededor de su propio centro (no del origen de la
   * pantalla), y `.x`/`.y` reflejan su posición real en el mundo, lista
   * para animar el "vuelo" hacia afuera.
   */
  private createShard(scene: Phaser.Scene, points: [number, number][]): Phaser.GameObjects.Graphics {
    const centroidX = (points[0][0] + points[1][0] + points[2][0]) / 3;
    const centroidY = (points[0][1] + points[1][1] + points[2][1]) / 3;

    const shard = scene.add.graphics();
    shard.fillStyle(0xcdf3ff, 0.22);
    shard.lineStyle(1.5, 0xffffff, 0.6);
    shard.beginPath();
    shard.moveTo(points[0][0] - centroidX, points[0][1] - centroidY);
    shard.lineTo(points[1][0] - centroidX, points[1][1] - centroidY);
    shard.lineTo(points[2][0] - centroidX, points[2][1] - centroidY);
    shard.closePath();
    shard.fillPath();
    shard.strokePath();

    shard.setPosition(centroidX, centroidY);
    return shard;
  }
}