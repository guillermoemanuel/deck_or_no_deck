import Phaser from 'phaser';
import languageManager from '../../shared/i18n/LanguageManager';
import { PERIODIC_BONUS_COOLDOWN_MS } from '../../domain/value-objects/PeriodicBonus';
import { LocalizedText } from './LocalizedText';

/** Misma paleta "Casino de Lujo" que el resto de los modales del juego. */
const COLOR_GOLD = 0xffd76a;
const COLOR_GOLD_DIM = 0xd4af37;
const COLOR_GOLD_HEX = '#ffd76a';
const COLOR_WHITE_HEX = '#ffffff';
const COLOR_PANEL_BG = 0x0a0e17;
const FONT_FAMILY = 'Georgia, "Times New Roman", serif';

interface CardSlot {
  readonly container: Phaser.GameObjects.Container;
  readonly back: Phaser.GameObjects.Image;
  readonly front: Phaser.GameObjects.Image;
  readonly valueText: Phaser.GameObjects.Text;
  readonly glow: Phaser.GameObjects.Graphics;
  readonly hitZone: Phaser.GameObjects.Zone;
  /**
   * Valor NUMÉRICO original de la carta — fuente única de verdad para
   * acreditar el premio. El texto formateado (valueText) es solo
   * presentación (i18n) y JAMÁS debe re-parsearse para obtener el importe
   * (ver BUGFIX en activateFocusedCard).
   */
  readonly value: number;
}

export interface PeriodicBonusModalCallbacks {
  /**
   * Se dispara UNA vez, en el instante en que el jugador elige una carta
   * (antes de que cierre el modal) — quien orqueste (UIScene) debe
   * acreditar `value` de inmediato acá, no esperar a "Cerrar".
   */
  onCardChosen: (value: number) => void;
  /** Se dispara al presionar "Cerrar", ya con el premio revelado y acreditado. */
  onClose: () => void;
}

/**
 * PeriodicBonusModal: el modal de "elegí una carta" del bono periódico.
 *
 * Reutiliza las texturas GENÉRICAS 'card-back'/'card-front' — las mismas
 * que ya están cargadas para el mazo activo del jugador (ver
 * PreloadScene.preload()) — en vez de instanciar `CardView` (esa clase
 * está pensada para el tablero de juego real: conoce audio de
 * apertura, numeración de posición, y su ciclo de vida está atado a
 * GameSceneController; reutilizarla acá para 6 cartas puramente
 * decorativas de un modal de HUD sería acoplar dos responsabilidades
 * que no tienen por qué conocerse). Acá se implementa un flip mínimo y
 * autocontenido, suficiente para este único uso.
 */
export class PeriodicBonusModal extends Phaser.GameObjects.Container {
  private readonly slots: CardSlot[] = [];
  private resolved = false;
  // Teclado PC (Fase 3): callbacks guardados como campo para que
  // requestClose() delegue en callbacks.onClose — el MISMO camino de
  // cierre que el botón "Cerrar" interno, sin duplicar la lógica.
  private readonly callbacks: PeriodicBonusModalCallbacks;
  // Teclado PC (Fase 7): índice de la carta actualmente enfocada
  // (0 = primera carta, 5 = última). Se actualiza con flechas ←/→ y
  // se activa con ENTER — el mismo camino que el pointerup del ratón.
  private focusedCardIndex = 0;
  // Teclado PC (Fase 3): reveal pendiente de la carta elegida (el
  // delayedCall de handleCardPicked) — se cancela si el jugador cierra
  // con ESC dentro de la ventana de animación, o showResult() crearía el
  // texto de resultado y el botón "Cerrar" sobre un contenedor ya
  // destruido (UIScene lo destruye vía callbacks.onClose), filtrándolos
  // en la escena para siempre.
  private pendingRevealTimer: Phaser.Time.TimerEvent | null = null;

