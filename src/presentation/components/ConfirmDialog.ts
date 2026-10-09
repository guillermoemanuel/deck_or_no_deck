import Phaser from 'phaser';
import { TranslationKey } from '../../shared/i18n/LanguageData';
import { TranslationParams } from '../../shared/i18n/LanguageManager';
import { LocalizedText } from './LocalizedText';
import { IAudioService } from '../../domain/ports/IAudioService';
import { bindUiClick } from '../audio/UiSfx';

const COLOR_GOLD = 0xffd76a;
const COLOR_GOLD_DIM = 0xd4af37;
const COLOR_GOLD_HEX = '#ffd76a';
const COLOR_PANEL_BG = 0x0a0e17;
const COLOR_NEUTRAL = 0x8b949e;
const FONT_FAMILY = 'Georgia, "Times New Roman", serif';
const DEPTH = 1000;

export interface ConfirmDialogConfig {
  readonly titleKey: TranslationKey;
  readonly bodyKey: TranslationKey;
  readonly bodyParams?: TranslationParams;
  readonly cancelKey: TranslationKey;
  readonly confirmKey: TranslationKey;
  /** Color de acento del botón de confirmar (rojo para acciones destructivas). */
  readonly confirmColor: number;
  readonly onConfirm: () => void;
  /** Se llama al cancelar (botón, ESC). */
  readonly onCancel?: () => void;
}

/**
 * Diálogo modal de confirmación con el estilo "Casino de Lujo" del resto del
 * juego. Bloquea todo lo que hay debajo (fondo interactivo a mayor depth), y
 * se cierra solo tras elegir. "Cancelar" es el botón por defecto: ESC también
 * cancela, nunca confirma.
 */
export class ConfirmDialog {
  private container: Phaser.GameObjects.Container | null = null;
  private readonly onEscape = (): void => this.cancel();

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly config: ConfirmDialogConfig,
    private readonly audio?: IAudioService
  ) {
    this.build();
  }

  isOpen(): boolean {
    return this.container !== null;
  }

  destroy(): void {
    this.scene.input.keyboard?.off('keydown-ESC', this.onEscape);
    this.container?.destroy();
    this.container = null;
  }

  private cancel(): void {
    if (!this.container) return;
    this.destroy();
    this.config.onCancel?.();
  }

  private confirm(): void {
    if (!this.container) return;
    this.destroy();
    this.config.onConfirm();
  }

  private build(): void {
    const { width, height } = this.scene.cameras.main;
    const cx = width / 2;
    const cy = height / 2;

    const backdrop = this.scene.add.rectangle(cx, cy, width * 2, height * 2, 0x000000, 0.75).setInteractive();

    const panelBg = this.scene.add
      .rectangle(cx, cy, 560, 280, COLOR_PANEL_BG, 0.98)
      .setStrokeStyle(3, COLOR_GOLD_DIM, 0.9);
    const innerFrame = this.scene.add.rectangle(cx, cy, 540, 260, 0x000000, 0).setStrokeStyle(1, COLOR_GOLD, 0.35);

    const title = new LocalizedText(this.scene, cx, cy - 100, this.config.titleKey, {
      fontFamily: FONT_FAMILY,
      fontSize: '24px',
      fontStyle: 'bold',
      color: COLOR_GOLD_HEX
    }).setOrigin(0.5);

    const body = new LocalizedText(
      this.scene,
      cx,
      cy - 50,
      this.config.bodyKey,
      {
        fontFamily: FONT_FAMILY,
        fontSize: '18px',
        color: '#ffb4c0',
        align: 'center',
        wordWrap: { width: 480 }
      },
      this.config.bodyParams
    ).setOrigin(0.5, 0);

    const buttonY = cy + 90;
    const cancelBtn = this.createButton(cx - 130, buttonY, this.config.cancelKey, COLOR_NEUTRAL, () => this.cancel());
    const confirmBtn = this.createButton(cx + 130, buttonY, this.config.confirmKey, this.config.confirmColor, () =>
      this.confirm()
    );

    const container = this.scene.add
      .container(0, 0, [backdrop, panelBg, innerFrame, title, body, cancelBtn, confirmBtn])
      .setDepth(DEPTH)
      .setScale(0.2)
      .setAlpha(0);
    // El escalado nace en el origen (0,0): se compensa para que el panel crezca desde el centro.
    container.setPosition(cx * 0.8, cy * 0.8);
    this.container = container;

    this.scene.tweens.add({
      targets: container,
      scale: 1,
      alpha: 1,
      x: 0,
      y: 0,
      duration: 200,
      ease: 'Back.easeOut'
    });

    this.scene.input.keyboard?.on('keydown-ESC', this.onEscape);
  }

  private createButton(
    x: number,
    y: number,
    label: TranslationKey,
    accent: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const w = 220;
    const h = 50;
    const container = this.scene.add.container(x, y);

    const glow = this.scene.add.graphics();
    glow.fillStyle(accent, 0.4);
    glow.fillRoundedRect(-w / 2 - 8, -h / 2 - 8, w + 16, h + 16, 16);
    glow.setAlpha(0);

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x121218, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 10);
    bg.lineStyle(2, accent, 0.9);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 10);
    bg.lineStyle(1, COLOR_GOLD, 0.25);
    bg.strokeRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, 8);

    const text = new LocalizedText(this.scene, 0, 0, label, {
      fontFamily: FONT_FAMILY,
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);

    const hit = this.scene.add.zone(0, 0, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add([glow, bg, text, hit]);
    // Click genérico de UI (punto único: UiSfx.bindUiClick).
    bindUiClick(hit, this.audio);

    hit.on('pointerover', () => this.scene.tweens.add({ targets: glow, alpha: 1, duration: 150 }));
    hit.on('pointerout', () => this.scene.tweens.add({ targets: glow, alpha: 0, duration: 150 }));
    hit.on('pointerup', onClick);

    return container;
  }
}
