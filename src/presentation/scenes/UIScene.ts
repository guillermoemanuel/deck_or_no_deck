import Phaser from 'phaser';
import { getServices } from '../GameServices';
import { ProgressionEvent } from '../../domain/events/ProgressionEvents';
import { deactivateGameAbandonGuard, isGameAbandonGuardActive } from '../GameAbandonGuard';
import { LOSS_PENALTY_AMOUNT } from '../../domain/value-objects/GamePenalties';
import { LocalizedText } from '../components/LocalizedText';
import { TranslationKey } from '../../shared/i18n/LanguageData';
import languageManager from '../../shared/i18n/LanguageManager';
import { PeriodicBonusModal } from '../components/PeriodicBonusModal';
import { PeriodicBonusStatus } from '../../domain/value-objects/PeriodicBonus';
import { HudIconButton } from '../components/HudIconButton';
import { SoundFullscreenControls } from '../components/SoundFullscreenControls';

/** Misma paleta "Casino de Lujo" que MainMenuScene.ts / BankerOfferPanel.ts /
 * ResultScene.ts / SwapEventModal.ts — mismos valores hex, para que el
 * modal de confirmación se sienta parte del mismo show. */
const COLOR_GOLD = 0xffd76a;
const COLOR_GOLD_DIM = 0xd4af37;
const COLOR_GOLD_HEX = '#ffd76a';
const COLOR_LOSS_ACCENT = 0xff4d6d;
const COLOR_NEUTRAL = 0x5a5a66;
const COLOR_NEUTRAL_GLOW = 0xd8d8de;
const COLOR_PANEL_BG = 0x0a0e17;
const COLOR_WHITE_HEX = '#ffffff';
const FONT_FAMILY = 'Georgia, "Times New Roman", serif';

/** Layout del renglón superior de botones-ícono del HUD (Bono / Tienda /
 * Salir): mismo tamaño cuadrado, mismo espaciado, misma Y — anclado al
 * borde derecho de la cámara. Se recalcula en cada resize (ver
 * layoutTopRightRow()). Sonido/Pantalla Completa viven en su propio
 * renglón, anclado a la esquina inferior derecha, resuelto por el
 * componente compartido SoundFullscreenControls (ver más abajo) — así
 * MainMenuScene/HowToPlayScene/DeckSelectionScene/UIScene comparten
 * EXACTAMENTE el mismo comportamiento en vez de cuatro copias del mismo
 * layout. */
const HUD_BUTTON_SIZE = 48; // >= 44px táctil (REQ 2), ya lo fuerza HudIconButton igual
const HUD_BUTTON_GAP = 14; // separación horizontal proporcional entre botones de un renglón
const HUD_EDGE_MARGIN = 20; // distancia del borde del botón al borde de la cámara
const HUD_TOP_ROW_Y = HUD_EDGE_MARGIN + HUD_BUTTON_SIZE / 2; // Container = origen central

/**
 * Escena superpuesta (launch, no start) para HUD que no debe reiniciarse
 * cada vez que GameScene recarga una nueva partida.
 
 * Incluye el botón "Salir / Menú" con su modal de confirmación, y el
 * disparo VOLUNTARIO del sistema Anti-Cheat de penalización por abandono
 * (-5000, ver GameAbandonGuard.ts para el ciclo de vida completo del flag
 * y su contraparte de abandono FORZADO en main.ts's `beforeunload`).
 */
export class UIScene extends Phaser.Scene {
  private coinsText!: Phaser.GameObjects.Text;
  private unsubscribe: (() => void) | null = null;
  private exitModal: Phaser.GameObjects.Container | null = null;
  private bonusModal: Phaser.GameObjects.Container | null = null;
  private bonusRefreshTimer: Phaser.Time.TimerEvent | null = null;

  // Botones-ícono del renglón superior (Bono / Tienda / Salir) — se
  // necesitan guardados como referencias, no solo creados al vuelo, para
  // poder reposicionarlos en cada resize del ScaleManager
  // (layoutTopRightRow()) y para poder destruirlos explícitamente en el
  // shutdown de la escena.
  private tiendaButton!: HudIconButton;
  private salirButton!: HudIconButton;
  private bonusButton!: HudIconButton;
  // Renglón inferior (Sonido / Pantalla Completa) — componente
  // compartido con MainMenuScene/HowToPlayScene/DeckSelectionScene, ver
  // SoundFullscreenControls.ts.
  private hudControls!: SoundFullscreenControls;

