import Phaser from 'phaser';
import { getServices } from '../GameServices';
import { getUtcDateKey, msUntilNextUtcDay } from '../../domain/value-objects/DailyBoard';
import { DailyChallengeState, DailyStatus, getDailyStatus, previewDailyCompletion } from '../../domain/value-objects/DailyChallenge';
import { getWinRatePercent } from '../../domain/value-objects/PlayerRecords';
import { formatShortDuration } from '../../shared/utils/TimeFormat';
import { requestDailyChallenge } from '../GameMode';
import { LocalizedText } from './LocalizedText';
import { SFX } from '../../shared/audio/AudioData';

const COLOR_GOLD = 0xffd76a;
const COLOR_GOLD_DIM = 0xd4af37;
const COLOR_GOLD_HEX = '#ffd76a';
const COLOR_DIM_HEX = '#8b949e';
const FONT_FAMILY = 'Georgia, "Times New Roman", serif';

// Fill de reposo del panel: lo pinta el constructor y lo restaura
// highlight(false). Es el ÚNICO dueño del valor (Fase 7) — el hover del
// ratón y el foco de teclado pasan por highlight() para no divergir.
const BG_REST_COLOR = 0x121218;
const BG_REST_ALPHA = 0.92;
const BG_HOVER_COLOR = 0x1c1c26;
const BG_HOVER_ALPHA = 0.95;

export interface DailyChallengeBannerConfig {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  /** Alto del panel — lo expone para que MainMenuScene arme el FocusItem con la geometría real (Fase 7). */
  readonly height: number;
  readonly onStart: () => void;
}

/**
 * Banner del menú principal con el Desafío Diario (recompensa/racha o
 * cuenta regresiva) y una línea de récords personales debajo.
 *
 * Es deliberadamente estático (se arma una vez, con el estado al momento de
 * entrar al menú): no hay countdown en vivo tick-a-tick — es coherente con
 * el resto del menú, que ya se reconstruye entero cada vez que se vuelve a
 * él (`MainMenuScene.create()`), y evita un timer más que limpiar.
 */
export class DailyChallengeBanner {
  private readonly container: Phaser.GameObjects.Container;
  // Fase 7 (teclado PC): estado que la API de foco necesita re-leer fuera
  // del constructor — el background del panel (para highlight) y todo lo que
  // activate() replayea igual que el pointerup del ratón.
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly available: boolean;
  private readonly scene: Phaser.Scene;
  private readonly todayKey: string;
  private readonly services: ReturnType<typeof getServices>;
  private readonly onStart: () => void;
  // Geometría expuesta para que MainMenuScene arme el FocusItem sin coords
  // nuevas (Fase 7) — misma razón que los getters de foco de otros componentes.
  readonly width: number;
  readonly height: number;

  constructor(scene: Phaser.Scene, config: DailyChallengeBannerConfig) {
    const services = getServices(scene);
    const now = Date.now();
    const todayKey = getUtcDateKey(now);
    const dailyState = services.dailyChallengeRepository.get();
    const status = getDailyStatus(dailyState, todayKey);
    const records = services.recordsRepository.get();

    const { x, y, width, height, onStart } = config;
    const isAvailable = status === 'available';

    this.scene = scene;
    this.services = services;
    this.todayKey = todayKey;
    this.available = isAvailable;
    this.onStart = onStart;
    this.width = width;
    this.height = height;

    const bg = scene.add
      .rectangle(0, 0, width, height, 0x121218, 0.92)
      .setStrokeStyle(2, isAvailable ? COLOR_GOLD : COLOR_GOLD_DIM, isAvailable ? 0.9 : 0.4);
    this.bg = bg;

    const title = new LocalizedText(scene, 0, -15, 'DAILY_CHALLENGE_TITLE', {
      fontFamily: FONT_FAMILY,
      fontSize: '17px',
      fontStyle: 'bold',
      color: isAvailable ? COLOR_GOLD_HEX : COLOR_DIM_HEX
    }).setOrigin(0.5);

    const subtitle = this.buildSubtitle(scene, status, dailyState, todayKey, now);
    subtitle.setPosition(0, 10).setOrigin(0.5);

    const statsLine = new LocalizedText(
      scene,
      0,
      height / 2 + 16,
      'STATS_LINE',
      { fontFamily: 'Arial, sans-serif', fontSize: '13px', color: COLOR_DIM_HEX },
      {
        games: records.gamesPlayed,
        winRate: getWinRatePercent(records),
        bestPayout: records.bestPayout.toLocaleString()
      }
    ).setOrigin(0.5);

    this.container = scene.add.container(x, y, [bg, title, subtitle, statsLine]);

    if (isAvailable) {
      const hit = scene.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive({ useHandCursor: true });
      this.container.add(hit);
      // El hover delega en highlight() — el MISMO camino que usa el foco de
      // teclado, así el resaltado no puede divergir entre puntero y flechas.
      hit.on('pointerover', () => this.highlight(true));
      hit.on('pointerout', () => this.highlight(false));
      hit.on('pointerup', () => this.activate());
    }
  }

  /** Fase 7 (teclado): ¿el desafío de hoy se puede empezar? false si ya se jugó/completó. */
  isAvailable(): boolean {
    return this.available;
  }

  /**
   * Fase 7 (teclado): enciende/apaga el resaltado del panel. ÚNICO dueño
   * del cambio de fill — el hover del ratón (más arriba) y el foco de
   * teclado de MainMenuScene lo invocan, así ambos se ven idénticos
   * (criterio M2 del review de la Fase 3).
   */
  highlight(on: boolean): void {
    this.bg.setFillStyle(on ? BG_HOVER_COLOR : BG_REST_COLOR, on ? BG_HOVER_ALPHA : BG_REST_ALPHA);
  }

  /**
   * Fase 7 (teclado): activa el desafío TAL CUAL el pointerup del ratón —
   * pide el modo diario en el registry, suena el click de reclamo y navega
   * vía onStart. El pointerup delega acá, así ENTER del teclado y clic
   * comparten un solo camino. No-op si el banner no está disponible (el
   * ratón tampoco puede clickearlo: no tiene hit zone en ese estado).
   */
  activate(): void {
    if (!this.available) return;
    requestDailyChallenge(this.scene.game.registry, this.todayKey);
    // El sonido marca el click de reclamo — la acreditación real del
    // premio ocurre al final de la partida (application), no acá.
    try {
      this.services.audioService.play(SFX.BONUS_CLAIM);
    } catch {
      // Audio best-effort: nunca rompe la interacción.
    }
    this.onStart();
  }

  destroy(): void {
    this.container.destroy();
  }

  private buildSubtitle(
    scene: Phaser.Scene,
    status: DailyStatus,
    dailyState: DailyChallengeState,
    todayKey: string,
    now: number
  ): LocalizedText {
    if (status === 'available') {
      const preview = previewDailyCompletion(dailyState, todayKey);
      return new LocalizedText(
        scene,
        0,
        0,
        'DAILY_CHALLENGE_AVAILABLE',
        { fontFamily: 'Arial, sans-serif', fontSize: '14px', color: '#ffffff' },
        { reward: preview.reward.toLocaleString(), streak: preview.streak }
      );
    }
    const time = formatShortDuration(msUntilNextUtcDay(now));
    const key = status === 'completed' ? 'DAILY_CHALLENGE_COMPLETED' : 'DAILY_CHALLENGE_USED';
    return new LocalizedText(
      scene,
      0,
      0,
      key,
      { fontFamily: 'Arial, sans-serif', fontSize: '14px', color: COLOR_DIM_HEX },
      { time }
    );
  }
}
