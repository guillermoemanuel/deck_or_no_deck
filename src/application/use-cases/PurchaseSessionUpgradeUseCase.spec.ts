import { PurchaseSessionUpgradeUseCase } from './PurchaseSessionUpgradeUseCase';
import { GameSession, DefaultEnergyDrainRule, EnergyDrainRule } from '../../domain/entities/GameSession';
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

function buildSession(): GameSession {
  const boardCards = STANDARD_VALUES.slice(0, 12).map((v, i) => Card.create(`card_${i}`, v));
  const secretCard = Card.create('card_secret', STANDARD_VALUES[12], true);
  return new GameSession(boardCards, secretCard, new Banker(new OfferCalculator()), new DefaultEnergyDrainRule());
}

class NoDrainRule implements EnergyDrainRule {
  drainFor(): number {
    return 0;
  }
}

/** Mismo helper que SwapFinalSecretCardUseCase.spec.ts — deja la sesión en la ÚLTIMA jugada (una única carta cerrada restante), sin el upgrade todavía. */
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

function buildContext(seedCoins = 100000) {
  const session = buildSession();
  const repository = new FakeProgressionRepository();
  repository.seedCoins(seedCoins);
  const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
  const eventBus = new SimpleEventEmitter<GameEvent>();
  const useCase = new PurchaseSessionUpgradeUseCase(session, progressionManager, eventBus);
  return { session, repository, progressionManager, eventBus, useCase };
}

