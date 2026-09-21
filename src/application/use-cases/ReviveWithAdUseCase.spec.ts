import { ReviveWithAdUseCase } from './ReviveWithAdUseCase';
import { GameSession, DefaultEnergyDrainRule, EnergyDrainRule } from '../../domain/entities/GameSession';
import { Banker } from '../../domain/services/Banker';
import { OfferCalculator } from '../../domain/services/OfferCalculator';
import { Card } from '../../domain/entities/Card';
import { GameEvent } from '../../domain/events/GameEvents';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
import { FakeCrazyGamesService } from '../../infrastructure/services/testing/FakeCrazyGamesService';
import { collectEvents } from './testing/collectEvents';

const STANDARD_VALUES = [1, 5, 10, 25, 50, 100, 250, 500, 750, 1000, 5000, 10000, 25000];

class FixedDrainRule implements EnergyDrainRule {
  drainFor(cardValue: number): number {
    return cardValue;
  }
}

function buildLostSession(): GameSession {
  const values = [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const boardCards = values.slice(0, 12).map((v, i) => Card.create(`card_${i}`, v));
  const secretCard = Card.create('card_secret', values[12], true);
  const session = new GameSession(boardCards, secretCard, new Banker(new OfferCalculator()), new FixedDrainRule());
  session.openCard('card_0');
  return session;
}

function buildPlayingSession(): GameSession {
  const boardCards = STANDARD_VALUES.slice(0, 12).map((v, i) => Card.create(`card_${i}`, v));
  const secretCard = Card.create('card_secret', STANDARD_VALUES[12], true);
  return new GameSession(
    boardCards,
    secretCard,
    new Banker(new OfferCalculator()),
    new DefaultEnergyDrainRule()
  );
}

describe('ReviveWithAdUseCase', () => {
  it('returns { revived: false, reason: "not_eligible" } if the game is not currently lost', async () => {
    const session = buildPlayingSession();
    const crazyGamesService = new FakeCrazyGamesService();
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus);

    const result = await useCase.execute();

    expect(result).toEqual({ revived: false, reason: 'not_eligible' });
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
  });

  it('returns { revived: false, reason: "sdk_unavailable" } if the SDK is not available', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setAvailable(false);
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus);

    const result = await useCase.execute();

    expect(result).toEqual({ revived: false, reason: 'sdk_unavailable' });
  });

  it('returns { revived: false, reason: "ad_failed" } and does NOT revive when the ad fails', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setNextAdResult({ success: false, reason: 'user_cancelled' });
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus);

    const result = await useCase.execute();

    expect(result).toEqual({ revived: false, reason: 'ad_failed' });
    expect(session.getStatus()).toBe('lost');
  });

  it('revives the session and emits GameRevived with the real post-revive energy percentage', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const events = collectEvents(eventBus);
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus);

    const result = await useCase.execute();

    expect(result).toEqual({ revived: true });
    expect(session.getStatus()).toBe('playing');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('GameRevived');
    // BUGFIX (nivel de energía): el evento debe reflejar el porcentaje REAL
    // tras revivir (50% de baseline, no un 100 fijo que la presentación
    // usaba antes por su cuenta).
    if (events[0].type === 'GameRevived') {
      expect(events[0].energyPercentage).toBe(session.getEnergyPercentage());
    }
  });

  it('calls showRewardedAd exactly once per execute() call', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus);

    await useCase.execute();

    expect(crazyGamesService.rewardedAdCallCount).toBe(1);
  });
});
