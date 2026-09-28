import Phaser from 'phaser';
import { GameEvent } from '../../domain/events/GameEvents';
import { GameSession } from '../../domain/entities/GameSession';
import { OpenCardUseCase } from '../../application/use-cases/OpenCardUseCase';
import { ResolveDealUseCase } from '../../application/use-cases/ResolveDealUseCase';
import { SwapSecretCardUseCase } from '../../application/use-cases/SwapSecretCardUseCase';
import { ReviveWithAdUseCase } from '../../application/use-cases/ReviveWithAdUseCase';
import { SwapFinalSecretCardUseCase } from '../../application/use-cases/SwapFinalSecretCardUseCase';
import { CardView } from '../components/CardView';
import { EnergyBarView } from '../components/EnergyBarView';
import { BankerOfferPanel } from '../components/BankerOfferPanel';
import { SwapEventModal } from '../components/SwapEventModal';
import { PayoutBoardView } from '../components/PayoutBoardView';
import { ResultSceneData } from '../scenes/ResultScene.types';
import { ParticleManager } from '../components/ParticleManager';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
import { LocalizedText } from '../components/LocalizedText';
import { IAudioService } from '../../domain/ports/IAudioService';
import { deactivateGameAbandonGuard, activateGameAbandonGuard } from '../GameAbandonGuard';

/** Misma paleta "Casino de Lujo" que MainMenuScene.ts / BankerOfferPanel.ts /
 * ResultScene.ts / SwapEventModal.ts — mismos valores hex, para que los
 * popups disparados desde este controlador (ej. valor de la carta
 * descartada en un intercambio) se sientan parte del mismo show en vez de
 * un estilo aislado. */
const COLOR_GOLD = 0xffd76a;
const COLOR_GOLD_DIM = 0xd4af37;
const COLOR_GOLD_HEX = '#ffd76a';
const COLOR_PANEL_BG = 0x0a0e17;
const FONT_FAMILY = 'Georgia, "Times New Roman", serif';

/**
 * GameSceneController: Unico punto donde eventos de dominio se traducen a efectos visuales.
 * GameScene delega aqui toda la orquestacion.
 *
 * Actua estrictamente como cliente tonto (Clean Architecture):
 * - No contiene reglas matematicas ni estado economico propio.
 * - Consume GameEvents emitidos por los Casos de Uso.
 */
export class GameSceneController {
  private activeOfferPanel: BankerOfferPanel | null = null;
  private activeSwapModal: SwapEventModal | null = null;
  private isAwaitingSwapSelection = false;
  private swapPromptBanner: Phaser.GameObjects.Container | null = null;

