import Phaser from 'phaser';
import { CardDTO } from '../../application/dto/GameStateDTO';
import { ParticleManager } from './ParticleManager';
import { IAudioService } from '../../domain/ports/IAudioService';
import { isHighCaseValue } from '../../domain/value-objects/CaseValues';
/**
 * CardView: Componente visual tonto en Phaser 3 para renderizar una carta del juego.
 *
 * Características AAA:
 * - Simulación de giro 3D avanzado con tweens de escala X/Y y perspectiva.
 * - Estados hover con micro-animaciones elásticas y brillo arcade.
 * - Soporte para partículas al revelarse mediante ParticleManager.
 * - Formateo monetario arcade de alto impacto visual.
 */
export class CardView extends Phaser.GameObjects.Container {
  private readonly cardSprite: Phaser.GameObjects.Image;
  private readonly glowBorder: Phaser.GameObjects.Rectangle;
  private readonly valueText: Phaser.GameObjects.Text;
  private readonly positionLabel: Phaser.GameObjects.Text;
  private isRevealed = false;

  // BUGFIX (bug_card_focus): escala "de reposo" real de la carta en su
  // posición actual del layout (0.82 en la grilla de selección, 0.88 en el
  // tablero, 0.9 en el pedestal, etc). El hover debe volver EXACTAMENTE a
  // este valor al salir — nunca a un 1.0 fijo, que ignoraba la escala que
  // la escena le había asignado y dejaba la carta más grande que su tamaño
  // original tras el primer hover.
  private initialScale = 1;
  private displayNumber: number | null = null;

  private particleManager: ParticleManager | null = null;
  // Clean Architecture: CardView (capa de presentación) solo conoce el
  // puerto IAudioService — nunca la clase concreta de infraestructura.
  private readonly audioService?: IAudioService;