describe('PurchaseSessionUpgradeUseCase', () => {
  it('returns unknown_upgrade for an invalid id', () => {
    const { useCase } = buildContext();
    // @ts-expect-error probando un id invalido a proposito
    const result = useCase.execute('does_not_exist');
    expect(result).toEqual({ success: false, reason: 'unknown_upgrade' });
  });

  it('fails with insufficient_coins and does NOT apply the effect', () => {
    const { session, useCase } = buildContext(0);

    const result = useCase.execute('energy_tank_1');

    expect(result).toEqual({ success: false, reason: 'insufficient_coins' });
    expect(session.getSessionUpgrades().getEnergyTankLevel()).toBe(0);
  });

  describe('energy_tank_1 / energy_tank_2', () => {
    it('applies level 1 immediately, charges its cost, and emits EnergyTankUpgraded', () => {
      const { session, repository, eventBus, useCase } = buildContext();
      const events = collectEvents(eventBus);

      const result = useCase.execute('energy_tank_1');

      expect(result).toEqual({ success: true });
      expect(session.getSessionUpgrades().getEnergyTankLevel()).toBe(1);
      expect(repository.getCoins()).toBe(100000 - 350);
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'EnergyTankUpgraded', capacityMultiplier: 1.25 })
      );
    });

    it('rejects energy_tank_2 before energy_tank_1 (not_applicable, no charge)', () => {
      const { repository, useCase } = buildContext();

      const result = useCase.execute('energy_tank_2');

      expect(result).toEqual({ success: false, reason: 'not_applicable' });
      expect(repository.getCoins()).toBe(100000); // no se cobro nada
    });

    it('allows energy_tank_2 after energy_tank_1', () => {
      const { session, useCase } = buildContext();
      useCase.execute('energy_tank_1');

      const result = useCase.execute('energy_tank_2');

      expect(result).toEqual({ success: true });
      expect(session.getSessionUpgrades().getEnergyTankLevel()).toBe(2);
    });

    it('rejects buying energy_tank_1 twice', () => {
      const { useCase } = buildContext();
      useCase.execute('energy_tank_1');

      const result = useCase.execute('energy_tank_1');

      expect(result).toEqual({ success: false, reason: 'not_applicable' });
    });
  });

  describe('double_reward / triple_reward', () => {
    it('triple_reward costs exactly double double_reward (regla de diseño)', () => {
      // Verificado contra el catalogo real, no un valor hardcodeado aparte.
      const { repository, useCase: useCaseA } = buildContext();
      useCaseA.execute('double_reward');
      const coinsAfterDouble = 100000 - repository.getCoins();

      const { repository: repoB, useCase: useCaseB } = buildContext();
      useCaseB.execute('triple_reward');
      const coinsAfterTriple = 100000 - repoB.getCoins();

      expect(coinsAfterTriple).toBe(coinsAfterDouble * 2);
    });

    it('both can be purchased and coexist in the same session', () => {
      const { session, useCase } = buildContext();
      useCase.execute('double_reward');
      useCase.execute('triple_reward');

      expect(session.getSessionUpgrades().hasDoubleReward()).toBe(true);
      expect(session.getSessionUpgrades().hasTripleReward()).toBe(true);
    });

    it('rejects buying the same one-shot upgrade twice', () => {
      const { useCase } = buildContext();
      useCase.execute('double_reward');
      const second = useCase.execute('double_reward');

      expect(second).toEqual({ success: false, reason: 'not_applicable' });
    });
  });

  describe('revive', () => {
    it('grants the revive flag on the session', () => {
      const { session, useCase } = buildContext();
      useCase.execute('revive');
      expect(session.getSessionUpgrades().hasRevive()).toBe(true);
    });
  });

  describe('secret_swap_final', () => {
    it('grants the flag without requiring any particular board state', () => {
      const { session, useCase } = buildContext();
      const result = useCase.execute('secret_swap_final');

      expect(result).toEqual({ success: true });
      expect(session.getSessionUpgrades().hasSecretSwapFinal()).toBe(true);
    });

    it('does NOT emit FinalCardSwapAvailable when the board is not on its last card', () => {
      const { eventBus, useCase } = buildContext();
      const events = collectEvents(eventBus);

      useCase.execute('secret_swap_final');

      expect(events).toHaveLength(0);
    });

    // BUGFIX reportado: comprar este upgrade estando YA en la última
    // jugada (una única carta cerrada restante) no ofrecía la opción de
    // intercambio hasta la partida siguiente, porque esa disponibilidad
    // normalmente se anuncia una única vez, al abrir la anteúltima carta
    // (ver OpenCardUseCase.execute()) — momento que para esta compra ya
    // pasó. Ver PurchaseSessionUpgradeUseCase.applyEffect().
    it('emits FinalCardSwapAvailable immediately when purchased with exactly 1 closed card left', () => {
      const session = buildSessionWithOneCardLeft();
      const repository = new FakeProgressionRepository();
      repository.seedCoins(100000);
      const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
      const eventBus = new SimpleEventEmitter<GameEvent>();
      const events = collectEvents(eventBus);
      const useCase = new PurchaseSessionUpgradeUseCase(session, progressionManager, eventBus);

      const result = useCase.execute('secret_swap_final');

      expect(result).toEqual({ success: true });
      expect(events).toContainEqual({ type: 'FinalCardSwapAvailable' });
    });
  });

  describe('negative_card_shield', () => {
    it('grants the flag and charges its cost', () => {
      const { session, repository, useCase } = buildContext();

      const result = useCase.execute('negative_card_shield');

      expect(result).toEqual({ success: true });
      expect(session.getSessionUpgrades().hasNegativeCardShield()).toBe(true);
      expect(repository.getCoins()).toBe(100000 - 400);
    });

    it('rejects buying it twice', () => {
      const { useCase } = buildContext();
      useCase.execute('negative_card_shield');

      const second = useCase.execute('negative_card_shield');

      expect(second).toEqual({ success: false, reason: 'not_applicable' });
    });
  });

  describe('negotiator', () => {
    it('grants the flag and charges its cost', () => {
      const { session, repository, useCase } = buildContext();

      const result = useCase.execute('negotiator');

      expect(result).toEqual({ success: true });
      expect(session.getSessionUpgrades().hasNegotiator()).toBe(true);
      expect(repository.getCoins()).toBe(100000 - 550);
    });

    it('coexists with negative_card_shield in the same session', () => {
      const { session, useCase } = buildContext();
      useCase.execute('negotiator');
      useCase.execute('negative_card_shield');

      expect(session.getSessionUpgrades().hasNegotiator()).toBe(true);
      expect(session.getSessionUpgrades().hasNegativeCardShield()).toBe(true);
    });

    it('rejects buying it twice', () => {
      const { useCase } = buildContext();
      useCase.execute('negotiator');

      const second = useCase.execute('negotiator');

      expect(second).toEqual({ success: false, reason: 'not_applicable' });
    });
  });
});