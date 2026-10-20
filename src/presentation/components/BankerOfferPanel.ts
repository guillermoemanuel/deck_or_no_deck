import Phaser from 'phaser';
import { BankerOffer } from '../../domain/services/Banker';
import { LocalizedText } from './LocalizedText';
import { TranslationKey } from '../../shared/i18n/LanguageData';
import { IAudioService } from '../../domain/ports/IAudioService';
import { SFX } from '../../shared/audio/AudioData';
import { FocusDirection } from '../input/KeyboardNavigation';

/** Misma paleta "Casino de Lujo" que MainMenuScene.ts / DeckSelectionScene.ts —
 * mismos valores hex, para que el modal del banquero se sienta parte del
 * mismo producto en vez de un estilo "arcade neón" aislado. */
const COLOR_GOLD = 0xffd76a;
const COLOR_GOLD_DIM = 0xd4af37;
const COLOR_GOLD_HEX = '#ffd76a';
const COLOR_WHITE_HEX = '#ffffff';
const COLOR_PANEL_BG = 0x0a0e17;
const FONT_FAMILY = 'Georgia, "Times New Roman", serif';

/**
 * BankerOfferPanel: modal de decision DEAL / NO DEAL.
 *
 * Características:
 * - Backdrop oscuro translúcido a pantalla completa.
 * - Marco "Casino de Lujo" (fondo carbón + doble borde dorado/metálico),
 *   coherente con MainMenuScene/DeckSelectionScene en vez del look
 *   "arcade neón" anterior.
 * - Animación elástica de entrada (pop-in con Back.easeOut).
 * - Monto de la oferta con conteo progresivo desde $0 + destello/pulso
 *   continuo al terminar, para ser el foco visual del modal.
 * - Botones DEAL / NO DEAL con la misma construcción (panel + halo + hover)
 *   que los botones del menú principal, diferenciados por colorimetría.
 * - Navegación de teclado (Fase 7g): flechas para posicionarse entre
 *   DEAL / NO DEAL + ENTER para activar el enfocado (ESC sigue siendo
 *   NO TRATO directo). El foco inicial es NO TRATO: sin mover las flechas,
 *   ENTER rechaza (acción segura); para aceptar hay que mover a DEAL con ←.
 */
export class BankerOfferPanel extends Phaser.GameObjects.Container {
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  private readonly panelBg: Phaser.GameObjects.Rectangle;
  // Clean Architecture: solo se conoce el puerto IAudioService, nunca la
  // clase concreta de infraestructura.
  private readonly audioService?: IAudioService;
  // Fase 5 (teclado PC): true en cuanto arranca el tween de salida (150 ms)
  // — por ratón O teclado — para que cualquier segundo intento durante esa
  // ventana sea no-op (ver onDealAccepted/onDealRejected).
  private exitStarted = false;
  // Fase 7g (teclado PC): índice del botón con foco de teclado — 0 = DEAL,
  // 1 = NO DEAL. Arranca en NO TRATO (foco seguro): ENTER sin mover las
  // flechas rechaza la oferta en vez de aceptarla por accidente.
  private focusedButtonIndex = 1;
  // Dueño único del efecto visual de encendido/apagado de cada botón
  // (mismo closure que usa el hover del ratón), guardado en orden de
  // creación: 0 = DEAL, 1 = NO DEAL. Así las flechas y el puntero
  // comparten UN solo efecto (mismo glow, misma duración 120 ms).
  private readonly buttonHighlights: ((on: boolean) => void)[] = [];

