export type CardId = string;

/**
 * Value Object inmutable. Las "aperturas" generan una nueva instancia
 * en vez de mutar el estado, favoreciendo previsibilidad y testing.
 */
export class Card {
  private constructor(
    public readonly id: CardId,
    public readonly value: number,
    public readonly isOpen: boolean,
    public readonly isSecret: boolean
  ) {}

  static create(id: CardId, value: number, isSecret = false): Card {
    return new Card(id, value, false, isSecret);
  }

  open(): Card {
    if (this.isOpen) {
      throw new Error(`Card ${this.id} is already open`);
    }
    return new Card(this.id, this.value, true, this.isSecret);
  }
}