  // Bound una sola vez en create() para poder hacer `off()` con la MISMA
  // referencia en shutdown() — pasar una arrow function nueva a `off()`
  // no desengancharía nada (ver requisito de limpieza de listeners).
  private readonly handleScaleResize = (gameSize: Phaser.Structs.Size): void => {
    this.layoutTopRightRow(gameSize.width);
  };
  // Desuscripción de LanguageManager (ver create()/shutdown()) — mismo
  // motivo/patrón que `unsubscribe` (ProgressionManager) más abajo: se
  // guarda la función de desuscripción, no un booleano ni una referencia
  // de listener suelta, porque LanguageManager expone `onLanguageChanged`
  // con ese contrato (ver LanguageManager.ts).
  private unsubscribeLanguage: (() => void) | null = null;

  constructor() {
    super({ key: 'UIScene' });
  }

  create(): void {
    const services = getServices(this);

    this.coinsText = this.add.text(20, 20, this.formatCoins(services.progressionManager.getCoins()), {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: '#f1c40f'
    });

    // Renglón superior — Bono / Tienda / Salir. Posición real (x,y) la
    // resuelve layoutTopRightRow() más abajo; acá solo se instancian.
    // Cada botón lleva su descripción como `label` (REQ: "agregar a
    // cada botón la descripción a su lado").
    this.tiendaButton = new HudIconButton(this, 0, 0, 'hud-shop', () => this.scene.launch('ShopScene'), {
      size: HUD_BUTTON_SIZE,
      label: languageManager.getText('HUD_SHOP')
    });

    // Botón "Salir / Menú" — mismo renglón que "Tienda" (el modal de
    // confirmación, no este botón disparador, es quien lleva el
    // tratamiento visual completo "Casino de Lujo").
    this.salirButton = new HudIconButton(this, 0, 0, 'hud-exit', () => this.showExitConfirmationModal(), {
      size: HUD_BUTTON_SIZE,
      label: languageManager.getText('HUD_EXIT')
    });

    // Botón "Bono Periódico" — ícono fijo; su ESTADO (cuenta regresiva /
    // disponible) se comunica con el `label` (countdown ó "¡Bonus!") +
    // setIconAlpha(), no cambiando de textura. Ver refreshBonusButton().
    // Si está 'locked', el propio botón queda deshabilitado
    // (setEnabled(false)) — antes el click en 'locked' simplemente no
    // hacía nada, ahora además no reacciona visualmente al hover,
    // comunicando lo mismo con más claridad. El label arranca vacío:
    // refreshBonusButton() lo completa apenas termina create().
    this.bonusButton = new HudIconButton(this, 0, 0, 'hud-bonus', () => this.tryOpenBonusModal(services), {
      size: HUD_BUTTON_SIZE,
      label: ''
    });

    // Renglón inferior — Sonido / Pantalla Completa, esquina INFERIOR
    // derecha: componente compartido (ver SoundFullscreenControls.ts),
    // el MISMO que usan MainMenuScene/HowToPlayScene/DeckSelectionScene,
    // para mantener coherencia total en todo el juego.
    this.hudControls = new SoundFullscreenControls(this, services.audioService, services.fullscreenEnabled);

    // Posiciona el renglón superior por primera vez, y lo vuelve a
    // calcular en cada resize del canvas/iframe (activar/desactivar
    // fullscreen desde el wrapper de CrazyGames, redimensionar la
    // ventana, etc.) — REQ 4: espaciado horizontal proporcional e igual
    // altura Y dentro del renglón, adaptado al tamaño actual del canvas.
    // El renglón inferior se recalcula solo, dentro de `hudControls`.
    this.layoutTopRightRow(this.scale.gameSize.width);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleResize);
    // REQ (bono periódico): si el ciclo anterior expiró sin reclamarse,
    // se resuelve UNA vez acá, al entrar a la partida — arranca un nuevo
    // ciclo de 12hs desde ahora. Ver ProgressionManager.resolvePeriodicBonusExpiry()
    // y PeriodicBonus.ts para el porqué de este diseño (no es un simple
    // "queda disponible para siempre": dejarlo expirar cuesta otra espera
    // completa, lo cual empuja a volver a jugar dentro de la ventana).
    services.progressionManager.resolvePeriodicBonusExpiry();
    this.refreshBonusButton(services);
    // La cuenta regresiva no necesita precision de frame — se refresca
    // cada 30s, liviano y suficiente para un timer de horas.
    this.bonusRefreshTimer = this.time.addEvent({
      delay: 30000,
      loop: true,
      callback: () => {
        services.progressionManager.resolvePeriodicBonusExpiry();
        this.refreshBonusButton(services);
      }
    });


