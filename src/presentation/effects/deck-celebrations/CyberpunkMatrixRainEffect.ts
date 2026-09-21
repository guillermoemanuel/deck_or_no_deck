import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect } from './DeckCelebrationEffect';

/**
 * Estrategia del mazo Cyberpunk: la pantalla se oscurece y cae una
 * lluvia vertical de dígitos binarios (0/1) en verde fluo, estilo
 * "Matrix" — columnas independientes, cada una con su propia
 * velocidad/duración para que la lluvia se sienta orgánica y no
 * sincronizada.
 *
 * Vive en su propio archivo (GRASP Polymorphism / Strategy) para que
 * pueda crecer o afinarse sin tocar GameScene.ts ni las estrategias de
 * otros mazos.
 */
export class CyberpunkMatrixRainEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, _card: Card): void {
    const { width, height } = scene.cameras.main;
    const container = scene.add.container(0, 0);

    // Oscurecimiento de la pantalla: entra rápido, se mantiene, y se
    // desvanece junto con el resto del efecto al final.
    const darken = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0).setAlpha(0);
    container.add(darken);
    scene.tweens.add({ targets: darken, alpha: 0.72, duration: 220, ease: 'Cubic.easeOut' });

    // Lluvia de columnas binarias. Cada columna es un único Text
    // multilínea (más liviano que un GameObject por carácter) con
    // caracteres '0'/'1' aleatorios, cayendo de arriba hacia abajo y
    // reapareciendo arriba un par de veces mientras dura el efecto.
    const columnSpacing = 32;
    const columnCount = Math.ceil(width / columnSpacing);
    const lineHeight = 22;

    for (let i = 0; i < columnCount; i++) {
      const x = i * columnSpacing + columnSpacing / 2;
      const rowCount = 12 + Math.floor(Math.random() * 10);

      let glyphs = '';
      for (let row = 0; row < rowCount; row++) {
        glyphs += (Math.random() < 0.5 ? '0' : '1') + (row < rowCount - 1 ? '\n' : '');
      }

      const columnHeight = rowCount * lineHeight;
      const startY = -columnHeight - Math.random() * height * 0.5;
      const endY = height + columnHeight;

      const column = scene.add
        .text(x, startY, glyphs, {
          fontSize: '18px',
          fontFamily: '"Courier New", monospace',
          fontStyle: 'bold',
          color: '#39ff14',
          align: 'center',
          lineSpacing: lineHeight - 18
        })
        .setOrigin(0.5, 0)
        .setAlpha(0.85);
      container.add(column);

      scene.tweens.add({
        targets: column,
        y: endY,
        duration: 1400 + Math.random() * 1200,
        delay: Math.random() * 600,
        repeat: 1,
        ease: 'Linear',
        onRepeat: () => column.setY(startY)
      });
    }

    // Restauración suave: todo (oscurecimiento + lluvia) se desvanece
    // junto y se destruye, devolviendo la escena a su estado normal. Sin
    // `setDepth()` explícito, mismo criterio que el resto de los efectos
    // — ver el comentario correspondiente en SpotlightSweepEffect.
    scene.time.delayedCall(2600, () => {
      scene.tweens.add({
        targets: container,
        alpha: 0,
        duration: 450,
        ease: 'Cubic.easeIn',
        onComplete: () => container.destroy()
      });
    });
  }
}