  constructor(scene: Phaser.Scene, values: readonly number[], callbacks: PeriodicBonusModalCallbacks) {
    const cx = scene.cameras.main.centerX;
    const cy = scene.cameras.main.centerY;
    super(scene, cx, cy);
    this.callbacks = callbacks;

    const backdrop = scene.add.rectangle(0, 0, scene.cameras.main.width * 2, scene.cameras.main.height * 2, 0x000000, 0.78).setInteractive();

    const panelWidth = Math.min(620, scene.cameras.main.width - 60);
    const panelBg = scene.add
      .rectangle(0, 0, panelWidth, 360, COLOR_PANEL_BG, 0.98)
      .setStrokeStyle(3, COLOR_GOLD_DIM, 0.9);

    const innerFrame = scene.add
      .rectangle(0, 0, panelWidth - 20, 340, 0x000000, 0)
      .setStrokeStyle(1, COLOR_GOLD, 0.35);

    // BUGFIX (i18n hardcodeado): este modal quedó afuera cuando el resto
    // de la UI migró a LocalizedText/languageManager — todos sus textos
    // estaban escritos en español a mano, sin traducir. Al ser un modal
    // efímero (se construye de cero cada vez que se abre, nunca queda
    // abierto entre cambios de idioma), alcanza con resolver el texto
    // UNA vez al crearlo — no hace falta la suscripción en caliente que
    // sí usa EnergyBarView (que vive durante toda la partida).
    const titleText = new LocalizedText(scene, 0, -115, 'PERIODIC_BONUS_TITLE', {
      fontSize: '24px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: COLOR_GOLD_HEX
    }).setOrigin(0.5);

    const subtitleText = new LocalizedText(scene, 0, -82, 'PERIODIC_BONUS_SUBTITLE', {
      fontSize: '17px',
      fontFamily: FONT_FAMILY,
      color: '#cbd5e1'
    }).setOrigin(0.5);

    this.add([backdrop, panelBg, innerFrame, titleText, subtitleText]);

    const cardSpacing = Math.min(95, (panelWidth - 60) / (values.length - 1));
    const startX = -((values.length - 1) * cardSpacing) / 2;

    values.forEach((value, index) => {
      const x = startX + index * cardSpacing;
      const slot = this.createCardSlot(scene, x, 20, value, () => this.handleCardPicked(scene, index, value, callbacks));
      this.slots.push(slot);
      this.add(slot.container);
    });

    // Foco inicial VISIBLE (Fase 7g-3): recién abierto ya hay una carta
    // enfocada (índice 0) resaltada con el MISMO glow que el hover del
    // ratón. Antes el foco existía en el estado pero solo se dibujaba
    // después de la primera flecha — el jugador no veía por qué ENTER
    // elegiría la carta 0.
    this.highlightFocusedCard();

    scene.add.existing(this);

    // Animación de entrada, misma familia que el resto de los modales del juego.
    this.setScale(0.2).setAlpha(0);
    scene.tweens.add({ targets: this, scale: 1, alpha: 1, duration: 220, ease: 'Back.easeOut' });
  }

