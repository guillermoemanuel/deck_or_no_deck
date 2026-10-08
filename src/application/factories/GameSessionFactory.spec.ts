import { createGameSessionWithSelection, createGameSession } from './GameSessionFactory';
import { DeterministicRandomProvider } from '../../infrastructure/services/testing/DeterministicRandomProvider';

const FIXED_ORDER = [1, 5, 10, 25, 50, 100, 250, 500, 750, 1000, 5000, 10000, 25000];

describe('GameSessionFactory', () => {
  describe('createGameSessionWithSelection', () => {
    it('creates a session with a secret card and board cards', () => {
      const session = createGameSessionWithSelection(FIXED_ORDER, 0, () => 0.5);

      expect(session.getSecretCard().value).toBe(1); // 1 al inicio del arreglo
      expect(session.getClosedCards()).toHaveLength(12);
      expect(session.getStatus()).toBe('playing');
    });

    it('creates sessions with different secret cards for different indices', () => {
      const sessionA = createGameSessionWithSelection(FIXED_ORDER, 5, () => 0.5);
      const sessionB = createGameSessionWithSelection(FIXED_ORDER, 10, () => 0.5);

      expect(sessionA.getSecretCard().value).toBe(100);
      expect(sessionB.getSecretCard().value).toBe(5000);
    });

    // ADR-013: el generador de ruido de la oferta se INYECTA (nunca
    // Math.random en dominio). u = 0.5 → ruido 0 → oferta exacta de
    // ronda 1 = 0.75 × promedio de las cartas cerradas.
    it('wires the injected generator into the Banker (u=0.5 → oferta exacta 0.75 × promedio)', () => {
      const session = createGameSessionWithSelection(FIXED_ORDER, 0, () => 0.5);

      session.openCard('card_1'); // 5
      session.openCard('card_2'); // 10
      const { offer } = session.openCard('card_3'); // 25 → ronda 1 de oferta

      const closed = session.getClosedCards().map(c => c.value);
      const average = closed.reduce((sum, v) => sum + v, 0) / closed.length;

      expect(offer).not.toBeNull();
      expect(offer?.amount).toBe(Math.round(average * 0.75));
    });

    it('different generators produce different offers (ruido inyectado, no Math.random)', () => {
      const low = createGameSessionWithSelection(FIXED_ORDER, 0, () => 0); // ruido −20 %
      const high = createGameSessionWithSelection(FIXED_ORDER, 0, () => 0.999999999); // ruido +20 %

      const openAndGetOffer = (session: ReturnType<typeof createGameSessionWithSelection>): number => {
        session.openCard('card_1');
        session.openCard('card_2');
        return session.openCard('card_3').offer?.amount ?? 0;
      };

      const lowAmount = openAndGetOffer(low);
      const highAmount = openAndGetOffer(high);

      expect(lowAmount).toBeGreaterThan(0);
      expect(highAmount).toBeGreaterThan(lowAmount);
    });
  });

  describe('createGameSession', () => {
    it('creates a valid session from the random provider', () => {
      const provider = new DeterministicRandomProvider(FIXED_ORDER);
      const session = createGameSession(provider);

      expect(session.getSecretCard().value).toBe(25000); // index 12
      expect(session.getClosedCards()).toHaveLength(12);
      expect(session.getStatus()).toBe('playing');
    });

    it('derives offer noise from the provider (determinista con DeterministicRandomProvider)', () => {
      const a = createGameSession(new DeterministicRandomProvider(FIXED_ORDER));
      const b = createGameSession(new DeterministicRandomProvider(FIXED_ORDER));

      const openAndGetOffer = (session: ReturnType<typeof createGameSession>): number => {
        session.openCard('card_1');
        session.openCard('card_2');
        return session.openCard('card_3').offer?.amount ?? 0;
      };

      const offerA = openAndGetOffer(a);
      const offerB = openAndGetOffer(b);

      // DeterministicRandomProvider.nextFloat() = 0.5 → ruido 0 → la misma
      // oferta exacta en ambas sesiones: nada de Math.random().
      expect(offerA).toBe(offerB);
      expect(offerA).toBeGreaterThan(0);
    });
  });
});
