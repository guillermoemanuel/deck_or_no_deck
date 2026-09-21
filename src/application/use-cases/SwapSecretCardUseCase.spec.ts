import { SwapSecretCardUseCase } from './SwapSecretCardUseCase';
import { GameSession, DefaultEnergyDrainRule } from '../../domain/entities/GameSession';
import { Banker } from '../../domain/services/Banker';
import { OfferCalculator } from '../../domain/services/OfferCalculator';
import { Card } from '../../domain/entities/Card';
import { GameEvent } from '../../domain/events/GameEvents';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
import { collectEvents } from './testing/collectEvents';

const STANDARD_VALUES = [1, 5, 10, 25, 50, 100, 250, 500, 750, 1000, 5000, 10000, 25000];

function buildSessionAtSixthCard(): GameSession {
  const boardCards = STANDARD_VALUES.slice(0, 12).map((v, i) => Card.create(`card_${i}`, v));
  const secretCard = Card.create('card_secret', STANDARD_VALUES[12], true);
  const banker = new Banker(new OfferCalculator());
  const drainRule = new DefaultEnergyDrainRule();
  const session = new GameSession(boardCards, secretCard, banker, drainRule);

  session.openCard('card_0');
  session.openCard('card_1');
  session.openCard('card_2');
  session.rejectDeal();
  session.openCard('card_3');
  session.openCard('card_4');
  session.openCard('card_5');
  return session;
}

describe('SwapSecretCardUseCase', () => {
  it('isAvailable reflects GameSession.isMidgameSwapAvailable()', () => {
    const session = buildSessionAtSixthCard();
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new SwapSecretCardUseCase(session, eventBus);

    expect(useCase.isAvailable()).toBe(true);
  });

  it('execute performs the swap and emits SecretCardSwapped with the new secret card', () => {
    const session = buildSessionAtSixthCard();
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const events = collectEvents(eventBus);
    const useCase = new SwapSecretCardUseCase(session, eventBus);

    useCase.execute('card_6');

    expect(events).toHaveLength(1);
    // El nuevo secreto conserva el ID de la carta secreta original ('card_secret')
    // pero toma el VALOR de la carta del tablero seleccionada (card_6 => valor 250).
    expect(events[0]).toMatchObject({ type: 'SecretCardSwapped', newSecretCard: { id: 'card_secret', value: 250 } });
  });

  it('isAvailable becomes false after a swap is executed', () => {
    const session = buildSessionAtSixthCard();
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new SwapSecretCardUseCase(session, eventBus);

    useCase.execute('card_6');
    expect(useCase.isAvailable()).toBe(false);
  });

  it('propagates the exception when swapping is not currently available', () => {
    const boardCards = STANDARD_VALUES.slice(0, 12).map((v, i) => Card.create(`card_${i}`, v));
    const secretCard = Card.create('card_secret', STANDARD_VALUES[12], true);
    const session = new GameSession(
      boardCards,
      secretCard,
      new Banker(new OfferCalculator()),
      new DefaultEnergyDrainRule()
    );
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new SwapSecretCardUseCase(session, eventBus);

    expect(() => useCase.execute('card_6')).toThrow();
  });
});
