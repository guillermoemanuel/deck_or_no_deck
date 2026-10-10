import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect, getCelebrationTargetPosition } from './DeckCelebrationEffect';

// Paleta del mazo de ajedrez: blanco y negro dominan; el plateado solo
// aporta marcos y destellos (nunca un color "de tema" que compita).
const WHITE = 0xf4f4f4;
const BLACK = 0x121212;
const SILVER = 0xc9ccd1;

// Línea de tiempo (ms). Todo lo animado termina antes de FADE_START_MS,
// así el fundido y la destrucción final nunca cortan un tween a medias.
const IMPACT_AT_MS = 420;
const TARGET_PULSE_AT_MS = 900;
const FADE_START_MS = 2300;
const FADE_DURATION_MS = 450;
const DESTROY_AT_MS = FADE_START_MS + FADE_DURATION_MS + 80;

const SCATTER_CARD_COUNT = 20;
const TARGET_MINI_CARD_COUNT = 6;
const CARD_WIDTH = 34;
const CARD_HEIGHT = 48;

/** Acota `value` a [min, max] sin depender de Phaser.Math (más simple de testear). */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Estrategia del mazo Ajedrez (nivel final):
 * 1. Destello blanco, la escena se oscurece y aparece un tablero de ajedrez
 *    en perspectiva.
 * 2. Un golpe seco sacude la cámara y el tablero: en vez de piezas, saltan
 *    cartas blancas y negras que describen una parábola, caen al "suelo" de
 *    la pantalla, rebotan, giran y se desparraman — como cuando un puñetazo
 *    contra la mesa tira las piezas.
 * 3. Sobre la carta de mayor valor (25,000) estalla un pulso plateado y unas
 *    cartas pequeñas salen despedidas de ella.
 *
 * Todo se dibuja con Graphics (sin texturas ni fuentes), igual que el resto
 * de las estrategias, y respeta el contrato de DeckCelebrationEffect: crea
 * todos sus GameObjects dentro de un único container, no bloquea la escena
 * ni el input, no usa setDepth() y se autodestruye al terminar.
 */
export class ChessCardScatterEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, card: Card): void {
    const { width, height } = scene.cameras.main;
    const centerX = width / 2;
    const centerY = height / 2 + 30;
    const container = scene.add.container(0, 0);

    // Posición global de la carta objetivo de 25k
    const target = getCelebrationTargetPosition(scene, card);

