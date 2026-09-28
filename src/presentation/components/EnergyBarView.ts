import Phaser from 'phaser';
import languageManager from '../../shared/i18n/LanguageManager';
import { TranslationKey } from '../../shared/i18n/LanguageData';

/**
 * EnergyBarView: Barra de energía HUD.
 *
 * Características:
 * - Marco (`energy-bar-bg`) y relleno (`energy-bar-fill`) con el nuevo
 *   arte — ya no requieren un borde resplandeciente adicional
 *   (`borderGlow` fue eliminado por completo).
 * - Interpolación cromática dinámica (Verde esmeralda -> Ámbar -> Rojo carmesí).
 * - Animación de pulso crítico de alerta cuando la energía cae por debajo del 20%.
 * - Respiración continua y sutil sobre el relleno, para que la barra se
 *   sienta viva incluso sin cambios de energía.
 * - Transiciones de barra suaves vía tweens.
 * - Capacidad visual dinámica: el upgrade "Tanque de Energía" ensancha
 *   físicamente la barra (setCapacityMultiplier), para que el jugador
 *   perciba de inmediato que el tanque creció, más allá de solo verla
 *   "más llena" con el mismo ancho de siempre. La expansión es simétrica
 *   (ver constructor) en vez de crecer únicamente hacia la derecha.
 */