  constructor(scene: Phaser.Scene, offer: BankerOffer, audioService?: IAudioService, cappedRemainingGames: number | null = null) {
    const cx = scene.cameras.main.centerX;
    const cy = scene.cameras.main.centerY;

    super(scene, cx, cy);

    //Audio
    this.audioService = audioService;

    // Fondo atenuador de pantalla completa
    this.backdrop = scene.add
      .rectangle(0, 0, scene.cameras.main.width * 2, scene.cameras.main.height * 2, 0x000000, 0.75)
      .setInteractive();

    // Contenedor principal del modal: fondo carbón translúcido con borde
    // dorado — mismo lenguaje visual que los paneles del menú principal y
    // de selección de mazo, en vez del contorno neón verde anterior.
    this.panelBg = scene.add
      .rectangle(0, 0, 453, 453, COLOR_PANEL_BG, 0.98)
      .setStrokeStyle(3, COLOR_GOLD_DIM, 0.9);

    // Segundo borde interior, más fino, para un acabado "metálico" en
    // capas (misma técnica que el filo interior de los botones casino).
    const innerFrame = scene.add
      .rectangle(0, 0, 436, 436, 0x000000, 0)
      .setStrokeStyle(1, COLOR_GOLD, 0.35);

    // Resplandor exterior dorado
    const outerGlow = scene.add
      .rectangle(0, 0, 460, 460, COLOR_GOLD, 0)
      .setStrokeStyle(1, COLOR_GOLD, 0.4);

    // Retrato del banquero
    const portrait = scene.add.image(0, 0, 'banker-portrait').setScale(0.85);

    // Título con tipografía elegante, coherente con el resto de la UI.
    const titleText = new LocalizedText(this.scene, 0, 60, 'BANKER_OFFER_TITLE', {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        fontStyle: 'bold',
        color: COLOR_GOLD_HEX,
        backgroundColor: '#000000'
      })
      .setOrigin(0.5);

    // Halo detrás del monto — ver startOfferAmountPulse() para el pulso
    // continuo que lo convierte en el foco de atención inmediato.
    const offerGlow = scene.add.graphics();
    offerGlow.fillStyle(COLOR_GOLD, 0.48);
    offerGlow.fillRoundedRect(-110, 80, 220, 50, 20);
    offerGlow.lineStyle(2, COLOR_GOLD, 0.5);
    offerGlow.strokeRoundedRect(-110, 80, 220, 50, 20);

    const offerText = scene.add
      .text(0, 100, '$0', {
        fontFamily: FONT_FAMILY,
        fontSize: '38px',
        fontStyle: 'bold',
        color: COLOR_GOLD_HEX,
        stroke: '#000000',
        strokeThickness: 4
      })
      .setOrigin(0.5);

    this.animateOfferAmountCounter(offerGlow, offerText, offer.amount);

    // Botones DEAL / NO DEAL — misma construcción visual (panel + halo +
    // hover) que los botones casino de MainMenuScene, diferenciados por
    // colorimetría: verde esmeralda para DEAL, rojo carmesí (con halo
    // dorado en hover) para NO DEAL.
    const dealBtn = this.createArcadeButton(
      scene,
      -110,
      165,
      'BANKER_DEAL_BUTTON',
      0x00e676,
      0x5cffb0,
      () => this.onDealAccepted()
    );

    const noDealBtn = this.createArcadeButton(
      scene,
      110,
      165,
      'BANKER_NO_DEAL_BUTTON',
      0xff1744,
      0xff4d6d,
      () => this.onDealRejected()
    );

    // Fase 7g: foco de teclado visible desde la apertura sobre NO TRATO
    // (índice 1) — ENTER sin mover las flechas rechaza, que es la acción
    // segura; para aceptar hay que mover con ← y recién ahí ENTER.
    this.buttonHighlights[1]?.(true);

    // Aviso de la regla anti-farmeo (ADR-014): línea chica debajo de los
    // botones (terminan en y=189; el marco interior llega a 218) que avisa
    // que la oferta de la 1ª ronda está topeada y cuántas partidas más lo
    // estará. Solo lo envía GameSceneController cuando el monto es
    // realmente un valor del catálogo topado (ver ese archivo).
    const cappedNotice =
      cappedRemainingGames !== null && cappedRemainingGames > 0
        ? new LocalizedText(
            this.scene,
            0,
            204,
            cappedRemainingGames === 1 ? 'BANKER_CAPPED_NOTICE_SINGULAR' : 'BANKER_CAPPED_NOTICE_PLURAL',
            {
              fontFamily: FONT_FAMILY,
              fontSize: '13px',
              color: COLOR_GOLD_HEX,
              align: 'center',
              wordWrap: { width: 430 }
            },
            { n: cappedRemainingGames }
          ).setOrigin(0.5)
        : null;

    // Aviso topado visible (regla ADR-014 activa): el banquero "se molesta"
    // — el sonido va acá y no en un lugar genérico porque este bloque solo
    // se renderiza cuando la oferta es realmente la topada.
    if (cappedNotice) {
      try {
        this.audioService?.play(SFX.BANKER_ANNOYED);
      } catch {
        // Audio best-effort: nunca rompe el modal.
      }
    }

    this.add([
      this.backdrop,
      this.panelBg,
      innerFrame,
      outerGlow,
      portrait,
      titleText,
      offerGlow,
      offerText,
      dealBtn,
      noDealBtn,
      ...(cappedNotice ? [cappedNotice] : [])
    ]);
    scene.add.existing(this);

    // Animación de entrada
    this.setScale(0.2);
    this.setAlpha(0);
    scene.tweens.add({
      targets: this,
      scale: 1,
      alpha: 1,
      duration: 250,
      ease: 'Back.easeOut'
    });

    try {
      this.audioService?.play(SFX.OFFER);
    } catch {
      // Ignorar fallback de audio
    }
  }

