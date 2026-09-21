import { SwapFinalSecretCardUseCase } from './SwapFinalSecretCardUseCase';
import { GameSession, EnergyDrainRule } from '../../domain/entities/GameSession';
import { Banker } from '../../domain/services/Banker';
import { OfferCalculator } from '../../domain/services/OfferCalculator';
import { Card } from '../../domain/entities/Card';
import { GameEvent } from '../../domain/events/GameEvents';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
import { ProgressionManager } from '../../infrastructure/persistence/ProgressionManager';
import { FakeProgressionRepository } from '../../infrastructure/persistence/testing/FakeProgressionRepository';
import { DeterministicRandomProvider } from '../../infrastructure/services/testing/DeterministicRandomProvider';
import { collectEvents } from './testing/collectEvents';

const STANDARD_VALUES = [1, 5, 10, 25, 50, 100, 250, 500, 750, 1000, 5000, 10000, 25000];

class NoDrainRule implements EnergyDrainRule {
  drainFor(): number {
    return 0;
  }
}

function buildSessionWithOneCardLeft(): GameSession {
  const boardCards = STANDARD_VALUES.slice(0, 12).map((v, i) => Card.create(`card_${i}`, v));
  const secretCard = Card.create('card_secret', STANDARD_VALUES[12], true);
  const session = new GameSession(boardCards, secretCard, new Banker(new OfferCalculator()), new NoDrainRule());

  for (let i = 0; i < 11; i++) {
    session.openCard(`card_${i}`);
    if (session.getStatus() === 'awaiting_offer_response') {
      session.rejectDeal();
    }
  }
  return session;
}

describe('SwapFinalSecretCardUseCase', () => {
  it('isAvailable is false without the upgrade even with 1 card left', () => {
    const session = buildSessionWithOneCardLeft();
    const progressionManager = new ProgressionManager(new FakeProgressionRepository(), new DeterministicRandomProvider());
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new SwapFinalSecretCardUseCase(session, progressionManager, eventBus);

    expect(useCase.isAvailable()).toBe(false);
  });

  it('isAvailable is true once the upgrade is owned and 1 card remains', () => {
    const session = buildSessionWithOneCardLeft();
    session.getSessionUpgrades().grantSecretSwapFinal();
    const progressionManager = new ProgressionManager(new FakeProgressionRepository(), new DeterministicRandomProvider());
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new SwapFinalSecretCardUseCase(session, progressionManager, eventBus);

    expect(useCase.isAvailable()).toBe(true);
  });

  it('execute awards the final prize as persistent coins', () => {
    const session = buildSessionWithOneCardLeft();
    session.getSessionUpgrades().grantSecretSwapFinal();
    const lastCardValue = session.getClosedCards()[0].value;
    const repository = new FakeProgressionRepository();
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new SwapFinalSecretCardUseCase(session, progressionManager, eventBus);

    useCase.execute();

    expect(repository.getCoins()).toBe(lastCardValue);
  });

  it('emits FinalSecretCardSwapped followed by GameWon, with matching amounts', () => {
    const session = buildSessionWithOneCardLeft();
    session.getSessionUpgrades().grantSecretSwapFinal();
    const progressionManager = new ProgressionManager(new FakeProgressionRepository(), new DeterministicRandomProvider());
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const events = collectEvents(eventBus);
    const useCase = new SwapFinalSecretCardUseCase(session, progressionManager, eventBus);

    useCase.execute();

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('FinalSecretCardSwapped');
    expect(events[1].type).toBe('GameWon');
    if (events[0].type === 'FinalSecretCardSwapped' && events[1].type === 'GameWon') {
      expect(events[0].finalPrize).toBe(events[1].finalAmount);
    }
  });

  it('leaves the session in "won" status', () => {
    const session = buildSessionWithOneCardLeft();
    session.getSessionUpgrades().grantSecretSwapFinal();
    const progressionManager = new ProgressionManager(new FakeProgressionRepository(), new DeterministicRandomProvider());
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new SwapFinalSecretCardUseCase(session, progressionManager, eventBus);

    useCase.execute();

    expect(session.getStatus()).toBe('won');
  });

  it('propagates the exception when not available (defense in depth)', () => {
    const session = buildSessionWithOneCardLeft(); // sin el upgrade
    const progressionManager = new ProgressionManager(new FakeProgressionRepository(), new DeterministicRandomProvider());
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new SwapFinalSecretCardUseCase(session, progressionManager, eventBus);

    expect(() => useCase.execute()).toThrow();
  });
});
