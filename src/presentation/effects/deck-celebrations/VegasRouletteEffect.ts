
import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect, getCelebrationTargetPosition } from './DeckCelebrationEffect';

type SuitType = 'heart' | 'spade' | 'club' | 'diamond';

/**
 * Estrategia del mazo Vegas:
 * 1. Flash y ruleta de casino girando a alta velocidad con gajos y pintas.
 * 2. Al detenerse el giro, una ficha dorada de casino de alta denominación ($25,000)
 *    sale proyectada y se posiciona directamente sobre la carta de mayor valor (25,000),
 *    impactando con un estallido de confeti de pintas y destellos dorados.
 */
export class VegasRouletteEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, card: Card): void {
    const { width, height } = scene.cameras.main;
    const centerX = width / 2;
    const centerY = height / 2 - 30;
    const container = scene.add.container(0, 0);

    // Posición global de la carta objetivo de 25k
    const target = getCelebrationTargetPosition(scene, card);

    // Flash inicial dorado
    const flash = scene.add.rectangle(width / 2, height / 2, width, height, 0xfff3c4, 0.5);
    container.add(flash);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 280, ease: 'Cubic.easeOut' });

    // Oscurecimiento de la escena
    const darken = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0).setAlpha(0);
    container.add(darken);
    scene.tweens.add({ targets: darken, alpha: 0.55, duration: 250, ease: 'Cubic.easeOut' });

    // --- La ruleta ---
    const suits: SuitType[] = ['heart', 'spade', 'club', 'diamond'];
    const segmentCount = 8;
    const segmentAngleDeg = 360 / segmentCount;
    const segmentSuits: SuitType[] = Array.from({ length: segmentCount }, (_, i) => suits[i % suits.length]);

    const winningIndex = Math.floor(Math.random() * segmentCount);
    const winningSuit = segmentSuits[winningIndex];
    const winningSegmentCenterAngle = winningIndex * segmentAngleDeg + segmentAngleDeg / 2;
    const restAngle = ((-winningSegmentCenterAngle % 360) + 360) % 360;
    const totalSpins = 4;
    const finalAngle = totalSpins * 360 + restAngle;

    const wheelRadius = Math.min(width, height) * 0.16;
    const wheelPivot = scene.add.container(centerX, centerY);
    const wheel = this.createWheel(scene, wheelRadius, segmentSuits);
    wheelPivot.add(wheel);
    container.add(wheelPivot);

    // Puntero fijo superior
    const pointer = scene.add.graphics();
    pointer.fillStyle(0xffd76a, 1);
    pointer.fillTriangle(-10, -wheelRadius - 26, 10, -wheelRadius - 26, 0, -wheelRadius - 6);
    pointer.setPosition(centerX, centerY);
    container.add(pointer);

    wheelPivot.setScale(0.4).setAlpha(0);
    scene.tweens.add({ targets: wheelPivot, scale: 1, alpha: 1, duration: 300, ease: 'Back.easeOut' });

    // Giro acelerado y frenado de la ruleta
    scene.tweens.add({
      targets: wheel,
      angle: finalAngle,
      duration: 1700,
      delay: 200,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        // Estallido de la pinta ganadora en el centro de la ruleta
        this.spawnSuitBurst(scene, container, centerX, centerY, winningSuit, true);

        // --- Ficha final de casino proyectándose y posicionándose sobre la carta de 25k ---
        scene.time.delayedCall(250, () => {
          this.launchFinalChipToCard(scene, container, centerX, centerY, target.x, target.y);
        });
      }
    });

    // Pintas ambientales apareciendo como confeti de cartas mientras gira la ruleta
    const randomBurstCount = 8;
    for (let i = 0; i < randomBurstCount; i++) {
      const x = 60 + Math.random() * (width - 120);
      const y = 60 + Math.random() * (height - 120);
      const suit = suits[Math.floor(Math.random() * suits.length)];

      scene.time.delayedCall(300 + Math.random() * 1500, () => {
        this.spawnSuitBurst(scene, container, x, y, suit, false);
      });
    }

    // Restauración y limpieza
    scene.time.delayedCall(3800, () => {
      scene.tweens.add({
        targets: container,
        alpha: 0,
        duration: 500,
        ease: 'Cubic.easeIn',
        onComplete: () => container.destroy()
      });
    });
  }

  /** Proyecta y posiciona la ficha dorada de $25,000 sobre la carta objetivo */
  private launchFinalChipToCard(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    startX: number,
    startY: number,
    targetX: number,
    targetY: number
  ): void {
    const chip = this.createCasinoChip(scene, '$25K');
    chip.setPosition(startX, startY);
    chip.setScale(0.3);
    chip.setAlpha(0.9);
    container.add(chip);

    // Vuelo con arco hacia la carta
    scene.tweens.add({
      targets: chip,
      x: targetX,
      y: targetY,
      scale: 1,
      angle: 720,
      duration: 620,
      ease: 'Back.easeOut',
      onComplete: () => {
        // Impacto de la ficha sobre la carta
        this.spawnChipImpact(scene, container, targetX, targetY);
      }
    });
  }

  /** Dibuja una ficha de casino detallada de alta denominación */
  private createCasinoChip(scene: Phaser.Scene, label: string): Phaser.GameObjects.Container {
    const chipContainer = scene.add.container(0, 0);
    const radius = 34;

    const g = scene.add.graphics();
    // Borde exterior dorado
    g.fillStyle(0xd4af37, 1);
    g.fillCircle(0, 0, radius);

    // Muescas radiales de ficha
    g.fillStyle(0xffffff, 0.9);
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const nx = Math.cos(angle) * (radius - 4);
      const ny = Math.sin(angle) * (radius - 4);
      g.fillRect(nx - 3, ny - 3, 6, 6);
    }

    // Anillo interior
    g.fillStyle(0x1a1a24, 1);
    g.fillCircle(0, 0, radius - 8);
    g.lineStyle(2, 0xffd76a, 0.9);
    g.strokeCircle(0, 0, radius - 8);

    chipContainer.add(g);

    // Texto de denominación ($25K)
    const text = scene.add
      .text(0, 0, label, {
        fontSize: '15px',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        color: '#ffd76a',
        align: 'center'
      })
      .setOrigin(0.5);
    chipContainer.add(text);

    return chipContainer;
  }

  private spawnChipImpact(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    x: number,
    y: number
  ): void {
    // Destello de impacto
    const flash = scene.add.circle(x, y, 55, 0xffe082, 0.9).setScale(0.1);
    container.add(flash);
    scene.tweens.add({
      targets: flash,
      scale: 1.4,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy()
    });

    // Anillo expansivo dorado
    const ring = scene.add
      .circle(x, y, 70, 0x000000, 0)
      .setStrokeStyle(3, 0xffd700, 0.9)
      .setScale(0.2);
    container.add(ring);
    scene.tweens.add({
      targets: ring,
      scale: 1.1,
      alpha: 0,
      duration: 400,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });

    // Confeti de pintas saliendo de la carta
    const suits: SuitType[] = ['heart', 'diamond', 'club', 'spade'];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const dist = 40 + Math.random() * 35;
      const suit = suits[i % suits.length];
      const icon = scene.add.graphics();
      const color = suit === 'heart' || suit === 'diamond' ? 0xff4d6d : 0xffffff;
      this.drawSuit(icon, suit, 14, color);
      icon.setPosition(x, y);
      icon.setScale(0);
      container.add(icon);

      scene.tweens.add({
        targets: icon,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        scale: 1,
        alpha: 0,
        duration: 500 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => icon.destroy()
      });
    }

    scene.cameras.main.shake(170, 0.007);
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