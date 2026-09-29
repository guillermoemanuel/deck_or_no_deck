import {
  completeDaily,
  DAILY_REWARD_BASE,
  DAILY_REWARD_MAX_STREAK,
  DAILY_REWARD_STREAK_STEP,
  EMPTY_DAILY_STATE,
  getActiveStreak,
  getDailyReward,
  getDailyStatus,
  getNextStreak,
  markDailyStarted
} from './DailyChallenge';

describe('DailyChallenge', () => {
  it('un estado nuevo permite jugar hoy', () => {
    expect(getDailyStatus(EMPTY_DAILY_STATE, '2026-09-28')).toBe('available');
  });

  it('empezar consume el intento del día ("used") y es idempotente', () => {
    const started = markDailyStarted(EMPTY_DAILY_STATE, '2026-09-28');

    expect(getDailyStatus(started, '2026-09-28')).toBe('used');
    expect(markDailyStarted(started, '2026-09-28')).toBe(started);
    expect(getDailyStatus(started, '2026-09-29')).toBe('available');
  });

  it('completar paga la recompensa base, marca "completed" y arranca la racha en 1', () => {
    const result = completeDaily(markDailyStarted(EMPTY_DAILY_STATE, '2026-09-28'), '2026-09-28', 2500);

    expect(result.reward).toBe(DAILY_REWARD_BASE);
    expect(result.streak).toBe(1);
    expect(getDailyStatus(result.state, '2026-09-28')).toBe('completed');
    expect(result.state).toMatchObject({ totalCompleted: 1, bestStreak: 1, bestPayout: 2500 });
  });

  it('completar días consecutivos sube la racha y la recompensa', () => {
    const day1 = completeDaily(EMPTY_DAILY_STATE, '2026-09-28', 100).state;
    const day2 = completeDaily(day1, '2026-09-29', 100);

    expect(day2.streak).toBe(2);
    expect(day2.reward).toBe(DAILY_REWARD_BASE + DAILY_REWARD_STREAK_STEP);
  });

  it('saltear un día reinicia la racha pero conserva la mejor', () => {
    const day1 = completeDaily(EMPTY_DAILY_STATE, '2026-09-28', 100).state;
    const day2 = completeDaily(day1, '2026-09-29', 100).state;
    const afterGap = completeDaily(day2, '2026-10-01', 100);

    expect(afterGap.streak).toBe(1);
    expect(afterGap.state.bestStreak).toBe(2);
  });

  it('la racha continúa a través del cambio de mes', () => {
    const last = completeDaily(EMPTY_DAILY_STATE, '2026-09-30', 100).state;

    expect(completeDaily(last, '2026-10-01', 100).streak).toBe(2);
  });

  it('completar dos veces el mismo día no paga de nuevo', () => {
    const first = completeDaily(EMPTY_DAILY_STATE, '2026-09-28', 100);
    const second = completeDaily(first.state, '2026-09-28', 9999);

    expect(second.reward).toBe(0);
    expect(second.state).toBe(first.state);
  });

  it('la recompensa deja de crecer al llegar a la racha máxima', () => {
    expect(getDailyReward(DAILY_REWARD_MAX_STREAK)).toBe(getDailyReward(DAILY_REWARD_MAX_STREAK + 5));
    expect(getDailyReward(0)).toBe(DAILY_REWARD_BASE);
  });

  it('marca nuevo mejor premio solo si había uno previo y se lo supera', () => {
    const first = completeDaily(EMPTY_DAILY_STATE, '2026-09-28', 500);
    const better = completeDaily(first.state, '2026-09-29', 800);
    const worse = completeDaily(better.state, '2026-09-30', 100);

    expect(first.isNewBestPayout).toBe(false);
    expect(better.isNewBestPayout).toBe(true);
    expect(worse.isNewBestPayout).toBe(false);
    expect(worse.state.bestPayout).toBe(800);
  });

  it('getActiveStreak muestra la racha solo si sigue viva (hoy o ayer)', () => {
    const state = completeDaily(EMPTY_DAILY_STATE, '2026-09-28', 100).state;

    expect(getActiveStreak(state, '2026-09-28')).toBe(1);
    expect(getActiveStreak(state, '2026-09-29')).toBe(1);
    expect(getActiveStreak(state, '2026-09-30')).toBe(0);
  });

  it('getNextStreak anuncia la racha que se lograría al completar hoy', () => {
    const state = completeDaily(EMPTY_DAILY_STATE, '2026-09-28', 100).state;

    expect(getNextStreak(EMPTY_DAILY_STATE, '2026-09-28')).toBe(1);
    expect(getNextStreak(state, '2026-09-29')).toBe(2);
    expect(getNextStreak(state, '2026-10-05')).toBe(1);
  });
});
