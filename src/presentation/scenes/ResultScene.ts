import Phaser from 'phaser';
import { getServices, GameServices } from '../GameServices';
import { ResultSceneData, ResultOutcome } from './ResultScene.types';
import { MultiplyRewardUseCase, RewardMultiplier } from '../../application/use-cases/MultiplyRewardUseCase';
import { ReviveResult } from '../../application/use-cases/ReviveWithAdUseCase';
import { ParticleManager } from '../components/ParticleManager';
import { LocalizedText } from '../components/LocalizedText';
import { GameSummary } from '../../application/records/GameOutcomeRecorder';
import { TranslationKey } from '../../shared/i18n/LanguageData';
import { IAudioService } from '../../domain/ports/IAudioService';
import { CardPositionSource, getGameObjectGlobalPosition } from '../effects/deck-celebrations/DeckCelebrationEffect';
import languageManager from '../../shared/i18n/LanguageManager';
import { SFX } from '../../shared/audio/AudioData';
import { bindUiClick, playUiClick } from '../audio/UiSfx';
import { bindKeys } from '../input/KeyBindings';
import { FocusDirection, FocusItem, nextFocusIndex } from '../input/KeyboardNavigation';

/** Misma paleta "Casino de Lujo" que MainMenuScene.ts / DeckSelectionScene.ts /
 * BankerOfferPanel.ts — mismos valores hex, para que la pantalla final se
 * sienta el clímax coherente del mismo show, no un estilo aparte. */
const COLOR_GOLD = 0xffd76a;
const COLOR_GOLD_DIM = 0xd4af37;
const COLOR_GOLD_HEX = '#ffd76a';
const COLOR_WHITE_HEX = '#ffffff';
const COLOR_LOSS_ACCENT = 0xff4d6d;
const COLOR_PANEL_BG = 0x0a0f1d;
const FONT_FAMILY = 'Georgia, "Times New Roman", serif';

/** Motivos de fallo de `ReviveResult` — el caso `revived: true` se resuelve
 * antes (la escena ya la detuvo GameSceneController) y nunca llega acá. */
type ReviveFailureReason = Extract<ReviveResult, { revived: false }>['reason'];

/**
 * Registro de foco de teclado (Fase 5) de un botón de resultado: extiende
 * `FocusItem` (geometría real del container para `nextFocusIndex`) con lo
 * mínimo para aplicar el MISMO efecto que el hover del ratón y para
 * activar la acción SIN pointer (ENTER invoca el callback tal cual, como
 * MainMenuScene.activateFocusedItem).
 *
 * `enabled` es mutable a propósito: `disableActionButton` es el punto
 * único de apagado de botones y también marca la entry para que las
 * flechas la salten y ENTER quede inerte.
 */
interface KbFocusEntry extends FocusItem {
  readonly container: Phaser.GameObjects.Container;
  readonly glow: Phaser.GameObjects.Graphics;
  // `void | Promise<void>`: los closures de Duplicar/Triplicar/Revivir son
  // async (el ad está en vuelo) — el flag de reentrada del teclado atad a
  // esta promesa en vez de durar "para siempre" (ver activateFocusedItem).
  readonly onClick: () => void | Promise<void>;
  readonly highlight: (on: boolean) => void;
  // Sin readonly: se apaga en disableActionButton (punto único).
  enabled: boolean;
}

/**
 * ResultScene: Pantalla modal de Victoria / Derrota, estilo "Casino de
 * Lujo / Game Show" — coherente con MainMenuScene y BankerOfferPanel.
 * Se superpone a GameScene con efectos visuales y soporte para Rewarded
 * Ads de CrazyGames.
 */
export class ResultScene extends Phaser.Scene implements CardPositionSource {
  private multiplyUseCase: MultiplyRewardUseCase | null = null;
  private statusText!: Phaser.GameObjects.Text;
  private particleManager!: ParticleManager;
  private services!: GameServices;
  // Clean Architecture: ResultScene NUNCA reprodujo música propia — solo
  // necesita poder DETENERLA. Por eso ya no crea su propia instancia
  // (`new AudioManager(this)`), que era precisamente la causa del bug:
  // esa instancia nacía con `currentMusic = null` y jamás se enteraba de
  // la música que GameScene había arrancado. Ahora se obtiene el MISMO
  // audioService (singleton a nivel Game) desde GameServices — ver
  // AudioService.ts para el detalle completo del fix.
  private audioService!: IAudioService;

