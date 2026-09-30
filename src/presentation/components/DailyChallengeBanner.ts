import Phaser from 'phaser';
import { getServices } from '../GameServices';
import { getUtcDateKey, msUntilNextUtcDay } from '../../domain/value-objects/DailyBoard';
import { DailyChallengeState, DailyStatus, getDailyStatus, previewDailyCompletion } from '../../domain/value-objects/DailyChallenge';
import { getWinRatePercent } from '../../domain/value-objects/PlayerRecords';
import { formatShortDuration } from '../../shared/utils/TimeFormat';
import { requestDailyChallenge } from '../GameMode';
import { LocalizedText } from './LocalizedText';

const COLOR_GOLD = 0xffd76a;
const COLOR_GOLD_DIM = 0xd4af37;
const COLOR_GOLD_HEX = '#ffd76a';
const COLOR_DIM_HEX = '#8b949e';
const FONT_FAMILY = 'Georgia, "Times New Roman", serif';

export interface DailyChallengeBannerConfig {
  readonly x: number;
  readonly y: number;
  readonly width: number;
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

  constructor(scene: Phaser.Scene, config: DailyChallengeBannerConfig) {
    const services = getServices(scene);
    const now = Date.now();
    const todayKey = getUtcDateKey(now);
    const dailyState = services.dailyChallengeRepository.get();
    const status = getDailyStatus(dailyState, todayKey);
    const records = services.recordsRepository.get();

    const { x, y, width, onStart } = config;
    const height = 64;
    const isAvailable = status === 'available';

    const bg = scene.add
      .rectangle(0, 0, width, height, 0x121218, 0.92)
      .setStrokeStyle(2, isAvailable ? COLOR_GOLD : COLOR_GOLD_DIM, isAvailable ? 0.9 : 0.4);

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
      hit.on('pointerover', () => bg.setFillStyle(0x1c1c26, 0.95));
      hit.on('pointerout', () => bg.setFillStyle(0x121218, 0.92));
      hit.on('pointerup', () => {
        requestDailyChallenge(scene.game.registry, todayKey);
        onStart();
      });
    }
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
