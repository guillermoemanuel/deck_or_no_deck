import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect, hasCardPositionSource } from './DeckCelebrationEffect';

/**
 * Estrategia del mazo Basic: la pantalla baja de tono, como una sala de
 * teatro apagando las luces, y dos grandes reflectores blanco-amarillentos
 * "barren" la pantalla con movimientos aleatorios hasta converger sobre
 * la carta que disparó la celebración — sea que esté en el tablero o sea
 * la carta secreta del pedestal.
 *
 * Necesita la posición REAL en pantalla de esa carta (no una posición
 * fija), así que resuelve `card.id` vía `hasCardPositionSource` — ver
 * ese type guard en DeckCelebrationEffect.ts para el porqué no hace
 * falta ningún cast a `any` ni un import circular a GameScene.
 *
 * Vive en su propio archivo (GRASP Polymorphism / Strategy) para que
 * pueda crecer o afinarse sin tocar GameScene.ts ni las estrategias de
 * otros mazos.
 */
export class TheaterSpotlightsEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, card: Card): void {
    const { width, height } = scene.cameras.main;
    const container = scene.add.container(0, 0);

    // Oscurecimiento: apaga la escena para que los reflectores resalten,
    // como las luces de una sala bajando antes del número principal.
    const darken = scene.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0).setAlpha(0);
    container.add(darken);
    scene.tweens.add({ targets: darken, alpha: 0.62, duration: 350, ease: 'Cubic.easeOut' });

    // Posición real de la carta que disparó el festejo — sea del tablero
    // o la secreta. Si por algún motivo no está disponible (defensivo),
    // cae al centro de la pantalla como resultado seguro.
    const target = (hasCardPositionSource(scene) ? scene.getCardScreenPosition(card.id) : null) ?? {
      x: width / 2,
      y: height / 2
    };

    const spotlightRadius = Math.min(width, height) * 0.51;
    const spotlightA = this.createSpotlight(scene, spotlightRadius);
    const spotlightB = this.createSpotlight(scene, spotlightRadius);
    container.add([spotlightA, spotlightB]);

    // Arrancan en esquinas opuestas, como si "peinaran" la sala buscando.
    spotlightA.setPosition(width * 0.18, height * 0.22);
    spotlightB.setPosition(width * 0.82, height * 0.78);

    let settledCount = 0;
    const onOneSettled = () => {
      settledCount++;
      if (settledCount === 2) {
        // Ambos reflectores "encontraron" la carta — remate visual.
        this.spawnFoundFlash(scene, container, target.x, target.y);
      }
    };

    // Cantidad de saltos aleatorios distinta para cada uno, así no se
    // sienten sincronizados — cada reflector "busca" a su propio ritmo
    // antes de converger.
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
  }
}