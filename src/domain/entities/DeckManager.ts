import { Card, CardId } from './Card';

/**
 * DeckManager: Gestiona la coleccion de cartas, el tablero y la carta secreta.
 * Soporta mazos dinamicos (por defecto 13 cartas: 12 en tablero + 1 secreta).
 * 100% puro en TypeScript, sin frameworks ni dependencias externas.
 */
export class DeckManager {
  private boardCards: Card[];
  private secretCard: Card;

  constructor(boardCards: Card[], secretCard: Card) {
    if (boardCards.length < 1) {
      throw new Error('Board must have at least 1 card');
    }
    if (!secretCard.isSecret) {
      throw new Error('Secret card must have isSecret = true');
    }
    this.boardCards = [...boardCards];
    this.secretCard = secretCard;
  }

  /**
   * Crea un DeckManager a partir de un arreglo de valores numericos.
   * La ultima carta se reserva automaticamente como carta secreta por defecto.
   */
  static fromValues(values: readonly number[]): DeckManager {
    if (values.length < 2) {
      throw new Error('A deck requires at least 2 values (1 board + 1 secret)');
    }
    const boardCount = values.length - 1;
    const boardCards = values.slice(0, boardCount).map((v, i) => Card.create(`card_${i}`, v, false));
    const secretCard = Card.create('card_secret', values[boardCount], true);
    return new DeckManager(boardCards, secretCard);
  }

  /**
   * Crea un DeckManager permitiendo que el jugador elija el indice de su carta secreta.
   */
  static fromValuesWithSelection(values: readonly number[], secretIndex: number): DeckManager {
    if (values.length < 2) {
      throw new Error('A deck requires at least 2 values (1 board + 1 secret)');
    }
    if (secretIndex < 0 || secretIndex >= values.length) {
      throw new Error(`Invalid secret card index ${secretIndex}`);
    }

    const secretValue = values[secretIndex];
    const secretCard = Card.create(`card_${secretIndex}`, secretValue, true);

    const boardCards: Card[] = [];
    values.forEach((val, idx) => {
      if (idx !== secretIndex) {
        boardCards.push(Card.create(`card_${idx}`, val, false));
      }
    });

    return new DeckManager(boardCards, secretCard);
  }

  getBoardCards(): readonly Card[] {
    return this.boardCards;
  }

  getSecretCard(): Card {
    return this.secretCard;
  }

  getClosedCards(): Card[] {
    return this.boardCards.filter(c => !c.isOpen);
  }

  getOpenCards(): Card[] {
    return this.boardCards.filter(c => c.isOpen);
  }

  getBoardCardsCount(): number {
    return this.boardCards.length;
  }

  getTotalCardsCount(): number {
    return this.boardCards.length + 1;
  }

  getMidgameSwapThreshold(): number {
    return Math.floor(this.boardCards.length / 2);
  }

  findCard(cardId: CardId): Card {
    const card = this.boardCards.find(c => c.id === cardId);
    if (!card) {
      if (this.secretCard.id === cardId) {
        return this.secretCard;
      }
      throw new Error(`Card ${cardId} not found in deck`);
    }
    return card;
  }

  openCard(cardId: CardId): Card {
    const target = this.findCard(cardId);
    if (target.id === this.secretCard.id) {
      throw new Error('Cannot directly open the reserved secret card during normal play');
    }
    const opened = target.open();
    this.boardCards = this.boardCards.map(c => (c.id === target.id ? opened : c));
    return opened;
  }

  /**
   * Revela la carta secreta (usado en el final del juego o al descartarla en swap).
   */
  openSecretCard(): Card {
    if (!this.secretCard.isOpen) {
      this.secretCard = this.secretCard.open();
    }
    return this.secretCard;
  }

  /**
   * Intercambia la carta secreta actual por una carta cerrada del tablero.
   * La carta del tablero pasa a ser la nueva carta secreta conservando su id (con isSecret=true).
   * La carta secreta anterior ocupa el lugar en el tablero conservando su id (con isSecret=false).
   * Mantiene invariable la longitud del arreglo boardCards.
   */
  swapSecretCard(boardCardId: CardId): { oldSecret: Card; newSecret: Card } {
    const index = this.boardCards.findIndex(c => c.id === boardCardId);
    if (index === -1) {
      throw new Error(`Board card ${boardCardId} not found`);
    }
    const boardCard = this.boardCards[index];
    if (boardCard.isOpen) {
      throw new Error('Cannot swap with an already-open card');
    }

    // El ID de la carta en el tablero se mantiene, pero ahora tiene el valor de la carta secreta y se revela.
    const oldSecretAsBoard = Card.create(boardCard.id, this.secretCard.value, false).open();
    
    // La nueva carta secreta mantiene su ID de reserva (ej. card_secret o el ID inicial) pero toma el valor de la carta del tablero.
    const newSecret = Card.create(this.secretCard.id, boardCard.value, true);

    this.boardCards[index] = oldSecretAsBoard;
    this.secretCard = newSecret;

    // Retornamos oldSecretAsBoard como oldSecret para que el controller sepa su ID en el tablero
    return { oldSecret: oldSecretAsBoard, newSecret };
  }
}