  //Color del número de posición del reverso, resuelto por el mazo
  private readonly numberColor: string;
  private readonly glowBorderSelect: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly cardId: string,
    audioService?: IAudioService,
    particleManager?: ParticleManager,
    displayNumber?: number,
    numberColor?: string,
    glowBorderSelect?: number
  ) {
    super(scene, x, y);
    this.particleManager = particleManager ?? null;
    this.displayNumber = displayNumber ?? null;
    this.audioService = audioService;
    this.numberColor = numberColor ?? '#f39c12';
    this.glowBorderSelect = glowBorderSelect ?? 0x00e5ff;

    // Resplandor neón perimetral
    this.glowBorder = scene.add
      .rectangle(0, 0, 126, 174, 0x00ffff, 0)
      .setStrokeStyle(3, 0x00e5ff, 0);

    this.cardSprite = scene.add
      .image(0, 0, 'card-back')
      .setInteractive({ useHandCursor: true });

    // Numero de posicion en el reverso ("maletin #N"): ayuda al jugador a
    // identificar cada carta sin revelar su valor — reemplaza el "?" generico.
    this.positionLabel = scene.add
      .text(0, 0, this.displayNumber !== null ? `#${this.displayNumber}` : '', {
        fontSize: '30px',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        color: this.numberColor,
        stroke: '#000000',
        strokeThickness: 3
      })
      .setOrigin(0.5)
      .setVisible(this.displayNumber !== null);

    this.valueText = scene.add
      .text(0, 0, '', {
        fontSize: '24px',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3
      })
      .setOrigin(0.5)
      .setVisible(false);

    this.add([this.glowBorder, this.cardSprite, this.positionLabel, this.valueText]);
    scene.add.existing(this);

    this.setupInteractivity();
    
  }

  /**
   * BUGFIX (bug_card_focus): reemplaza a las llamadas directas de
   * `setScale()` que la escena hace al posicionar la carta en cada fase del
   * layout (selección, tablero, pedestal). Además de aplicar la escala
   * visual, la registra como `initialScale` — la referencia real a la que
   * el hover debe volver al salir.
   */
  setBaseScale(scale: number): void {
    this.initialScale = scale;
    this.setScale(scale);
  }

  private setupInteractivity(): void {
    this.cardSprite.on('pointerover', () => {
      if (this.isRevealed) return;
      this.glowBorder.setStrokeStyle(3, this.glowBorderSelect, 0.9);
      this.scene.tweens.add({
        targets: this,
        // Crecimiento relativo a la escala base real de la carta, no a un
        // valor absoluto fijo (evita saltos de tamaño inconsistentes entre
        // cartas con distinta escala de reposo).
        scale: this.initialScale * 1.06,
        duration: 120,
        ease: 'Cubic.easeOut'
      });
    });

    this.cardSprite.on('pointerout', () => {
      if (this.isRevealed) return;
      this.glowBorder.setStrokeStyle(3, 0x00e5ff, 0);
      this.scene.tweens.add({
        targets: this,
        // BUGFIX (bug_card_focus): vuelve exactamente a la escala base
        // guardada — antes volvía siempre a 1.0, mayor que la escala real
        // de reposo (0.82/0.88/0.9), dejando la carta agrandada para siempre.
        scale: this.initialScale,
        duration: 120,
        ease: 'Cubic.easeOut'
      });
    });

    this.cardSprite.on('pointerup', () => {
      this.emit('card-clicked', this.cardId);
    });
  }

  setParticleManager(pm: ParticleManager): void {
    this.particleManager = pm;
  }

  /** Obtiene el id de la carta asociada a esta vista. */
  getCardId(): string {
    return this.cardId;
  }

  /** Expone si la carta ya fue revelada — usado para evitar reabrir/reintercambiar una carta ya resuelta. */
  isCardOpen(): boolean {
    return this.isRevealed;
  }

  /** Numero de posicion actualmente mostrado en el reverso (o null si no aplica). */
  getDisplayNumber(): number | null {
    return this.displayNumber;
  }

  /**
   * BUGFIX (bug_secret_card_swap): reasigna el numero de posicion mostrado
   * en el reverso. Se usa cuando el pedestal de la Carta Secreta adopta la
   * identidad de la carta del tablero elegida en un intercambio — sin esto,
   * el pedestal seguia mostrando el numero de la carta secreta ORIGINAL
   * (texto nunca actualizado) aunque la textura/valor si se refrescaban.
   */
  setPositionNumber(displayNumber: number): void {
    this.displayNumber = displayNumber;
    this.positionLabel.setText(`#${displayNumber}`);
    this.positionLabel.setVisible(!this.isRevealed);
  }

  applyState(dto: CardDTO): void {
    if (dto.isOpen && !this.isRevealed) {
      this.reveal(dto.value ?? 0);
    }
    if (dto.isOpen) {
      // BUG CORREGIDO: `setInteractive(undefined)` NO deshabilita la interactividad
      // en Phaser (solo reaplica la config existente) — dejaba la carta "clickeable"
      // aun revelada, lo que rompia el flujo (throw al reabrir una carta ya abierta).
      this.cardSprite.disableInteractive();
    } else {
      this.cardSprite.setInteractive({ useHandCursor: true });
    }
  }

  revealValue(value: number): void {
    if (this.isRevealed) return;
    this.reveal(value);
  }

  /**
   * Giro 3D simulado en 2 etapas:
   * 1. Colapso en X a 0 con expansión sutil en Y (efecto perspectiva hacia el jugador).
   * 2. Cambio de textura a frontal, inserción del texto y expansión en X con rebote Back.easeOut.
   */
  private reveal(value: number): void {
    this.isRevealed = true;
    this.glowBorder.setStrokeStyle(3, 0x00e5ff, 0);
    this.positionLabel.setVisible(false);

    // BUGFIX (glitch de flip — CardView.ts:L215): antes del click en esta
    // MISMA carta pasar por aquí una segunda vez ya estaba cubierto por el
    // guard `isRevealed` de revealValue()/applyState(), pero el sprite
    // seguía interactivo durante los ~360ms del giro entero (esta función
    // nunca llamaba a disableInteractive() por sí misma — solo lo hacía
    // applyState() DESPUÉS, en un ciclo de sync posterior). Se deshabilita
    // ya mismo, al arrancar el giro, en vez de esperar a ese sync externo.
    this.cardSprite.disableInteractive();

    this.scene.tweens.add({
      // BUGFIX (glitch de flip): se tweenea el CONTENEDOR entero (`this`),
      // no solo `cardSprite`. `valueText` es un HERMANO de `cardSprite`
      // dentro de este mismo Container (ver el `this.add([...])` del
      // constructor) — al animar solo `cardSprite`, `valueText` quedaba
      // siempre a escala 1:1 fija. Cuando `onComplete` lo hacía visible
      // (exactamente al terminar esta primera mitad del giro, con el
      // contenedor en su punto más colapsado), aparecía de golpe a tamaño
      // completo sobre una carta invisible/de canto — un artefacto visual
      // de este mismo tramo de 160ms. Tweeneando el contenedor, `valueText`
      // escala EN SINCRONÍA con `cardSprite` sin código extra.
      //
      // Los valores respetan `initialScale` (la escala de reposo real del
      // layout — 0.82 en la grilla de selección, 0.88 en el tablero, 0.9
      // en el pedestal — ver setBaseScale()), igual que ya hace el tween
      // de hover más arriba: tweenear el contenedor a scaleX/scaleY
      // absolutos de 0/1 lo habría reseteado a esa escala fija de 1.0 al
      // terminar el giro, deshaciendo el layout.
      targets: this,
      scaleX: 0,
      scaleY: this.initialScale * 1.12,
      duration: 160,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.cardSprite.setTexture('card-front');
        const formatted = `$${value.toLocaleString()}`;
        this.valueText.setText(formatted).setVisible(true);

        const isHigh = isHighCaseValue(value);
        this.valueText.setColor(isHigh ? '#ff4d6d' : '#38ef7d');

        this.scene.tweens.add({
          targets: this,
          scaleX: this.initialScale,
          scaleY: this.initialScale,
          duration: 200,
          ease: 'Back.easeOut',
          onComplete: () => {
            if (this.particleManager) {
              this.particleManager.emitCardRevealBurst(this.x, this.y, isHigh);
            }
          }
        });
      }
    });

    try {
      this.audioService?.play('sfx-card-open');
    } catch {
      // Audio fallback
    }
  }

  resetAsFaceDown(): void {
    this.isRevealed = false;
    // BUGFIX (flip ahora anima el contenedor, no cardSprite): si esto se
    // llama mientras el giro de reveal() todavía está animando `this`
    // (p. ej. una baraja que reutiliza CardViews), hay que cortar ese
    // tween y devolver el contenedor a su escala de REPOSO real — nunca a
    // 1.0 fijo, que rompería el tamaño de layout en grillas con escala
    // distinta de 1 (selección/tablero/pedestal — ver setBaseScale()).
    this.scene.tweens.killTweensOf(this);
    this.setScale(this.initialScale);
    this.cardSprite.setTexture('card-back');
    this.valueText.setVisible(false);
    this.positionLabel.setVisible(this.displayNumber !== null);
    this.glowBorder.setStrokeStyle(3, 0x00e5ff, 0);
    this.cardSprite.setInteractive({ useHandCursor: true });
  }

  setLocked(locked: boolean): void {
    if (locked) {
      this.cardSprite.disableInteractive();
      this.glowBorder.setStrokeStyle(3, 0x00e5ff, 0);
    } else if (!this.isRevealed) {
      this.cardSprite.setInteractive({ useHandCursor: true });
    }
  }
}