  // --- Teclado PC (Fase 5) ------------------------------------------------
  // Items de foco de las flechas sobre los botones de resultado, con la
  // geometría REAL de cada container — se reconstruyen DESDE CERO en cada
  // build de acciones (buildWonActions / buildLostActions).
  private kbFocusEntries: KbFocusEntry[] = [];
  // -1 = nada enfocado hasta la primera pulsación de flecha (UX del menú).
  private kbFocusIndex = -1;
  // Desuscripción de bindKeys — se resuelve en el SHUTDOWN de create(),
  // con la MISMA referencia (AGENTS §5).
  private unsubscribeKeys: (() => void) | null = null;
  // Reentrada de ENTER: el flag se mantiene mientras la acción del botón
  // está EN VUELO (los closures devuelven `void | Promise<void>` — el ad
  // de multiply/revive/restart es la promesa) y se libera apenas asienta.
  // Antes era one-shot "por render" y dejaba ENTER muerto para TODOS los
  // botones tras una acción que no navega (multiply con ads_cooldown,
  // revive reintenable — ADR-006): el jugador de teclado quedaba trabado.
  // Doble pulsación síncrona: el reset es en microtask, así que un segundo
  // ENTER del mismo tick queda bloqueado — paridad con el pop de 50 ms del
  // ratón. Acciones que navegan: la escena muere y create() resetea igual.
  private kbActionTaken = false;

  constructor() {
    super({ key: 'ResultScene' });
  }

  /**
   * Implementación de CardPositionSource para la pantalla de victoria/resultado:
   * Retorna la ubicación precisa de la Carta Secreta en el modal.
   */
  getCardScreenPosition(_cardId: string): { x: number; y: number } | null {
    if (this.statusText && this.statusText.active) {
      return getGameObjectGlobalPosition(this.statusText);
    }
    const { width, height } = this.cameras.main;
    return { x: width / 2, y: height / 2 - 48 };
  }

  create(data: ResultSceneData): void {
    this.services = getServices(this);
    // BUGFIX (bug_fix_audio_lifecycle): se reutiliza la ÚNICA instancia de
    // AudioService del Composition Root — esta es la pieza que faltaba
    // para que stopAll()/stopMusic() de acá abajo realmente afecten a la
    // música que GameScene inició.
    this.audioService = this.services.audioService;
    // Teclado PC (Fase 5): estado de foco fresco en cada create() — los
    // entries se reconstruyen recién en buildWonActions/buildLostActions.
    this.kbFocusIndex = -1;
    this.kbActionTaken = false;
    this.particleManager = new ParticleManager(this);
    const { width, height } = this.cameras.main;

    const isWon = data.outcome === 'won';
    // Verde/dorado para victoria, carmesí para derrota — mismo código de
    // color que ya distinguía el resultado, ahora en tonos "premium"
    // coherentes con el resto de la interfaz en vez de neón puro.
    const accentColor = isWon ? COLOR_GOLD_DIM : COLOR_LOSS_ACCENT;

    // Fondo atenuador
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.82);

    // Resumen de récords/Desafío Diario de ESTA partida, si lo hay (ver
    // GameScene.setupOutcomeRecording). Solo existe de forma confiable para
    // una VICTORIA: una derrota se confirma recién al cerrar GameScene, para
    // entonces esta pantalla ya se cerró (ver el comentario en ese archivo).
    const summary = this.registry.get('lastGameSummary') as GameSummary | undefined;
    this.registry.remove('lastGameSummary');
    this.renderOutcomeSummary(summary, width / 2, height / 2 + 148);

    // Contenedor modal: carbón oscuro translúcido con doble borde
    // (acento de resultado + filo dorado interior), misma técnica de
    // capas usada en BankerOfferPanel para el acabado "metálico".
    const modalBg = this.add
      .rectangle(width / 2, height / 2, 540, 380, COLOR_PANEL_BG, 0.98)
      .setStrokeStyle(3, accentColor, 0.9);

    const innerFrame = this.add
      .rectangle(width / 2, height / 2, 520, 360, 0x000000, 0)
      .setStrokeStyle(1, COLOR_GOLD, 0.35);

    const outerGlow = this.add
      .rectangle(width / 2, height / 2, 548, 388, accentColor, 0)
      .setStrokeStyle(1, accentColor, 0.4);

    // Halo detrás del titular/monto — ver startHeadlinePulse() para el
    // destello continuo que lo convierte en foco visual inmediato.
    const headlineGlow = this.add.graphics();
    headlineGlow.fillStyle(accentColor, 0.22);
    headlineGlow.fillRoundedRect(width / 2 - 250, height / 2 - 160, 500, 90, 20);
    headlineGlow.lineStyle(2, accentColor, 0.45);
    headlineGlow.strokeRoundedRect(width / 2 - 250, height / 2 - 160, 500, 90, 20);

    const headlineText = new LocalizedText(this, width / 2, height / 2 - 120, this.titleFor(data.outcome), {
        fontSize: '28px',
        fontFamily: FONT_FAMILY,
        fontStyle: 'bold',
        color: COLOR_WHITE_HEX,
        align: 'center',
        stroke: '#000000',
        strokeThickness: 4,
        wordWrap: { width: 480 }
      },
      {amount: `$${(data.amount ?? 0).toLocaleString()}`}
      ).setOrigin(0.5);

