import Phaser from 'phaser';
import { getServices } from '../GameServices';
import { ProgressionEvent } from '../../domain/events/ProgressionEvents';
import { ABANDON_PENALTY_AMOUNT, deactivateGameAbandonGuard, isGameAbandonGuardActive } from '../GameAbandonGuard';
import { LocalizedText } from '../components/LocalizedText';
import { TranslationKey } from '../../shared/i18n/LanguageData';
import { PeriodicBonusModal } from '../components/PeriodicBonusModal';
import { PeriodicBonusStatus } from '../../domain/value-objects/PeriodicBonus';

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
  private bonusButtonText!: Phaser.GameObjects.Text;
  private bonusRefreshTimer: Phaser.Time.TimerEvent | null = null;

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

    this.add
      .text(this.cameras.main.width - 250, 20, '🛒 Tienda', { fontSize: '18px', color: '#ffffff' })
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.scene.launch('ShopScene'));

    // Botón "Salir / Menú" — posicionado en armonía con "Tienda": mismo
    // borde derecho, justo debajo, mismo estilo de texto liviano del HUD
    // (el modal de confirmación, no este botón disparador, es quien lleva
    // el tratamiento visual completo "Casino de Lujo").
    this.add
      .text(this.cameras.main.width - 120, 20, '🚪 Salir', { fontSize: '18px', color: '#ffffff' })
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.showExitConfirmationModal());

    // Botón "Bono Periódico" — arriba de Tienda/Salir, mismo borde derecho.
    // Su texto cambia solo (cuenta regresiva / disponible) vía
    // refreshBonusButton(), sin bloquear el click: si está en 'locked' el
    // handler simplemente no abre nada.
    this.bonusButtonText = this.add
      .text(this.cameras.main.width - 380, 20, '', { fontSize: '18px', color: '#ffffff' })
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.tryOpenBonusModal(services));
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

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.unsubscribe = null;
      this.bonusRefreshTimer?.destroy();
      this.bonusRefreshTimer = null;
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
   * Actualiza el texto del botón "Bono" según el estado vigente:
   * cuenta regresiva mientras está 'locked', invitación pulsante cuando
   * está 'available'. ('expired' no debería observarse acá — se resuelve
   * en el mismo instante en que se detecta, ver resolvePeriodicBonusExpiry()
   * llamado justo antes de cada refresh — pero se contempla igual por las
   * dudas de una carrera entre el timer de 30s y el reloj real).
   */
  private refreshBonusButton(services: ReturnType<typeof getServices>): void {
    const status: PeriodicBonusStatus = services.progressionManager.getPeriodicBonusStatus();
    if (status.state === 'available') {
      this.bonusButtonText.setText('🎁 ¡Bonus!');
      this.bonusButtonText.setColor('#ffd76a');
    } else {
      const remainingMs = Math.max(0, status.availableAt - Date.now());
      this.bonusButtonText.setText(`🎁 ${this.formatBonusCountdown(remainingMs)}`);
      this.bonusButtonText.setColor('#8b949e');
    }
  }
  private formatBonusCountdown(ms: number): string {
    const totalMinutes = Math.ceil(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }
  /**
   * Abre el modal del bono SOLO si el estado vigente es 'available' — si
   * el jugador clickea mientras está 'locked', no pasa nada (el propio
   * texto del botón ya le muestra el countdown, no hace falta feedback
   * adicional). Misma exclusión mutua con el modal de salida, y mismo
   * patrón de pausar GameScene mientras decide, que showExitConfirmationModal().
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
      ? 'GAME_ABANDON_SUBTITLE_PENALIZATION'//`Perderás ${ABANDON_PENALTY_AMOUNT.toLocaleString()} puntos de tu saldo\npor abandonar la partida en curso.`
      : 'GAME_ABANDON_SUBTITLE_GO';

    const bodyText = new LocalizedText(this, cx, cy - 30, bodyMessage, {
      fontSize: '15px',
      fontFamily: FONT_FAMILY,
      color: willBePenalized ? '#ffb4c0' : '#cbd5e1',
      align: 'center'
    },
      {
        amount: ABANDON_PENALTY_AMOUNT.toLocaleString()
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
   * `ABANDON_PENALTY_AMOUNT`) y misma secuencia de detención de audio que
   * ya usa `ResultScene.exitToMainMenu()`.
   */
  private confirmExitToMainMenu(): void {
    const services = getServices(this);
    if (isGameAbandonGuardActive(this.registry)) {
      // Sistema Anti-Cheat / penalización por abandono VOLUNTARIO: mismo
      // monto y mecanismo que OpenCardUseCase aplica al perder por
      // energía — acá se dispara porque el jugador elige salir con una
      // partida REALMENTE en curso, no por el flujo normal del juego.
      services.progressionManager.applyLossPenalty(ABANDON_PENALTY_AMOUNT);
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

