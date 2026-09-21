import Phaser from 'phaser';
import { getServices, GameServices } from '../GameServices';
import { ResultSceneData, ResultOutcome } from './ResultScene.types';
import { MultiplyRewardUseCase, RewardMultiplier } from '../../application/use-cases/MultiplyRewardUseCase';
import { ParticleManager } from '../components/ParticleManager';
import { LocalizedText } from '../components/LocalizedText';
import { TranslationKey } from '../../shared/i18n/LanguageData';
import { IAudioService } from '../../domain/ports/IAudioService';
import {
  CardPositionSource,
  getGameObjectGlobalPosition
} from '../effects/deck-celebrations/DeckCelebrationEffect';

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

  private buildWonActions(data: ResultSceneData): void {
    const { width, height } = this.cameras.main;
    const baseAmount = data.amount ?? 0;
    this.multiplyUseCase = new MultiplyRewardUseCase(baseAmount, this.services.crazyGamesService, this.services.progressionManager);

    // Upgrades "Duplicar"/"Triplicar": son consumibles de esta partida —
    // solo se ofrecen si el jugador los compró en la tienda durante ESTA
    // sesión (ver GameSceneController.buildUpgradeFlagsForResultScene).
    // Ambos pueden coexistir; si falta alguno, el que queda se centra.
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
      this.createActionButton(width / 2, height / 2 - 5, 'RESULT_REVIVE_BUTTON', COLOR_GOLD, COLOR_GOLD_DIM, async () => {
        if (!data.onRevive) return;
        this.statusText.setText('loading ad...');
        await data.onRevive();
        this.statusText.setText('The ad was not completed. Try again.');
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

    this.statusText.setText('loading ad...');
    const result = await this.multiplyUseCase.execute(multiplier);

    if (result.success) {
      this.statusText.setText(`¡BONUS!\n+$${result.bonusAwarded.toLocaleString()}`);
      this.particleManager.emitVictoryBurst(this.cameras.main.centerX, this.cameras.main.centerY - 50);
      this.disableMultiplyButtons();
    } else {
      this.statusText.setText(this.errorMessageFor(result.reason));
    }
  }

  private errorMessageFor(reason: 'ad_failed' | 'sdk_unavailable' | 'already_claimed'): string {
    switch (reason) {
      case 'ad_failed':
        return 'The ad was not completed. Try again.';
      case 'sdk_unavailable':
        return 'Ads are not available at this time.';
      case 'already_claimed':
        return 'You have already claimed your bonus.';
    }
  }

  private disableMultiplyButtons(): void {
    const doubleBtn = this.registry.get('resultScene:doubleBtn') as Phaser.GameObjects.Container | undefined;
    const tripleBtn = this.registry.get('resultScene:tripleBtn') as Phaser.GameObjects.Container | undefined;

    [doubleBtn, tripleBtn].forEach(btn => {
      if (btn) {
        btn.setAlpha(0.4);
        btn.list.forEach(child => child.disableInteractive?.());
      }
    });
  }

  private restartGame(): void {
    this.scene.stop('ResultScene');
    this.scene.get('GameScene')?.scene.restart();
  }

  /**
   * Botón "Ir al Menú" (REQ): NO limpia la caché ni elimina los datos del jugador almacenados en localStorage.
   */
  private exitToMainMenu(): void {
    // REQ: Redirigir al usuario a MainMenuScene SIN limpiar la caché.
    // Se elimina this.services.progressionManager.resetAllProgress();

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