export class EnergyBarView extends Phaser.GameObjects.Container {
  private readonly bg: Phaser.GameObjects.Image;
  private readonly fill: Phaser.GameObjects.Image;
  private readonly labelText: Phaser.GameObjects.Text;
  private readonly bankerOfferText: Phaser.GameObjects.Text;
  private readonly baseMaxWidth: number;
  private capacityMultiplier = 1;
  private criticalTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y);

    // REDISEÑO (expansión centrada/simétrica): `bg` y `fill` ahora
    // comparten el mismo punto de anclaje local, (0, 0), con
    // `setOrigin(0.5, 0.5)`. Antes ambos usaban `setOrigin(0, 0.5)` con
    // el borde izquierdo fijo en x=0 (y `fill` además desplazado a x=4
    // como offset manual), por lo que crecer la barra
    // (`setCapacityMultiplier`) sólo la expandía hacia la derecha.
    //
    // Al anclar ambos al centro, escalar `scaleX` los expande
    // SIMÉTRICAMENTE hacia ambos lados sin ningún cálculo de offset
    // manual. Y como `fill` y `bg` comparten exactamente el mismo centro
    // (sin offset de por medio), nunca pueden desalinearse entre sí —
    // "sin desfasarse del fondo" — sin importar el capacityMultiplier
    // vigente ni el porcentaje de energía actual: el relleno simplemente
    // crece/decrece desde ese mismo centro compartido.
    this.bg = scene.add.image(0, 0, 'energy-bar-bg').setOrigin(0.5, 0.5);
    this.fill = scene.add.image(0, 0, 'energy-bar-fill').setOrigin(0.5, 0.5);
    this.baseMaxWidth = this.fill.width;

    // Centrado sobre la barra (antes anclado a la izquierda en x=4, lo
    // que quedaba descentrado respecto del nuevo marco simétrico).
    this.labelText = scene.add
      .text(0, -24, 'ENERGÍA: 100%', {
        fontSize: '17px',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        color: '#00e5ff'
      })
      .setOrigin(0.5, 0.5);

    // Justo debajo de la barra (labelText va arriba, en -24 — este va
    // simétricamente abajo). Dorado en vez de cian: se lee como
    // información secundaria/meta, no como el dato principal (energía)
    // que ya domina el label de arriba — mismo criterio cromático que el
    // resto de la UI "Casino de Lujo" del juego.
    this.bankerOfferText = scene.add
      .text(0, 24, '', {
        fontSize: '15px',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        color: '#ffd76a',
        stroke: '#000000',
        strokeThickness: 3
      })
      .setOrigin(0.5, 0.5);

    this.add([this.bg, this.fill, this.labelText, this.bankerOfferText]);
    scene.add.existing(this);

    // Animación de "respiración": pulso continuo y sutil en bucle
    // infinito sobre `fill`. Se anima `scaleY` (NO `alpha` ni `scaleX`)
    // a propósito: `scaleX` ya es propiedad de la animación de porcentaje
    // (`displayWidth` en setPercentage(), que internamente escribe sobre
    // scaleX) y `alpha` ya es propiedad del pulso crítico de energía baja
    // más abajo. Si la respiración compartiera cualquiera de esas dos
    // propiedades, ambas animaciones se pisarían entre sí cada frame. Al
    // usar `scaleY` en exclusiva, las tres conviven sin conflicto sobre
    // el mismo `fill`.
    scene.tweens.add({
      targets: this.fill,
      scaleY: { from: 1, to: 1.06 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  private get effectiveMaxWidth(): number {
    return this.baseMaxWidth * this.capacityMultiplier;
  }

  setPercentage(percentage: number): void {
    const clamped = Phaser.Math.Clamp(percentage, 0, 100);
    const targetWidth = (clamped / 100) * this.effectiveMaxWidth;
    const color = this.colorForPercentage(clamped);

    this.fill.setTint(color);
    this.labelText.setText(`ENERGÍA: ${Math.round(clamped)}%`);
    this.labelText.setColor(clamped <= 20 ? '#ff3366' : '#00e5ff');

    this.scene.tweens.add({
      targets: this.fill,
      displayWidth: targetWidth,
      duration: 250,
      ease: 'Cubic.easeOut'
    });

    // Gestión del pulso crítico al estar por debajo del 20%. Antes vivía
    // en `borderGlow` (removido junto con todo su rastro: propiedad,
    // instanciación y animaciones — el nuevo arte de energy-bar-bg/-fill
    // ya no lo necesita). Se reubica sobre `fill.alpha`, que queda libre
    // de conflicto porque la respiración usa `scaleY` y el ancho usa
    // `scaleX` (ver comentario del constructor).
    if (clamped <= 20 && clamped > 0) {
      if (!this.criticalTween) {
        this.criticalTween = this.scene.tweens.add({
          targets: this.fill,
          alpha: { from: 0.45, to: 1 },
          duration: 300,
          yoyo: true,
          repeat: -1
        });
      }
    } else {
      if (this.criticalTween) {
        this.criticalTween.stop();
        this.criticalTween = null;
        this.fill.setAlpha(1);
      }
    }
  }

  /**
   * Upgrade "Tanque de Energía": agranda físicamente el marco (`bg`) y el
   * ancho máximo del relleno — la barra se ve VISIBLEMENTE más grande de
   * inmediato, no solo "más llena".
   *
   * BUGFIX (bug_energy_bar_frame_scaling): se calcula `scaleX`
   * explícitamente contra el ancho NATIVO de la textura (`this.bg.width`,
   * estable, no afectado por escalados previos) — la única fuente de
   * verdad del nuevo ancho es `effectiveMaxWidth` (derivado de
   * `maxEnergy` vía `capacityMultiplier`).
   *
   * REDISEÑO (expansión centrada): a diferencia de la versión anterior
   * (que también debía recalcular y tweenear la posición X de
   * `borderGlow` para mantenerlo centrado sobre un marco que crecía sólo
   * hacia la derecha), acá no hace falta tocar ninguna posición: como
   * `bg` está anclado a su propio centro en x=0 (`setOrigin(0.5, 0.5)`),
   * escalar `scaleX` ya lo expande simétricamente hacia ambos lados por
   * sí solo.
   *
   * Se fija además el estado final de forma SÍNCRONICA (no solo vía
   * tween) para garantizar que el marco nunca quede en un tamaño
   * intermedio si la animación se interrumpe.
   */
  setCapacityMultiplier(multiplier: number): void {
    this.capacityMultiplier = multiplier;
    const newWidth = this.effectiveMaxWidth;
    const targetScaleX = newWidth / this.bg.width;

    this.scene.tweens.add({
      targets: this.bg,
      scaleX: targetScaleX,
      duration: 300,
      ease: 'Cubic.easeOut'
    });

    // Estado final garantizado: si la escena se destruye o la animación
    // se corta a mitad de camino, el marco igual termina con el ancho
    // correcto en vez de quedar desincronizado del relleno.
    this.scene.time.delayedCall(300, () => {
      this.bg.scaleX = targetScaleX;
    });
  }

  private colorForPercentage(percentage: number): number {
    if (percentage > 50) return 0x2ecc71; // Verde esmeralda
    if (percentage > 20) return 0xf1c40f; // Ámbar dorado
    return 0xe74c3c; // Rojo carmesí crítico
  }

  /**
   * REQ (transparencia de mecánicas): "Oferta del banquero en X cartas"
   * (singular si X = 1). Se llama en cada `CardOpened` — ver
   * GameSceneController.handleEvent() — con el valor ya calculado por el
   * dominio (Banker.cardsUntilNextOffer(), vía GameSession), nunca
   * recalculado ni hardcodeado acá: este componente solo sabe MOSTRAR el
   * número, no de dónde sale.
   */

  // Extraer la lógica de selección de clave a un método privado o helper puro
  private getCountdownKey(cardsRemaining: number): TranslationKey {
    if (cardsRemaining <= 0) return 'BANKER_OFFER_COUNTDOWN_ZERO';
    return cardsRemaining === 1 ? 'BANKER_OFFER_COUNTDOWN_SINGULAR' : 'BANKER_OFFER_COUNTDOWN_PLURAL';
  }

  setBankerOfferCountdown(cardsRemaining: number): void {
    const key = this.getCountdownKey(cardsRemaining);
    this.bankerOfferText.setText(languageManager.getText(key, { count: cardsRemaining }));
  }


  /**
   * REQ (transparencia de mecánicas): estado "lista" — se muestra durante
   * la pausa de 1.8s entre que se dispara 'BankerOfferMade' y el modal de
   * oferta realmente aparece (ver GameSceneController), en vez de saltar
   * directo a "en 3 cartas" (que ya corresponde al PRÓXIMO ciclo, no
   * tiene sentido mostrarlo mientras la oferta actual está a punto de
   * aparecer).
   */
  setBankerOfferReady(): void {
    this.bankerOfferText.setText(languageManager.getText('BANKER_OFFER_READY'));
  }
}