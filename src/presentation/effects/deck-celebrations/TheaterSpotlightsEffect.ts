import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect, getCelebrationTargetPosition } from './DeckCelebrationEffect';

/**
 * Estrategia del mazo Basic: la pantalla baja de tono, como una sala de
 * teatro apagando las luces, y dos grandes reflectores blanco-amarillentos
 * barren la pantalla hasta terminar posicionados y enfocando directamente
 * la carta de mayor valor (25,000) — sea que esté en el tablero o sea
 * la carta secreta del pedestal / victoria.
 */
export class TheaterSpotlightsEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, card: Card): void {
    const { width, height } = scene.cameras.main;
    const container = scene.add.container(0, 0);

    // Oscurecimiento de la escena
    const darken = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0).setAlpha(0);
    container.add(darken);
    scene.tweens.add({ targets: darken, alpha: 0.65, duration: 350, ease: 'Cubic.easeOut' });

    // Posición exacta de la carta objetivo de 25k
    const target = getCelebrationTargetPosition(scene, card);

    const spotlightRadius = Math.min(width, height) * 0.48;
    const spotlightA = this.createSpotlight(scene, spotlightRadius);
    const spotlightB = this.createSpotlight(scene, spotlightRadius);
    container.add([spotlightA, spotlightB]);

    // Arrancan en esquinas opuestas peinando la escena
    spotlightA.setPosition(width * 0.15, height * 0.2);
    spotlightB.setPosition(width * 0.85, height * 0.8);

    let settledCount = 0;
    const onOneSettled = () => {
      settledCount++;
      if (settledCount === 2) {
        // Ambos reflectores enfocaron con precisión la carta — remate visual
        this.spawnFoundFlash(scene, container, target.x, target.y);

        // Pulso conjunto de los reflectores enfocados sobre la carta
        scene.tweens.add({
          targets: [spotlightA, spotlightB],
          scale: { from: 1, to: 1.06 },
          alpha: { from: 0.85, to: 1 },
          duration: 350,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeInOut'
        });
      }
    };

    // Convergen hacia la carta objetivo
    this.wanderThenSettle(scene, spotlightA, width, height, 4, target, onOneSettled);
    this.wanderThenSettle(scene, spotlightB, width, height, 5, target, onOneSettled);

    // Restauración suave: todo se desvanece junto y se destruye. Sin
    // `setDepth()` explícito, mismo criterio que el resto de los
    // efectos — ver el comentario correspondiente en SpotlightSweepEffect
    // (evita taparle el modal a una oferta del banquero que coincida).
    scene.time.delayedCall(3200, () => {
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
   * Mueve un reflector por `hopsRemaining` puntos aleatorios y, en el
   * último salto, lo lleva exactamente a `finalTarget` (la carta real) en
   * vez de otro punto al azar — así los dos reflectores terminan
   * SIEMPRE sobre la misma carta, sin importar cuántos saltos random
   * hicieron antes.
   */
  private wanderThenSettle(
    scene: Phaser.Scene,
    spotlight: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    hopsRemaining: number,
    finalTarget: { x: number; y: number },
    onSettle: () => void
  ): void {
    const isLastHop = hopsRemaining <= 0;
    const targetX = isLastHop ? finalTarget.x : 60 + Math.random() * (width - 120);
    const targetY = isLastHop ? finalTarget.y : 60 + Math.random() * (height - 120);

    scene.tweens.add({
      targets: spotlight,
      x: targetX,
      y: targetY,
      duration: isLastHop ? 550 : 260 + Math.random() * 220,
      ease: isLastHop ? 'Back.easeOut' : 'Sine.easeInOut',
      onComplete: () => {
        if (isLastHop) {
          onSettle();
        } else {
          this.wanderThenSettle(scene, spotlight, width, height, hopsRemaining - 1, finalTarget, onSettle);
        }
      }
    });
  }

  /**
   * Dibuja un reflector: halo suave (círculos concéntricos con alpha
   * creciente hacia el centro — mismo criterio "sin fillGradientStyle"
   * ya usado en MainMenuScene.drawAtmosphere(), seguro entre renderers)
   * más un núcleo brillante encima, todo en blend mode ADD para que se
   * vea como luz real sobre el fondo oscurecido.
   */
  private createSpotlight(scene: Phaser.Scene, radius: number): Phaser.GameObjects.Graphics {
    const spotlight = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    const rings = 5;

    for (let i = rings; i >= 1; i--) {
      const t = i / rings;
      const ringRadius = radius * t;
      const alpha = 0.16 * (1 - t) + 0.05;
      spotlight.fillStyle(0xfff6d0, alpha);
      spotlight.fillCircle(0, 0, ringRadius);
    }

    spotlight.fillStyle(0xffffff, 0.9);
    spotlight.fillCircle(0, 0, radius * 0.28);

    return spotlight;
  }

  /** Remate: un flash + un anillo expandiéndose sobre la carta encontrada. */
  private spawnFoundFlash(scene: Phaser.Scene, container: Phaser.GameObjects.Container, x: number, y: number): void {
    const flash = scene.add.circle(x, y, 90, 0xfff6d0, 0.85).setBlendMode(Phaser.BlendModes.ADD).setScale(0.1);
    container.add(flash);
    scene.tweens.add({
      targets: flash,
      scale: 1,
      alpha: 0,
      duration: 500,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy()
    });

    const ring = scene.add.circle(x, y, 70, 0x000000, 0).setStrokeStyle(3, 0xffe9a8, 0.9).setScale(0.2);
    container.add(ring);
    scene.tweens.add({
      targets: ring,
      scale: 1,
      alpha: 0,
      duration: 550,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy()
    });

    // Destellos dorados teatrales sobre la carta iluminada
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2;
      const dist = 40 + Math.random() * 35;
      const star = scene.add.circle(x, y, 2.5 + Math.random() * 2, 0xfff0b3, 0.95);
      star.setBlendMode(Phaser.BlendModes.ADD);
      container.add(star);

      scene.tweens.add({
        targets: star,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        alpha: 0,
        scale: 0.2,
        duration: 400 + Math.random() * 250,
        ease: 'Cubic.easeOut',
        onComplete: () => star.destroy()
      });
    }
  }
}