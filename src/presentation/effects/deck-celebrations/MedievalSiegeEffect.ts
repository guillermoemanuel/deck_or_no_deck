import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect, getCelebrationTargetPosition } from './DeckCelebrationEffect';

/**
 * Estrategia del mazo Medieval: una lluvia de flechas en llamas cruza la
 * pantalla horizontalmente, y al final una espada cae en vertical desde
 * arriba, clavándose directamente sobre la carta de mayor valor (25,000)
 * — sea que esté en el tablero o sea la carta secreta del pedestal / victoria.
 */
export class MedievalSiegeEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, card: Card): void {
    const { width, height } = scene.cameras.main;
    const container = scene.add.container(0, 0);

    // Tinte cálido de antorchas/asedio, sutil.
    const tint = scene.add.rectangle(width / 2, height / 2, width, height, 0x1a0f05, 0).setAlpha(0);
    container.add(tint);
    scene.tweens.add({ targets: tint, alpha: 0.28, duration: 300, ease: 'Cubic.easeOut' });

    // Posición real y exacta de la carta objetivo de 25k
    const target = getCelebrationTargetPosition(scene, card);

    // --- Lluvia de flechas en llamas ---
    const arrowCount = 10;
    for (let i = 0; i < arrowCount; i++) {
      const y = height * (0.12 + Math.random() * 0.7);
      const fromLeft = Math.random() < 0.5;
      scene.time.delayedCall(Math.random() * 1100, () => {
        this.spawnFlamingArrow(scene, container, width, y, fromLeft);
      });
    }

    // --- Aviso breve sobre la columna, antes del golpe ---
    scene.time.delayedCall(1300, () => {
      this.spawnColumnWarning(scene, container, target.x, height);
    });

    // --- La espada cae en vertical y se clava exactamente sobre la carta ---
    scene.time.delayedCall(1650, () => {
      this.spawnFallingSword(scene, container, target.x, target.y);
    });

