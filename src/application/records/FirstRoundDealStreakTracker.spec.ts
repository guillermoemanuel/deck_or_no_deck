import { FirstRoundDealStreakTracker, FirstRoundDealOutcomeRecorded } from './FirstRoundDealStreakTracker';
import { GameEvent } from '../../domain/events/GameEvents';
import { Card } from '../../domain/entities/Card';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
import { ResolveDealUseCase } from '../use-cases/ResolveDealUseCase';
import { RecordFirstRoundDealOutcomeUseCase } from '../use-cases/RecordFirstRoundDealOutcomeUseCase';
import { createGameSessionWithSelection } from '../factories/GameSessionFactory';
import { ProgressionManager } from '../../infrastructure/persistence/ProgressionManager';
import { FakeProgressionRepository } from '../../infrastructure/persistence/testing/FakeProgressionRepository';
import { DeterministicRandomProvider } from '../../infrastructure/services/testing/DeterministicRandomProvider';

describe('FirstRoundDealStreakTracker', () => {
  const offerMade = (roundNumber: number): GameEvent => ({
    type: 'BankerOfferMade',
    offer: { amount: 100, roundNumber, timestamp: 0 }
  });

  describe('detección de trato aceptado en la 1ª ronda', () => {
    it('reports a first-round deal when DealAccepted follows a round-1 offer', () => {
      const outcomes: FirstRoundDealOutcomeRecorded[] = [];
      const tracker = new FirstRoundDealStreakTracker(o => outcomes.push(o));

      tracker.onGameEvent(offerMade(1));
      tracker.onGameEvent({ type: 'DealAccepted', amount: 100, secretCardValue: 500 });
      tracker.onGameEvent({ type: 'GameWon', finalAmount: 100 });

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].firstRoundDealAccepted).toBe(true);
      expect(outcomes[0].rejectedRound1Offer).toBe(false);
    });

    it('reports NOT a first-round deal when the accepted offer was round 2', () => {
      const outcomes: FirstRoundDealOutcomeRecorded[] = [];
      const tracker = new FirstRoundDealStreakTracker(o => outcomes.push(o));

      tracker.onGameEvent(offerMade(1));
      tracker.onGameEvent({ type: 'DealRejected' });
      tracker.onGameEvent(offerMade(2));
      tracker.onGameEvent({ type: 'DealAccepted', amount: 200, secretCardValue: 500 });
      tracker.onGameEvent({ type: 'GameWon', finalAmount: 200 });

      expect(outcomes[0].firstRoundDealAccepted).toBe(false);
      expect(outcomes[0].rejectedRound1Offer).toBe(true); // superó la 1ª oferta
    });

    it('counts a board win after rejecting round 1 as "superó la 1ª oferta"', () => {
      const outcomes: FirstRoundDealOutcomeRecorded[] = [];
      const tracker = new FirstRoundDealStreakTracker(o => outcomes.push(o));

      tracker.onGameEvent(offerMade(1));
      tracker.onGameEvent({ type: 'DealRejected' });
      // Abre el resto del tablero y gana sin más ofertas.
      tracker.onGameEvent({ type: 'GameWon', finalAmount: 25000 });

      expect(outcomes[0].firstRoundDealAccepted).toBe(false);
      expect(outcomes[0].rejectedRound1Offer).toBe(true);
    });

    it('reports a loss before the first offer as never seeing it', () => {
      const outcomes: FirstRoundDealOutcomeRecorded[] = [];
      const tracker = new FirstRoundDealStreakTracker(o => outcomes.push(o));

      // Pierde en las cartas 1-3: sin BankerOfferMade previo.
      tracker.onGameEvent({ type: 'EnergyDepleted' });
      tracker.onGameEvent({ type: 'GameLost' });
      tracker.flush();

      expect(outcomes[0].firstRoundDealAccepted).toBe(false);
      expect(outcomes[0].rejectedRound1Offer).toBe(false);
    });

    it('reports a loss after rejecting round 1 as having passed it', () => {
      const outcomes: FirstRoundDealOutcomeRecorded[] = [];
      const tracker = new FirstRoundDealStreakTracker(o => outcomes.push(o));

      tracker.onGameEvent(offerMade(1));
      tracker.onGameEvent({ type: 'DealRejected' });
      tracker.onGameEvent({ type: 'EnergyDepleted' });
      tracker.onGameEvent({ type: 'GameLost' });
      tracker.flush();

      expect(outcomes[0].rejectedRound1Offer).toBe(true);
    });
  });

  describe('exactamente una vez por partida', () => {
    it('reports once when DealAccepted and GameWon arrive for the same deal', () => {
      const outcomes: FirstRoundDealOutcomeRecorded[] = [];
      const tracker = new FirstRoundDealStreakTracker(o => outcomes.push(o));

      tracker.onGameEvent(offerMade(1));
      tracker.onGameEvent({ type: 'DealAccepted', amount: 100, secretCardValue: 500 });
      tracker.onGameEvent({ type: 'GameWon', finalAmount: 100 });
      tracker.flush();

      expect(outcomes).toHaveLength(1);
    });

    it('does not report a loss that was later revived', () => {
      const outcomes: FirstRoundDealOutcomeRecorded[] = [];
      const tracker = new FirstRoundDealStreakTracker(o => outcomes.push(o));

      tracker.onGameEvent(offerMade(1));
      tracker.onGameEvent({ type: 'DealRejected' });
      tracker.onGameEvent({ type: 'EnergyDepleted' });
      tracker.onGameEvent({ type: 'GameLost' });
      tracker.onGameEvent({ type: 'GameRevived', energyPercentage: 60 });
      tracker.flush();

      expect(outcomes).toHaveLength(0);
    });

    it('confirms a pending loss on flush (fin de escena sin revive)', () => {
      const outcomes: FirstRoundDealOutcomeRecorded[] = [];
      const tracker = new FirstRoundDealStreakTracker(o => outcomes.push(o));

      tracker.onGameEvent({ type: 'EnergyDepleted' });
      tracker.onGameEvent({ type: 'GameLost' });
      expect(outcomes).toHaveLength(0); // aún pendiente

      tracker.flush();
      expect(outcomes).toHaveLength(1);
    });

    it('reports nothing on abandon (sin GameWon ni GameLost)', () => {
      const outcomes: FirstRoundDealOutcomeRecorded[] = [];
      const tracker = new FirstRoundDealStreakTracker(o => outcomes.push(o));

      tracker.onGameEvent(offerMade(1));
      tracker.onGameEvent({ type: 'CardOpened', card: Card.create('card_4', 50), energyRemaining: 40, cardsUntilNextOffer: 2 });
      tracker.flush(); // SHUTDOWN sin desenlace: abandono

      expect(outcomes).toHaveLength(0);
    });

    it('flush is idempotent (no duplica el reporte)', () => {
      const outcomes: FirstRoundDealOutcomeRecorded[] = [];
      const tracker = new FirstRoundDealStreakTracker(o => outcomes.push(o));

      tracker.onGameEvent({ type: 'GameWon', finalAmount: 1000 });
      tracker.flush();
      tracker.flush();

      expect(outcomes).toHaveLength(1);
    });

    it('a revived player who later wins reports the win (y que superó la 1ª)', () => {
      const outcomes: FirstRoundDealOutcomeRecorded[] = [];
      const tracker = new FirstRoundDealStreakTracker(o => outcomes.push(o));

      tracker.onGameEvent(offerMade(1));
      tracker.onGameEvent({ type: 'DealRejected' });
      tracker.onGameEvent({ type: 'EnergyDepleted' });
      tracker.onGameEvent({ type: 'GameLost' });
      tracker.onGameEvent({ type: 'GameRevived', energyPercentage: 60 });
      tracker.onGameEvent({ type: 'GameWon', finalAmount: 5000 });

      expect(outcomes).toHaveLength(1);
      expect(outcomes[0].rejectedRound1Offer).toBe(true);
    });
  });

  // Flujo completo ADR-014: sesión REAL + ResolveDealUseCase (eventos
  // reales) → tracker → use case → progresión persistida (fake). Cuatro
  // tratos de 1ª ronda activan la regla; la quinta partida nace topada y
  // rechazar la oferta topada cuenta regresiva.
  describe('integración — flujo completo con sesión y use-cases reales', () => {
    const STANDARD_VALUES = [1, 5, 10, 25, 50, 100, 250, 500, 750, 1000, 5000, 10000, 25000];

    function playOneFirstRoundDealGame(environment: {
      repository: FakeProgressionRepository;
      manager: ProgressionManager;
      accept: boolean;
    }): FirstRoundDealStreakTracker {
      const { repository, manager, accept } = environment;
      const eventBus = new SimpleEventEmitter<GameEvent>();
      const recordUseCase = new RecordFirstRoundDealOutcomeUseCase(manager);
      const tracker = new FirstRoundDealStreakTracker(outcome => recordUseCase.execute(outcome, false));
      eventBus.subscribe(event => tracker.onGameEvent(event));

      // Cap sorteado como lo haría GameScene: solo si la regla está activa.
      const streak = repository.getFirstRoundDealStreak();
      const samples = [0.5, 0.5]; // cap descartado (inactivo) + ruido 0
      const generator = () => samples.shift() ?? 0.5;
      const session = createGameSessionWithSelection(STANDARD_VALUES, 12, generator, streak);
      const resolveDeal = new ResolveDealUseCase(session, manager, eventBus);

      session.openCard('card_0');
      session.openCard('card_1');
      const { offer } = session.openCard('card_2');
      expect(offer?.roundNumber).toBe(1);
      // El evento real del use case (BankerOfferMade lo emite OpenCardUseCase;
      // acá se emite a mano para simular ese paso sin Phaser).
      eventBus.emit({ type: 'BankerOfferMade', offer: offer! });

      if (accept) {
        resolveDeal.acceptDeal();
      } else {
        resolveDeal.rejectDeal();
        // Pierde por energía tras rechazar (fin de partida real vía flush).
        eventBus.emit({ type: 'EnergyDepleted' });
        eventBus.emit({ type: 'GameLost' });
        tracker.flush();
      }
      return tracker;
    }

    it('activates after 4 first-round deals and caps the 5th game offer', () => {
      const repository = new FakeProgressionRepository();
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());

      for (let i = 0; i < 4; i++) {
        playOneFirstRoundDealGame({ repository, manager, accept: true });
      }

      const streak = manager.getFirstRoundDealStreak();
      expect(streak.isActive).toBe(true);
      expect(streak.cappedGamesRemaining).toBe(5);

      // Quinta partida: la regla activa topa la oferta de ronda 1.
      const samples = [0, 0.5]; // sorteo cap → 1 (u=0), ruido 0
      const generator = () => samples.shift() ?? 0.5;
      const session = createGameSessionWithSelection(STANDARD_VALUES, 12, generator, streak);
      session.openCard('card_0');
      session.openCard('card_1');
      const { offer } = session.openCard('card_2');

      expect(offer?.amount).toBe(1); // cap de CAPPED_OFFER_VALUES
    });

    it('rejecting the capped offer counts down; accepting it does not', () => {
      const repository = new FakeProgressionRepository();
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());
      for (let i = 0; i < 4; i++) {
        playOneFirstRoundDealGame({ repository, manager, accept: true });
      }
      expect(manager.getFirstRoundDealStreak().cappedGamesRemaining).toBe(5);

      // Quinta partida: rechaza la topada y pierde → cuenta regresiva.
      playOneFirstRoundDealGame({ repository, manager, accept: false });
      expect(manager.getFirstRoundDealStreak().cappedGamesRemaining).toBe(4);

      // Sexta partida: ACEPTA la topada → no cuenta, y tampoco suma racha.
      playOneFirstRoundDealGame({ repository, manager, accept: true });
      expect(manager.getFirstRoundDealStreak().cappedGamesRemaining).toBe(4);
      expect(manager.getFirstRoundDealStreak().consecutiveFirstRoundDeals).toBe(0);
    });
  });
});
