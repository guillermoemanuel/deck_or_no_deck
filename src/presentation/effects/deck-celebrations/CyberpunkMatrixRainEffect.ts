import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect, getCelebrationTargetPosition } from './DeckCelebrationEffect';

/**
 * Estrategia del mazo Cyberpunk:
 * 1. Lluvia de código Matrix en verde neón cayendo por toda la pantalla.
 * 2. La última cadena de código cae específicamente sobre la columna de la
 *    carta de mayor valor (25,000) e impacta directamente en su coordenada objetivo,
 *    provocando un estallido digital / pulso de glitch cibernético.
 */
export class CyberpunkMatrixRainEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, card: Card): void {
    const { width, height } = scene.cameras.main;
    const container = scene.add.container(0, 0);

    // Posición global de la carta de 25k
    const target = getCelebrationTargetPosition(scene, card);

    // Oscurecimiento de fondo
    const darken = scene.add.rectangle(width / 2, height / 2, width, height, 0x020804, 0).setAlpha(0);
    container.add(darken);
    scene.tweens.add({ targets: darken, alpha: 0.76, duration: 220, ease: 'Cubic.easeOut' });

    // Lluvia ambiental de columnas binarias
    const columnSpacing = 34;
    const columnCount = Math.ceil(width / columnSpacing);
    const lineHeight = 22;

    for (let i = 0; i < columnCount; i++) {
      const x = i * columnSpacing + columnSpacing / 2;
      // Saltear la columna directa de la carta para que la cadena final resalte sin solaparse
      if (Math.abs(x - target.x) < columnSpacing * 0.6) {
        continue;
      }

      const rowCount = 10 + Math.floor(Math.random() * 8);
      let glyphs = '';
      for (let row = 0; row < rowCount; row++) {
        glyphs += (Math.random() < 0.5 ? '0' : '1') + (row < rowCount - 1 ? '\n' : '');
      }

      const columnHeight = rowCount * lineHeight;
      const startY = -columnHeight - Math.random() * height * 0.4;
      const endY = height + columnHeight;

      const column = scene.add
        .text(x, startY, glyphs, {
          fontSize: '17px',
          fontFamily: '"Courier New", monospace',
          fontStyle: 'bold',
          color: '#39ff14',
          align: 'center',
          lineSpacing: lineHeight - 17
        })
        .setOrigin(0.5, 0)
        .setAlpha(0.65);
      container.add(column);

      scene.tweens.add({
        targets: column,
        y: endY,
        duration: 1300 + Math.random() * 900,
        delay: Math.random() * 500,
        repeat: 1,
        ease: 'Linear',
        onRepeat: () => column.setY(startY)
      });
    }

    // --- Cadena de código final: cae con delay e impacta sobre la carta de 25,000 ---
    scene.time.delayedCall(700, () => {
      const finalGlyphs = ['0', '1', '0', '1', '1', '0', '2', '5', 'K', '!', '1', '0'].join('\n');
      const finalHeight = 12 * 24;
      const streamStart = -finalHeight - 20;

      // Texto de alta luminosidad / blanco y verde brillante
      const finalStream = scene.add
        .text(target.x, streamStart, finalGlyphs, {
          fontSize: '22px',
          fontFamily: '"Courier New", monospace',
          fontStyle: 'bold',
          color: '#eaffea',
          stroke: '#00ff66',
          strokeThickness: 3,
          align: 'center',
          lineSpacing: 4
        })
        .setOrigin(0.5, 1) // Origen en la base del texto para que el impacto coincida con la punta inferior
        .setAlpha(0.95);
      container.add(finalStream);

      // Descenso veloz directamente hasta target.y
      scene.tweens.add({
        targets: finalStream,
        y: target.y,
        duration: 520,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          this.spawnCyberImpact(scene, container, target.x, target.y);
          // La cadena se disuelve al impactar
          scene.tweens.add({
            targets: finalStream,
            alpha: 0,
            scaleY: 0.2,
            duration: 200,
            ease: 'Quad.easeOut',
            onComplete: () => finalStream.destroy()
          });
        }
      });
    });

    // Restauración y limpieza
    scene.time.delayedCall(2900, () => {
      scene.tweens.add({
        targets: container,
        alpha: 0,
        duration: 450,
        ease: 'Cubic.easeIn',
        onComplete: () => container.destroy()
      });
    });
  }

  private spawnCyberImpact(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    x: number,
    y: number
  ): void {
    // Destello de impacto cibernético
    const flash = scene.add.circle(x, y, 48, 0x39ff14, 0.9).setScale(0.1);
    container.add(flash);
    scene.tweens.add({
      targets: flash,
      scale: 1.3,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy()
    });

    // Cuadrícula / retícula digital en expansión
    const gridRect = scene.add
      .rectangle(x, y, 110, 150, 0x00ff88, 0)
      .setStrokeStyle(3, 0x39ff14, 0.95)
      .setScale(0.2);
    container.add(gridRect);

    scene.tweens.add({
      targets: gridRect,
      scale: 1,
      alpha: 0,
      duration: 420,
      ease: 'Back.easeOut',
      onComplete: () => gridRect.destroy()
    });

    // Píxeles / bits dispersos
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const dist = 35 + Math.random() * 45;
      const bit = scene.add.rectangle(x, y, 4, 4, 0x80ffea, 0.9);
      container.add(bit);

      scene.tweens.add({
        targets: bit,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 380 + Math.random() * 180,
        ease: 'Cubic.easeOut',
        onComplete: () => bit.destroy()
      });
    }

    scene.cameras.main.shake(160, 0.006);
  }
}