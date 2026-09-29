import { GameResultTracker } from './GameResultTracker';
import { GameResult } from '../../domain/value-objects/PlayerRecords';
import { GameEvent } from '../../domain/events/GameEvents';

function setup(): { tracker: GameResultTracker; results: GameResult[] } {
  const results: GameResult[] = [];
  return { tracker: new GameResultTracker(r => results.push(r)), results };
}

const won = (finalAmount: number): GameEvent => ({ type: 'GameWon', finalAmount });

describe('GameResultTracker', () => {
  it('cuenta una victoria una sola vez aunque lleguen eventos repetidos', () => {
    const { tracker, results } = setup();

    tracker.onGameEvent({ type: 'DealAccepted', amount: 500, secretCardValue: 100 });
    tracker.onGameEvent(won(500));
    tracker.onGameEvent(won(500));

    expect(results).toEqual([{ outcome: 'won', amount: 500 }]);
  });

  it('una derrota se confirma recién en flush()', () => {
    const { tracker, results } = setup();

    tracker.onGameEvent({ type: 'GameLost' });
    expect(results).toEqual([]);

    tracker.flush();
    expect(results).toEqual([{ outcome: 'lost', amount: 0 }]);
  });

  it('si revive después de perder, no cuenta la derrota y sí la victoria posterior', () => {
    const { tracker, results } = setup();

    tracker.onGameEvent({ type: 'GameLost' });
    tracker.onGameEvent({ type: 'GameRevived', energyPercentage: 50 });
    tracker.onGameEvent(won(1000));
    tracker.flush();

    expect(results).toEqual([{ outcome: 'won', amount: 1000 }]);
  });

  it('abandonar a mitad de partida no cuenta nada', () => {
    const { tracker, results } = setup();

    tracker.onGameEvent({ type: 'CardOpened' } as unknown as GameEvent);
    tracker.flush();

    expect(results).toEqual([]);
  });

  it('flush repetido no duplica la derrota', () => {
    const { tracker, results } = setup();

    tracker.onGameEvent({ type: 'GameLost' });
    tracker.flush();
    tracker.flush();

    expect(results.length).toBe(1);
  });

  it('tras ganar, un flush posterior no agrega una derrota', () => {
    const { tracker, results } = setup();

    tracker.onGameEvent({ type: 'GameLost' });
    tracker.onGameEvent({ type: 'GameRevived', energyPercentage: 50 });
    tracker.onGameEvent(won(250));
    tracker.flush();

    expect(results.map(r => r.outcome)).toEqual(['won']);
  });
});