    // Restauración suave: todo se desvanece junto y se destruye. Sin
    // `setDepth()` explícito, mismo criterio que el resto de los
    // efectos — ver el comentario correspondiente en SpotlightSweepEffect
    // (evita taparle el modal a una oferta del banquero que coincida).
    scene.time.delayedCall(3300, () => {
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
   * Flecha en llamas cruzando horizontalmente. Se dibuja apuntando hacia
   * +X en coordenadas locales (asta + punta + plumas), y si viaja de
   * derecha a izquierda simplemente se espeja (`scaleX: -1`) en vez de
   * redibujarla — mismo resultado, menos código. El fuego (glow ADD)
   * vive en un Graphics aparte del cuerpo (madera/metal, blend normal),
   * porque un blend mode se aplica a TODO un Graphics, no por-figura.
   */
  private spawnFlamingArrow(
    scene: Phaser.Scene,
    container: Phaser.GameObjects.Container,
    width: number,
    y: number,
    fromLeft: boolean
  ): void {
    const body = scene.add.graphics();
    body.fillStyle(0x3a2415, 1); // asta
    body.fillRect(-20, -2, 26, 4);
    body.fillStyle(0x8a8a8a, 1); // punta metálica
    body.fillTriangle(6, -6, 6, 6, 16, 0);
    body.fillStyle(0x5a4a2a, 1); // plumas traseras
    body.fillTriangle(-20, -6, -20, 6, -12, 0);

    const flame = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    flame.fillStyle(0xffb347, 0.55);
    flame.fillCircle(-10, 0, 9);
    flame.fillStyle(0xff6a1f, 0.7);
    flame.fillCircle(-4, 0, 7);
    flame.fillStyle(0xfff2a8, 0.85);
    flame.fillCircle(4, 0, 5);

    const startX = fromLeft ? -60 : width + 60;
    const endX = fromLeft ? width + 60 : -60;
    const arrow = scene.add.container(startX, y, [flame, body]);
    if (!fromLeft) {
      arrow.setScale(-1, 1);
    }
    container.add(arrow);

    // Chispas que se desprenden mientras vuela, como el rastro de fuego.
    const sparkTimer = scene.time.addEvent({
      delay: 50,
      loop: true,
      callback: () => {
        const spark = scene.add
          .circle(arrow.x, arrow.y + (Math.random() - 0.5) * 6, 2 + Math.random() * 2, 0xffaa33, 0.8)
          .setBlendMode(Phaser.BlendModes.ADD);
        container.add(spark);
        scene.tweens.add({
          targets: spark,
          alpha: 0,
          scale: 0.3,
          duration: 300,
          onComplete: () => spark.destroy()
        });
      }
    });

    scene.tweens.add({
      targets: arrow,
      x: endX,
      duration: 550 + Math.random() * 250,
      ease: 'Linear',
      onComplete: () => {
        sparkTimer.destroy();
        arrow.destroy();
      }
    });
  }

  /** Aviso breve: un resplandor pulsante marca la columna un instante antes del golpe. */
  private spawnColumnWarning(scene: Phaser.Scene, container: Phaser.GameObjects.Container, x: number, height: number): void {
    const warning = scene.add.rectangle(x, height / 2, 46, height, 0xffcc66, 0).setBlendMode(Phaser.BlendModes.ADD);
    container.add(warning);

    scene.tweens.add({
      targets: warning,
      alpha: { from: 0, to: 0.22 },
      duration: 140,
      yoyo: true,
      repeat: 1,
      onComplete: () => warning.destroy()
    });
  }

  /**
   * La espada cae en vertical (recto hacia abajo, sin rotación — tal
   * como se pidió) desde arriba de la pantalla hasta clavarse sobre
   * `(x, y)`, con aceleración tipo gravedad (`Cubic.easeIn`), seguida de
   * un impacto (destello + polvo + leve temblor de cámara).
   */
  private spawnFallingSword(scene: Phaser.Scene, container: Phaser.GameObjects.Container, x: number, y: number): void {
    const sword = scene.add.graphics();
    const bladeLength = 130;
    const bladeWidth = 14;
    const guardWidth = 34;
    const hiltLength = 26;

    // Hoja: triángulo alargado, la punta apuntando hacia abajo (+y local).
    sword.fillStyle(0xd8d8dc, 1);
    sword.beginPath();
    sword.moveTo(-bladeWidth / 2, 0);
    sword.lineTo(bladeWidth / 2, 0);
    sword.lineTo(0, bladeLength);
    sword.closePath();
    sword.fillPath();
    // Filo/brillo central.
    sword.fillStyle(0xffffff, 0.5);
    sword.fillRect(-1.5, 6, 3, bladeLength - 14);

    // Guarda.
    sword.fillStyle(0xb8860b, 1);
    sword.fillRect(-guardWidth / 2, -6, guardWidth, 6);

    // Empuñadura + pomo, arriba de la guarda (en -y local).
    sword.fillStyle(0x3a2415, 1);
    sword.fillRect(-4, -hiltLength - 6, 8, hiltLength);
    sword.fillStyle(0xb8860b, 1);
    sword.fillCircle(0, -hiltLength - 6, 6);

    const startY = -bladeLength - hiltLength - 40;
    const finalSwordY = y - bladeLength;
    sword.setPosition(x, startY);
    container.add(sword);

    scene.tweens.add({
      targets: sword,
      y: finalSwordY,
      duration: 380,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        // Vibración / rebote de clavado de la hoja
        scene.tweens.add({
          targets: sword,
          y: finalSwordY - 4,
          duration: 45,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeInOut'
        });

        this.spawnImpact(scene, container, x, y);
        scene.cameras.main.shake(220, 0.012);
      }
    });
  }

  /** Impacto de la espada clavándose: destello + polvo radial. */
  private spawnImpact(scene: Phaser.Scene, container: Phaser.GameObjects.Container, x: number, y: number): void {
    const flash = scene.add.circle(x, y, 40, 0xfff2c0, 0.9).setBlendMode(Phaser.BlendModes.ADD).setScale(0.1);
    container.add(flash);
    scene.tweens.add({
      targets: flash,
      scale: 1,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy()
    });

    const dustCount = 8;
    for (let i = 0; i < dustCount; i++) {
      const angle = Math.PI + (i / (dustCount - 1)) * Math.PI; // media vuelta hacia arriba, como tierra saltando
      const travel = 24 + Math.random() * 26;
      const dust = scene.add.circle(x, y, 3 + Math.random() * 3, 0xb8a06a, 0.7);
      container.add(dust);

      scene.tweens.add({
        targets: dust,
        x: x + Math.cos(angle) * travel,
        y: y + Math.sin(angle) * travel * 0.5,
        alpha: 0,
        duration: 400 + Math.random() * 200,
        ease: 'Cubic.easeOut',
        onComplete: () => dust.destroy()
      });
    }
  }
}