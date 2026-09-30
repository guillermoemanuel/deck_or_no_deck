import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect } from './DeckCelebrationEffect';
import { LocalizedText } from '../../components/LocalizedText';

/**
 * Efecto genérico de "reflectores cruzando la pantalla": se reproduce
 * SIEMPRE al revelar la carta de mayor valor, sin importar el mazo
 * activo — no es una estrategia POR mazo, sino la base común sobre la
 * que cada mazo puede sumar la suya (ver
 * GameScene.playTopValueCardCelebration(), que la invoca aparte del
 * lookup polimórfico por mazo).
 *
 * 3 haces de luz diagonales (Graphics + blend mode ADD, para que se vean
 * como focos reales sobre el fondo oscuro) barriendo la pantalla, más un
 * destello inicial y un título breve.
 */
export class SpotlightSweepEffect implements DeckCelebrationEffect {
  play(scene: Phaser.Scene, _card: Card): void {
    const { width, height } = scene.cameras.main;
    const effectContainer = scene.add.container(0, 0);

    // Destello inicial, como un flash de cámara al momento del hallazgo.
    const flash = scene.add.rectangle(width / 2, height / 2, width, height, 0xffffff, 0.55);
    effectContainer.add(flash);
    scene.tweens.add({ targets: flash, alpha: 0, duration: 350, ease: 'Cubic.easeOut' });

    // Haces de luz diagonales en modo ADD, barriendo de un lado al otro.
    const beamCount = 3;
    for (let i = 0; i < beamCount; i++) {
      const beam = scene.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
      const beamWidth = 130;
      beam.fillStyle(0xfff2c2, 0.3);
      // Rectángulo alto centrado en su propio origen local; al rotarlo con
      // setAngle() y solo trasladarlo en X, barre la pantalla en diagonal.
      beam.fillRect(-beamWidth / 2, -height, beamWidth, height * 3);
      beam.setAngle(20 + i * 8);
      beam.setPosition(-height - i * 150, height / 2);
      effectContainer.add(beam);

      scene.tweens.add({
        targets: beam,
        x: width + height + i * 150,
        duration: 1900 + i * 200,
        delay: i * 160,
        ease: 'Sine.easeInOut'
      });
    }

    // BUGFIX (i18n hardcodeado): a diferencia del título de MainMenuScene
    // ("DECK OR NO DECK", un nombre de marca que no se traduce en ningún
    // idioma), este es un mensaje de contenido real ("¡carta máxima
    // revelada!") — un jugador no hispanohablante lo veía siempre en
    // español sin importar el idioma elegido. `LocalizedText` resuelve
    // esto; el efecto es de un solo uso (se destruye a los ~2.9s), así
    // que no hace falta suscripción en caliente al cambio de idioma.
    const celebrationText = new LocalizedText(
      scene,
      width / 2,
      height / 2 - 40,
      'SPOTLIGHT_TOP_CARD_TITLE',
      {
        fontSize: '34px',
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontStyle: 'bold',
        color: '#ffd76a',
        stroke: '#000000',
        strokeThickness: 6
      }
    )
      .setOrigin(0.5)
      .setScale(0.3)
      .setAlpha(0);
    effectContainer.add(celebrationText);

    scene.tweens.add({ targets: celebrationText, scale: 1, alpha: 1, duration: 350, ease: 'Back.easeOut' });

    // Restauración suave de la escena: todo el efecto se desvanece junto
    // y se destruye (Container.destroy() destruye también sus hijos), sin
    // dejar objetos huérfanos ni congelar el flujo del juego en ningún
    // momento.
    //
    // Nota de profundidad: NO se usa `setDepth()` acá a propósito —
    // ningún otro elemento de esta escena lo usa (cartas, HUD, ni los
    // modales de BankerOfferPanel/SwapEventModal/ResultScene), así que
    // todo se apoya en el orden de inserción al display list. Si la carta
    // de 25000 coincide justo con el turno de una oferta del banquero
    // (cada 3 cartas), este efecto se crea PRIMERO (se dispara antes en
    // el mismo OpenCardUseCase.execute()) y el panel de oferta se crea
    // después — con ambos en depth 0, el orden de inserción los apila
    // correctamente (la oferta queda arriba, como corresponde a una
    // decisión que requiere atención). Ponerle un depth alto acá rompería
    // esa apilación y el reflector taparía el modal.
    scene.time.delayedCall(2400, () => {
      scene.tweens.add({
        targets: effectContainer,
        alpha: 0,
        duration: 500,
        ease: 'Cubic.easeIn',
        onComplete: () => effectContainer.destroy()
      });
    });
  }
}