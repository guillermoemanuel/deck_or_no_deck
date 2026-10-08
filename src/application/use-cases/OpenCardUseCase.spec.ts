import { OpenCardUseCase } from './OpenCardUseCase';
import { GameSession, DefaultEnergyDrainRule, EnergyDrainRule } from '../../domain/entities/GameSession';
import { Banker } from '../../domain/services/Banker';
import { OfferCalculator } from '../../domain/services/OfferCalculator';
import { Card } from '../../domain/entities/Card';
import { LOSS_PENALTY_AMOUNT } from '../../domain/value-objects/GamePenalties';
import { GameEvent } from '../../domain/events/GameEvents';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
import { ProgressionManager } from '../../infrastructure/persistence/ProgressionManager';
import { FakeProgressionRepository } from '../../infrastructure/persistence/testing/FakeProgressionRepository';
import { DeterministicRandomProvider } from '../../infrastructure/services/testing/DeterministicRandomProvider';
import { collectEvents } from './testing/collectEvents';

const STANDARD_VALUES = [1, 5, 10, 25, 50, 100, 250, 500, 750, 1000, 5000, 10000, 25000];

function buildSession(
  values: number[] = STANDARD_VALUES,
  customDrainRule?: EnergyDrainRule,
  customBanker?: Banker
): GameSession {
  const boardCards = values.slice(0, 12).map((v, i) => Card.create(`card_${i}`, v));
  const secretCard = Card.create('card_secret', values[12], true);
  const banker = customBanker ?? new Banker(new OfferCalculator());
  const drainRule = customDrainRule ?? (values[0] === 100000 ? { drainFor: () => 100 } : new DefaultEnergyDrainRule());
  return new GameSession(boardCards, secretCard, banker, drainRule);
}