  private createCardSlot(scene: Phaser.Scene, x: number, y: number, value: number, onPick: () => void): CardSlot {
    const w = 78;
    const h = 108;

    const container = scene.add.container(x, y);

    const glow = scene.add.graphics();
    glow.fillStyle(COLOR_GOLD, 0.35);
    glow.fillRoundedRect(-w / 2 - 6, -h / 2 - 6, w + 12, h + 12, 12);
    glow.setAlpha(0);

    const back = scene.add.image(0, 0, 'card-back').setDisplaySize(w, h);
    const front = scene.add.image(0, 0, 'card-front').setDisplaySize(w, h).setVisible(false);

    const valueText = scene.add
      .text(0, 0, `+$${value.toLocaleString()}`, {
        // QA de legibilidad: se queda en 16px (no 17, como el resto de
        // los textos "14px->17px" de este archivo) a propósito — la
        // carta mide apenas 78px de ancho y "+$5.000" (el valor más alto
        // del catálogo, ver PERIODIC_BONUS_VALUES) ya casi la llena a
        // 17px; 16px sigue muy por encima del piso de legibilidad
        // (10px reales @800x450) sin arriesgar que el número se salga
        // del borde de la carta.
        fontSize: '16px',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        color: COLOR_GOLD_HEX,
        stroke: '#000000',
        strokeThickness: 3,
        align: 'center'
      })
      .setOrigin(0.5)
      .setVisible(false);

    container.add([glow, back, front, valueText]);

    const hitZone = scene.add.zone(0, 0, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add(hitZone);

    hitZone.on('pointerover', () => {
      if (this.resolved) return;
      scene.tweens.add({ targets: container, scale: 1.08, duration: 100, ease: 'Cubic.easeOut' });
      scene.tweens.add({ targets: glow, alpha: 0.7, duration: 100 });
    });
    hitZone.on('pointerout', () => {
      if (this.resolved) return;
      scene.tweens.add({ targets: container, scale: 1, duration: 100, ease: 'Cubic.easeOut' });
      scene.tweens.add({ targets: glow, alpha: 0, duration: 100 });
      // BUGFIX (Fase 7g-3): al salir el puntero se apagaba el glow sin más,
      // incluso cuando ESA carta era la que tenía el foco de teclado — el
      // hover y el foco eran dos dueños del glow y se pisaban (foco invisible
      // apenas el mouse se movía). Se re-asserta el foco vigente tras el
      // apagado: si la carta saliente ES la enfocada, su glow vuelve al
      // estado de foco (0.7, mismo tween del hover); si no, queda en 0.
      if (this.slots[this.focusedCardIndex]?.glow === glow) {
        scene.tweens.add({ targets: glow, alpha: 0.7, duration: 100 });
      }
    });
    hitZone.on('pointerup', () => {
      if (this.resolved) return;
      onPick();
    });

    return { container, back, front, valueText, glow, hitZone, value };
  }

  private handleCardPicked(scene: Phaser.Scene, chosenIndex: number, value: number, callbacks: PeriodicBonusModalCallbacks): void {
    if (this.resolved) return; // Doble click protegido — solo se resuelve una vez.
    this.resolved = true;

    this.slots.forEach((slot, index) => {
      slot.hitZone.disableInteractive();
      if (index === chosenIndex) {
        this.flipCard(scene, slot);
      } else {
        // El resto de las cartas se apaga sin revelar su valor — el
        // jugador eligió una sola, no se muestra "lo que se perdió"
        // (mantiene la mecánica simple, tal como se pidió).
        scene.tweens.add({ targets: slot.container, alpha: 0.3, scale: 0.94, duration: 200 });
      }
    });

    // El premio se acredita YA, en el instante de la elección — "Cerrar"
    // más abajo solo cierra el modal, no condiciona si el premio se otorga.
    callbacks.onCardChosen(value);

    this.pendingRevealTimer = scene.time.delayedCall(420, () => {
      this.pendingRevealTimer = null;
      this.showResult(scene, value, callbacks.onClose);
    });
  }

  /**
   * Teclado PC (Fase 3): cierre vía teclado (ESC en UIScene) — delega en
   * `callbacks.onClose`, el MISMO camino que su botón "Cerrar" interno
   * (resume GameScene + destroy, orquestado por UIScene), sin duplicar
   * lógica. Sin sonido: cerrar es cancelar, no confirmar. También cancela
   * el reveal pendiente si el jugador cierra dentro de la ventana de
   * animación de 420 ms (ver pendingRevealTimer).
   */
  requestClose(): void {
    if (this.pendingRevealTimer) {
      this.pendingRevealTimer.destroy();
      this.pendingRevealTimer = null;
    }
    this.callbacks.onClose();
  }

  /**
   * Teclado PC (Fase 7g-3): índice de la carta actualmente enfocada
   * (0..5) — getter de observación, para que el spec pueda fijar el
   * contrato de foco sin tocar el estado interno.
   */
  getFocusedCardIndex(): number {
    return this.focusedCardIndex;
  }

  /**
   * Teclado PC (Fase 7): mueve el foco de carta una posición a la izqda
   * o drcha. Se detiene en el borde (índice 0 ó 5); no hay enrollamiento.
   * El resaltado usa el mismo glow que el hover del ratón, así el efecto
   * visual es idéntico tanto con puntero como con flechas.
   */
  moveFocus(dir: 'left' | 'right'): void {
    if (this.resolved) return; // modal ya resuelto → no mover foco
    if (dir === 'left') {
      if (this.focusedCardIndex > 0) this.focusedCardIndex--;
    } else {
      if (this.focusedCardIndex < this.slots.length - 1) this.focusedCardIndex++;
    }
    this.highlightFocusedCard();
  }

  /**
   * Teclado PC (Fase 7): activa la carta enfocada — idéntico efecto que
   * el `pointerup` del ratón: accredita el premio YA (mismo instante),
   * revela la carta, suena SFX.BONUS_CLAIM y muestra el resultado.
   * El foco se queda sobre la carta seleccionada (resolved=true) hasta
   * que el modal se cierre con ESC.
   */
  activateFocusedCard(): void {
    if (this.resolved) return; // ya se resolvió una vez
    const index = this.focusedCardIndex;
    // BUGFIX (Fase 7c — parseo del texto formateado): antes se re-parseaba
    // valueText ("+$5.000") con parseInt quitando '$' y comas — con locale
    // es-* el separador de miles es PUNTO, y parseInt("5.000") devolvía 5:
    // el teclado acreditaba 5 en vez de 5000 (el ratón, que pasaba el número
    // directo, estaba bien). El importe es el valor numérico original que ya
    // vive en el slot; el texto es solo presentación (i18n) y no se toca.
    const value = this.slots[index].value;
    // La carta se "elige": mismo camino que pointerup → handleCardPicked.
    // Pasamos el índice y el valor numérico puro.
    this.handleCardPicked(this.scene, index, value, this.callbacks);
    // Sonido: el ratón no suena al clickear una carta en el bono, pero el
    // teclado sí para paridad: SFX.BONUS_CLAIM (mismo que el banner del menú).
    try {
      this.scene.sound.play('sfx-bonus-claim');
    } catch {
      // Audio best-effort.
    }
  }

  /**
   * Teclado PC (Fase 7g-3): ENTER (ruteado por UIScene.handleEnterKey).
   *
   * - Sin resolver: elige la carta enfocada por el MISMO camino que su
   *   `pointerup` (activateFocusedCard → handleCardPicked).
   * - Ya entregado el premio: cierra por el MISMO camino que el botón
   *   "Cerrar" (requestClose → callbacks.onClose) — igual que ESC, así
   *   ENTER/ESC son intercambiables una vez revelado el premio.
   * Las flechas quedan inertes tras la entrega (guard `resolved` de
   * moveFocus): solo el premio se puede reclamar una vez.
   */
  handleEnterPressed(): void {
    if (this.resolved) {
      this.requestClose();
      return;
    }
    this.activateFocusedCard();
  }

  private highlightFocusedCard(): void {
    // BUGFIX (Fase 7g-3): este highlight aplicaba setAlpha(0.35) crudo a la
    // carta enfocada y setAlpha(0) a las demás, mientras el hover del ratón
    // tween-eaba a 0.7/100 ms — dos dueños del glow con efectos divergentes:
    // hover y foco solapados dejaban la carta en un alpha intermedio o
    // apagada. Dueño único: el foco usa EXACTAMENTE el mismo tween del
    // pointerover/pointerout (mismo alpha, duración y ausencia de ease).
    this.slots.forEach((slot, index) => {
      const isFocused = index === this.focusedCardIndex;
      this.scene.tweens.add({ targets: slot.glow, alpha: isFocused ? 0.7 : 0, duration: 100 });
    });
  }

  private flipCard(scene: Phaser.Scene, slot: CardSlot): void {
    scene.tweens.add({
      targets: slot.container,
      scaleX: 0,
      duration: 140,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        slot.back.setVisible(false);
        slot.front.setVisible(true);
        slot.valueText.setVisible(true);
        scene.tweens.add({ targets: slot.container, scaleX: 1.08, duration: 140, ease: 'Cubic.easeOut' });
        // Un par de pulsos de brillo, no infinitos (el modal cierra pronto).
        scene.tweens.add({
          targets: slot.glow,
          alpha: { from: 0.3, to: 0.9 },
          duration: 260,
          yoyo: true,
          repeat: 2,
          ease: 'Sine.easeInOut'
        });
      }
    });
  }