  private onDealAccepted(): void {
    // Fase 5 (teclado PC): guarda de salida única compartida por ratón y
    // teclado — el ratón HOY puede doble-click (o clickear DEAL y NO DEAL
    // alternados) durante los 150 ms del tween de salida, mientras el panel
    // sigue interactivo; el teclado no debe empeorarlo, así que el flag se
    // setea en AMBOS handlers (accept/reject) y el segundo intento es no-op.
    if (this.exitStarted) return;
    this.exitStarted = true;
    this.animateExit(() => this.emit('deal-accepted'));
  }

  private onDealRejected(): void {
    // Misma guarda de salida única que onDealAccepted: cubre también el
    // rechazo para que ni ratón ni teclado puedan iniciar una segunda salida
    // (ni emitir 'deal-rejected' tras un 'deal-accepted' ya en curso).
    if (this.exitStarted) return;
    this.exitStarted = true;
    this.animateExit(() => this.emit('deal-rejected'));
  }

  /**
   * Fase 5 (teclado PC): ENTER = TRATO — MISMA cadena que el click de ratón
   * sobre DEAL (onDealAccepted → animateExit 150 ms → emit 'deal-accepted'
   * que recibe el `.once` del GameSceneController sin cambios).
   *
   * SILENCIOSO por paridad con el ratón: los botones NO tienen bindUiClick
   * (el sfx de este modal es el propio SFX.OFFER/BANKER_ANNOYED), así que el
   * teclado no agrega ningún sonido nuevo.
   */
  acceptFromKeyboard(): void {
    this.onDealAccepted();
  }

  /**
   * Fase 5 (teclado PC): ESC = NO TRATO — idéntico a acceptFromKeyboard
   * pero por la cadena de rechazo (onDealRejected → emit 'deal-rejected').
   * También silencioso: ver acceptFromKeyboard.
   */
  rejectFromKeyboard(): void {
    this.onDealRejected();
  }

  /**
   * Fase 7g (teclado PC): mueve el foco entre DEAL / NO DEAL con las
   * flechas. Posicionamiento absoluto sin wrap en ←/→ (left = DEAL 0,
   * right = NO DEAL 1: en el borde no hace nada) y alternancia en ↑/↓
   * (eje ambiguo entre dos botones, mismo precedente que el modal de
   * salida de UIScene). Si el índice resultante no cambia es no-op: no
   * se re-apaga/re-enciende nada. Una vez arrancada la salida
   * (exitStarted) las flechas quedan inertes, igual que los clicks.
   */
  moveFocus(dir: FocusDirection): void {
    if (this.exitStarted) return;
    let nextIndex: number;
    if (dir === 'left') nextIndex = 0;
    else if (dir === 'right') nextIndex = 1;
    else nextIndex = this.focusedButtonIndex === 0 ? 1 : 0;
    if (nextIndex === this.focusedButtonIndex) return;
    this.buttonHighlights[this.focusedButtonIndex]?.(false);
    this.buttonHighlights[nextIndex]?.(true);
    this.focusedButtonIndex = nextIndex;
  }

  /**
   * Fase 7g (teclado PC): ENTER activa el botón enfocado delegando en la
   * MISMA cadena que el click de ratón (índice 0 → onDealAccepted,
   * índice 1 → onDealRejected, ambas con el guard exitStarted). Sin
   * sonido por paridad con el ratón: los botones no tienen bindUiClick
   * (el sfx del panel es el SFX.OFFER, ver acceptFromKeyboard).
   */
  activateFocused(): void {
    if (this.exitStarted) return;
    if (this.focusedButtonIndex === 0) this.onDealAccepted();
    else this.onDealRejected();
  }

  /**
   * Fase 7g (teclado PC): observabilidad del índice con foco (0 = DEAL,
   * 1 = NO DEAL) para specs y escenas — la lógica de decisión vive en
   * moveFocus/activateFocused, acá solo se lee el estado.
   */
  getFocusedButtonIndex(): number {
    return this.focusedButtonIndex;
  }

  private animateExit(onComplete: () => void): void {
    this.scene.tweens.add({
      targets: this,
      scale: 0.8,
      alpha: 0,
      duration: 150,
      ease: 'Quad.easeIn',
      onComplete
    });
  }