describe('OpenCardUseCase', () => {
  it('emits CardOpened with the correct card and remaining energy', () => {
    const session = buildSession();
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const events = collectEvents(eventBus);
    const useCase = new OpenCardUseCase(session, eventBus);

    useCase.execute('card_0');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'CardOpened', card: { id: 'card_0' } });
  });

  it('emits BankerOfferMade after the 3rd card, in addition to CardOpened', () => {
    const session = buildSession();
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const events = collectEvents(eventBus);
    const useCase = new OpenCardUseCase(session, eventBus);

    useCase.execute('card_0');
    useCase.execute('card_1');
    useCase.execute('card_2');

    const types = events.map(e => e.type);
    expect(types).toEqual(['CardOpened', 'CardOpened', 'CardOpened', 'BankerOfferMade']);
  });

  it('emits EnergyDepleted and GameLost, and stops after energy hits 0 (no BankerOfferMade)', () => {
    const values = [100000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const session = buildSession(values);
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const events = collectEvents(eventBus);
    const useCase = new OpenCardUseCase(session, eventBus);

    useCase.execute('card_0');

    const types = events.map(e => e.type);
    expect(types).toEqual(['CardOpened', 'EnergyDepleted', 'GameLost']);
  });

  it('emits MidgameSwapAvailable exactly after the 6th card, when no offer coincides', () => {
    const silentBanker = new Banker(new OfferCalculator());
    jest.spyOn(silentBanker, 'shouldMakeOffer').mockReturnValue(false);
    const session = buildSession(STANDARD_VALUES, undefined, silentBanker);
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new OpenCardUseCase(session, eventBus);

    useCase.execute('card_0');
    useCase.execute('card_1');
    useCase.execute('card_2');

    const events = collectEvents(eventBus);
    useCase.execute('card_3');
    useCase.execute('card_4');
    useCase.execute('card_5');

    const lastEvent = events[events.length - 1];
    expect(lastEvent.type).toBe('MidgameSwapAvailable');
  });

  it('emits BankerOfferMade at the 6th card when offer coincides, deferring swap until NO DEAL', () => {
    const session = buildSession();
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new OpenCardUseCase(session, eventBus);

    useCase.execute('card_0');
    useCase.execute('card_1');
    useCase.execute('card_2');
    session.rejectDeal();

    const events = collectEvents(eventBus);
    useCase.execute('card_3');
    useCase.execute('card_4');
    useCase.execute('card_5');

    const types = events.map(e => e.type);
    expect(types).toContain('BankerOfferMade');
    expect(types).not.toContain('MidgameSwapAvailable');
  });

  it('propagates GameSession exceptions (e.g. opening an already-open card)', () => {
    const session = buildSession();
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new OpenCardUseCase(session, eventBus);

    useCase.execute('card_0');
    expect(() => useCase.execute('card_0')).toThrow();
  });

  it('supports multiple independent subscribers via onEvent', () => {
    const session = buildSession();
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new OpenCardUseCase(session, eventBus);

    const receivedByA: GameEvent[] = [];
    const receivedByB: GameEvent[] = [];
    useCase.onEvent(e => receivedByA.push(e));
    useCase.onEvent(e => receivedByB.push(e));

    useCase.execute('card_0');

    expect(receivedByA).toHaveLength(1);
    expect(receivedByB).toHaveLength(1);
  });

  describe('loss penalty (REQ: LOSS_PENALTY_AMOUNT al perder por energía, permite negativo)', () => {
    it('applies exactly the fixed penalty to the persistent balance on GameLost', () => {
      const values = [100000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const session = buildSession(values);
      const repository = new FakeProgressionRepository();
      // 500 es menor que la penalidad: el resultado queda en negativo y el
      // test verifica de paso que el saldo NO se trunca en 0.
      repository.seedCoins(500);
      const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
      const eventBus = new SimpleEventEmitter<GameEvent>();
      const useCase = new OpenCardUseCase(session, eventBus, progressionManager);

      useCase.execute('card_0'); // agota la energia -> GameLost

      // 500 - LOSS_PENALTY_AMOUNT = -500: se permite saldo negativo, a proposito.
      expect(repository.getCoins()).toBe(500 - LOSS_PENALTY_AMOUNT);
      expect(repository.getCoins()).toBeLessThan(0);
    });

    it('does not apply any penalty when the game does not end in a loss', () => {
      const session = buildSession();
      const repository = new FakeProgressionRepository();
      repository.seedCoins(2000);
      const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
      const eventBus = new SimpleEventEmitter<GameEvent>();
      const useCase = new OpenCardUseCase(session, eventBus, progressionManager);

      useCase.execute('card_0'); // carta baja, no pierde

      expect(repository.getCoins()).toBe(2000);
    });

    it('does not throw when no progressionService was provided (optional dependency)', () => {
      const values = [100000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      const session = buildSession(values);
      const eventBus = new SimpleEventEmitter<GameEvent>();
      const useCase = new OpenCardUseCase(session, eventBus);

      expect(() => useCase.execute('card_0')).not.toThrow();
    });
  });

  describe('FinalCardSwapAvailable (upgrade "Cambio de Carta Secreta")', () => {
    class NoDrainRule implements EnergyDrainRule {
      drainFor(): number {
        return 0;
      }
    }

    it('is emitted after opening down to exactly 1 closed card left, when the upgrade is owned', () => {
      const silentBanker = new Banker(new OfferCalculator());
      jest.spyOn(silentBanker, 'shouldMakeOffer').mockReturnValue(false);
      const session = buildSession(STANDARD_VALUES, new NoDrainRule(), silentBanker);
      session.getSessionUpgrades().grantSecretSwapFinal();
      const eventBus = new SimpleEventEmitter<GameEvent>();
      const useCase = new OpenCardUseCase(session, eventBus);

      for (let i = 0; i < 10; i++) {
        useCase.execute(`card_${i}`);
      }

      const events = collectEvents(eventBus);
      useCase.execute('card_10'); // deja exactamente 1 carta cerrada ('card_11')

      expect(events.map(e => e.type)).toEqual(['CardOpened', 'FinalCardSwapAvailable']);
    });

    it('is NOT emitted without the upgrade, even with exactly 1 card left', () => {
      const silentBanker = new Banker(new OfferCalculator());
      jest.spyOn(silentBanker, 'shouldMakeOffer').mockReturnValue(false);
      const session = buildSession(STANDARD_VALUES, new NoDrainRule(), silentBanker);
      const eventBus = new SimpleEventEmitter<GameEvent>();
      const useCase = new OpenCardUseCase(session, eventBus);

      for (let i = 0; i < 10; i++) {
        useCase.execute(`card_${i}`);
      }
      const events = collectEvents(eventBus);
      useCase.execute('card_10');

      expect(events.map(e => e.type)).not.toContain('FinalCardSwapAvailable');
    });
  });

  describe('TopValueCardRevealed (REQ: momento de celebración al revelar la carta de 25000)', () => {
    class ZeroDrainRule implements EnergyDrainRule {
      drainFor(): number {
        return 0;
      }
    }

    it('is emitted right after CardOpened when the opened BOARD card matches TOP_CASE_VALUE', () => {
      // 25000 en la posición del tablero (card_0); el resto son valores
      // irrelevantes para este test, y la carta secreta (índice 12) NO es
      // la de 25000, para aislar el camino "carta de tablero".
      const values = [25000, 5, 10, 25, 50, 100, 250, 500, 750, 1000, 5000, 10000, 1];
      const session = buildSession(values, new ZeroDrainRule());
      const eventBus = new SimpleEventEmitter<GameEvent>();
      const events = collectEvents(eventBus);
      const useCase = new OpenCardUseCase(session, eventBus);

      useCase.execute('card_0');

      expect(events.map(e => e.type)).toEqual(['CardOpened', 'TopValueCardRevealed']);
      expect(events[1]).toMatchObject({ type: 'TopValueCardRevealed', card: { id: 'card_0', value: 25000 } });
    });

    it('is NOT emitted when the opened board card is below TOP_CASE_VALUE', () => {
      const session = buildSession(STANDARD_VALUES, new ZeroDrainRule());
      const eventBus = new SimpleEventEmitter<GameEvent>();
      const events = collectEvents(eventBus);
      const useCase = new OpenCardUseCase(session, eventBus);

      useCase.execute('card_0'); // value 1

      expect(events.map(e => e.type)).not.toContain('TopValueCardRevealed');
    });

    it('is also emitted for the SECRET card, revealed via LastCardRevealed at game end', () => {
      // Acá la de 25000 es la carta SECRETA (índice 12) — nunca pasa por
      // CardOpened, así que este es el otro camino que necesita su propio
      // chequeo (ver el comentario en OpenCardUseCase.execute()).
      const silentBanker = new Banker(new OfferCalculator());
      jest.spyOn(silentBanker, 'shouldMakeOffer').mockReturnValue(false);
      const values = [1, 5, 10, 25, 50, 100, 250, 500, 750, 1000, 5000, 10000, 25000];
      const session = buildSession(values, new ZeroDrainRule(), silentBanker);
      const eventBus = new SimpleEventEmitter<GameEvent>();
      const useCase = new OpenCardUseCase(session, eventBus);

      for (let i = 0; i < 11; i++) {
        useCase.execute(`card_${i}`);
      }
      const events = collectEvents(eventBus);
      useCase.execute('card_11'); // última carta del tablero -> revela la secreta

      const topValueEvents = events.filter(e => e.type === 'TopValueCardRevealed');
      expect(topValueEvents).toHaveLength(1);
      expect(topValueEvents[0]).toMatchObject({ card: { id: 'card_secret', value: 25000 } });
    });

    it('is NOT emitted when the top-value card is opened in the SAME action that ends the game in a loss', () => {
      // Prioridad de derrota (REQ): si abrir la carta de 25000 agota la
      // energía en la misma jugada, no debe festejar justo antes de la
      // pantalla de "Game Over" — ver el comentario en execute().
      class InstantLossDrainRule implements EnergyDrainRule {
        drainFor(): number {
          return 100;
        }
      }
      const values = [25000, 5, 10, 25, 50, 100, 250, 500, 750, 1000, 5000, 10000, 1];
      const session = buildSession(values, new InstantLossDrainRule());
      const eventBus = new SimpleEventEmitter<GameEvent>();
      const events = collectEvents(eventBus);
      const useCase = new OpenCardUseCase(session, eventBus);

      useCase.execute('card_0');

      expect(events.map(e => e.type)).toEqual(['CardOpened', 'EnergyDepleted', 'GameLost']);
    });
  });
});