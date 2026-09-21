import { DeckCollection } from './DeckCollection';

describe('DeckCollection', () => {
  describe('createDefault', () => {
    it('starts owning only the basic deck', () => {
      const collection = DeckCollection.createDefault();
      expect(collection.getOwnedDeckIds()).toEqual(['basic']);
    });

    it('starts with the basic deck selected', () => {
      const collection = DeckCollection.createDefault();
      expect(collection.getSelectedDeckId()).toBe('basic');
    });

    it('ownsMoreThanBasic is false', () => {
      expect(DeckCollection.createDefault().ownsMoreThanBasic()).toBe(false);
    });
  });

  describe('restore', () => {
    it('always includes the basic deck, even if absent from the persisted list', () => {
      const collection = DeckCollection.restore(['cyberpunk'], 'cyberpunk');
      expect(collection.hasDeck('basic')).toBe(true);
      expect(collection.hasDeck('cyberpunk')).toBe(true);
    });

    it('preserves a valid selected deck from persisted data', () => {
      const collection = DeckCollection.restore(['tarot', 'vegas'], 'vegas');
      expect(collection.getSelectedDeckId()).toBe('vegas');
    });

    it('falls back to basic if the persisted selection is not actually owned (corrupted/stale data)', () => {
      const collection = DeckCollection.restore(['tarot'], 'vegas');
      expect(collection.getSelectedDeckId()).toBe('basic');
    });

    it('deduplicates owned ids', () => {
      const collection = DeckCollection.restore(['medieval', 'medieval', 'basic'], 'medieval');
      expect(collection.getOwnedDeckIds().filter(id => id === 'medieval')).toHaveLength(1);
    });
  });

  describe('canPurchase / withPurchasedDeck', () => {
    it('canPurchase is true for a deck not owned', () => {
      expect(DeckCollection.createDefault().canPurchase('cyberpunk')).toBe(true);
    });

    it('canPurchase is false for a deck already owned (including basic)', () => {
      expect(DeckCollection.createDefault().canPurchase('basic')).toBe(false);
    });

    it('withPurchasedDeck adds the deck to the owned set', () => {
      const updated = DeckCollection.createDefault().withPurchasedDeck('ww2');
      expect(updated.hasDeck('ww2')).toBe(true);
      expect(updated.getOwnedDeckIds().sort()).toEqual(['basic', 'ww2']);
    });

    it('withPurchasedDeck does not change the currently selected deck', () => {
      const updated = DeckCollection.createDefault().withPurchasedDeck('ww2');
      expect(updated.getSelectedDeckId()).toBe('basic');
    });

    it('throws when purchasing an already-owned deck (cannot re-buy)', () => {
      const collection = DeckCollection.restore(['cyberpunk'], 'basic');
      expect(() => collection.withPurchasedDeck('cyberpunk')).toThrow();
    });

    it('is immutable — the original instance is unaffected', () => {
      const original = DeckCollection.createDefault();
      original.withPurchasedDeck('tarot');
      expect(original.hasDeck('tarot')).toBe(false);
    });
  });

  describe('withSelectedDeck', () => {
    it('selects an owned deck', () => {
      const collection = DeckCollection.restore(['vegas'], 'basic').withSelectedDeck('vegas');
      expect(collection.getSelectedDeckId()).toBe('vegas');
    });

    it('throws when selecting a deck that is not owned', () => {
      const collection = DeckCollection.createDefault();
      expect(() => collection.withSelectedDeck('cyberpunk')).toThrow();
    });
  });

  describe('ownsMoreThanBasic', () => {
    it('becomes true after purchasing a second deck', () => {
      const collection = DeckCollection.createDefault().withPurchasedDeck('medieval');
      expect(collection.ownsMoreThanBasic()).toBe(true);
    });
  });
});