  /**
   * Revelado del monto: arranca en $0 y hace un conteo progresivo
   * (`counter tween` sobre un objeto plano) hasta `offer.amount`,
   * actualizando el texto en cada `onUpdate` — misma técnica que
   * `GameSceneController.animateRevealedValueCounter()` para la cifra de
   * la carta descartada, ahora también acá. Al terminar el conteo arranca
   * el pulso continuo (`startOfferAmountPulse`) que mantiene la cifra
   * como foco de atención mientras el modal sigue en pantalla.
   */
  private animateOfferAmountCounter(
    glow: Phaser.GameObjects.Graphics,
    amountText: Phaser.GameObjects.Text,
    targetAmount: number
  ): void {
    const counter = { value: 0 };

    this.scene.tweens.add({
      targets: counter,
      value: targetAmount,
      duration: 500,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        amountText.setText(`$${Math.round(counter.value).toLocaleString()}`);
      },
      onComplete: () => {
        amountText.setText(`$${targetAmount.toLocaleString()}`);
        this.startOfferAmountPulse(glow, amountText);
      }
    });
  }

  /**
   * Destello/pulso continuo del monto de la oferta: el halo dorado detrás
   * del texto respira en alpha mientras el propio texto escala levemente,
   * en loop infinito (`yoyo`, `repeat: -1`) — convierte la cifra en el
   * punto focal inmediato del modal, tal como pide el diseño.
   */
  private startOfferAmountPulse(glow: Phaser.GameObjects.Graphics, amountText: Phaser.GameObjects.Text): void {
    this.scene.tweens.add({
      targets: glow,
      alpha: { from: 0.55, to: 1 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.scene.tweens.add({
      targets: amountText,
      scale: { from: 1, to: 1.06 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  private createArcadeButton(
    scene: Phaser.Scene,
    x: number,
    y: number,
    title: TranslationKey,
    primaryColor: number,
    hoverGlowColor: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const width = 200;
    const height = 48;

    const btnContainer = scene.add.container(x, y);

    // Halo externo, invisible en reposo, que se enciende en hover — misma
    // construcción que los botones casino de MainMenuScene/DeckSelectionScene.
    const glow = scene.add.graphics();
    glow.fillStyle(hoverGlowColor, 0.45);
    glow.fillRoundedRect(-width / 2 - 8, -height / 2 - 8, width + 16, height + 16, 16);
    glow.setAlpha(0);

    // Panel oscuro con borde de acento (color propio de cada acción) y un
    // filo dorado interior muy fino para el mismo acabado "premium".
    const bg = scene.add.graphics();
    bg.fillStyle(0x121218, 0.95);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 10);
    bg.lineStyle(2, primaryColor, 0.9);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 10);
    bg.lineStyle(1, COLOR_GOLD, 0.25);
    bg.strokeRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, height - 8, 8);

    const btnText = new LocalizedText(this.scene, 0, 0, title, {
        fontFamily: FONT_FAMILY,
        fontSize: '20px',
        fontStyle: 'bold',
        color: COLOR_WHITE_HEX
      })
      .setOrigin(0.5);

    btnContainer.add([glow, bg, btnText]);

    // Zona interactiva invisible del tamaño exacto del botón — reemplaza
    // al rectángulo de fondo interactivo anterior, ahora que el fondo
    // visual es Graphics (que no ofrece un hit-area rectangular directo
    // tan simple de mantener sincronizado).
    const hitZone = scene.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btnContainer.add(hitZone);

    // Dueño único del efecto visual de encendido/apagado (Fase 7g): el
    // MISMO closure sirve al hover del ratón y al foco de las flechas
    // (buttonHighlights), así no hay dos lógicas compitiendo por el glow
    // ni escalas/duraciones distintas. `on` true = encendido (scale 1.05 +
    // glow alpha 1), false = reposo — duración 120 ms en ambos sentidos.
    const highlight = (on: boolean): void => {
      scene.tweens.add({ targets: btnContainer, scale: on ? 1.05 : 1, duration: 120, ease: 'Cubic.easeOut' });
      scene.tweens.add({ targets: glow, alpha: on ? 1 : 0, duration: 120, ease: 'Cubic.easeOut' });
    };
    // Orden de creación = índice de foco: 0 = DEAL (se crea primero), 1 = NO DEAL.
    this.buttonHighlights.push(highlight);

    hitZone.on('pointerover', () => highlight(true));
    hitZone.on('pointerout', () => highlight(false));

    hitZone.on('pointerup', () => {
      scene.tweens.add({
        targets: btnContainer,
        scale: 0.95,
        duration: 50,
        yoyo: true,
        onComplete: onClick
      });
    });

    return btnContainer;
  }
}