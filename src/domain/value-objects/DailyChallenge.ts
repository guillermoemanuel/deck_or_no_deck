import { shiftDateKey } from './DailyBoard';

/**
 * Reglas del Desafío Diario (puras, sin tiempo ni storage propios).
 *
 * - Un intento por día (UTC). El intento se CONSUME al empezar: como el
 *   tablero es el mismo para todos y no cambia en el día, dejar reintentar
 *   permitiría memorizarlo.
 * - Terminar la partida (ganar o perder) cuenta como completar el desafío,
 *   suma a la racha diaria y paga la recompensa.
 * - La racha sube si completaste AYER; si faltó un día, vuelve a 1.
 */

/** Recompensa base en monedas por completar el desafío (día 1 de racha). */
export const DAILY_REWARD_BASE = 1000;
/** Monedas extra por cada día adicional de racha. */
export const DAILY_REWARD_STREAK_STEP = 500;
/** Racha a partir de la cual la recompensa deja de crecer. */
export const DAILY_REWARD_MAX_STREAK = 7;

export interface DailyChallengeState {
  /** Último día (`YYYY-MM-DD`) cuyo intento se empezó, o null. */
  readonly lastStartedDate: string | null;
  /** Último día cuyo desafío se completó, o null. */
  readonly lastCompletedDate: string | null;
  readonly currentStreak: number;
  readonly bestStreak: number;
  readonly totalCompleted: number;
  /** Mejor premio logrado en un desafío diario. */
  readonly bestPayout: number;
}

export const EMPTY_DAILY_STATE: DailyChallengeState = {
  lastStartedDate: null,
  lastCompletedDate: null,
  currentStreak: 0,
  bestStreak: 0,
  totalCompleted: 0,
  bestPayout: 0
};

/** 'available': se puede jugar hoy. 'used': se empezó hoy y no se terminó. 'completed': ya lo completó hoy. */
export type DailyStatus = 'available' | 'used' | 'completed';

export function getDailyStatus(state: DailyChallengeState, todayKey: string): DailyStatus {
  if (state.lastCompletedDate === todayKey) {
    return 'completed';
  }
  if (state.lastStartedDate === todayKey) {
    return 'used';
  }
  return 'available';
}

/** Racha vigente a efectos de mostrar: se corta si ni hoy ni ayer se completó. */
export function getActiveStreak(state: DailyChallengeState, todayKey: string): number {
  if (state.lastCompletedDate === todayKey || state.lastCompletedDate === shiftDateKey(todayKey, -1)) {
    return state.currentStreak;
  }
  return 0;
}

/** Racha que tendría el jugador si completara el desafío hoy (para anunciar la recompensa antes de jugar). */
export function getNextStreak(state: DailyChallengeState, todayKey: string): number {
  if (state.lastCompletedDate === todayKey) {
    return state.currentStreak;
  }
  return state.lastCompletedDate === shiftDateKey(todayKey, -1) ? state.currentStreak + 1 : 1;
}

export function getDailyReward(streak: number): number {
  const effective = Math.min(Math.max(streak, 1), DAILY_REWARD_MAX_STREAK);
  return DAILY_REWARD_BASE + (effective - 1) * DAILY_REWARD_STREAK_STEP;
}

/** Consume el intento de hoy. Idempotente. */
export function markDailyStarted(state: DailyChallengeState, todayKey: string): DailyChallengeState {
  return state.lastStartedDate === todayKey ? state : { ...state, lastStartedDate: todayKey };
}

export interface DailyCompletion {
  readonly state: DailyChallengeState;
  /** Monedas a acreditar (0 si ya estaba completado hoy). */
  readonly reward: number;
  readonly streak: number;
  readonly isNewBestPayout: boolean;
}

/** Completa el desafío de hoy. Si ya estaba completado devuelve el mismo estado con recompensa 0. */
export function completeDaily(state: DailyChallengeState, todayKey: string, payout: number): DailyCompletion {
  if (state.lastCompletedDate === todayKey) {
    return { state, reward: 0, streak: state.currentStreak, isNewBestPayout: false };
  }

  const continuesStreak = state.lastCompletedDate === shiftDateKey(todayKey, -1);
  const streak = continuesStreak ? state.currentStreak + 1 : 1;
  const safePayout = Math.max(0, Math.floor(payout));

  return {
    reward: getDailyReward(streak),
    streak,
    isNewBestPayout: state.bestPayout > 0 && safePayout > state.bestPayout,
    state: {
      lastStartedDate: todayKey,
      lastCompletedDate: todayKey,
      currentStreak: streak,
      bestStreak: Math.max(state.bestStreak, streak),
      totalCompleted: state.totalCompleted + 1,
      bestPayout: Math.max(state.bestPayout, safePayout)
    }
  };
}