    this.statusText = headlineText;
    this.startHeadlinePulse(headlineGlow, headlineText);

    if (isWon) {
      this.particleManager.emitVictoryBurst(width / 2, height / 2 - 90);

      // BUGFIX (bug_deal_modal_reveal): el modal de éxito también revela
      // el valor de la Carta Secreta reservada al inicio, no solo el premio.
      if (data.secretCardValue !== undefined) {
        this.statusText = new LocalizedText(this, width / 2, height / 2 - 48, 'RESULT_SECRET_CARD_REVEAL', {
            fontSize: '20px',
            fontFamily: FONT_FAMILY,
            fontStyle: 'italic',
            color: COLOR_GOLD_HEX,
            stroke: '#000000',
            strokeThickness: 2
          },
          {amount: `$${(data.secretCardValue ?? 0).toLocaleString()}`}
          )
          .setOrigin(0.5);
      }

      this.buildWonActions(data);
    } else {
      this.buildLostActions(data);
    }

    // Animación de entrada
    modalBg.setScale(0.2);
    innerFrame.setScale(0.2);
    outerGlow.setScale(0.2);
    this.tweens.add({
      targets: [modalBg, innerFrame, outerGlow],
      scale: 1,
      duration: 250,
      ease: 'Back.easeOut'
    });

