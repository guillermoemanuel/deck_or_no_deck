import { GameOutcomeRecorder } from './GameOutcomeRecorder';
import { DAILY_REWARD_BASE, DAILY_REWARD_STREAK_STEP, getDailyStatus } from '../../domain/value-objects/DailyChallenge';
import {
  FakeDailyChallengeRepository,
  FakeRecordsRepository
} from '../../infrastructure/persistence/testing/FakeRecordsRepositories';

function setup() {
  const records = new FakeRecordsRepository();
  const daily = new FakeDailyChallengeRepository();
  const awarded: number[] = [];
  const recorder = new GameOutcomeRecorder(records, daily, { awardGameplayCoins: a => awarded.push(a) });
  return { records, daily, awarded, recorder };
}

describe('GameOutcomeRecorder', () => {
  it('una partida normal actualiza récords y no toca el desafío diario ni las monedas', () => {
    const { records, daily, awarded, recorder } = setup();

    const summary = recorder.record({ outcome: 'won', amount: 700 }, null);

    expect(records.get()).toMatchObject({ gamesPlayed: 1, wins: 1, bestPayout: 700 });
    expect(daily.get().totalCompleted).toBe(0);
    expect(awarded).toEqual([]);
    expect(summary).toEqual({ isNewBestPayout: false });
  });

  it('el desafío diario ganado paga la recompensa y devuelve el resumen', () => {
    const { daily, awarded, recorder } = setup();
    recorder.startDaily('2026-09-28');

    const summary = recorder.record({ outcome: 'won', amount: 2500 }, '2026-09-28');

    expect(awarded).toEqual([DAILY_REWARD_BASE]);
    expect(summary.daily).toEqual({ reward: DAILY_REWARD_BASE, streak: 1 });
    expect(getDailyStatus(daily.get(), '2026-09-28')).toBe('completed');
  });

  it('perder el desafío diario también lo completa y paga (sin castigo)', () => {
    const { awarded, recorder } = setup();
    recorder.startDaily('2026-09-28');

    recorder.record({ outcome: 'lost', amount: 0 }, '2026-09-28');

    expect(awarded).toEqual([DAILY_REWARD_BASE]);
  });

  it('días consecutivos suben la recompensa', () => {
    const { awarded, recorder } = setup();
    recorder.startDaily('2026-09-28');
    recorder.record({ outcome: 'won', amount: 100 }, '2026-09-28');
    recorder.startDaily('2026-09-29');
    recorder.record({ outcome: 'won', amount: 100 }, '2026-09-29');

    expect(awarded).toEqual([DAILY_REWARD_BASE, DAILY_REWARD_BASE + DAILY_REWARD_STREAK_STEP]);
  });

  it('registrar dos veces el mismo día no paga dos veces', () => {
    const { awarded, recorder } = setup();
    recorder.record({ outcome: 'won', amount: 100 }, '2026-09-28');
    const second = recorder.record({ outcome: 'won', amount: 100 }, '2026-09-28');

    expect(awarded.length).toBe(1);
    expect(second.daily).toBeUndefined();
  });

  it('startDaily consume el intento aunque nunca se termine la partida', () => {
    const { daily, awarded, recorder } = setup();
    recorder.startDaily('2026-09-28');

    expect(getDailyStatus(daily.get(), '2026-09-28')).toBe('used');
    expect(awarded).toEqual([]);
  });

  it('reportar un nuevo récord en la partida', () => {
    const { recorder } = setup();
    recorder.record({ outcome: 'won', amount: 100 }, null);

    expect(recorder.record({ outcome: 'won', amount: 900 }, null).isNewBestPayout).toBe(true);
  });
});
