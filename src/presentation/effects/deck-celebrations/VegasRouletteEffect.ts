import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect } from './DeckCelebrationEffect';

type SuitType = 'heart' | 'spade' | 'club' | 'diamond';

/**
 * Estrategia del mazo Vegas: una ruleta de casino gira y frena hasta
 * detenerse en una pinta (corazón, pica, trébol o diamante), mientras
 * más pintas van apareciendo al azar por la pantalla — pop-in con rebote
 * y desvanecimiento, como confeti de cartas.
 *
 * Las 4 pintas se dibujan a mano con Graphics (círculos + triángulos),
 * sin depender de ningún asset — mismo criterio que el resto de los
 * efectos de esta carpeta.
 *
 * Vive en su propio archivo (GRASP Polymorphism / Strategy) para que
 * pueda crecer o afinarse sin tocar GameScene.ts ni las estrategias de
 * otros mazos.
 */
export class VegasRouletteEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, _card: Card): void {
    const { width, height } = scene.cameras.main;
    const centerX = width / 2;
    const centerY = height / 2 - 20;
    const container = scene.add.container(0, 0);

    // Flash inicial dorado, como las luces de un casino encendiéndose.
    const flash = scene.add.rectangle(width / 2, height / 2, width, height, 0xfff3c4, 0.5);
    container.add(flash);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 280, ease: 'Cubic.easeOut' });

    // Oscurecimiento leve, para que la ruleta y las pintas resalten.
    const darken = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0).setAlpha(0);
    container.add(darken);
    scene.tweens.add({ targets: darken, alpha: 0.5, duration: 250, ease: 'Cubic.easeOut' });

    // --- La ruleta ---
    const suits: SuitType[] = ['heart', 'spade', 'club', 'diamond'];
    const segmentCount = 8;
    const segmentAngleDeg = 360 / segmentCount;
    const segmentSuits: SuitType[] = Array.from({ length: segmentCount }, (_, i) => suits[i % suits.length]);

    // Se elige la pinta ganadora ANTES de girar, y se calcula el ángulo
    // final necesario para que ese segmento termine exactamente bajo el
    // puntero fijo (arriba) — así el resultado visual de la ruleta y el
    // festejo final siempre coinciden.
    const winningIndex = Math.floor(Math.random() * segmentCount);
    const winningSuit = segmentSuits[winningIndex];
    const winningSegmentCenterAngle = winningIndex * segmentAngleDeg + segmentAngleDeg / 2;
    const restAngle = ((-winningSegmentCenterAngle % 360) + 360) % 360;
    const totalSpins = 4 + Math.floor(Math.random() * 2);
    const finalAngle = totalSpins * 360 + restAngle;

    const wheelRadius = Math.min(width, height) * 0.16;
    const wheelPivot = scene.add.container(centerX, centerY);
    const wheel = this.createWheel(scene, wheelRadius, segmentSuits);
    wheelPivot.add(wheel);
    container.add(wheelPivot);

    // Puntero fijo — NO rota junto con la ruleta, marca el resultado.
    const pointer = scene.add.graphics();
    pointer.fillStyle(0xffd76a, 1);
    pointer.fillTriangle(-10, -wheelRadius - 26, 10, -wheelRadius - 26, 0, -wheelRadius - 6);
    pointer.setPosition(centerX, centerY);
    container.add(pointer);

    wheelPivot.setScale(0.4).setAlpha(0);
    scene.tweens.add({ targets: wheelPivot, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });

    scene.tweens.add({
      targets: wheel,
      angle: finalAngle,
      duration: 2000,
      delay: 200,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        // Estalla la pinta ganadora en el centro, como resultado final.
        this.spawnSuitBurst(scene, container, centerX, centerY, winningSuit, true);
      }
    });

    // --- Pintas apareciendo al azar por la pantalla, mientras gira ---
    const randomBurstCount = 10;
    for (let i = 0; i < randomBurstCount; i++) {
      const x = 60 + Math.random() * (width - 120);
      const y = 60 + Math.random() * (height - 120);
      const suit = suits[Math.floor(Math.random() * suits.length)];

      scene.time.delayedCall(300 + Math.random() * 1800, () => {
        this.spawnSuitBurst(scene, container, x, y, suit, false);
      });
    }

    // Restauración suave: todo se desvanece junto y se destruye. Sin
    // `setDepth()` explícito, mismo criterio que el resto de los
    // efectos — ver el comentario correspondiente en SpotlightSweepEffect
    // (evita taparle el modal a una oferta del banquero que coincida).
    scene.time.delayedCall(3500, () => {
      scene.tweens.add({
        targets: container,
        alpha: 0,
        duration: 450,
        ease: 'Cubic.easeIn',
        onComplete: () => container.destroy()
      });
    });
  }

  /** Arma la ruleta: gajos alternados + pinta al medio de cada uno + aro y centro dorados. */
  private createWheel(scene: Phaser.Scene, radius: number, segmentSuits: SuitType[]): Phaser.GameObjects.Container {
    const wheelContainer = scene.add.container(0, 0);
    const segmentAngleDeg = 360 / segmentSuits.length;
    const segmentColors = [0x121218, 0x7a1f1f]; // negro / rojo vegas, alternando

    segmentSuits.forEach((suit, i) => {
      const startDeg = -90 + i * segmentAngleDeg;
      const endDeg = -90 + (i + 1) * segmentAngleDeg;

      const wedge = scene.add.graphics();
      wedge.fillStyle(segmentColors[i % 2], 1);
      wedge.lineStyle(2, 0xffd76a, 0.8);
      wedge.slice(0, 0, radius, Phaser.Math.DegToRad(startDeg), Phaser.Math.DegToRad(endDeg), false);
      wedge.fillPath();
      wedge.strokePath();
      wheelContainer.add(wedge);

      const midRad = Phaser.Math.DegToRad(startDeg + segmentAngleDeg / 2);
      const iconX = Math.cos(midRad) * radius * 0.65;
      const iconY = Math.sin(midRad) * radius * 0.65;

      const icon = scene.add.graphics();
      const suitColor = suit === 'heart' || suit === 'diamond' ? 0xff5c7a : 0xffffff;
      this.drawSuit(icon, suit, 16, suitColor);
      icon.setPosition(iconX, iconY);
      wheelContainer.add(icon);
    });

    const rim = scene.add.graphics();
    rim.lineStyle(4, 0xffd76a, 0.9);
    rim.strokeCircle(0, 0, radius);
    wheelContainer.add(rim);

    const hub = scene.add.graphics();
    hub.fillStyle(0x121218, 1);
    hub.fillCircle(0, 0, radius * 0.12);
    hub.lineStyle(2, 0xffd76a, 0.9);
    hub.strokeCircle(0, 0, radius * 0.12);
    wheelContainer.add(hub);

    return wheelContainer;
  }

  /** Hace "estallar" una pinta en (x, y): pop-in con rebote y desvanecimiento. */
  private spawnSuitBurst(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    x: number,
    y: number,
    suit: SuitType,
    isWinner: boolean
  ): void {
    const icon = scene.add.graphics();
    const color = suit === 'heart' || suit === 'diamond' ? 0xff5c7a : 0xffffff;
    const size = isWinner ? 42 : 20 + Math.random() * 10;
    this.drawSuit(icon, suit, size, color);
    icon.setPosition(x, y);
    icon.setScale(0);
    icon.setAlpha(0);
    container.add(icon);

    scene.tweens.add({ targets: icon, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });

    scene.tweens.add({
      targets: icon,
      alpha: 0,
      scale: isWinner ? 1.3 : 0.7,
      duration: isWinner ? 500 : 350,
      delay: isWinner ? 500 : 300,
      ease: 'Cubic.easeIn'
    });
  }

  /** Dibuja la pinta pedida, centrada en el (0,0) local del Graphics recibido. */
  private drawSuit(g: Phaser.GameObjects.Graphics, suit: SuitType, size: number, color: number): void {
    switch (suit) {
      case 'heart':
        this.drawHeart(g, size, color);
        break;
      case 'spade':
        this.drawSpade(g, size, color);
        break;
      case 'club':
        this.drawClub(g, size, color);
        break;
      case 'diamond':
        this.drawDiamond(g, size, color);
        break;
    }
  }

  private drawDiamond(g: Phaser.GameObjects.Graphics, size: number, color: number): void {
    g.fillStyle(color, 1);
    g.beginPath();
    g.moveTo(0, -size);
    g.lineTo(size * 0.7, 0);
    g.lineTo(0, size);
    g.lineTo(-size * 0.7, 0);
    g.closePath();
    g.fillPath();
  }

  private drawHeart(g: Phaser.GameObjects.Graphics, size: number, color: number): void {
    g.fillStyle(color, 1);
    const lobeRadius = size * 0.42;
    g.fillCircle(-lobeRadius * 0.85, -lobeRadius * 0.35, lobeRadius);
    g.fillCircle(lobeRadius * 0.85, -lobeRadius * 0.35, lobeRadius);
    g.beginPath();
    g.moveTo(-size * 0.95, -lobeRadius * 0.15);
    g.lineTo(size * 0.95, -lobeRadius * 0.15);
    g.lineTo(0, size);
    g.closePath();
    g.fillPath();
  }

  private drawSpade(g: Phaser.GameObjects.Graphics, size: number, color: number): void {
    g.fillStyle(color, 1);
    const lobeRadius = size * 0.42;
    // Cuerpo: un corazón invertido (la punta apunta hacia arriba).
    g.fillCircle(-lobeRadius * 0.85, size * 0.35, lobeRadius);
    g.fillCircle(lobeRadius * 0.85, size * 0.35, lobeRadius);
    g.beginPath();
    g.moveTo(-size * 0.95, size * 0.15);
    g.lineTo(size * 0.95, size * 0.15);
    g.lineTo(0, -size);
    g.closePath();
    g.fillPath();
    // Tallo, como el de una pica real.
    g.fillTriangle(-size * 0.18, size * 0.55, size * 0.18, size * 0.55, 0, size * 0.95);
  }

  private drawClub(g: Phaser.GameObjects.Graphics, size: number, color: number): void {
    g.fillStyle(color, 1);
    const lobeRadius = size * 0.4;
    g.fillCircle(0, -lobeRadius * 0.9, lobeRadius);
    g.fillCircle(-lobeRadius * 0.85, lobeRadius * 0.5, lobeRadius);
    g.fillCircle(lobeRadius * 0.85, lobeRadius * 0.5, lobeRadius);
    // Tallo.
    g.fillTriangle(-size * 0.18, size * 0.35, size * 0.18, size * 0.35, 0, size);
  }
}