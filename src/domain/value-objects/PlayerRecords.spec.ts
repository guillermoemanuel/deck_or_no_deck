import { applyGameResult, EMPTY_RECORDS, getWinRatePercent } from './PlayerRecords';

describe('applyGameResult', () => {
  it('una victoria suma partida, victoria, racha y mejor premio', () => {
    const { records, isNewBestPayout } = applyGameResult(EMPTY_RECORDS, { outcome: 'won', amount: 1000 });

    expect(records).toEqual({ gamesPlayed: 1, wins: 1, losses: 0, bestPayout: 1000, currentWinStreak: 1, bestWinStreak: 1 });
    // La primera victoria no es "récord": no había nada que superar.
    expect(isNewBestPayout).toBe(false);
  });

  it('una derrota corta la racha actual pero conserva la mejor', () => {
    let records = applyGameResult(EMPTY_RECORDS, { outcome: 'won', amount: 100 }).records;
    records = applyGameResult(records, { outcome: 'won', amount: 100 }).records;
    records = applyGameResult(records, { outcome: 'lost', amount: 0 }).records;

    expect(records).toMatchObject({ gamesPlayed: 3, wins: 2, losses: 1, currentWinStreak: 0, bestWinStreak: 2 });
  });

  it('marca nuevo récord solo si se supera un premio previo', () => {
    const first = applyGameResult(EMPTY_RECORDS, { outcome: 'won', amount: 500 }).records;
    const better = applyGameResult(first, { outcome: 'won', amount: 900 });
    const equal = applyGameResult(better.records, { outcome: 'won', amount: 900 });

    expect(better.isNewBestPayout).toBe(true);
    expect(equal.isNewBestPayout).toBe(false);
  });

  it('una derrota nunca es récord ni cambia el mejor premio', () => {
    const first = applyGameResult(EMPTY_RECORDS, { outcome: 'won', amount: 500 }).records;
    const lost = applyGameResult(first, { outcome: 'lost', amount: 99999 });

    expect(lost.isNewBestPayout).toBe(false);
    expect(lost.records.bestPayout).toBe(500);
  });

  it('no muta el objeto original', () => {
    const before = { ...EMPTY_RECORDS };
    applyGameResult(EMPTY_RECORDS, { outcome: 'won', amount: 10 });

    expect(EMPTY_RECORDS).toEqual(before);
  });
});

describe('getWinRatePercent', () => {
  it('es 0 sin partidas y redondea con ellas', () => {
    expect(getWinRatePercent(EMPTY_RECORDS)).toBe(0);
    expect(getWinRatePercent({ ...EMPTY_RECORDS, gamesPlayed: 3, wins: 2, losses: 1 })).toBe(67);
  });
});