    // --- Teclado PC (Fase 5) ----------------------------------------------
    // Sin addCapture: ResultScene se lanza sobre GameScene + UIScene todavía
    // RUNNING, y GameScene ya capturó ↑/↓/←/→ en su create() — las
    // capturas de Phaser son globales y persisten mientras esa escena siga
    // viva, bajarlas acá le robaría las flechas a la partida debajo
    // (mismo criterio que ShopScene). NO se registra ESC: no hay nada que
    // cerrar (el modal es el final de la partida).
    // Los handlers van como MISMA referencia (el objeto literal se crea una
    // sola vez acá) para que el unsubscribe de SHUTDOWN desenganche de
    // verdad (AGENTS §5 — bindKeys registra/`off` los pares exactos).
    this.unsubscribeKeys = bindKeys(this.input.keyboard, {
      UP: (event?: KeyboardEvent) => this.handleFocusArrow(event, 'up'),
      DOWN: (event?: KeyboardEvent) => this.handleFocusArrow(event, 'down'),
      LEFT: (event?: KeyboardEvent) => this.handleFocusArrow(event, 'left'),
      RIGHT: (event?: KeyboardEvent) => this.handleFocusArrow(event, 'right'),
      ENTER: (event?: KeyboardEvent) => this.activateFocusedItem(event)
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // Desuscripción con la MISMA referencia (AGENTS §5). Phaser emite
      // SHUTDOWN tanto en stop() como en restart() — "Jugar de nuevo" hace
      // scene.stop('ResultScene'), así que el camino queda cubierto en
      // cualquiera de las salidas de la escena.
      this.unsubscribeKeys?.();
      this.unsubscribeKeys = null;
      this.kbFocusEntries = [];
      this.kbFocusIndex = -1;
      this.kbActionTaken = false;
    });
  }

  private titleFor(outcome: ResultOutcome): TranslationKey {
    return outcome === 'won'
      ? 'RESULT_WON_TITLE' 
      : 'RESULT_LOST_TITLE';
  }

  /**
   * Destello/pulso continuo del titular (que en la victoria incluye el
   * monto del premio, interpolado dentro de RESULT_WON_TITLE): el halo
   * detrás del texto respira en alpha mientras el propio texto escala
   * levemente, en loop infinito — mismo tratamiento que el monto de la
   * oferta en BankerOfferPanel, para que la cifra final se sienta el foco
   * de atención y transmita recompensa/victoria.
   *
   * Se aplica sobre una referencia local (`headlineText`) capturada ANTES
   * de que `this.statusText` pueda reasignarse a otro texto (revelación
   * de Carta Secreta) más abajo — así el pulso queda enganchado al texto
   * correcto sin tocar en absoluto esa lógica de reasignación existente.
   */
  private startHeadlinePulse(glow: Phaser.GameObjects.Graphics, headlineText: Phaser.GameObjects.Text): void {
    this.tweens.add({
      targets: glow,
      alpha: { from: 0.5, to: 1 },
      duration: 950,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.tweens.add({
      targets: headlineText,
      scale: { from: 1, to: 1.04 },
      duration: 950,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  /** Dibuja, si corresponde, "Nuevo récord" y/o la recompensa del Desafío Diario debajo del contenido principal del modal. */
  private renderOutcomeSummary(summary: GameSummary | undefined, x: number, startY: number): void {
    if (!summary) {
      return;
    }
    let y = startY;
    if (summary.daily) {
      new LocalizedText(
        this,
        x,
        y,
        'RESULT_DAILY_REWARD',
        { fontFamily: 'Arial, sans-serif', fontSize: '14px', fontStyle: 'bold', color: '#ffd76a' },
        { reward: summary.daily.reward.toLocaleString(), streak: summary.daily.streak }
      ).setOrigin(0.5);
      y += 20;
    }
    if (summary.isNewBestPayout) {
      new LocalizedText(this, x, y, 'RESULT_NEW_RECORD', {
        fontFamily: 'Arial, sans-serif',
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffd76a'
      }).setOrigin(0.5);
      // Fanfarria de récord — solo en la rama que realmente muestra el
      // "Nuevo récord" (audioService ya está seteado: create() lo asigna
      // antes de renderOutcomeSummary()).
      try {
        this.audioService.play(SFX.RECORD);
      } catch {
        // Audio best-effort: nunca rompe el modal de resultado.
      }
    }
  }

  private buildWonActions(data: ResultSceneData): void {
    // Teclado PC (Fase 5): el registro de foco se reconstruye DESDE CERO en
    // cada build — createActionButton empuja cada botón nuevo con su
    // geometría REAL y su closure onClick.
    this.kbFocusEntries = [];
    const { width, height } = this.cameras.main;
    const baseAmount = data.amount ?? 0;
    // El flag `refunded` (invariante reembolso XOR efecto) vive en ESTA
    // instancia del use-case, que se recrea en cada create(): si algún día
    // se relanzara ResultScene con `outcome: 'won'` dentro de la MISMA
    // partida, la instancia nueva nacería sin el flag y habilitaría un
    // segundo reembolso. Hoy no es alcanzable porque el modal `won` es
    // terminal ("Jugar de nuevo"/"Salir" arrancan una sesión nueva, con
    // su GameSession y su use-case propios).
    this.multiplyUseCase = new MultiplyRewardUseCase(baseAmount, this.services.crazyGamesService, this.services.progressionManager);

    // Upgrades "Duplicar"/"Triplicar": son consumibles de esta partida —
    // solo se ofrecen si el jugador los compró en la tienda durante ESTA
    // sesión (ver GameSceneController.buildUpgradeFlagsForResultScene).
    // Son mutuamente excluyentes desde la Tienda (ver
    // PurchaseSessionUpgradeUseCase / SessionUpgradeCatalog.conflictsWith):
    // no debería llegar a haber comprado ambos en la misma partida. La rama
    // `wantsDouble && wantsTriple` queda como red de seguridad ante
    // CUALQUIER bug de lógica que otorgue ambos a la vez — no ante datos
    // viejos persistidos: `SessionUpgrades` no se serializa (se crea fresco
    // en cada GameSession) y estos flags se calculan en vivo en
    // `buildUpgradeFlagsForResultScene`, sin pasar por storage.
    const multiplyRowY = height / 2 + 20;
    const wantsDouble = data.hasDoubleReward === true;
    const wantsTriple = data.hasTripleReward === true;

    let doubleBtn: Phaser.GameObjects.Container | null = null;
    let tripleBtn: Phaser.GameObjects.Container | null = null;

    if (wantsDouble && wantsTriple) {
      doubleBtn = this.createActionButton(width / 2 - 110, multiplyRowY, 'RESULT_DOUBLE_BUTTON', 0x00e5ff, 0x00e5ff, () =>
        this.handleMultiply(2)
      );
      tripleBtn = this.createActionButton(width / 2 + 110, multiplyRowY, 'RESULT_TRIPLE_BUTTON', 0xffab00, 0xffab00, () =>
        this.handleMultiply(3)
      );
    } else if (wantsDouble) {
      doubleBtn = this.createActionButton(width / 2, multiplyRowY, 'RESULT_DOUBLE_BUTTON', 0x00e5ff, 0x00e5ff, () =>
        this.handleMultiply(2)
      );
    } else if (wantsTriple) {
      tripleBtn = this.createActionButton(width / 2, multiplyRowY, 'RESULT_TRIPLE_BUTTON', 0xffab00, 0xffab00, () =>
        this.handleMultiply(3)
      );
    }

    this.registry.set('resultScene:doubleBtn', doubleBtn);
    this.registry.set('resultScene:tripleBtn', tripleBtn);

    // "Jugar de nuevo" + "Salir": siempre presentes, lado a lado.
    this.createActionButton(width / 2 - 110, height / 2 + 100, 'RESULT_PLAY_AGAIN_BUTTON', 0x00e676, 0x5cffb0, () =>
      this.restartGame()
    );
    this.createActionButton(width / 2 + 110, height / 2 + 100, 'RESULT_EXIT_BUTTON', COLOR_LOSS_ACCENT, 0xff4d6d, () =>
      this.exitToMainMenu()
    );
  }

  private buildLostActions(data: ResultSceneData): void {
    // Teclado PC (Fase 5): el registro de foco se reconstruye DESDE CERO en
    // cada build — createActionButton empuja cada botón nuevo con su
    // geometría REAL y su closure onClick.
    this.kbFocusEntries = [];
    const { width, height } = this.cameras.main;

    // Upgrade "Revivir": solo se ofrece si se compró en esta partida.
    if (data.hasReviveUpgrade === true) {
      // El contenedor se guarda en una variable local del closure (mismo
      // rol que el registry de doubleBtn/tripleBtn, pero acá el disable
      // ocurre DENTRO del propio callback): si el consumo termina en
      // reembolso hay que poder apagar el botón desde ahí mismo.
      const reviveBtn = this.createActionButton(width / 2, height / 2 - 5, 'RESULT_REVIVE_BUTTON', COLOR_GOLD, COLOR_GOLD_DIM, async () => {
        if (!data.onRevive) return;
        this.statusText.setText(languageManager.getText('RESULT_AD_LOADING'));
        const outcome = (await data.onRevive()) as ReviveResult | undefined;
        // Si revivió, GameSceneController ya detuvo esta escena: tocar
        // `statusText` acá lanzaría un error sobre un objeto destruido.
        if (outcome?.revived === true || !this.scene.isActive()) {
          return;
        }
        const reason: ReviveFailureReason | undefined =
          outcome?.revived === false ? outcome.reason : undefined;
        this.statusText.setText(
          languageManager.getText(
            // 'sdk_unavailable' y 'ads_cooldown' siguen siendo posibles (el
            // primero porque el use-case puede construirse sin puerto de
            // progresión; el segundo, ADR-006, por un cooldown autoinfligido
            // por la cancelación del jugador): en AMBOS no se reembolsa y la
            // jugada queda reintentable, por eso el botón solo se apaga en
            // 'refunded'.
            reason === 'sdk_unavailable'
              ? 'RESULT_AD_UNAVAILABLE'
              : reason === 'ads_cooldown'
                ? 'RESULT_AD_COOLDOWN'
                : reason === 'refunded'
                  ? 'RESULT_AD_REFUNDED'
                  : 'RESULT_AD_FAILED'
          )
        );
        if (reason === 'refunded') {
          // Causa raíz: el costo YA se reembolsó (invariante reembolso XOR
          // efecto) y el use-case bloquea cualquier revive posterior — el
          // botón dejaría prometiendo "Revivir" sin poder entregar nada, así
          // que se apaga (mismo estilo que disableMultiplyButtons).
          // CONTRASTE DE POLÍTICAS (ADR-006): 'ads_cooldown' NO entra en este
          // `if` — ese cooldown puede ser autoinfligido por la cancelación del
          // propio jugador, el use-case NO reembolsa y el reclamo sigue abierto:
          // el botón queda ACTIVO para que, pasados los 60 s, el reintento
          // pueda entregar el revive de verdad.
          this.disableActionButton(reviveBtn);
        }
      });
    }

    const bottomRowY = data.hasReviveUpgrade === true ? height / 2 + 70 : height / 2 + 20;
    this.createActionButton(width / 2 - 110, bottomRowY, 'RESULT_PLAY_AGAIN_BUTTON', 0x00e676, 0x5cffb0, () =>
      this.restartGame()
    );
    this.createActionButton(width / 2 + 110, bottomRowY, 'RESULT_EXIT_BUTTON', COLOR_LOSS_ACCENT, 0xff4d6d, () =>
      this.exitToMainMenu()
    );
  }

  private async handleMultiply(multiplier: RewardMultiplier): Promise<void> {
    if (!this.multiplyUseCase || this.multiplyUseCase.isClaimed()) return;

    this.statusText.setText(languageManager.getText('RESULT_AD_LOADING'));
    const result = await this.multiplyUseCase.execute(multiplier);

    if (result.success) {
      this.statusText.setText(languageManager.getText('RESULT_AD_BONUS', { amount: result.bonusAwarded.toLocaleString() }));
      this.particleManager.emitVictoryBurst(this.cameras.main.centerX, this.cameras.main.centerY - 50);
      this.disableMultiplyButtons();
    } else {
      this.statusText.setText(this.errorMessageFor(result.reason));
      // Causa raíz: con 'refunded' el costo ya se devolvió UNA sola vez y
      // el use-case bloquea cualquier reclamo posterior (reembolso XOR
      // efecto) — el botón seguiría diciendo "Duplicar x2"/"Triplicar x3"
      // sin poder entregar nada, así que se apaga y solo queda el mensaje
      // re-explicando la devolución.
      // 'ads_cooldown' (ADR-006) queda FUERA de este `if` a propósito: no
      // reembolsa, el reclamo sigue abierto y a los 60 s el reintento sí
      // puede entregar el efecto — solo se muestra el mensaje y los botones
      // permanecen ACTIVOS.
      if (result.reason === 'refunded') {
        this.disableMultiplyButtons();
      }
    }
  }

  // Firmado espejo de `MultiplyRewardResult` (ya no incluye
  // 'sdk_unavailable': esa rama del multiply devuelve 'refunded' — el
  // 'sdk_unavailable' del revive se maneja aparte en buildLostActions).
  private errorMessageFor(reason: 'ad_failed' | 'already_claimed' | 'refunded' | 'ads_cooldown'): string {
    switch (reason) {
      case 'ad_failed':
        return  languageManager.getText('RESULT_AD_FAILED');
      case 'already_claimed':
        return languageManager.getText('RESULT_AD_ALREADY_CLAIMED');
      case 'refunded':
        return languageManager.getText('RESULT_AD_REFUNDED');
      case 'ads_cooldown':
        return languageManager.getText('RESULT_AD_COOLDOWN');
    }
  }

  private disableMultiplyButtons(): void {
    const doubleBtn = this.registry.get('resultScene:doubleBtn') as Phaser.GameObjects.Container | undefined;
    const tripleBtn = this.registry.get('resultScene:tripleBtn') as Phaser.GameObjects.Container | undefined;

    [doubleBtn, tripleBtn].forEach(btn => this.disableActionButton(btn));
  }

  /**
   * Estado "agotado" de un botón de acción: alpha atenuado a 0.4 y sin
   * interactividad en los hijos (la zona de click vive como `zone` dentro
   * del contenedor). Compartido por Duplicar/Triplicar y por Revivir para
   * que las dos deshabilitaciones sean visualmente idénticas.
   */
  private disableActionButton(btn: Phaser.GameObjects.Container | undefined): void {
    if (btn) {
      btn.setAlpha(0.4);
      btn.list.forEach(child => child.disableInteractive?.());
      // Teclado PC (Fase 5): el MISMO punto único de apagado marca la entry
      // de foco — así las flechas lo saltan y el ENTER queda inerte y
      // silencioso (paridad con el hitZone disableInteractive del ratón).
      // Buscado por identidad de container (la única referencia compartida).
      const entry = this.kbFocusEntries.find(candidate => candidate.container === btn);
      if (entry) {
        entry.enabled = false;
        // Si el botón apagado era justamente el que tenía el foco, se apaga
        // también su resaltado: sin esto el glow quedaría encendido sobre un
        // botón muerto.
        if (this.kbFocusEntries[this.kbFocusIndex] === entry) {
          entry.highlight(false);
        }
      }
    }
  }

  /**
   * Teclado PC (Fase 5): ResultScene se lanza con `scene.launch()` ENCIMA
   * de GameScene + UIScene sin pausarlas, y Phaser emite `keydown-<KEY>` en
   * TODA escena RUNNING (no filtra la que está arriba) — sin esta guarda,
   * las flechas/ENTER actuarían sobre los botones de la partida de atrás.
   * Mismo fix que MainMenuScene.isForeground.
   */
  private isForeground(): boolean {
    // `this.scene.manager` (SceneManager) en vez de `this.scene.getScenes`:
    // la versión de Phaser del repo no expone getScenes en ScenePlugin.
    // Chequeo EXPLÍCITO de ads (mismo patrón que GameScene.
    // hasActiveOverlayScene / UIScene): no depender del orden de creación
    // — si algún día se lanzara un overlay antes que ResultScene, el último
    // de getScenes(true) no sería ésta y el foco quedaría muerto (NIT del
    // review de la Fase 5).
    if (this.scene.isActive('AdOverlayScene') || this.scene.isActive('AdBlockerScene')) {
      return false;
    }
    const active = this.scene.manager.getScenes(true);
    return active[active.length - 1] === this;
  }

  /**
   * Teclado PC (Fase 5): navega el foco con ↑/↓/←/→ sobre los botones de
   * resultado con el núcleo puro KeyboardNavigation (candidato HABILITADO
   * más cercano del lado pedido, sobre las posiciones REALES de los
   * containers). SIN sonido al mover — mismo criterio que MainMenuScene y
   * ShopScene.
   *
   * El auto-repeat del SO re-emite `keydown` cada ~30 ms con la tecla
   * mantenida — sin ignorar `repeat` el foco saltaría en tromba y
   * acumularía tweens; solo se navega en la pulsación inicial.
   */
  private handleFocusArrow(event: KeyboardEvent | undefined, direction: FocusDirection): void {
    if (event?.repeat) return;
    if (!this.isForeground()) return;

    const previousIndex = this.kbFocusIndex;
    this.kbFocusIndex = nextFocusIndex(this.kbFocusEntries, this.kbFocusIndex, direction);
    // Sin cambio de índice (borde de la lista, o sin items habilitados):
    // no se toca ningún resaltado.
    if (this.kbFocusIndex === previousIndex) return;
    if (previousIndex >= 0) this.kbFocusEntries[previousIndex]?.highlight(false);
    this.kbFocusEntries[this.kbFocusIndex]?.highlight(true);
  }

  /**
   * Teclado PC (Fase 5): ENTER activa el botón enfocado invocando el MISMO
   * closure onClick que el pointerup del ratón — NO se emite un pointer
   * sintético (mismo motivo que MainMenuScene/ShopScene). El sonido va por
   * `playUiClick` (punto único ADR-015).
   *
   * `kbActionTaken` protege la REENTRADA mientras la acción está en vuelo:
   * si el closure devuelve una promesa (ads de multiply/revive/restart), el
   * flag se libera en el `finally` apenas asienta — así las acciones que NO
   * navegan (multiply con ads_cooldown, revive reintenable — ADR-006)
   * devuelven el control al teclado en vez de dejar ENTER muerto para el
   * resto de botones hasta recrear la escena. Un botón apagado
   * (entry.enabled=false) es inerte y SILENCIOSO, paridad exacta con el
   * hitZone disableInteractive del ratón.
   */
  private activateFocusedItem(event?: KeyboardEvent): void {
    if (event?.repeat) return;
    if (!this.isForeground()) return;
    if (this.kbActionTaken) return;
    if (this.kbFocusIndex < 0) return; // nada enfocado → ENTER inerte
    const entry = this.kbFocusEntries[this.kbFocusIndex];
    if (!entry) return;
    if (!entry.enabled) return;
    playUiClick(this.audioService);
    this.kbActionTaken = true;
    try {
      // Promise.resolve cubre ambos mundos: closures sync (void) liberan el
      // flag en la microtask siguiente (bloquea el doble ENTER del mismo
      // tick) y los async lo liberan cuando el ad termina.
      void Promise.resolve(entry.onClick()).finally(() => {
        this.kbActionTaken = false;
      });
    } catch (error) {
      // Si el closure lanza sincrónicamente, el flag no debe quedarse clavado.
      this.kbActionTaken = false;
      throw error;
    }
  }

  /**
   * "Jugar de nuevo": dispara el Midgame Ad (interstitial) de CrazyGames
   * ANTES de reiniciar GameScene — este es uno de los dos puntos de
   * transición entre partidas que exige la política de monetización de
   * CrazyGames (ver `runMidgameAdThen`, que documenta el contrato de
   * "garantía de navegación" completo).
   */
  private restartGame(): Promise<void> {
    // Devuelve la promesa (no `void ...`): el flag de reentrada de ENTER
    // se libera recién cuando el midgame ad termina y corre la navegación.
    return this.runMidgameAdThen(() => {
      this.scene.stop('ResultScene');
      this.scene.get('GameScene')?.scene.restart();
    });
  }

  /**
   * Botón "Ir al Menú" (REQ): NO limpia la caché ni elimina los datos del jugador almacenados en localStorage.
   *
   * También dispara el Midgame Ad ANTES de transicionar a MainMenuScene
   * (segundo punto de transición entre partidas exigido por CrazyGames).
   */
  private exitToMainMenu(): Promise<void> {
    // REQ: Redirigir al usuario a MainMenuScene SIN limpiar la caché.
    // Se elimina this.services.progressionManager.resetAllProgress();
    // Devuelve la promesa: el flag de reentrada de ENTER cubre el vuelo
    // del midgame ad (mismo motivo que restartGame).
    return this.runMidgameAdThen(() => {
      // BUGFIX (bug_fix_audio_lifecycle) — requisito (b): se invoca el
      // método de detención GLOBAL del servicio de audio ANTES de la
      // transición de escena. A diferencia de la versión anterior
      // (`this.audioManager.stopMusic(0)` sobre una instancia local que
      // nunca había reproducido nada), `this.audioService` es la MISMA
      // instancia que GameScene usó para arrancar la música — por lo tanto
      // esto SÍ la detiene de verdad, y con `stopAll` de paso se limpia
      // cualquier efecto de sonido que pudiera seguir sonando.
      this.audioService.stopAll(0);

      this.scene.stop('ResultScene');
      this.scene.stop('UIScene');
      this.scene.stop('GameScene');
      this.scene.start('MainMenuScene');
    });
  }

  /**
   * Punto único de integración del Midgame Ad (CrazyGames SDK v3), usado
   * por AMBAS transiciones entre partidas ("Jugar de nuevo" e "Ir al
   * Menú"). Contrato de "Flow Safety" que exige CrazyGames:
   *
   * 1. El audio ya NO se maneja acá: se silencia/restaura globalmente en
   *    `main.ts` a partir de `onAdLifecycle` ('started' / 'ended'), es
   *    decir SOLO si el anuncio realmente empezó. Antes esta función
   *    hacía `sound.pauseAll()` al PEDIR el anuncio, lo que cortaba la
   *    música aunque el request terminara sin fill (adblock, timing).
   * 2. Espera `showMidgameAd()`, que siempre resuelve (nunca rechaza)
   *    sea cual sea el resultado: reproducido, fallado, sin fill o
   *    bloqueado por AdBlocker.
   * 3. Ejecuta `onComplete()` (que llama a `scene.start()`/`restart()`)
   *    en el `finally`, así la navegación queda garantizada pase lo que
   *    pase con el anuncio y nunca se congela la pantalla de resultado.
   */
  private async runMidgameAdThen(onComplete: () => void): Promise<void> {
    try {
      await this.services.crazyGamesService.showMidgameAd();
    } catch (error) {
      console.warn('[ResultScene] showMidgameAd() rechazó inesperadamente — se continúa igual.', error);
    } finally {
      onComplete();
    }
  }

  /**
   * Botón estilo "Casino de Lujo": panel oscuro + borde de acento + halo
   * de hover + microinteracción de escala — misma construcción que
   * MainMenuScene.createCasinoButton() / BankerOfferPanel.createArcadeButton(),
   * para que los botones de la pantalla final compartan exactamente la
   * misma línea estética que el resto del juego.
   */
  private createActionButton(
    x: number,
    y: number,
    translationKey: TranslationKey,
    primaryColor: number,
    hoverGlowColor: number,
    // `void | Promise<void>`: los closures de Duplicar/Triplicar/Revivir y
    // ahora también restart/exit devuelven la promesa del ad — el flag de
    // reentrada del teclado la espera antes de liberarse (ver
    // activateFocusedItem). El pointerup del ratón la ignora (Phaser no
    // espera el return de onComplete), así que el ratón no cambia.
    onClick: () => void | Promise<void>
  ): Phaser.GameObjects.Container {
    const width = 200;
    const height = 48;

    const container = this.add.container(x, y);

    // Halo externo, invisible en reposo, que se enciende en hover.
    const glow = this.add.graphics();
    glow.fillStyle(hoverGlowColor, 0.45);
    glow.fillRoundedRect(-width / 2 - 8, -height / 2 - 8, width + 16, height + 16, 16);
    glow.setAlpha(0);

    // Panel oscuro con borde de acento (propio de cada acción) y un filo
    // dorado interior muy fino, mismo acabado "premium" del resto de la UI.
    const bg = this.add.graphics();
    bg.fillStyle(0x121218, 0.95);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 10);
    bg.lineStyle(2, primaryColor, 0.9);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 10);
    bg.lineStyle(1, COLOR_GOLD, 0.25);
    bg.strokeRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, height - 8, 8);

    const btnText = new LocalizedText(this, 0, 0, translationKey, {
      fontFamily: FONT_FAMILY,
      fontSize: '17px',
      fontStyle: 'bold',
      color: COLOR_WHITE_HEX
    }).setOrigin(0.5);

    container.add([glow, bg, btnText]);

    // Zona interactiva invisible del tamaño exacto del botón.
    const hitZone = this.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add(hitZone);

    // Efecto de resaltado ÚNICO compartido entre el hover del ratón y el
    // foco de teclado (Fase 5): mismos tweens y misma duración que el hover
    // — el teclado se ve idéntico a pasar el cursor (mismo patrón que
    // MainMenuScene.createCasinoButton).
    const highlight = (on: boolean): void => {
      this.tweens.add({ targets: container, scale: on ? 1.05 : 1, duration: 120, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: glow, alpha: on ? 1 : 0, duration: 120, ease: 'Cubic.easeOut' });
    };

    hitZone.on('pointerover', () => highlight(true));
    hitZone.on('pointerout', () => highlight(false));
    // Click genérico de UI (punto único: UiSfx.bindUiClick).
    bindUiClick(hitZone, this.audioService);

    hitZone.on('pointerup', () => {
      this.tweens.add({
        targets: container,
        scale: 0.95,
        duration: 50,
        yoyo: true,
        onComplete: onClick
      });
    });

    // Teclado PC (Fase 5): registro como item de foco con la geometría REAL
    // del container y el MISMO closure onClick que recibe el pointerup del
    // ratón — ENTER lo invoca directo, NO un pointer sintético. Todos nacen
    // habilitados; el único apagado posible (disableActionButton) marca la
    // entry en el mismo punto único donde apaga el botón.
    this.kbFocusEntries.push({ x: container.x, y: container.y, enabled: true, container, glow, onClick, highlight });

    return container;
  }
}