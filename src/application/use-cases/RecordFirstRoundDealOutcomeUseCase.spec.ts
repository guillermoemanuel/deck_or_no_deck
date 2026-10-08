import { RecordFirstRoundDealOutcomeUseCase } from './RecordFirstRoundDealOutcomeUseCase';
import { ProgressionManager } from '../../infrastructure/persistence/ProgressionManager';
import { FakeProgressionRepository } from '../../infrastructure/persistence/testing/FakeProgressionRepository';
import { DeterministicRandomProvider } from '../../infrastructure/services/testing/DeterministicRandomProvider';
import { CAPPED_GAMES_DURATION, FIRST_ROUND_STREAK_TRIGGER } from '../../domain/value-objects/BankerPolicy';

describe('RecordFirstRoundDealOutcomeUseCase', () => {
  function setup(): { repository: FakeProgressionRepository; manager: ProgressionManager; useCase: RecordFirstRoundDealOutcomeUseCase } {
    const repository = new FakeProgressionRepository();
    const manager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const useCase = new RecordFirstRoundDealOutcomeUseCase(manager);
    return { repository, manager, useCase };
  }

  const firstRoundDeal = { firstRoundDealAccepted: true, rejectedRound1Offer: false };
  const passedFirstRound = { firstRoundDealAccepted: false, rejectedRound1Offer: true };

  it('accumulates the streak on repeated first-round deals (no diaria)', () => {
    const { manager, useCase } = setup();

    for (let i = 0; i < FIRST_ROUND_STREAK_TRIGGER - 1; i++) {
      useCase.execute(firstRoundDeal, false);
    }

    expect(manager.getFirstRoundDealStreak().consecutiveFirstRoundDeals).toBe(FIRST_ROUND_STREAK_TRIGGER - 1);
    expect(manager.getFirstRoundDealStreak().isActive).toBe(false);
  });

  it('activates the cap on the 4th first-round deal and persists it', () => {
    const { repository, manager, useCase } = setup();

    for (let i = 0; i < FIRST_ROUND_STREAK_TRIGGER; i++) {
      useCase.execute(firstRoundDeal, false);
    }

    expect(manager.getFirstRoundDealStreak().isActive).toBe(true);
    expect(manager.getFirstRoundDealStreak().cappedGamesRemaining).toBe(CAPPED_GAMES_DURATION);
    // Persistido en el repo (fake = memoria): otra fachada sobre el mismo
    // repo ve el mismo estado.
    expect(repository.getFirstRoundDealStreak().isActive).toBe(true);
  });

  it('resets the streak when a game does not end in a first-round deal', () => {
    const { manager, useCase } = setup();
    useCase.execute(firstRoundDeal, false);
    useCase.execute(firstRoundDeal, false);

    useCase.execute({ firstRoundDealAccepted: false, rejectedRound1Offer: false }, false);

    expect(manager.getFirstRoundDealStreak().consecutiveFirstRoundDeals).toBe(0);
  });

  it('counts down only when the capped offer was rejected', () => {
    const { manager, useCase } = setup();
    for (let i = 0; i < FIRST_ROUND_STREAK_TRIGGER; i++) {
      useCase.execute(firstRoundDeal, false);
    }
    expect(manager.getFirstRoundDealStreak().cappedGamesRemaining).toBe(CAPPED_GAMES_DURATION);

    useCase.execute(passedFirstRound, false);

    expect(manager.getFirstRoundDealStreak().cappedGamesRemaining).toBe(CAPPED_GAMES_DURATION - 1);
  });

  it('does not decrement when the capped offer was accepted (y tampoco suma racha)', () => {
    const { manager, useCase } = setup();
    for (let i = 0; i < FIRST_ROUND_STREAK_TRIGGER; i++) {
      useCase.execute(firstRoundDeal, false);
    }

    useCase.execute(firstRoundDeal, false); // acepta la topada

    expect(manager.getFirstRoundDealStreak().cappedGamesRemaining).toBe(CAPPED_GAMES_DURATION);
    expect(manager.getFirstRoundDealStreak().consecutiveFirstRoundDeals).toBe(0);
  });

  it('deactivates when the countdown reaches zero', () => {
    const { manager, useCase } = setup();
    for (let i = 0; i < FIRST_ROUND_STREAK_TRIGGER; i++) {
      useCase.execute(firstRoundDeal, false);
    }
    for (let i = 0; i < CAPPED_GAMES_DURATION; i++) {
      useCase.execute(passedFirstRound, false);
    }

    expect(manager.getFirstRoundDealStreak().isActive).toBe(false);
    expect(manager.getFirstRoundDealStreak().cappedGamesRemaining).toBe(0);
  });

  it('EXCLUDES the daily challenge: never touches the streak (regla 5)', () => {
    const { manager, useCase } = setup();
    useCase.execute(firstRoundDeal, false);
    useCase.execute(firstRoundDeal, false);

    useCase.execute(firstRoundDeal, true); // diaria: no suma
    useCase.execute(passedFirstRound, true); // diaria: no resetea

    expect(manager.getFirstRoundDealStreak().consecutiveFirstRoundDeals).toBe(2);
  });
});
