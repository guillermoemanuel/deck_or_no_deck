import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect } from './DeckCelebrationEffect';

/**
 * Estrategia del mazo Egypt: una tormenta de arena del desierto cruza la
 * pantalla — un tinte cálido/ambarino cubre todo, franjas de arena
 * arrastradas por el viento barren horizontalmente, una nube de granos
 * más finos da densidad de fondo, y un leve temblor de cámara refuerza
 * la sensación de tormenta.
 *
 * Vive en su propio archivo (GRASP Polymorphism / Strategy) para que
 * pueda crecer o afinarse sin tocar GameScene.ts ni las estrategias de
 * otros mazos.
 */
export class EgyptSandstormEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, _card: Card): void {
    const { width, height } = scene.cameras.main;
    const container = scene.add.container(0, 0);

    // Flash inicial cálido, como un golpe de sol filtrado por el polvo.
    const flash = scene.add.rectangle(width / 2, height / 2, width, height, 0xffdca0, 0.55);
    container.add(flash);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 300, ease: 'Cubic.easeOut' });

    // Tinte ambarino de fondo: la tormenta "tiñe" toda la escena, con un
    // pulso de intensidad para que se sienta turbulento y no plano.
    const sandTint = scene.add.rectangle(width / 2, height / 2, width, height, 0xc2914a, 0).setAlpha(0);
    container.add(sandTint);
    scene.tweens.add({ targets: sandTint, alpha: 0.32, duration: 260, ease: 'Cubic.easeOut' });
    scene.tweens.add({
      targets: sandTint,
      alpha: { from: 0.24, to: 0.38 },
      duration: 320,
      delay: 260,
      yoyo: true,
      repeat: 4,
      ease: 'Sine.easeInOut'
    });

    // Franjas de arena: rectángulos angostos y alargados que cruzan la
    // pantalla horizontalmente (desde cualquiera de los dos lados, con
    // leve inclinación y deriva vertical), como ráfagas de viento
    // cargadas de arena.
    const streakCount = 14;
    for (let i = 0; i < streakCount; i++) {
      const y = Math.random() * height;
      const streakLength = 160 + Math.random() * 220;
      const streakColor = [0xe8c07d, 0xd2a679, 0xb98a4a][i % 3];
      const fromLeft = Math.random() < 0.5;

      const streak = scene.add.rectangle(
        fromLeft ? -streakLength : width + streakLength,
        y,
        streakLength,
        3 + Math.random() * 3,
        streakColor,
        0.5 + Math.random() * 0.3
      );
      streak.setAngle(-6 + Math.random() * 12);
      container.add(streak);

      scene.tweens.add({
        targets: streak,
        x: fromLeft ? width + streakLength : -streakLength,
        y: y + (Math.random() - 0.5) * 60,
        duration: 900 + Math.random() * 700,
        delay: Math.random() * 500,
        ease: 'Sine.easeInOut'
      });
    }

    // Nube de granos finos, más densa, para dar textura entre las franjas.
    const grainCount = 60;
    for (let i = 0; i < grainCount; i++) {
      const y = Math.random() * height;
      const fromLeft = Math.random() < 0.5;

      const grain = scene.add.circle(fromLeft ? -10 : width + 10, y, 1 + Math.random() * 1.5, 0xd9b06b, 0.6 + Math.random() * 0.3);
      container.add(grain);

      scene.tweens.add({
        targets: grain,
        x: fromLeft ? width + 10 : -10,
        y: y + (Math.random() - 0.5) * 100,
        duration: 1100 + Math.random() * 900,
        delay: Math.random() * 700,
        ease: 'Linear'
      });
    }

    // Leve temblor de cámara: refuerza la sensación de tormenta sin
    // marear — intensidad baja, breve, nativo de Phaser y se limpia solo
    // (no requiere ningún cleanup manual de nuestra parte).
    scene.cameras.main.shake(600, 0.004);

    // Restauración suave: todo (tinte, franjas, granos) se desvanece
    // junto y se destruye, sin dejar objetos huérfanos. Sin `setDepth()`
    // explícito, mismo criterio que el resto de los efectos — ver el
    // comentario correspondiente en SpotlightSweepEffect (evita taparle
    // el modal a una oferta del banquero que coincida).
    scene.time.delayedCall(2300, () => {
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