  private showResult(scene: Phaser.Scene, value: number, onClose: () => void): void {
    const resultMessage =
      value > 0
        ? languageManager.getText('PERIODIC_BONUS_WON', { amount: value.toLocaleString() })
        : languageManager.getText('PERIODIC_BONUS_NO_PRIZE', { hours: PERIODIC_BONUS_COOLDOWN_MS / (60 * 60 * 1000) });
    const resultText = scene.add
      .text(0, 99, resultMessage, {
        fontSize: '18px',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        color: value > 0 ? COLOR_GOLD_HEX : '#cbd5e1'
      })
      .setOrigin(0.5)
      .setAlpha(0);

    const closeBtn = this.createCloseButton(scene, 0, 140, onClose);

    this.add([resultText, closeBtn]);
    scene.tweens.add({ targets: resultText, alpha: 1, duration: 200 });
  }

  private createCloseButton(scene: Phaser.Scene, x: number, y: number, onClick: () => void): Phaser.GameObjects.Container {
    const width = 160;
    const height = 44;
    const container = scene.add.container(x, y).setScale(0).setAlpha(0);

    const glow = scene.add.graphics();
    glow.fillStyle(COLOR_GOLD, 0.4);
    glow.fillRoundedRect(-width / 2 - 8, -height / 2 - 8, width + 16, height + 16, 14);
    glow.setAlpha(0);

    const bg = scene.add.graphics();
    bg.fillStyle(0x121218, 0.95);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 10);
    bg.lineStyle(2, COLOR_GOLD_DIM, 0.9);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 10);

    const label = new LocalizedText(scene, 0, 0, 'PERIODIC_BONUS_CLOSE_BUTTON', {
      fontFamily: FONT_FAMILY,
      fontSize: '16px',
      fontStyle: 'bold',
      color: COLOR_WHITE_HEX
    }).setOrigin(0.5);

    container.add([glow, bg, label]);

    const hitZone = scene.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add(hitZone);

    hitZone.on('pointerover', () => {
      scene.tweens.add({ targets: container, scale: 1.05, duration: 120 });
      scene.tweens.add({ targets: glow, alpha: 1, duration: 120 });
    });
    hitZone.on('pointerout', () => {
      scene.tweens.add({ targets: container, scale: 1, duration: 120 });
      scene.tweens.add({ targets: glow, alpha: 0, duration: 120 });
    });
    hitZone.on('pointerup', () => onClick());

    scene.tweens.add({ targets: container, scale: 1, alpha: 1, duration: 180, ease: 'Back.easeOut' });

    return container;
  }
}