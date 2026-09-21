import { createGameSessionWithSelection, createGameSession } from './GameSessionFactory';
import { DeterministicRandomProvider } from '../../infrastructure/services/testing/DeterministicRandomProvider';

const FIXED_ORDER = [1, 5, 10, 25, 50, 100, 250, 500, 750, 1000, 5000, 10000, 25000];

describe('GameSessionFactory', () => {
  describe('createGameSessionWithSelection', () => {
    it('creates a session with a secret card and board cards', () => {
      const session = createGameSessionWithSelection(FIXED_ORDER, 0);

      expect(session.getSecretCard().value).toBe(1);
      expect(session.getSecretCard().isSecret).toBe(true);

      const boardCards = session.getClosedCards();
      expect(boardCards).toHaveLength(12);
      expect(boardCards.every(c => !c.isOpen)).toBe(true);
      expect(boardCards.map(c => c.value).sort((a, b) => a - b)).toEqual(
        [5, 10, 25, 50, 100, 250, 500, 750, 1000, 5000, 10000, 25000].sort((a, b) => a - b)
      );
    });
  });

  describe('createGameSession', () => {
    it('creates a full session using the random provider (defaulting to last index as secret)', () => {
      const provider = new DeterministicRandomProvider(FIXED_ORDER);
      const session = createGameSession(provider);

      expect(session.getSecretCard().value).toBe(25000); // index 12
      expect(session.getClosedCards()).toHaveLength(12);
    });
  });
});
