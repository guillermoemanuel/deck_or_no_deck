import Phaser from 'phaser';
import { OnboardingHintId } from '../../domain/ports/IOnboardingRepository';
import { TranslationKey } from '../../shared/i18n/LanguageData';
import { LocalizedText } from './LocalizedText';

const COLOR_GOLD = 0xffd76a;
const COLOR_GOLD_DIM = 0xd4af37;
const COLOR_GOLD_HEX = '#ffd76a';
const COLOR_PANEL_BG = 0x0a0e17;
const COLOR_HIGHLIGHT = 0x00e5ff;
const FONT_FAMILY = 'Georgia, "Times New Roman", serif';

const BUBBLE_WIDTH = 620;
const BUBBLE_HEIGHT = 104;
/** Debajo del tablero (que termina ~y=610) y a la izquierda de los controles de sonido/pantalla completa. */
const BUBBLE_Y = 662;
const DEPTH = 900;

interface Frame {
  /** Centro y tamaño en coordenadas de la escena (no del contenedor). */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface HintLayout {
  readonly titleKey: TranslationKey;
  readonly bodyKey: TranslationKey;
  /** Marco pulsante que señala la zona de pantalla a la que se refiere el consejo. */
  readonly highlight: Frame | null;
  /** Línea chica al pie que remite a la escena "Cómo jugar" del menú. */
  readonly showMoreInfo: boolean;
}

const HINT_LAYOUTS: Record<OnboardingHintId, HintLayout> = {
  open_card: {
    titleKey: 'ONBOARDING_OPEN_CARD_TITLE',
    bodyKey: 'ONBOARDING_OPEN_CARD_BODY',
    // Tablero de 4×3 cartas (ver GameScene.onSecretCardChosen).
    highlight: { x: 500, y: 366, width: 580, height: 508 },
    showMoreInfo: false
  },
  energy: {
    titleKey: 'ONBOARDING_ENERGY_TITLE',
    bodyKey: 'ONBOARDING_ENERGY_BODY',
    // EnergyBarView está en (490, 32).
    highlight: { x: 490, y: 34, width: 440, height: 70 },
    showMoreInfo: false
  },
  banker_offer: {
    titleKey: 'ONBOARDING_BANKER_TITLE',
    bodyKey: 'ONBOARDING_BANKER_BODY',
    highlight: null,
    showMoreInfo: true
  }
};

/**
 * Burbuja de consejo contextual del onboarding in-game.
 *
 * Es deliberadamente NO bloqueante: solo el enlace "Omitir consejos" es
 * interactivo, así el jugador nunca queda frenado por el tutorial — sigue
 * jugando mientras lee, y el consejo desaparece solo cuando deja de aplicar
 * (lo decide `OnboardingFlow`, esta clase solo dibuja).
 *
 * Convive con la escena "Cómo jugar" del menú: acá se enseña lo mínimo en el
 * momento exacto en que hace falta; allá queda la versión completa para
 * quien quiera leer con calma.
 */
export class OnboardingCoach {
  private container: Phaser.GameObjects.Container | null = null;
  private skipListener: (() => void) | null = null;

  constructor(private readonly scene: Phaser.Scene) {}

  /** Callback para el enlace "Omitir consejos". */
  onSkip(listener: () => void): void {
    this.skipListener = listener;
  }

  isShowing(): boolean {
    return this.container !== null;
  }

  show(hint: OnboardingHintId): void {
    this.destroyNow();

    const layout = HINT_LAYOUTS[hint];
    const cx = this.scene.cameras.main.centerX - 80;

    const bg = this.scene.add
      .rectangle(0, 0, BUBBLE_WIDTH, BUBBLE_HEIGHT, COLOR_PANEL_BG, 0.96)
      .setStrokeStyle(2, COLOR_GOLD_DIM, 0.9);

    const title = new LocalizedText(this.scene, 0, -32, layout.titleKey, {
      fontFamily: FONT_FAMILY,
      fontSize: '18px',
      fontStyle: 'bold',
      color: COLOR_GOLD_HEX
    }).setOrigin(0.5);

    const body = new LocalizedText(this.scene, 0, -14, layout.bodyKey, {
      fontFamily: 'Arial, sans-serif',
      fontSize: '17px',
      color: '#ffffff',
      align: 'center',
      wordWrap: { width: BUBBLE_WIDTH - 40 }
    }).setOrigin(0.5, 0);

    const skip = new LocalizedText(this.scene, BUBBLE_WIDTH / 2 - 12, -BUBBLE_HEIGHT / 2 + 14, 'ONBOARDING_SKIP', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '15px',
      color: '#8b949e'
    })
      .setOrigin(1, 0.5)
      .setInteractive({ useHandCursor: true });
    skip.on('pointerover', () => skip.setColor('#ffffff'));
    skip.on('pointerout', () => skip.setColor('#8b949e'));
    skip.on('pointerdown', () => this.skipListener?.());

    const children: Phaser.GameObjects.GameObject[] = [bg, title, body, skip];

    if (layout.showMoreInfo) {
      children.push(
        new LocalizedText(this.scene, 0, BUBBLE_HEIGHT / 2 - 14, 'ONBOARDING_MORE_INFO', {
          fontFamily: 'Arial, sans-serif',
          fontSize: '15px',
          color: '#00e5ff'
        }).setOrigin(0.5)
      );
    }

    // Los marcos se dibujan en coordenadas de escena, pero viven dentro del
    // contenedor (para destruirse juntos), así que se restan la posición del
    // contenedor: (cx, BUBBLE_Y).
    if (layout.highlight) {
      const frame = this.scene.add
        .rectangle(
          layout.highlight.x - cx,
          layout.highlight.y - BUBBLE_Y,
          layout.highlight.width,
          layout.highlight.height,
          COLOR_HIGHLIGHT,
          0
        )
        .setStrokeStyle(3, COLOR_HIGHLIGHT, 0.9);
      this.scene.tweens.add({
        targets: frame,
        alpha: { from: 1, to: 0.25 },
        duration: 650,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
      children.push(frame);
    }

    const container = this.scene.add.container(cx, BUBBLE_Y + 12, children).setDepth(DEPTH).setAlpha(0);
    this.container = container;

    this.scene.tweens.add({
      targets: container,
      alpha: 1,
      y: BUBBLE_Y,
      duration: 260,
      ease: 'Cubic.easeOut'
    });

    // Decoración mínima de brillo dorado en el borde, igual que los paneles del banquero.
    bg.setStrokeStyle(2, COLOR_GOLD, 0.7);
  }

  hide(): void {
    const container = this.container;
    if (!container) {
      return;
    }
    this.container = null;
    this.scene.tweens.add({
      targets: container,
      alpha: 0,
      duration: 180,
      onComplete: () => container.destroy()
    });
  }

  destroy(): void {
    this.skipListener = null;
    this.destroyNow();
  }

  private destroyNow(): void {
    if (this.container) {
      this.scene.tweens.killTweensOf(this.container);
      this.container.destroy();
      this.container = null;
    }
  }
}
