import { GameSession, EnergyDrainRule, DefaultEnergyDrainRule } from './GameSession';
import { Banker } from '../services/Banker';
import { OfferCalculator } from '../services/OfferCalculator';
import { Card } from './Card';

function buildBoard(values: number[]): { boardCards: Card[]; secretCard: Card } {
  if (values.length !== 13) {
    throw new Error('Test helper requires exactly 13 values');
  }
  const boardCards = values.slice(0, 12).map((v, i) => Card.create(`card_${i}`, v));
  const secretCard = Card.create('card_secret', values[12], true);
  return { boardCards, secretCard };
}

class FixedDrainRule implements EnergyDrainRule {
  drainFor(cardValue: number): number {
    return cardValue;
  }
}

function createSession(values: number[], drainRule: EnergyDrainRule = new FixedDrainRule(), startingEnergyBonus = 0): GameSession {
  const { boardCards, secretCard } = buildBoard(values);
  const banker = new Banker(new OfferCalculator(() => 0.5));
  return new GameSession(boardCards, secretCard, banker, drainRule, startingEnergyBonus);
}

const STANDARD_VALUES = [1, 5, 10, 25, 50, 100, 250, 500, 750, 1000, 5000, 10000, 25000];

describe('GameSession', () => {
  describe('constructor', () => {
    it('throws if initialCards does not have exactly 12 cards', () => {
      const { boardCards, secretCard } = buildBoard(STANDARD_VALUES);
      const banker = new Banker(new OfferCalculator(() => 0.5));
      const drainRule = new FixedDrainRule();

      expect(() => new GameSession(boardCards.slice(0, 11), secretCard, banker, drainRule)).toThrow();
    });

    it('starts with status "playing"', () => {
      const session = createSession(STANDARD_VALUES);
      expect(session.getStatus()).toBe('playing');
    });

    it('starts at 60% energy with no bonus (STARTING_ENERGY_RATIO — ADR-013)', () => {
      const session = createSession(STANDARD_VALUES);
      expect(session.getEnergyPercentage()).toBe(60);
    });
  });

  describe('openCard', () => {
    it('marks the card as open and drains energy accordingly', () => {
      const session = createSession(STANDARD_VALUES, new FixedDrainRule());
      session.openCard('card_0');

      expect(session.getEnergyRaw()).toBe(59); // 60 (STARTING_ENERGY_RATIO) - 1
    });

    it('throws when opening the same card twice', () => {
      const session = createSession(STANDARD_VALUES);
      session.openCard('card_0');

      expect(() => session.openCard('card_0')).toThrow();
    });

    it('throws when opening a nonexistent card id', () => {
      const session = createSession(STANDARD_VALUES);
      expect(() => session.openCard('card_does_not_exist')).toThrow();
    });

    it('throws when opening a card after the game already ended', () => {
      const session = createSession(STANDARD_VALUES);
      session.openCard('card_11');
      expect(session.getStatus()).toBe('lost');

      expect(() => session.openCard('card_0')).toThrow();
    });

    it('sets status to "lost" when energy reaches exactly 0', () => {
      const session = createSession([100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], new FixedDrainRule());
      session.openCard('card_0');
      expect(session.getStatus()).toBe('lost');
    });

    it('does not trigger a banker offer while losing on the same card', () => {
      const session = createSession([100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], new FixedDrainRule());
      const { offer } = session.openCard('card_0');
      expect(offer).toBeNull();
    });
  });

  describe('banker offer cadence', () => {
    it('returns no offer after the 1st and 2nd cards opened', () => {
      const session = createSession(STANDARD_VALUES);
      const first = session.openCard('card_0');
      const second = session.openCard('card_1');

      expect(first.offer).toBeNull();
      expect(second.offer).toBeNull();
    });

    it('returns an offer exactly after the 3rd card opened', () => {
      const session = createSession(STANDARD_VALUES);
      session.openCard('card_0');
      session.openCard('card_1');
      const third = session.openCard('card_2');

      expect(third.offer).not.toBeNull();
      expect(session.getStatus()).toBe('awaiting_offer_response');
    });

    it('throws if trying to open another card while awaiting offer response', () => {
      const session = createSession(STANDARD_VALUES);
      session.openCard('card_0');
      session.openCard('card_1');
      session.openCard('card_2');

      expect(() => session.openCard('card_3')).toThrow();
    });
  });

  describe('acceptDeal / rejectDeal', () => {
    function sessionAwaitingOffer(): GameSession {
      const session = createSession(STANDARD_VALUES);
      session.openCard('card_0');
      session.openCard('card_1');
      session.openCard('card_2');
      return session;
    }

    it('throws acceptDeal when there is no active offer', () => {
      const session = createSession(STANDARD_VALUES);
      expect(() => session.acceptDeal()).toThrow();
    });

    it('throws rejectDeal when there is no active offer', () => {
      const session = createSession(STANDARD_VALUES);
      expect(() => session.rejectDeal()).toThrow();
    });

    it('acceptDeal sets status to "deal_accepted" and returns the offer amount', () => {
      const session = sessionAwaitingOffer();
      const amount = session.acceptDeal();

      expect(session.getStatus()).toBe('deal_accepted');
      expect(amount).toBeGreaterThan(0);
    });

    it('rejectDeal returns status to "playing" and clears the offer', () => {
      const session = sessionAwaitingOffer();
      session.rejectDeal();

      expect(session.getStatus()).toBe('playing');
      expect(() => session.openCard('card_3')).not.toThrow();
    });

    it('throws if acceptDeal is called twice', () => {
      const session = sessionAwaitingOffer();
      session.acceptDeal();
      expect(() => session.acceptDeal()).toThrow();
    });
  });

  describe('midgame swap (6th card)', () => {
    function sessionAtSixthCard(): GameSession {
      const session = createSession(STANDARD_VALUES, new DefaultEnergyDrainRule());
      session.openCard('card_0');
      session.openCard('card_1');
      session.openCard('card_2');
      session.rejectDeal();
      session.openCard('card_3');
      session.openCard('card_4');
      session.openCard('card_5');
      return session;
    }

    it('is not available before the 6th card', () => {
      const session = createSession(STANDARD_VALUES);
      session.openCard('card_0');
      expect(session.isMidgameSwapAvailable()).toBe(false);
    });

    it('becomes available exactly at the 6th card opened', () => {
      const session = sessionAtSixthCard();
      expect(session.isMidgameSwapAvailable()).toBe(true);
    });

    it('replaces the secret card value with the chosen board card, keeping the original secret id', () => {
      const session = sessionAtSixthCard();
      const secretBefore = session.getSecretCard();
      const originalSecretId = secretBefore.id;
      const boardCardBefore = session.getDeckManager().findCard('card_6');

      session.swapSecretCard('card_6');
      const secretAfter = session.getSecretCard();

      // La carta secreta CONSERVA su id original (el pedestal no "se mueve",
      // solo cambia el valor que oculta) y sigue cerrada hasta el final.
      expect(secretAfter.id).toBe(originalSecretId);
      expect(secretAfter.value).toBe(boardCardBefore.value);
      expect(secretAfter.value).not.toBe(secretBefore.value);
      expect(secretAfter.isOpen).toBe(false);
    });

    it('reveals the discarded secret card on the board, occupying the swapped slot as an OPEN card (regresion del bug: ya no queda "cerrada")', () => {
      const session = sessionAtSixthCard();
      const secretBefore = session.getSecretCard();

      const { oldSecret } = session.swapSecretCard('card_6');

      // La carta descartada ocupa el MISMO id de tablero elegido para el
      // intercambio, ya revelada — este es exactamente el fix del bug
      // reportado: antes quedaba "cerrada" para siempre y era imposible
      // de volver a seleccionar sin romper el flujo del juego.
      expect(oldSecret.id).toBe('card_6');
      expect(oldSecret.value).toBe(secretBefore.value);
      expect(oldSecret.isOpen).toBe(true);

      const closedCards = session.getClosedCards();
      expect(closedCards.some(c => c.id === 'card_6')).toBe(false);

      const boardCardAfter = session.getDeckManager().findCard('card_6');
      expect(boardCardAfter.isOpen).toBe(true);
      expect(boardCardAfter.value).toBe(secretBefore.value);
    });

    it('can only be used once per game', () => {
      const session = sessionAtSixthCard();
      session.swapSecretCard('card_6');

      expect(session.isMidgameSwapAvailable()).toBe(false);
      expect(() => session.swapSecretCard('card_7')).toThrow();
    });

    it('throws when trying to swap with an already-open card', () => {
      const session = sessionAtSixthCard();
      expect(() => session.swapSecretCard('card_0')).toThrow();
    });
  });

  describe('reviveWithFullEnergy', () => {
    it('throws if the game is not currently lost', () => {
      const session = createSession(STANDARD_VALUES);
      expect(() => session.reviveWithFullEnergy()).toThrow();
    });

    it('restores energy to the starting point (60%, STARTING_ENERGY_RATIO) after a loss', () => {
      const session = createSession([100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], new FixedDrainRule());
      session.openCard('card_0');
      expect(session.getStatus()).toBe('lost');

      session.reviveWithFullEnergy();

      expect(session.getStatus()).toBe('playing');
      expect(session.getEnergyPercentage()).toBe(60);
    });

    it('respects the starting energy bonus when reviving', () => {
      const session = createSession(
        [110, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        new FixedDrainRule(),
        10
      );
      session.openCard('card_0');
      expect(session.getStatus()).toBe('lost');

      session.reviveWithFullEnergy();
      expect(session.getEnergyRaw()).toBe(70); // 60 (STARTING_ENERGY_RATIO) + 10 de bonus
    });

    it('allows opening cards again after reviving', () => {
      const session = createSession([100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], new FixedDrainRule());
      session.openCard('card_0');
      session.reviveWithFullEnergy();

      expect(() => session.openCard('card_1')).not.toThrow();
    });

    it('returns { wonImmediately: false } for a normal revive (cards still closed)', () => {
      const session = createSession([100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], new FixedDrainRule());
      session.openCard('card_0');

      const outcome = session.reviveWithFullEnergy();

      expect(outcome).toEqual({ wonImmediately: false });
    });

    // BUGFIX (partida trabada al revivir con el tablero ya vacío): si la
    // carta que causó la derrota era la ÚLTIMA cerrada del tablero,
    // openCard() la abre/quita del tablero ANTES de detectar el
    // agotamiento de energía, así que su chequeo de "tablero limpio →
    // victoria" nunca llega a correr — sin este caso en
    // reviveWithFullEnergy(), la partida quedaba en 'playing' para
    // siempre, sin ninguna carta más para abrir y sin forma de ganar.
    // Abre una carta y, si dispara una oferta del Banquero de paso (cada 3
    // cartas — ver Banker.OFFER_INTERVAL), la rechaza para poder seguir
    // abriendo. Deja 'card_0' como la ÚNICA carta cerrada del tablero.
    function openLeavingOnlyCardZero(session: GameSession): void {
      for (let i = 1; i <= 11; i++) {
        session.openCard(`card_${i}`);
        if (session.getStatus() === 'awaiting_offer_response') {
          session.rejectDeal();
        }
      }
    }

    it('resolves as an immediate win when the card that caused the loss was the LAST closed board card', () => {
      // 'card_0' vale 100 (agota la energía en la última jugada posible);
      // el resto del tablero vale 0 (no daña) para poder llegar hasta ahí
      // sin perder antes de tiempo. Secreta en 250.
      const values = [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 250];
      const session = createSession(values);
      openLeavingOnlyCardZero(session);
      expect(session.getStatus()).toBe('playing');

      session.openCard('card_0'); // agota la energía Y vacía el tablero, a la vez
      expect(session.getStatus()).toBe('lost');

      const outcome = session.reviveWithFullEnergy();

      expect(outcome.wonImmediately).toBe(true);
      expect(outcome.secretCard?.value).toBe(250);
      expect(session.getStatus()).toBe('won');
    });

    it('does not leave any way to keep playing after resolving as an immediate win', () => {
      const values = [100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 250];
      const session = createSession(values);
      openLeavingOnlyCardZero(session);
      session.openCard('card_0');

      session.reviveWithFullEnergy();

      expect(() => session.openCard('card_1')).toThrow();
    });
  });

  describe('starting energy bonus — comparative behavior', () => {
    it('lets a session with bonus survive a card that would deplete a session without bonus', () => {
      const drainRule = new FixedDrainRule();
      // Con el baseline de 60 (STARTING_ENERGY_RATIO), un drenaje de 60
      // agota a quien arranca en 60 (sin bonus) pero deja 20 de energía a
      // quien arranca en 80 (60 + 20 de "Tanque de Reserva").
      const moderateValues = [60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60];
      const sessionA = createSession(moderateValues, drainRule, 0);
      const sessionB = createSession(moderateValues, drainRule, 20);

      sessionA.openCard('card_0');
      sessionB.openCard('card_0');

      expect(sessionA.getStatus()).toBe('lost');
      expect(sessionB.getStatus()).toBe('playing');
    });
  });

  // BUGFIX (nivel de energía): esta suite prueba el ESCENARIO REAL reportado
  // — con la regla de drenaje REAL (DefaultEnergyDrainRule + EnergyDeltaTable),
  // no el doble de test FixedDrainRule usado en el resto del archivo. Antes,
  // la fórmula normalizada dejaba casi todos los valores en la rama
  // "protectora" y la energía prácticamente nunca llegaba a 0.
  describe('energy drains realistically with DefaultEnergyDrainRule (regresión del bug de energía)', () => {
    it('a streak of high-value cards can deplete energy to 0 and end the game in "lost"', () => {
      const realDrainRule = new DefaultEnergyDrainRule();
      // 25000 drena 40 puntos cada vez (ver EnergyDeltaTable). Con el
      // baseline de 60, dos cartas de 25000 seguidas alcanzan para agotarla.
      const session = createSession(
        [25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000],
        realDrainRule
      );

      session.openCard('card_0'); // 60 - 40 = 20
      expect(session.getStatus()).toBe('playing');
      expect(session.getEnergyRaw()).toBe(20);

      session.openCard('card_1'); // 20 - 40 -> acotado a 0
      expect(session.getStatus()).toBe('lost');
      expect(session.getEnergyRaw()).toBe(0);
    });

    it('a streak of low-value cards raises energy toward the cap without ever depleting', () => {
      const realDrainRule = new DefaultEnergyDrainRule();
      const session = createSession([1, 5, 10, 1, 5, 10, 1, 5, 10, 1, 5, 10, 1], realDrainRule);

      session.openCard('card_0'); // 60 + 30 = 90
      session.openCard('card_1'); // 90 + 25 -> acotado a 100
      session.openCard('card_2'); // ya en el tope, se mantiene en 100 — luego el banquero interviene

      // Cada 3 cartas se activa la oferta del banquero: el estado pasa a
      // 'awaiting_offer_response' hasta que el jugador decida. Rechazamos
      // para volver a 'playing' y continuar con las aserciones de energía.
      session.rejectDeal();

      expect(session.getStatus()).toBe('playing');
      expect(session.getEnergyRaw()).toBe(100);
    });
  });

  describe('applyEnergyTankUpgrade ("Tanque de Energía")', () => {
    it('level 1 raises the ceiling by 25% and grants the delta as immediate energy', () => {
      const session = createSession(STANDARD_VALUES); // 60/100 al inicio

      session.applyEnergyTankUpgrade(1);

      expect(session.getEnergyRaw()).toBe(85); // 60 + 25 de capacidad extra
      expect(session.getEnergyPercentage()).toBe(68); // 85/125*100
    });

    it('level 2 raises the ceiling by 50% from a fresh session', () => {
      const session = createSession(STANDARD_VALUES);

      session.applyEnergyTankUpgrade(1);
      session.applyEnergyTankUpgrade(2);

      expect(session.getEnergyRaw()).toBe(110); // 60 + 25 (nivel1) + 25 (nivel1->nivel2)
    });

    it('throws if level 2 is requested without owning level 1 first', () => {
      const session = createSession(STANDARD_VALUES);
      expect(() => session.applyEnergyTankUpgrade(2)).toThrow();
    });

    it('is reflected in getSessionUpgrades()', () => {
      const session = createSession(STANDARD_VALUES);
      session.applyEnergyTankUpgrade(1);
      expect(session.getSessionUpgrades().getEnergyTankLevel()).toBe(1);
    });

    it('the higher ceiling persists through a later loss and revive (does not reset to 100)', () => {
      const session = createSession([100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], new FixedDrainRule());
      session.applyEnergyTankUpgrade(1); // techo 125, energia 85

      session.openCard('card_0'); // drena 100 -> 85-100 acotado a 0
      expect(session.getStatus()).toBe('lost');

      session.reviveWithFullEnergy();
      // BUGFIX detectado durante este mismo refactor: revivir NO debe
      // perder el Tanque de Energía ya comprado en esta partida.
      expect(session.getEnergyRaw()).toBe(75); // 60 % de 125 (STARTING_ENERGY_RATIO), el techo vigente
    });
  });

  describe('negative card shield upgrade ("Escudo de Carta Negativa")', () => {
    it('halves the drain of a dangerous card (positive delta) when active', () => {
      const realDrainRule = new DefaultEnergyDrainRule();
      const session = createSession(STANDARD_VALUES, realDrainRule);
      session.getSessionUpgrades().grantNegativeCardShield();

      session.openCard('card_11'); // valor 10000 -> delta +30 (drena) sin escudo

      // Con el escudo activo, el drenaje real debe ser la MITAD: 60 - 15 = 45
      expect(session.getEnergyRaw()).toBe(45);
    });

    it('does NOT affect the protection of a beneficial card (negative delta)', () => {
      const realDrainRule = new DefaultEnergyDrainRule();
      const session = createSession(STANDARD_VALUES, realDrainRule);
      session.getSessionUpgrades().grantNegativeCardShield();

      session.openCard('card_0'); // valor 1 -> delta -30 (protege)

      // El escudo mitiga DAÑO, no debe alterar el beneficio de una carta protectora
      expect(session.getEnergyRaw()).toBe(90); // 60 + 30, igual que sin escudo
    });

    it('produces exactly double the drain when NOT active, for the same dangerous card', () => {
      const realDrainRule = new DefaultEnergyDrainRule();
      const withShield = createSession(STANDARD_VALUES, realDrainRule);
      withShield.getSessionUpgrades().grantNegativeCardShield();
      const withoutShield = createSession(STANDARD_VALUES, realDrainRule);

      withShield.openCard('card_11'); // 10000 -> delta +30
      withoutShield.openCard('card_11');

      const drainWithShield = 60 - withShield.getEnergyRaw();
      const drainWithoutShield = 60 - withoutShield.getEnergyRaw();
      expect(drainWithShield).toBeCloseTo(drainWithoutShield / 2, 5);
    });

    it('can let the player survive a card that would otherwise deplete their energy', () => {
      const realDrainRule = new DefaultEnergyDrainRule();
      const session = createSession(
        [25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000, 25000],
        realDrainRule
      );
      session.getSessionUpgrades().grantNegativeCardShield();

      session.openCard('card_0'); // 25000 -> delta +40, mitigado a +20 -> 60-20=40
      expect(session.getStatus()).toBe('playing');
      expect(session.getEnergyRaw()).toBe(40);

      session.openCard('card_1'); // otro +20 mitigado -> 40-20=20
      expect(session.getStatus()).toBe('playing');
      expect(session.getEnergyRaw()).toBe(20);
    });
  });

  describe('negotiator upgrade ("Negociador")', () => {
    function sessionAwaitingOfferWith(negotiatorActive: boolean): GameSession {
      const session = createSession(STANDARD_VALUES);
      if (negotiatorActive) {
        session.getSessionUpgrades().grantNegotiator();
      }
      session.openCard('card_0');
      session.openCard('card_1');
      session.openCard('card_2'); // dispara la oferta del banquero
      return session;
    }

    it('produces a higher (or equal) banker offer when active, vs an identical session without it', () => {
      const withNegotiator = sessionAwaitingOfferWith(true);
      const withoutNegotiator = sessionAwaitingOfferWith(false);

      const offerWith = withNegotiator.acceptDeal();
      const offerWithout = withoutNegotiator.acceptDeal();

      expect(offerWith).toBeGreaterThanOrEqual(offerWithout);
    });

    it('does not affect the offer at all when not purchased', () => {
      const sessionA = sessionAwaitingOfferWith(false);
      const sessionB = sessionAwaitingOfferWith(false);

      expect(sessionA.acceptDeal()).toBe(sessionB.acceptDeal());
    });
  });

  describe('final secret card swap upgrade ("Cambio de Carta Secreta")', () => {
    class NoDrainRule implements EnergyDrainRule {
      drainFor(): number {
        return 0;
      }
    }

    function sessionWithOneCardLeft(): GameSession {
      const session = createSession(STANDARD_VALUES, new NoDrainRule());
      // Abre 11 de las 12 cartas del tablero, dejando 'card_11' cerrada.
      // El banquero ofrece en la 3ra, 6ta y 9na — rechazamos cada vez.
      for (let i = 0; i < 11; i++) {
        session.openCard(`card_${i}`);
        if (session.getStatus() === 'awaiting_offer_response') {
          session.rejectDeal();
        }
      }
      return session;
    }

    it('canSwapFinalSecretCard is false without the upgrade, even with 1 card left', () => {
      const session = sessionWithOneCardLeft();
      expect(session.getClosedCards()).toHaveLength(1);
      expect(session.canSwapFinalSecretCard()).toBe(false);
    });

    it('canSwapFinalSecretCard is false with the upgrade but more than 1 card left', () => {
      const session = createSession(STANDARD_VALUES, new NoDrainRule());
      session.getSessionUpgrades().grantSecretSwapFinal();
      session.openCard('card_0');
      expect(session.canSwapFinalSecretCard()).toBe(false);
    });

    it('canSwapFinalSecretCard is true with the upgrade AND exactly 1 card left', () => {
      const session = sessionWithOneCardLeft();
      session.getSessionUpgrades().grantSecretSwapFinal();
      expect(session.canSwapFinalSecretCard()).toBe(true);
    });

    it('swapFinalSecretCard reveals the old secret on the last board slot and ends the game as won', () => {
      const session = sessionWithOneCardLeft();
      session.getSessionUpgrades().grantSecretSwapFinal();
      const secretBefore = session.getSecretCard();
      const lastCardBefore = session.getClosedCards()[0];

      const result = session.swapFinalSecretCard();

      expect(result.oldSecret.id).toBe(lastCardBefore.id);
      expect(result.oldSecret.value).toBe(secretBefore.value);
      expect(result.oldSecret.isOpen).toBe(true);
      expect(result.finalPrize).toBe(lastCardBefore.value);
      expect(result.newSecret.value).toBe(lastCardBefore.value);
      expect(session.getStatus()).toBe('won');
    });

    it('throws if attempted without the upgrade', () => {
      const session = sessionWithOneCardLeft();
      expect(() => session.swapFinalSecretCard()).toThrow();
    });

    it('throws if attempted with more than 1 card left, even with the upgrade', () => {
      const session = createSession(STANDARD_VALUES, new NoDrainRule());
      session.getSessionUpgrades().grantSecretSwapFinal();
      expect(() => session.swapFinalSecretCard()).toThrow();
    });
  });
});