  // BUGFIX (bug_deal_modal_reveal): ResolveDealUseCase.acceptDeal() emite
  // tanto 'DealAccepted' como 'GameWon' para la MISMA aceptacion de oferta.
  // Sin esta guarda, el handler de 'GameWon' relanzaba ResultScene 1.6s
  // despues (pensado para el camino "se abrio la ultima carta sin oferta
  // pendiente"), pisando el modal ya mostrado por 'DealAccepted' y perdiendo
  // la revelacion de la carta secreta que este ultimo si incluye.
  private dealResultLaunched = false;
  private finalSwapPromptBanner: Phaser.GameObjects.Container | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly cardViews: Map<string, CardView>,
    private readonly secretCardView: CardView,
    private readonly energyBar: EnergyBarView,
    private readonly openCardUseCase: OpenCardUseCase,
    private readonly resolveDealUseCase: ResolveDealUseCase,
    private readonly swapSecretCardUseCase: SwapSecretCardUseCase,
    private readonly reviveWithAdUseCase: ReviveWithAdUseCase,
    private readonly session: GameSession,
    private readonly swapFinalSecretCardUseCase: SwapFinalSecretCardUseCase,
    private readonly eventBus?: SimpleEventEmitter<GameEvent>,
    private readonly particleManager?: ParticleManager,
    private readonly payoutBoard?: PayoutBoardView,
    // Clean Architecture / DIP: el controlador recibe el PUERTO de audio
    // por inyección de dependencias (igual que el resto de sus
    // colaboradores), en vez de instanciar su propia infraestructura
    // concreta con `new AudioManager(this.scene)` como antes — eso creaba
    // una TERCERA instancia de audio desconectada de la de GameScene,
    // agravando el problema de estado duplicado que causaba la
    // superposición. Opcional por consistencia con el resto de las
    // dependencias de esta lista (particleManager, payoutBoard) — en la
    // práctica siempre la provee GameScene.
    private readonly audioService?: IAudioService
  ) {
    if (this.eventBus) {
      this.eventBus.subscribe(event => this.handleEvent(event));
    } else {
      this.openCardUseCase.onEvent(event => this.handleEvent(event));
    }
    this.bindCardClicks();
  }

  private bindCardClicks(): void {
    this.cardViews.forEach((cardView, cardId) => {
      cardView.on('card-clicked', () => {
        if (this.isAwaitingSwapSelection) {
          // Defensa adicional: una carta ya revelada no deberia disparar el
          // handler (CardView.applyState ya deshabilita su interactividad),
          // pero si igual llegara el evento, lo ignoramos en vez de dejar
          // que swapSecretCardUseCase explote con una excepcion sin manejar.
          if (cardView.isCardOpen()) return;
          this.executeSwapWithCard(cardId);
          return;
        }
        this.openCardUseCase.execute(cardId);
      });
    });
  }

  private executeSwapWithCard(cardId: string): void {
    this.isAwaitingSwapSelection = false;
    this.hideSwapPromptBanner();
    this.swapSecretCardUseCase.execute(cardId);
  }

  private enableSwapCardSelection(): void {
    this.isAwaitingSwapSelection = true;
   // this.showSwapPromptBanner('👉 HAZ CLIC EN UNA CARTA CERRADA DEL TABLERO');
   this.showSwapPromptBanner();
  }

  private showSwapPromptBanner(): void {
    this.hideSwapPromptBanner();
    const cx = this.scene.cameras.main.centerX - 80;
    const cy = 110;

    // QA de legibilidad (fontSize 14px -> 17px, ver LanguageManager/todo
    // el resto del proyecto): a 480px este fondo ya quedaba MUY justo
    // (~460px estimados) para el texto largo en mayúsculas de
    // FINAL_CHANGE_SECRET_CARD en cualquiera de los 2 idiomas — se
    // ensancha a 620px para dejar margen real y no arriesgar que el
    // texto se corte contra el borde del banner.
    const bg = this.scene.add
      .rectangle(0, 0, 620, 40, 0xffaa00, 0.95)
      .setStrokeStyle(2, 0xffffff);

    const bannerText = new LocalizedText(this.scene, 0, 0, 'FINAL_CHANGE_SECRET_CARD',{
        fontSize: '17px',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        color: '#000000'
      })
      .setOrigin(0.5);

    this.swapPromptBanner = this.scene.add.container(cx, cy, [bg, bannerText]);
  }

  private hideSwapPromptBanner(): void {
    if (this.swapPromptBanner) {
      this.swapPromptBanner.destroy();
      this.swapPromptBanner = null;
    }
  }

  private showRevealedOldCardPopup(oldValue: number): void {
    const cx = this.scene.cameras.main.centerX - 80;
    const cy = this.scene.cameras.main.centerY;

    // Marco "Casino de Lujo" coherente con BankerOfferPanel/ResultScene:
    // fondo carbón + doble borde dorado/metálico en capas, en vez del
    // panel de un solo trazo naranja anterior.
    const popupBg = this.scene.add
      .rectangle(0, 0, 420, 240, COLOR_PANEL_BG, 0.98)
      .setStrokeStyle(3, COLOR_GOLD_DIM, 0.9);

    const innerFrame = this.scene.add
      .rectangle(0, 0, 400, 220, 0x000000, 0)
      .setStrokeStyle(1, COLOR_GOLD, 0.35);

    const titleText = new LocalizedText(this.scene, 0, -70, 'FINAL_CHANGE_PREVIEW_SECRET_CARD', {
        fontSize: '16px',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        color: COLOR_GOLD_HEX
      })
      .setOrigin(0.5);

    const descText = new LocalizedText(this.scene,0, -35, 'FINAL_CHANGE_PREVIEW_SECRET_CARD_VALUE', {
        fontSize: '17px',
        fontFamily: FONT_FAMILY,
        color: '#cbd5e1'
      })
      .setOrigin(0.5);

    // Halo dorado detrás de la cifra — misma técnica de "foco visual
    // inmediato" que el monto de la oferta en BankerOfferPanel.
    const valueGlow = this.scene.add.graphics();
    valueGlow.fillStyle(COLOR_GOLD, 0.28);
    valueGlow.fillRoundedRect(-130, -18, 260, 66, 20);
    valueGlow.lineStyle(2, COLOR_GOLD, 0.5);
    valueGlow.strokeRoundedRect(-130, -18, 260, 66, 20);

    const valueText = this.scene.add
      .text(0, 15, '$0', {
        fontSize: '40px',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        color: COLOR_GOLD_HEX,
        stroke: '#000000',
        strokeThickness: 4
      })
      .setOrigin(0.5);

    const subText = new LocalizedText(this.scene, 0, 75, 'FINAL_CHANGE_NEW_SECRET_CARD', {
        fontSize: '16px',
        fontFamily: FONT_FAMILY,
        color: '#8b949e'
      })
      .setOrigin(0.5);

    const container = this.scene.add.container(cx, cy, [
      popupBg,
      innerFrame,
      titleText,
      descText,
      valueGlow,
      valueText,
      subText
    ]);
    container.setScale(0.2);
    container.setAlpha(0);

    this.scene.tweens.add({
      targets: container,
      scale: 1,
      alpha: 1,
      duration: 220,
      ease: 'Back.easeOut',
      onComplete: () => this.animateRevealedValueCounter(valueText, valueGlow, oldValue)
    });

    this.particleManager?.emitVictoryBurst(cx, cy);

    this.scene.time.delayedCall(2600, () => {
      this.scene.tweens.add({
        targets: container,
        scale: 0.8,
        alpha: 0,
        duration: 200,
        onComplete: () => container.destroy()
      });
    });
  }

  /**
   * Animación de la cifra revelada: primero un conteo progresivo desde $0
   * hasta `oldValue` (efecto "counter tween", da la sensación de que el
   * monto se está revelando en vivo), y al llegar arriba arranca el mismo
   * pulso de escala + resplandor en loop infinito (`yoyo`, `repeat: -1`)
   * que usa `offer.amount` en BankerOfferPanel — así el valor se mantiene
   * como foco de atención mientras el popup sigue en pantalla.
   */
  private animateRevealedValueCounter(
    valueText: Phaser.GameObjects.Text,
    valueGlow: Phaser.GameObjects.Graphics,
    targetValue: number
  ): void {
    const counter = { value: 0 };

    this.scene.tweens.add({
      targets: counter,
      value: targetValue,
      duration: 500,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        valueText.setText(`$${Math.round(counter.value).toLocaleString()}`);
      },
      onComplete: () => {
        valueText.setText(`$${targetValue.toLocaleString()}`);

        this.scene.tweens.add({
          targets: valueGlow,
          alpha: { from: 0.55, to: 1 },
          duration: 300,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });

        this.scene.tweens.add({
          targets: valueText,
          scale: { from: 1, to: 1.08 },
          duration: 300,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut'
        });
      }
    });
  }

  private handleEvent(event: GameEvent): void {
    switch (event.type) {
      case 'CardOpened':
        this.cardViews.get(event.card.id)?.applyState({
          id: event.card.id,
          isOpen: true,
          value: event.card.value
        });
        this.energyBar.setPercentage(event.energyRemaining);
        // REQ (transparencia de mecánicas): mismo evento que ya actualiza
        // la energía en cada carta abierta — se le suma el contador de
        // turnos hasta la próxima oferta del Banquero, sin ningún evento
        // nuevo ni disparo aparte.
        this.energyBar.setBankerOfferCountdown(event.cardsUntilNextOffer);
        this.payoutBoard?.markValueRevealed(event.card.value);
        break;

      case 'BankerOfferMade': {
        // BUGFIX (bug_banker_flow): antes el modal de oferta aparecia en el
        // mismo instante que se revelaba la carta, tapando la pantalla antes
        // de que el jugador llegara a ver que carta acababa de abrir.
        // Ahora: (a) se bloquean las cartas de inmediato para evitar clicks
        // durante la pausa, (b) se destacan con un pulso los valores que
        // siguen en juego en el panel lateral, y (c) recien tras 1.8s se
        // muestra el panel de oferta del banquero.
        this.lockAllCards(true);
        this.payoutBoard?.pulseRemainingValues();
         // REQ (transparencia de mecánicas): durante esta pausa de 1.8s el
        // contador ya no tiene sentido mostrando "en 3 cartas" (el
        // CardOpened previo ya reinició el ciclo para la PRÓXIMA oferta) —
        // se reemplaza por un estado "lista" mientras el jugador espera a
        // que aparezca el modal.
        this.energyBar.setBankerOfferReady();

        this.scene.time.delayedCall(1800, () => {
          this.activeOfferPanel = new BankerOfferPanel(this.scene, event.offer, this.audioService);
          this.activeOfferPanel.once('deal-accepted', () => {
            this.resolveDealUseCase.acceptDeal();
          });
          this.activeOfferPanel.once('deal-rejected', () => {
            this.resolveDealUseCase.rejectDeal();
          });
        });
        break;
      }

      case 'DealRejected':
        this.activeOfferPanel?.destroy();
        this.activeOfferPanel = null;
        this.lockAllCards(false);
        break;

      case 'DealAccepted':
        this.activeOfferPanel?.destroy();
        this.activeOfferPanel = null;
        this.particleManager?.emitVictoryBurst(
          this.scene.cameras.main.centerX,
          this.scene.cameras.main.centerY
        );
        // BUGFIX (bug_deal_modal_reveal): marcamos que este resultado ya fue
        // lanzado con la revelacion de la carta secreta incluida, para que
        // el 'GameWon' que se emite justo despues (ver ResolveDealUseCase)
        // no vuelva a relanzar ResultScene y pise este modal.
        this.dealResultLaunched = true;

        // Sistema Anti-Cheat / penalización por abandono: la partida se
        // resolvió por el flujo NORMAL (DEAL aceptado) — desde acá, cerrar
        // la pestaña o volver al menú desde ResultScene NUNCA debe
        // penalizar (ver GameAbandonGuard.ts).
        deactivateGameAbandonGuard(this.scene.registry);

        this.scene.scene.launch('ResultScene', {
          outcome: 'won',
          amount: event.amount,
          secretCardValue: event.secretCardValue,
          ...this.buildUpgradeFlagsForResultScene()
        } satisfies ResultSceneData);
        break;

      case 'MidgameSwapAvailable':
        this.activeSwapModal = new SwapEventModal(this.scene);
        this.activeSwapModal.once('swap-declined', () => this.closeSwapModal());
        this.activeSwapModal.once('swap-accepted-choose-card', () => {
          this.closeSwapModal();
          this.enableSwapCardSelection();
        });
        break;

      case 'SecretCardSwapped': {
        const oldVal = event.oldSecretCard?.value ?? 0;

        // *** FIX DEL BUG PRINCIPAL ***
        // La carta que estaba protegida (la secreta original) pasa a ocupar,
        // ya REVELADA, el mismo slot del tablero que el jugador eligio para
        // el intercambio (event.oldSecretCard.id === el id de ese slot — ver
        // DeckManager.swapSecretCard). Hasta ahora el controller nunca
        // actualizaba la CardView de ese slot: quedaba visualmente "cerrada"
        // para siempre (y con la interactividad mal deshabilitada, ver el
        // fix en CardView.applyState), por lo que un click posterior sobre
        // ella lanzaba una excepcion no manejada ("Card X is already open")
        // y el jugador quedaba trabado sin poder terminar la partida.
        if (event.oldSecretCard) {
          const revealedBoardSlot = this.cardViews.get(event.oldSecretCard.id);
          revealedBoardSlot?.applyState({
            id: event.oldSecretCard.id,
            isOpen: true,
            value: event.oldSecretCard.value
          });
          revealedBoardSlot?.setLocked(true);
          this.payoutBoard?.markValueRevealed(event.oldSecretCard.value);

          // BUGFIX (bug_secret_card_swap): el pedestal debe adoptar el
          // numero de posicion de la carta del tablero que el jugador eligio
          // como nueva secreta. Antes solo se actualizaban la textura y el
          // valor (via resetAsFaceDown/revealValue) pero el texto "#N" del
          // reverso seguia mostrando el numero de la carta secreta ORIGINAL,
          // porque nunca se llamaba a setPositionNumber().
          const newSecretDisplayNumber = revealedBoardSlot?.getDisplayNumber();
          if (newSecretDisplayNumber !== null && newSecretDisplayNumber !== undefined) {
            this.secretCardView.setPositionNumber(newSecretDisplayNumber);
          }
        }

        // Popup informativo con el valor que tenia la carta descartada
        this.showRevealedOldCardPopup(oldVal);

        // La NUEVA carta secreta permanece 100% oculta en el pedestal
        this.secretCardView.resetAsFaceDown();
        this.secretCardView.setLocked(true);
        break;
      }

      case 'LastCardRevealed': {
        this.lockAllCards(true);
        // Si el jugador decidió abrir la última carta normalmente en vez
        // de usar el intercambio final ofrecido, el aviso queda obsoleto.
        this.hideFinalSwapPrompt();
        // La carta secreta del pedestal se revela UNICAMENTE al finalizar el juego junto con la ultima carta
        this.scene.time.delayedCall(750, () => {
          this.secretCardView.revealValue(event.secretCard.value);
          this.payoutBoard?.markValueRevealed(event.secretCard.value);
          this.particleManager?.emitVictoryBurst(this.secretCardView.x, this.secretCardView.y);
        });
        break;
      }

      case 'GameWon': {
        // BUGFIX (bug_deal_modal_reveal): si este 'GameWon' corresponde a un
        // DEAL recien aceptado, 'DealAccepted' ya lanzo ResultScene (con la
        // carta secreta incluida) — evitamos relanzarlo y perder esa info.
        if (this.dealResultLaunched) {
          this.dealResultLaunched = false;
          break;
        }

        this.lockAllCards(true);

        // Sistema Anti-Cheat / penalización por abandono: camino "última
        // carta abierta sin oferta pendiente" — igual que DealAccepted,
        // resuelve la partida por el flujo normal (ver GameAbandonGuard.ts).
        deactivateGameAbandonGuard(this.scene.registry);

        this.scene.time.delayedCall(1600, () => {
          this.scene.scene.launch('ResultScene', {
            outcome: 'won',
            amount: event.finalAmount,
            secretCardValue: event.finalAmount,
            ...this.buildUpgradeFlagsForResultScene()
          } satisfies ResultSceneData);
        });
        break;
      }

      case 'EnergyDepleted':
        this.lockAllCards(true);
        break;

      case 'GameLost': {
        deactivateGameAbandonGuard(this.scene.registry);

        const onRevive = async () => {
          const result = await this.reviveWithAdUseCase.execute();
          if (result.revived) {
            this.lockAllCards(false);
            this.scene.scene.stop('ResultScene');
          }
          return result;
        };

        this.scene.scene.launch('ResultScene', {
          outcome: 'lost',
          onRevive,
          ...this.buildUpgradeFlagsForResultScene()
        } satisfies ResultSceneData);
        break;
      }

      case 'GameRevived':
        activateGameAbandonGuard(this.scene.registry);
        // BUGFIX (nivel de energía): usa el porcentaje real que viene del
        // dominio (antes se forzaba a 100 fijo, incorrecto ahora que el
        // baseline de partida/revive es 50 + bonus de tienda).
        this.energyBar.setPercentage(event.energyPercentage);
        this.lockAllCards(false);
        this.particleManager?.emitVictoryBurst(
          this.scene.cameras.main.centerX,
          this.scene.cameras.main.centerY
        );
        break;

      case 'EnergyTankUpgraded':
        // Upgrade "Tanque de Energía": la barra debe reflejar de inmediato
        // tanto el nuevo PORCENTAJE (siempre 0-100, normalizado contra el
        // techo vigente) como la nueva CAPACIDAD visual (la barra se
        // ensancha para transmitir "tanque más grande", no solo "más lleno").
        this.energyBar.setCapacityMultiplier(event.capacityMultiplier);
        this.energyBar.setPercentage(event.energyPercentage);
        break;

      case 'FinalCardSwapAvailable':
        // Upgrade "Cambio de Carta Secreta": queda una única carta cerrada
        // y el jugador tiene el upgrade — se ofrece la opción de cambiar su
        // Carta Secreta por ella en vez de abrirla normalmente.
        this.showFinalSwapPrompt();
        break;

      case 'FinalSecretCardSwapped': {
        this.hideFinalSwapPrompt();
        this.lockAllCards(true);

        // Revela, en el tablero, la carta que dejó de ser la Carta Secreta
        // — mismo tratamiento que el intercambio de mitad de juego.
        const revealedBoardSlot = this.cardViews.get(event.oldSecretCard.id);
        revealedBoardSlot?.applyState({
          id: event.oldSecretCard.id,
          isOpen: true,
          value: event.oldSecretCard.value
        });
        revealedBoardSlot?.setLocked(true);
        this.payoutBoard?.markValueRevealed(event.oldSecretCard.value);

        // A diferencia del intercambio de mitad de juego, acá la partida
        // TERMINA — el pedestal revela su valor final (el premio definitivo)
        // en vez de volver a quedar boca abajo.
        this.scene.time.delayedCall(750, () => {
          this.secretCardView.revealValue(event.newSecretCard.value);
          this.payoutBoard?.markValueRevealed(event.newSecretCard.value);
          this.particleManager?.emitVictoryBurst(this.secretCardView.x, this.secretCardView.y);
        });
        break;
      }
    }
  }

  /**
   * Snapshot de los upgrades de ESTA partida relevantes para el modal de
   * fin de partida — ResultScene solo debe mostrar los botones de
   * "Duplicar"/"Triplicar"/"Revivir" si el jugador los compró en esta
   * misma sesión (son consumibles, no persisten entre partidas).
   */
  private buildUpgradeFlagsForResultScene(): Pick<
    ResultSceneData,
    'hasDoubleReward' | 'hasTripleReward' | 'hasReviveUpgrade'
  > {
    const upgrades = this.session.getSessionUpgrades();
    return {
      hasDoubleReward: upgrades.hasDoubleReward(),
      hasTripleReward: upgrades.hasTripleReward(),
      hasReviveUpgrade: upgrades.hasRevive()
    };
  }

  private showFinalSwapPrompt(): void {
    this.hideFinalSwapPrompt();
    const cx = this.scene.cameras.main.centerX - 80;
    const cy = 110;

    const bg = this.scene.add
      .rectangle(0, 0, 520, 60, 0x1a1a2e, 0.97)
      .setStrokeStyle(2, 0x2ecc71)
      .setInteractive({ useHandCursor: true });

    const text = new LocalizedText(this.scene, 0, -12, 'FINAL_CHANGE_FINAL_CARD', {
        fontSize: '17px',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        color: '#2ecc71'
      })
      .setOrigin(0.5);

    const subText = new LocalizedText(this.scene, 0, 12, 'FINAL_CHANGE_UPGRATED', {
        fontSize: '15px',
        fontFamily: 'Arial, sans-serif',
        color: '#8b949e'
      })
      .setOrigin(0.5);

    bg.on('pointerup', () => {
      this.swapFinalSecretCardUseCase.execute();
    });

    this.finalSwapPromptBanner = this.scene.add.container(cx, cy, [bg, text, subText]);
  }

  private hideFinalSwapPrompt(): void {
    if (this.finalSwapPromptBanner) {
      this.finalSwapPromptBanner.destroy();
      this.finalSwapPromptBanner = null;
    }
  }

  private closeSwapModal(): void {
    this.activeSwapModal?.destroy();
    this.activeSwapModal = null;
  }

  private lockAllCards(locked: boolean): void {
    this.cardViews.forEach(view => view.setLocked(locked));
  }

  getCardView(cardId: string): CardView | undefined {
    return this.cardViews.get(cardId);
  }

  getSecretCardView(): CardView {
    return this.secretCardView;
  }

  hasBoardCard(cardId: string): boolean {
    return this.cardViews.has(cardId);
  }

  isSecretCard(cardId: string): boolean {
    return (
      this.secretCardView.getCardId() === cardId ||
      this.session.getSecretCard().id === cardId
    );
  }
}