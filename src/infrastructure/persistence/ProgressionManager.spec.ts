import { ProgressionManager } from './ProgressionManager';
import { FakeProgressionRepository } from './testing/FakeProgressionRepository';
import { DeterministicRandomProvider } from '../services/testing/DeterministicRandomProvider';
import { ProgressionEvent } from '../../domain/events/ProgressionEvents';

describe('ProgressionManager', () => {
  describe('awardGameplayCoins', () => {
    it('adds coins and emits CoinsChanged with a positive delta', () => {
      const manager = new ProgressionManager(new FakeProgressionRepository(), new DeterministicRandomProvider());
      const events: ProgressionEvent[] = [];
      manager.onEvent(e => events.push(e));

      manager.awardGameplayCoins(750);

      expect(manager.getCoins()).toBe(750);
      expect(events).toContainEqual({ type: 'CoinsChanged', newTotal: 750, delta: 750 });
    });
  });

  describe('spendCoins', () => {
    it('succeeds and emits CoinsChanged when the balance is sufficient', () => {
      const repository = new FakeProgressionRepository();
      repository.seedCoins(1000);
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());
      const events: ProgressionEvent[] = [];
      manager.onEvent(e => events.push(e));

      const result = manager.spendCoins(400);

      expect(result).toBe(true);
      expect(manager.getCoins()).toBe(600);
      expect(events).toContainEqual({ type: 'CoinsChanged', newTotal: 600, delta: -400 });
    });

    it('fails and does NOT change the balance when insufficient', () => {
      const manager = new ProgressionManager(new FakeProgressionRepository(), new DeterministicRandomProvider());
      const events: ProgressionEvent[] = [];
      manager.onEvent(e => events.push(e));

      const result = manager.spendCoins(100);

      expect(result).toBe(false);
      expect(manager.getCoins()).toBe(0);
      expect(events).toHaveLength(0); // no se emite CoinsChanged si no hubo cambio real
    });
  });

  describe('applyLossPenalty', () => {
    it('deducts the exact penalty amount from a sufficient balance', () => {
      const repository = new FakeProgressionRepository();
      repository.seedCoins(10000);
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());

      manager.applyLossPenalty(5000);

      expect(manager.getCoins()).toBe(5000);
    });

    it('allows the balance to go negative when insufficient (a diferencia de spendCoins)', () => {
      const repository = new FakeProgressionRepository();
      repository.seedCoins(2000);
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());

      manager.applyLossPenalty(5000);

      expect(manager.getCoins()).toBe(-3000);
    });

    it('emits CoinsChanged with the exact negative delta, even into negative territory', () => {
      const repository = new FakeProgressionRepository();
      repository.seedCoins(2000);
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());
      const events: ProgressionEvent[] = [];
      manager.onEvent(e => events.push(e));

      manager.applyLossPenalty(5000);

      expect(events).toContainEqual({ type: 'CoinsChanged', newTotal: -3000, delta: -5000 });
    });

    it('can be applied repeatedly, compounding the negative balance', () => {
      const repository = new FakeProgressionRepository();
      repository.seedCoins(1000);
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());

      manager.applyLossPenalty(5000); // 1000 -> -4000
      manager.applyLossPenalty(5000); // -4000 -> -9000

      expect(manager.getCoins()).toBe(-9000);
    });
  });

  describe('resetAllProgress', () => {
    it('resets the balance to exactly 0', () => {
      const repository = new FakeProgressionRepository();
      repository.seedCoins(12345);
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());

      manager.resetAllProgress();

      expect(manager.getCoins()).toBe(0);
    });

    it('resets a negative balance to 0 as well', () => {
      const repository = new FakeProgressionRepository();
      repository.seedCoins(500);
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());
      manager.applyLossPenalty(5000); // -4500

      manager.resetAllProgress();

      expect(manager.getCoins()).toBe(0);
    });

    it('emits CoinsChanged reflecting the reset', () => {
      const repository = new FakeProgressionRepository();
      repository.seedCoins(800);
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());
      const events: ProgressionEvent[] = [];
      manager.onEvent(e => events.push(e));

      manager.resetAllProgress();

      expect(events).toContainEqual({ type: 'CoinsChanged', newTotal: 0, delta: -800 });
    });

    it('actually clears the underlying repository (clearAll), not just a local zeroing', () => {
      const repository = new FakeProgressionRepository();
      repository.seedCoins(999);
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());
      const clearAllSpy = jest.spyOn(repository, 'clearAll');

      manager.resetAllProgress();

      expect(clearAllSpy).toHaveBeenCalledTimes(1);
    });

    it('also resets the deck collection back to only the basic deck', () => {
      const repository = new FakeProgressionRepository();
      repository.seedCoins(100000);
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());
      manager.purchaseDeck('cyberpunk');
      manager.selectDeck('cyberpunk');

      manager.resetAllProgress();

      expect(manager.getOwnedDeckIds()).toEqual(['basic']);
      expect(manager.getSelectedDeckId()).toBe('basic');
    });
  });

  describe('mazos temáticos (colección persistente)', () => {
    it('starts owning only the basic deck, selected by default', () => {
      const manager = new ProgressionManager(new FakeProgressionRepository(), new DeterministicRandomProvider());
      expect(manager.getOwnedDeckIds()).toEqual(['basic']);
      expect(manager.getSelectedDeckId()).toBe('basic');
      expect(manager.hasMoreThanBasicDeck()).toBe(false);
    });

    it('purchaseDeck succeeds, charges the exact price, and unlocks the deck', () => {
      const repository = new FakeProgressionRepository();
      repository.seedCoins(25000);
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());

      const result = manager.purchaseDeck('cyberpunk');

      expect(result).toEqual({ success: true });
      expect(manager.getCoins()).toBe(5000); // 25000 - 20000
      expect(manager.getOwnedDeckIds().sort()).toEqual(['basic', 'cyberpunk']);
    });

    it('purchaseDeck fails with insufficient_coins and does NOT unlock the deck', () => {
      const repository = new FakeProgressionRepository();
      repository.seedCoins(100);
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());

      const result = manager.purchaseDeck('vegas');

      expect(result).toEqual({ success: false, reason: 'insufficient_coins' });
      expect(manager.getCoins()).toBe(100); // no se cobro nada
      expect(manager.getOwnedDeckIds()).toEqual(['basic']);
    });

    it('purchaseDeck fails with already_owned on a second attempt (no se puede recomprar)', () => {
      const repository = new FakeProgressionRepository();
      repository.seedCoins(100000);
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());
      manager.purchaseDeck('tarot');

      const secondAttempt = manager.purchaseDeck('tarot');

      expect(secondAttempt).toEqual({ success: false, reason: 'already_owned' });
      expect(manager.getCoins()).toBe(100000 - 20000); // no se cobro dos veces
    });

    it('selectDeck succeeds for an owned deck and persists the selection', () => {
      const repository = new FakeProgressionRepository();
      repository.seedCoins(100000);
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());
      manager.purchaseDeck('medieval');

      const result = manager.selectDeck('medieval');

      expect(result).toBe(true);
      expect(manager.getSelectedDeckId()).toBe('medieval');
    });

    it('selectDeck fails for a deck not owned and does not change the selection', () => {
      const manager = new ProgressionManager(new FakeProgressionRepository(), new DeterministicRandomProvider());

      const result = manager.selectDeck('ww2');

      expect(result).toBe(false);
      expect(manager.getSelectedDeckId()).toBe('basic');
    });

    it('hasMoreThanBasicDeck becomes true after purchasing a second deck', () => {
      const repository = new FakeProgressionRepository();
      repository.seedCoins(100000);
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());

      manager.purchaseDeck('ww2');

      expect(manager.hasMoreThanBasicDeck()).toBe(true);
    });

    it('emits DeckCollectionChanged on purchase and on selection', () => {
      const repository = new FakeProgressionRepository();
      repository.seedCoins(100000);
      const manager = new ProgressionManager(repository, new DeterministicRandomProvider());
      const events: ProgressionEvent[] = [];
      manager.onEvent(e => events.push(e));

      manager.purchaseDeck('vegas');
      manager.selectDeck('vegas');

      const deckEvents = events.filter(e => e.type === 'DeckCollectionChanged');
      expect(deckEvents).toHaveLength(2);
      expect(deckEvents[1]).toEqual({
        type: 'DeckCollectionChanged',
        ownedDeckIds: ['basic', 'vegas'],
        selectedDeckId: 'vegas'
      });
    });
  });
});
