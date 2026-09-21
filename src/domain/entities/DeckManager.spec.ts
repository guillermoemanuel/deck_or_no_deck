import { DeckManager } from './DeckManager';

describe('DeckManager', () => {
  const VALUES = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 500];

  it('creates deck from array of values with last as secret card', () => {
    const deck = DeckManager.fromValues(VALUES);
    expect(deck.getBoardCardsCount()).toBe(12);
    expect(deck.getTotalCardsCount()).toBe(13);
    expect(deck.getSecretCard().value).toBe(500);
    expect(deck.getSecretCard().isSecret).toBe(true);
  });

  it('opens board card and tracks closed vs open cards', () => {
    const deck = DeckManager.fromValues(VALUES);
    expect(deck.getClosedCards()).toHaveLength(12);
    expect(deck.getOpenCards()).toHaveLength(0);

    const opened = deck.openCard('card_0');
    expect(opened.isOpen).toBe(true);
    expect(deck.getClosedCards()).toHaveLength(11);
    expect(deck.getOpenCards()).toHaveLength(1);
  });

  it('prevents opening secret card directly', () => {
    const deck = DeckManager.fromValues(VALUES);
    expect(() => deck.openCard('card_secret')).toThrow();
  });

  it('swaps secret card with a closed board card, revealing the discarded one on the board', () => {
    const deck = DeckManager.fromValues(VALUES);
    const initialBoardCount = deck.getBoardCardsCount();
    const initialSecretValue = deck.getSecretCard().value; // 500
    const initialSecretId = deck.getSecretCard().id; // 'card_secret'
    const boardCardToSwap = deck.findCard('card_2'); // 30

    const { oldSecret, newSecret } = deck.swapSecretCard('card_2');

    // La carta descartada (ex-secreta) ocupa el MISMO slot de tablero que se
    // eligio para el intercambio, ya revelada — nunca vuelve a quedar
    // "cerrada" ni seleccionable (este era el bug: quedaba cerrada para
    // siempre y romper el flujo al intentar reabrirla).
    expect(oldSecret.id).toBe('card_2');
    expect(oldSecret.value).toBe(initialSecretValue);
    expect(oldSecret.isOpen).toBe(true);

    // La NUEVA carta secreta conserva el id original de reserva (el pedestal
    // no "se mueve" — solo cambia el valor que oculta) y permanece cerrada.
    expect(newSecret.id).toBe(initialSecretId);
    expect(newSecret.value).toBe(boardCardToSwap.value);
    expect(newSecret.isOpen).toBe(false);

    expect(deck.getSecretCard().value).toBe(30);
    expect(deck.getSecretCard().id).toBe(initialSecretId);
    expect(deck.findCard('card_2').value).toBe(initialSecretValue);
    expect(deck.findCard('card_2').isOpen).toBe(true);
    expect(deck.getBoardCardsCount()).toBe(initialBoardCount);
  });

  it('prevents swapping secret card with an already opened card', () => {
    const deck = DeckManager.fromValues(VALUES);
    deck.openCard('card_0');
    expect(() => deck.swapSecretCard('card_0')).toThrow();
  });

  it('computes midgame swap threshold as 50% of board cards', () => {
    const deck = DeckManager.fromValues(VALUES);
    expect(deck.getMidgameSwapThreshold()).toBe(6);
  });
});
