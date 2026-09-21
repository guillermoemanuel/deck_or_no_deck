import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect } from './DeckCelebrationEffect';

/**
 * Estrategia del mazo Glacier: la pantalla se congela de golpe (escarcha)
 * y se resquebraja desde el centro — una red de grietas que se expande
 * rápido, seguida de un estallido en fragmentos de hielo que salen
 * volando en todas direcciones, rotando y desvaneciéndose.
 *
 * Vive en su propio archivo (GRASP Polymorphism / Strategy) para que
 * pueda crecer o afinarse sin tocar GameScene.ts ni las estrategias de
 * otros mazos.
 */
export class GlacierShatterEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, _card: Card): void {
    const { width, height } = scene.cameras.main;
    const centerX = width / 2;
    const centerY = height / 2;
    const container = scene.add.container(0, 0);

    // Flash inicial, el instante del "impacto" que origina la grieta.
    const flash = scene.add.rectangle(centerX, centerY, width, height, 0xeaffff, 0.6);
    container.add(flash);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 220, ease: 'Cubic.easeOut' });

    // Escarcha: un tinte helado cubre la pantalla de golpe, como si se
    // congelara instantáneamente antes de resquebrajarse.
    const frost = scene.add.rectangle(centerX, centerY, width, height, 0xbdeeff, 0).setAlpha(0);
    container.add(frost);
    scene.tweens.add({ targets: frost, alpha: 0.28, duration: 180, ease: 'Cubic.easeOut' });

    // Red de grietas: líneas irregulares que irradian desde el centro
    // hacia los bordes, más un par de anillos quebrados — se "expande"
    // rápido escalando desde un tamaño chico.
    const cracks = this.drawCrackWeb(scene, centerX, centerY, width, height);
    container.add(cracks);
    cracks.setScale(0.15);
    scene.tweens.add({ targets: cracks, scale: 1, duration: 260, ease: 'Cubic.easeOut' });

    // Estallido: la pantalla se divide en una grilla de fragmentos de
    // hielo (4 triángulos irregulares por celda, como vidrio roto) que
    // salen volando desde el centro, rotando y desvaneciéndose.
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

    // Restauración: la escarcha y la grieta se desvanecen, devolviendo
    // la escena a su estado normal. Sin `setDepth()` explícito, mismo
    // criterio que el resto de los efectos — ver el comentario
    // correspondiente en SpotlightSweepEffect (evita taparle el modal a
    // una oferta del banquero que coincida).
    scene.time.delayedCall(1500, () => {
      scene.tweens.add({ targets: [frost, cracks], alpha: 0, duration: 400, ease: 'Cubic.easeIn' });
    });

    scene.time.delayedCall(2000, () => container.destroy());
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