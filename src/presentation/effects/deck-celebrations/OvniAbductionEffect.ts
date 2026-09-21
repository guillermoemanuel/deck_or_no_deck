import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect } from './DeckCelebrationEffect';

/**
 * Estrategia del mazo OVNI: "abducción" — flash inicial, la pantalla se
 * oscurece, y un rayo grueso blanco/celeste desciende desde arriba hacia
 * el centro de la pantalla (el clásico "haz de tractor"), con unas motas
 * de luz ascendiendo dentro del haz para reforzar la sensación de algo
 * siendo levantado hacia la nave.
 *
 * Vive en su propio archivo (GRASP Polymorphism / Strategy) para que
 * pueda crecer o afinarse sin tocar GameScene.ts ni las estrategias de
 * otros mazos.
 */
export class OvniAbductionEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, _card: Card): void {
    const { width, height } = scene.cameras.main;
    const centerX = width / 2;
    const container = scene.add.container(0, 0);

    // Flash inicial, como el instante del "rapto".
    const flash = scene.add.rectangle(centerX, height / 2, width, height, 0xffffff, 0.7);
    container.add(flash);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 300, ease: 'Cubic.easeOut' });

    // Oscurecimiento: entra rápido y se mantiene; se desvanece al final
    // junto con todo lo demás.
    const darken = scene.add.rectangle(centerX, height / 2, width, height, 0x000000, 0).setAlpha(0);
    container.add(darken);
    scene.tweens.add({ targets: darken, alpha: 0.7, duration: 300, delay: 100, ease: 'Cubic.easeOut' });

    // Rayo exterior (celeste, más ancho, de glow) + rayo interior (blanco,
    // más angosto, núcleo brillante) — el clásico "haz de tractor" ovni.
    // Ambos se dibujan ANCLADOS ARRIBA y se revelan escalando `scaleY` de
    // 0 a 1, para que el haz literalmente "descienda" desde arriba hacia
    // abajo, en vez de aparecer entero de golpe.
    const outerBeam = this.createBeam(scene, centerX, width * 0.22, 0x8fe3ff, 0.35);
    const innerBeam = this.createBeam(scene, centerX, width * 0.09, 0xffffff, 0.55);
    container.add([outerBeam, innerBeam]);

    [outerBeam, innerBeam].forEach((beam, i) => {
      scene.tweens.add({
        targets: beam,
        scaleY: 1,
        duration: 750,
        delay: 150 + i * 80,
        ease: 'Cubic.easeIn'
      });
    });

    // Pulso sutil de intensidad mientras el haz está activo, para que se
    // sienta como energía viva y no una imagen estática.
    scene.tweens.add({
      targets: [outerBeam, innerBeam],
      alpha: { from: 0.7, to: 1 },
      duration: 260,
      delay: 900,
      yoyo: true,
      repeat: 2,
      ease: 'Sine.easeInOut'
    });

    // Motas de luz ascendiendo dentro del haz, como si algo fuera
    // "levantado" hacia la nave.
    for (let i = 0; i < 8; i++) {
      const speck = scene.add.circle(
        centerX + (Math.random() - 0.5) * width * 0.16,
        height * 0.85,
        2 + Math.random() * 2,
        0xffffff,
        0.9
      );
      container.add(speck);

      scene.tweens.add({
        targets: speck,
        y: -20,
        alpha: 0,
        duration: 1100 + Math.random() * 500,
        delay: 500 + i * 90,
        ease: 'Cubic.easeIn'
      });
    }

    // Restauración suave: todo se desvanece junto y se destruye. Sin
    // `setDepth()` explícito, mismo criterio que el resto de los efectos
    // — ver el comentario correspondiente en SpotlightSweepEffect (evita
    // taparle el modal a una oferta del banquero que coincida).
    scene.time.delayedCall(2500, () => {
      scene.tweens.add({
        targets: container,
        alpha: 0,
        duration: 450,
        ease: 'Cubic.easeIn',
        onComplete: () => container.destroy()
      });
    });
  }

  /**
   * Dibuja un haz vertical anclado en la parte superior de la pantalla
   * (el rectángulo se dibuja desde y=0 hacia abajo, en coordenadas
   * locales), listo para revelarse animando su `scaleY` de 0 a 1 — así
   * el haz "desciende" en vez de aparecer entero de una.
   */
  private createBeam(
    scene: Phaser.Scene,
    centerX: number,
    beamWidth: number,
    color: number,
    alpha: number
  ): Phaser.GameObjects.Graphics {
    const { height } = scene.cameras.main;
    const beam = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    beam.fillStyle(color, alpha);
    beam.fillRect(-beamWidth / 2, 0, beamWidth, height);
    beam.setPosition(centerX, 0);
    beam.setScale(1, 0);
    return beam;
  }
}