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
import { bindUiClick } from '../audio/UiSfx';

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
    }
  }

  /**
   * "Jugar de nuevo": dispara el Midgame Ad (interstitial) de CrazyGames
   * ANTES de reiniciar GameScene — este es uno de los dos puntos de
   * transición entre partidas que exige la política de monetización de
   * CrazyGames (ver `runMidgameAdThen`, que documenta el contrato de
   * "garantía de navegación" completo).
   */
  private restartGame(): void {
    void this.runMidgameAdThen(() => {
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
  private exitToMainMenu(): void {
    // REQ: Redirigir al usuario a MainMenuScene SIN limpiar la caché.
    // Se elimina this.services.progressionManager.resetAllProgress();
    void this.runMidgameAdThen(() => {
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
    onClick: () => void
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

    hitZone.on('pointerover', () => {
      this.tweens.add({ targets: container, scale: 1.05, duration: 120, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: glow, alpha: 1, duration: 120, ease: 'Cubic.easeOut' });
    });

    hitZone.on('pointerout', () => {
      this.tweens.add({ targets: container, scale: 1, duration: 120, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: glow, alpha: 0, duration: 120, ease: 'Cubic.easeOut' });
    });
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

    return container;
  }
}