    // Flash inicial blanco
    const flash = scene.add.rectangle(width / 2, height / 2, width, height, WHITE, 0.55);
    container.add(flash);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 200, ease: 'Cubic.easeOut' });

    // Oscurecimiento de la escena para que el tablero y las cartas resalten
    const darken = scene.add.rectangle(width / 2, height / 2, width, height, BLACK, 0).setAlpha(0);
    container.add(darken);
    scene.tweens.add({ targets: darken, alpha: 0.6, duration: 260, ease: 'Cubic.easeOut' });

    // --- El tablero, en perspectiva (aplastado en Y) ---
    const boardSize = Math.min(width, height) * 0.5;
    const boardScaleY = 0.55;
    const board = this.createBoard(scene, boardSize);
    board.setPosition(centerX, centerY).setAlpha(0);
    board.scaleX = 0.7;
    board.scaleY = 0.4;
    container.add(board);
    scene.tweens.add({
      targets: board,
      alpha: 1,
      scaleX: 1,
      scaleY: boardScaleY,
      duration: 260,
      ease: 'Back.easeOut'
    });

    // --- El golpe: sacude todo y dispara la lluvia de cartas ---
    scene.time.delayedCall(IMPACT_AT_MS, () => {
      this.playImpact(scene, container, board, centerX, centerY, boardSize, boardScaleY);

      const floorY = height - 60;
      for (let i = 0; i < SCATTER_CARD_COUNT; i++) {
        this.launchCardFromBoard(scene, container, {
          index: i,
          centerX,
          centerY,
          boardSize,
          boardScaleY,
          floorY,
          width,
          height
        });
      }
    });

    // --- Pulso y cartas pequeñas sobre la carta de mayor valor ---
    scene.time.delayedCall(TARGET_PULSE_AT_MS, () => {
      this.spawnTargetBurst(scene, container, target.x, target.y, width, height);
    });

    // Desvanecimiento y limpieza (todo lo animado ya terminó)
    scene.time.delayedCall(FADE_START_MS, () => {
      scene.tweens.add({ targets: container, alpha: 0, duration: FADE_DURATION_MS, ease: 'Cubic.easeIn' });
    });
    scene.time.delayedCall(DESTROY_AT_MS, () => container.destroy());
  }

  /** Tablero 8x8 de casillas blancas y negras con marco plateado, centrado en (0,0). */
  private createBoard(scene: Phaser.Scene, size: number): Phaser.GameObjects.Graphics {
    const g = scene.add.graphics();
    const cell = size / 8;
    const origin = -size / 2;

    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 8; col++) {
        g.fillStyle((row + col) % 2 === 0 ? WHITE : BLACK, 1);
        g.fillRect(origin + col * cell, origin + row * cell, cell, cell);
      }
    }
    g.lineStyle(5, SILVER, 1);
    g.strokeRect(origin, origin, size, size);
    return g;
  }

  /** Sacudida de cámara, salto/inclinación del tablero y onda de choque sobre la mesa. */
  private playImpact(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    board: Phaser.GameObjects.Graphics,
    centerX: number,
    centerY: number,
    boardSize: number,
    boardScaleY: number
  ): void {
    scene.cameras.main.shake(220, 0.014);

    // El tablero salta y se inclina un instante por el golpe, y vuelve a su lugar.
    const tilt = (Math.random() < 0.5 ? -1 : 1) * (2 + Math.random() * 2);
    scene.tweens.add({
      targets: board,
      y: centerY - 16,
      angle: tilt,
      scaleY: boardScaleY * 1.06,
      duration: 90,
      ease: 'Quad.easeOut',
      onComplete: () => {
        scene.tweens.add({
          targets: board,
          y: centerY,
          angle: 0,
          scaleY: boardScaleY,
          duration: 160,
          ease: 'Bounce.easeOut'
        });
      }
    });

    // Onda de choque elíptica (coherente con la perspectiva del tablero)
    const ring = scene.add.graphics();
    ring.lineStyle(4, WHITE, 0.9);
    ring.strokeEllipse(0, 0, boardSize * 0.6, boardSize * 0.6 * boardScaleY);
    ring.setPosition(centerX, centerY);
    ring.scaleX = 0.3;
    ring.scaleY = 0.3;
    container.add(ring);
    scene.tweens.add({
      targets: ring,
      scaleX: 1.9,
      scaleY: 1.9,
      alpha: 0,
      duration: 480,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });
  }

  /**
   * Una carta sale despedida desde una casilla al azar del tablero y recorre
   * cuatro fases encadenadas: subida (parábola), caída, rebote corto y
   * deslizamiento final. Las posiciones de aterrizaje y de apogeo se acotan a
   * la pantalla, así que ninguna carta se pierde fuera de la vista.
   */
  private launchCardFromBoard(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    params: {
      index: number;
      centerX: number;
      centerY: number;
      boardSize: number;
      boardScaleY: number;
      floorY: number;
      width: number;
      height: number;
    }
  ): void {
    const { index, centerX, centerY, boardSize, boardScaleY, floorY, width, height } = params;

    const startX = centerX + (Math.random() - 0.5) * boardSize * 0.85;
    const startY = centerY + (Math.random() - 0.5) * boardSize * boardScaleY * 0.85;
    const outward = startX < centerX ? -1 : 1;

    const drift = outward * (60 + Math.random() * 260) + (Math.random() - 0.5) * 80;
    const apexY = clamp(startY - (150 + Math.random() * 170), 30, height - 120);
    const landX = clamp(startX + drift, 40, width - 40);
    const landY = clamp(floorY + (Math.random() - 0.5) * 50, 40, height - 20);
    const spin = (Math.random() < 0.5 ? -1 : 1) * (240 + Math.random() * 420);
    const bounceHeight = 22 + Math.random() * 26;
    const slide = clamp((Math.random() - 0.5) * 120, -60, 60);
    const apexX = clamp(startX + drift * 0.45, 20, width - 20);
    const bounceX = clamp(landX + slide * 0.4, 20, width - 20);
    const settleX = clamp(landX + slide, 20, width - 20);

    const rise = 380 + Math.random() * 140;
    const fall = 420 + Math.random() * 140;
    const launchDelay = Math.random() * 140;

    const sprite = this.createCardGraphic(scene, index % 2 === 0, 1);
    sprite.setPosition(startX, startY).setAlpha(0);
    sprite.scaleX = 0.45;
    sprite.scaleY = 0.45;
    container.add(sprite);

    scene.time.delayedCall(launchDelay, () => {
      sprite.setAlpha(1);

      // 1. Subida con parábola hacia afuera
      scene.tweens.add({
        targets: sprite,
        x: apexX,
        y: apexY,
        scaleX: 1,
        scaleY: 1,
        angle: spin * 0.5,
        duration: rise,
        ease: 'Quad.easeOut',
        onComplete: () => {
          // 2. Caída hasta el "suelo"
          scene.tweens.add({
            targets: sprite,
            x: landX,
            y: landY,
            angle: spin,
            duration: fall,
            ease: 'Quad.easeIn',
            onComplete: () => {
              // 3. Rebote corto
              scene.tweens.add({
                targets: sprite,
                x: bounceX,
                y: landY - bounceHeight,
                angle: spin + (Math.random() - 0.5) * 50,
                duration: 170,
                ease: 'Quad.easeOut',
                onComplete: () => {
                  // 4. Segunda caída y deslizamiento hasta quedar quieta
                  scene.tweens.add({
                    targets: sprite,
                    x: settleX,
                    y: landY,
                    angle: spin + (Math.random() - 0.5) * 30,
                    duration: 190,
                    ease: 'Quad.easeIn'
                  });
                }
              });
            }
          });
        }
      });
    });
  }

  /** Pulso plateado sobre la carta de 25,000 y un puñado de cartas pequeñas despedidas de ella. */
  private spawnTargetBurst(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    tx: number,
    ty: number,
    width: number,
    height: number
  ): void {
    const pulse = scene.add
      .circle(tx, ty, 54, WHITE, 0.85)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.2);
    container.add(pulse);
    scene.tweens.add({
      targets: pulse,
      scale: 1.3,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => pulse.destroy()
    });

    const ring = scene.add.graphics();
    ring.lineStyle(2.5, SILVER, 0.95);
    ring.strokeCircle(0, 0, 60);
    ring.setPosition(tx, ty);
    ring.scaleX = 0.2;
    ring.scaleY = 0.2;
    container.add(ring);
    scene.tweens.add({
      targets: ring,
      scaleX: 1.2,
      scaleY: 1.2,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });

    for (let i = 0; i < TARGET_MINI_CARD_COUNT; i++) {
      const mini = this.createCardGraphic(scene, i % 2 === 0, 0.55);
      mini.setPosition(tx, ty);
      container.add(mini);

      const angle = (i / TARGET_MINI_CARD_COUNT) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 70 + Math.random() * 70;
      const endX = clamp(tx + Math.cos(angle) * dist, 20, width - 20);
      const peakY = clamp(ty + Math.sin(angle) * dist - 40, 20, height - 20);
      const endY = clamp(peakY + 60 + Math.random() * 40, 20, height - 20);
      const spin = (Math.random() - 0.5) * 540;

      scene.tweens.add({
        targets: mini,
        x: endX,
        y: peakY,
        angle: spin * 0.5,
        duration: 260,
        ease: 'Quad.easeOut',
        onComplete: () => {
          scene.tweens.add({
            targets: mini,
            y: endY,
            angle: spin,
            alpha: 0,
            duration: 380,
            ease: 'Quad.easeIn',
            onComplete: () => mini.destroy()
          });
        }
      });
    }
  }

  /**
   * Carta dibujada con Graphics (centrada en 0,0): fondo blanco con marco
   * negro o fondo negro con marco blanco, y un peón como emblema, en el tono
   * opuesto al del fondo para que se lea sobre cualquier fondo.
   */
  private createCardGraphic(scene: Phaser.Scene, white: boolean, scale: number): Phaser.GameObjects.Graphics {
    const fill = white ? WHITE : BLACK;
    const ink = white ? BLACK : WHITE;
    const g = scene.add.graphics();

    g.fillStyle(fill, 1);
    g.fillRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 5);
    g.lineStyle(2, ink, 1);
    g.strokeRoundedRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 5);

    // Peón: cabeza, cuerpo y base
    g.fillStyle(ink, 1);
    g.fillCircle(0, -9, 4.5);
    g.fillTriangle(-6, 8, 6, 8, 0, -4);
    g.fillRect(-8, 8, 16, 4);

    g.scaleX = scale;
    g.scaleY = scale;
    return g;
  }
}