    // Reactivo, no polling: se actualiza exactamente cuando ProgressionManager
    // emite un cambio real (compra en tienda, premio de partida).
    this.unsubscribe = services.progressionManager.onEvent((event: ProgressionEvent) => {
      if (event.type === 'CoinsChanged') {
        this.animateCoinsUpdate(event.newTotal, event.delta);
      }
    });

    // REQ i18n: reactividad en tiempo real — Tienda/Salir se re-etiquetan
    // de inmediato, y el botón de Bono se resuelve vía refreshBonusButton
    // (que además reacomoda el renglón, ya que el ancho de cada etiqueta
    // cambia de un idioma a otro). LanguageManager es un singleton de
    // módulo (sobrevive a esta escena) — por eso se guarda y desengancha
    // `unsubscribeLanguage` explícitamente en SHUTDOWN, igual que
    // `handleScaleResize` con el ScaleManager más abajo.
    this.unsubscribeLanguage = languageManager.onLanguageChanged(() => {
      this.tiendaButton.setLabel(languageManager.getText('HUD_SHOP'));
      this.salirButton.setLabel(languageManager.getText('HUD_EXIT'));
      this.refreshBonusButton(services);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.unsubscribeLanguage?.();
      this.unsubscribeLanguage = null;
      this.bonusRefreshTimer?.destroy();
      this.bonusRefreshTimer = null;
      // Limpieza de listeners del ScaleManager (REQ): a diferencia de los
      // listeners de `this.events`/`this.tweens`, los de `this.scale`
      // NO se destruyen solos con la escena — el ScaleManager vive a
      // nivel Game, así que un `on()` sin su `off()` acá quedaría
      // apilando callbacks de una UIScene ya destruida en cada
      // reingreso a partida, filtrando memoria y disparando lógica
      // sobre GameObjects ya inexistentes.
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleResize);
      // REQ 2/técnico: limpieza explícita de los botones-ícono del HUD
      // (y sus listeners pointerover/pointerout/pointerdown internos, ver
      // HudIconButton.destroy()) al apagar la escena.
      this.tiendaButton.destroy();
      this.salirButton.destroy();
      this.bonusButton.destroy();
      // Sonido/Pantalla Completa + sus propios listeners del ScaleManager
      // (ver SoundFullscreenControls.destroy()).
      this.hudControls.destroy();
      // Red de seguridad: si esta escena se cierra por cualquier vía
      // mientras el modal seguía abierto, GameScene no debe quedar
      // congelada para siempre (scene.pause() sin su scene.resume()).
      if (this.exitModal || this.bonusModal) {
        this.scene.resume('GameScene');
        this.exitModal = null;
        this.bonusModal = null;
      }
    });
  }

  /**
   * Recalcula la posición del renglón superior de HUD (Bono / Tienda /
   * Salir), anclado al borde derecho de la cámara — sin tocar el
   * renglón inferior de Sonido/Pantalla Completa (resuelto aparte por
   * SoundFullscreenControls, ver `hudControls`). Coloca cada botón de
   * derecha a izquierda usando su `getTotalWidth()` real (ícono +
   * descripción), así ningún botón se superpone con el anterior sin
   * importar cuánto mida su texto en ese momento (countdown de Bono,
   * p. ej.). Se llama una vez al crear la escena, en cada evento
   * `resize` del ScaleManager, y de nuevo cada vez que cambia el texto
   * de algún botón de este renglón (REQ 1 y REQ 4).
   */
  private layoutTopRightRow(width: number): void {
    let rightEdge = width - HUD_EDGE_MARGIN;
    rightEdge = this.placeIconRightToLeft(this.salirButton, rightEdge, HUD_TOP_ROW_Y);
    rightEdge = this.placeIconRightToLeft(this.tiendaButton, rightEdge, HUD_TOP_ROW_Y);
    this.placeIconRightToLeft(this.bonusButton, rightEdge, HUD_TOP_ROW_Y);
  }

  /**
   * Igual criterio que layoutTopRightRow() (derecha a izquierda, según
   * `getTotalWidth()` real de cada botón) — la implementación para
   * "Sonido"/"Pantalla Completa" vive ahora en el componente compartido
   * SoundFullscreenControls, no acá.
   */
  private placeIconRightToLeft(button: HudIconButton, rightEdge: number, y: number): number {
    const iconCenterX = rightEdge - HUD_BUTTON_SIZE / 2;
    button.setPosition(iconCenterX, y);
    return rightEdge - button.getTotalWidth() - HUD_BUTTON_GAP;
  }

  /**
   * Actualiza el estado visual del botón "Bono" (el ícono bonus.png es
   * fijo, ver REQ 3): mientras está 'locked' muestra countdown + ícono
   * atenuado + botón deshabilitado; al pasar a 'available' muestra
   * "¡Bonus!" + ícono a color pleno + botón habilitado. Reacomoda el
   * renglón superior porque el countdown cambia de ancho en cada
   * refresh. ('expired' no debería observarse acá — se resuelve en el
   * mismo instante en que se detecta, ver resolvePeriodicBonusExpiry()
   * llamado justo antes de cada refresh — pero se contempla igual por
   * las dudas de una carrera entre el timer de 30s y el reloj real).
   */
  private refreshBonusButton(services: ReturnType<typeof getServices>): void {
    const status: PeriodicBonusStatus = services.progressionManager.getPeriodicBonusStatus();
    if (status.state === 'available') {
      // REQ i18n: reemplaza el literal '¡Bonus!' — HUD_BONUS ("Bono"/
      // "Bonus") es la clave más cercana del diccionario centralizado
      // para el estado "disponible" de este botón; el estado 'locked'
      // sigue mostrando el countdown formateado (no es un string de UI
      // traducible, son minutos/horas calculados en runtime, ver
      // formatBonusCountdown()).
      this.bonusButton.setLabel(languageManager.getText('HUD_BONUS'));
      this.bonusButton.setLabelColor(COLOR_GOLD_HEX);
      this.bonusButton.setIconAlpha(1);
      this.bonusButton.setEnabled(true);
    } else {
      const remainingMs = Math.max(0, status.availableAt - Date.now());
      this.bonusButton.setLabel(this.formatBonusCountdown(remainingMs));
      this.bonusButton.setLabelColor('#8b949e');
      this.bonusButton.setIconAlpha(0.55);
      this.bonusButton.setEnabled(false);
    }
    this.layoutTopRightRow(this.scale.gameSize.width);
  }
  private formatBonusCountdown(ms: number): string {
    const totalMinutes = Math.ceil(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }
  /**
   * Abre el modal del bono SOLO si el estado vigente es 'available' — si
   * el jugador clickea mientras está 'locked' no pasa nada (además, el
   * botón ya está deshabilitado en ese estado, ver refreshBonusButton()).
   * Misma exclusión mutua con el modal de salida, y mismo patrón de
   * pausar GameScene mientras decide, que showExitConfirmationModal().
   */
  private tryOpenBonusModal(services: ReturnType<typeof getServices>): void {
    if (this.exitModal || this.bonusModal) return;
    const status = services.progressionManager.getPeriodicBonusStatus();
    if (status.state !== 'available') return;
    this.scene.pause('GameScene');
    const values = services.progressionManager.generatePeriodicBonusCardValues();
    this.bonusModal = new PeriodicBonusModal(this, values, {
      onCardChosen: value => {
        // Se acredita YA (mismo instante de la elección) — ver el
        // comentario en PeriodicBonusModal.handleCardPicked().
        services.progressionManager.claimPeriodicBonus(value);
        this.refreshBonusButton(services);
      },
      onClose: () => {
        this.scene.resume('GameScene');
        this.bonusModal?.destroy();
        this.bonusModal = null;
      }
    });
  }

  private animateCoinsUpdate(newTotal: number, delta: number): void {
    this.coinsText.setText(this.formatCoins(newTotal));

    if (delta > 0) {
      this.tweens.add({
        targets: this.coinsText,
        scale: { from: 1.3, to: 1 },
        duration: 200,
        ease: 'Back.easeOut'
      });
    }
  }

  private formatCoins(amount: number): string {
    return `💰 ${amount.toLocaleString()}`;
  }

  /**
 
   * Modal de confirmación "Salir al Menú" — estética "Casino de Lujo"
   * coherente con BankerOfferPanel/ResultScene/SwapEventModal (panel
   * carbón + doble borde dorado/metálico).
   *
   * Mientras está abierto se PAUSA GameScene (`scene.pause`), no solo se
   * bloquean sus clicks: así "Cancelar" garantiza que el juego reanuda
   * EXACTAMENTE en el mismo estado — ninguna animación, timer ni input
   * del tablero avanzó mientras el jugador decidía.
   */
  private showExitConfirmationModal(): void {
    if (this.exitModal || this.bonusModal) return; // Ya hay un modal abierto — evita apilar dos
    this.scene.pause('GameScene');
    const { width, height } = this.cameras.main;
    const cx = width / 2;
    const cy = height / 2;
    // Trazabilidad del flag de estado de partida: se decide el mensaje a
    // mostrar (y si corresponde advertir sobre la penalización) leyendo
    // `isGameAbandonGuardActive` — si el jugador todavía está en la fase
    // de elegir su Carta Secreta (antes de que GameScene active el guard
    // en onSecretCardChosen), o si la partida ya se resolvió y solo queda
    // el modal de ResultScene abierto (el guard ya fue desactivado por
    // GameSceneController), salir NO cuesta nada — y el modal lo dice.
    const willBePenalized = isGameAbandonGuardActive(this.registry);
    const backdrop = this.add.rectangle(cx, cy, width * 2, height * 2, 0x000000, 0.7).setInteractive();
    const panelBg = this.add
      .rectangle(cx, cy, 480, willBePenalized ? 230 : 200, COLOR_PANEL_BG, 0.98)
      .setStrokeStyle(3, COLOR_GOLD_DIM, 0.9);
    const innerFrame = this.add
      .rectangle(cx, cy, 460, willBePenalized ? 210 : 180, 0x000000, 0)
      .setStrokeStyle(1, COLOR_GOLD, 0.35);
    const titleText = new LocalizedText(this, cx, cy - (willBePenalized ? 75 : 60), 'GAME_ABANDON_EXIT_TITLE', {
      fontSize: '22px',
      fontFamily: FONT_FAMILY,
      fontStyle: 'bold',
      color: COLOR_GOLD_HEX
    })
      .setOrigin(0.5);
    const bodyMessage = willBePenalized
      ? 'GAME_ABANDON_SUBTITLE_PENALIZATION'//`Perderás ${LOSS_PENALTY_AMOUNT.toLocaleString()} puntos de tu saldo\npor abandonar la partida en curso.`
      : 'GAME_ABANDON_SUBTITLE_GO';

    // QA de legibilidad (fontSize 14px -> 17px) destapó un bug previo:
    // esta LocalizedText no tenía `wordWrap`, y GAME_ABANDON_SUBTITLE_
    // PENALIZATION en español (sin el '\n' manual que sí tiene la
    // variante en inglés) ya se salía del panel de 460px incluso antes
    // de este cambio de tamaño — con la fuente más grande el desborde
    // sería todavía peor. Se agrega wordWrap (ambos idiomas, sin
    // depender de un '\n' a mano que pueda quedar desincronizado en una
    // futura traducción) y se saca el '\n' del string en inglés más
    // abajo, dejando que wordWrap reparta las líneas en los dos casos
    // por igual.
    const bodyText = new LocalizedText(this, cx, cy - 30, bodyMessage, {
      fontSize: '17px',
      fontFamily: FONT_FAMILY,
      color: willBePenalized ? '#ffb4c0' : '#cbd5e1',
      align: 'center',
      wordWrap: { width: 400 }
    },
      {
        amount: LOSS_PENALTY_AMOUNT.toLocaleString()
      })
      .setOrigin(0.5);
    const buttonY = cy + (willBePenalized ? 55 : 40);
    const cancelBtn = this.createModalButton(cx - 120, buttonY, 'GAME_ABANDON_CANCEL', COLOR_NEUTRAL, COLOR_NEUTRAL_GLOW, () => {
      this.scene.resume('GameScene');
      this.destroyExitModal();
    });
    const confirmBtn = this.createModalButton(cx + 120, buttonY, 'GAME_ABANDON_GO', COLOR_LOSS_ACCENT, COLOR_GOLD, () =>
      this.confirmExitToMainMenu()
    );
    this.exitModal = this.add.container(0, 0, [backdrop, panelBg, innerFrame, titleText, bodyText, cancelBtn, confirmBtn]);
    this.exitModal.setScale(0.2).setAlpha(0);
    this.tweens.add({
      targets: this.exitModal,
      scale: 1,
      alpha: 1,
      duration: 200,
      ease: 'Back.easeOut'
    });
  }
  private destroyExitModal(): void {
    this.exitModal?.destroy();
    this.exitModal = null;
  }
  /**
   * "Ir al Menú" confirmado: aplica la penalización (SOLO si
   * `GameAbandonGuard` indica que había algo real que abandonar — ver
   * GameAbandonGuard.ts), detiene la música/efectos activos, y transiciona
   * a MainMenuScene. Mismo mecanismo (`applyLossPenalty`, misma cifra
   * `LOSS_PENALTY_AMOUNT`) y misma secuencia de detención de audio que
   * ya usa `ResultScene.exitToMainMenu()`.
   */
  private confirmExitToMainMenu(): void {
    const services = getServices(this);
    if (isGameAbandonGuardActive(this.registry)) {
      // Sistema Anti-Cheat / penalización por abandono VOLUNTARIO: mismo
      // monto y mecanismo que OpenCardUseCase aplica al perder por
      // energía — acá se dispara porque el jugador elige salir con una
      // partida REALMENTE en curso, no por el flujo normal del juego.
      services.progressionManager.applyLossPenalty(LOSS_PENALTY_AMOUNT);
      // Trazabilidad del flag: se desactiva de inmediato para que un
      // eventual segundo click, o el listener 'beforeunload' si el
      // jugador cierra la pestaña en el instante siguiente, nunca vuelvan
      // a descontar sobre la misma partida ya abandonada.
      deactivateGameAbandonGuard(this.registry);
    }
    // Mismo fix de ciclo de vida de audio que ResultScene.exitToMainMenu():
    // se detiene la música/efectos activos ANTES de transicionar, usando
    // la ÚNICA instancia compartida de AudioService (ver AudioService.ts).
    services.audioService.stopAll(0);
    this.destroyExitModal();
    // GameScene estaba en pausa (no detenida) mientras el modal decidía —
    // `scene.stop()` la apaga igual sin importar ese estado intermedio.
    this.scene.stop('ResultScene');
    this.scene.stop('UIScene');
    this.scene.stop('GameScene');
    this.scene.start('MainMenuScene');
  }
  /**
   * Botón estilo "Casino de Lujo": panel oscuro + borde de acento + halo
   * de hover + microinteracción de escala — misma construcción que
   * MainMenuScene.createCasinoButton() / BankerOfferPanel.createArcadeButton()
   * / ResultScene.createActionButton() / SwapEventModal.createButton().
   */
  private createModalButton(
    x: number,
    y: number,
    label: TranslationKey,
    primaryColor: number,
    hoverGlowColor: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const width = 190;
    const height = 46;
    const container = this.add.container(x, y);
    const glow = this.add.graphics();
    glow.fillStyle(hoverGlowColor, 0.45);
    glow.fillRoundedRect(-width / 2 - 8, -height / 2 - 8, width + 16, height + 16, 16);
    glow.setAlpha(0);
    const bg = this.add.graphics();
    bg.fillStyle(0x121218, 0.95);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 10);
    bg.lineStyle(2, primaryColor, 0.9);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 10);
    bg.lineStyle(1, COLOR_GOLD, 0.25);
    bg.strokeRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, height - 8, 8);
    const text = new LocalizedText(this, 0, 0, label, {
      fontFamily: FONT_FAMILY,
      fontSize: '16px',
      fontStyle: 'bold',
      color: COLOR_WHITE_HEX
    })
      .setOrigin(0.5);
    container.add([glow, bg, text]);
    const hitZone = this.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add(hitZone);
    hitZone.on('pointerover', () => {
      this.tweens.add({ targets: container, scale: 1.05, duration: 120, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: glow, alpha: 1, duration: 120, ease: 'Cubic.easeOut' });
    });
    hitZone.on('pointerout', () => {
      this.tweens.add({ targets: container, scale: 1, duration: 120, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: glow, alpha: 0, duration: 120, ease: 'Cubic.easeOut' });
    });
    hitZone.on('pointerup', () => {
      this.tweens.add({
        targets: container,
        scale: 0.95,
        duration: 50,
        yoyo: true,
        onComplete: onClick
      });
    });
    return container;
  }
}