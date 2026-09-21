import { ResolveDealUseCase } from './ResolveDealUseCase';
import { GameSession, DefaultEnergyDrainRule } from '../../domain/entities/GameSession';
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

function buildSessionAwaitingOffer(): GameSession {
  const boardCards = STANDARD_VALUES.slice(0, 12).map((v, i) => Card.create(`card_${i}`, v));
  const secretCard = Card.create('card_secret', STANDARD_VALUES[12], true);
  const banker = new Banker(new OfferCalculator());
  const drainRule = new DefaultEnergyDrainRule();
  const session = new GameSession(boardCards, secretCard, banker, drainRule);

  session.openCard('card_0');
  session.openCard('card_1');
  session.openCard('card_2');
  return session;
}

describe('ResolveDealUseCase', () => {
  it('acceptDeal credits the offer amount to ProgressionManager', () => {
    const session = buildSessionAwaitingOffer();
    const repository = new FakeProgressionRepository();
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new ResolveDealUseCase(session, progressionManager, eventBus);

    expect(repository.getCoins()).toBe(0);
    useCase.acceptDeal();

    expect(repository.getCoins()).toBeGreaterThan(0);
  });

  it('acceptDeal emits DealAccepted followed by GameWon, with matching amounts', () => {
    const session = buildSessionAwaitingOffer();
    const progressionManager = new ProgressionManager(new FakeProgressionRepository(), new DeterministicRandomProvider());
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const events = collectEvents(eventBus);
    const useCase = new ResolveDealUseCase(session, progressionManager, eventBus);

    useCase.acceptDeal();

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('DealAccepted');
    expect(events[1].type).toBe('GameWon');
    if (events[0].type === 'DealAccepted' && events[1].type === 'GameWon') {
      expect(events[0].amount).toBe(events[1].finalAmount);
    }
  });

  it('acceptDeal includes the reserved secret card value in DealAccepted (bug_deal_modal_reveal)', () => {
    const session = buildSessionAwaitingOffer();
    const progressionManager = new ProgressionManager(new FakeProgressionRepository(), new DeterministicRandomProvider());
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const events = collectEvents(eventBus);
    const useCase = new ResolveDealUseCase(session, progressionManager, eventBus);

    const expectedSecretValue = session.getSecretCard().value;
    useCase.acceptDeal();

    const dealAccepted = events.find(e => e.type === 'DealAccepted');
    expect(dealAccepted).toBeDefined();
    if (dealAccepted?.type === 'DealAccepted') {
      // Regresion del bug: el modal de "DEAL" solo mostraba el premio,
      // nunca el valor de la carta secreta reservada al inicio.
      expect(dealAccepted.secretCardValue).toBe(expectedSecretValue);
    }
  });

  it('acceptDeal sets GameSession status to "deal_accepted"', () => {
    const session = buildSessionAwaitingOffer();
    const progressionManager = new ProgressionManager(new FakeProgressionRepository(), new DeterministicRandomProvider());
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new ResolveDealUseCase(session, progressionManager, eventBus);

    useCase.acceptDeal();
    expect(session.getStatus()).toBe('deal_accepted');
  });

  it('rejectDeal emits DealRejected and does NOT credit any coins', () => {
    const session = buildSessionAwaitingOffer();
    const repository = new FakeProgressionRepository();
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const events = collectEvents(eventBus);
    const useCase = new ResolveDealUseCase(session, progressionManager, eventBus);

    useCase.rejectDeal();

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('DealRejected');
    expect(repository.getCoins()).toBe(0);
  });

  it('rejectDeal returns the session to "playing" status', () => {
    const session = buildSessionAwaitingOffer();
    const progressionManager = new ProgressionManager(new FakeProgressionRepository(), new DeterministicRandomProvider());
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new ResolveDealUseCase(session, progressionManager, eventBus);

    useCase.rejectDeal();
    expect(session.getStatus()).toBe('playing');
  });

  it('propagates the exception if acceptDeal is called without an active offer', () => {
    const boardCards = STANDARD_VALUES.slice(0, 12).map((v, i) => Card.create(`card_${i}`, v));
    const secretCard = Card.create('card_secret', STANDARD_VALUES[12], true);
    const session = new GameSession(
      boardCards,
      secretCard,
      new Banker(new OfferCalculator()),
      new DefaultEnergyDrainRule()
    );
    const progressionManager = new ProgressionManager(new FakeProgressionRepository(), new DeterministicRandomProvider());
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new ResolveDealUseCase(session, progressionManager, eventBus);

    expect(() => useCase.acceptDeal()).toThrow();
  });
});
