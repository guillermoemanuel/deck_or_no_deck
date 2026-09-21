import { DeckSetupId, DEFAULT_DECK_ID } from '../value-objects/DeckSetups';

/**
 * DeckCollection: entidad de dominio pura que encapsula la colección de
 * mazos temáticos del jugador — qué IDs posee y cuál tiene seleccionado.
 *
 * Value object inmutable (mismo estilo que Card/EnergyLevel en este
 * proyecto): cada mutación retorna una instancia nueva. A diferencia de
 * SessionUpgrades (consumibles de partida única, en memoria), esta
 * colección es PERSISTENTE — vive en IProgressionRepository/localStorage
 * a través de ProgressionManager, que es quien la reconstruye/guarda; esta
 * clase en sí no sabe nada de localStorage.
 */
export class DeckCollection {
  private constructor(
    private readonly ownedDeckIds: ReadonlySet<DeckSetupId>,
    private readonly selectedDeckId: DeckSetupId
  ) {}

  /** Colección inicial de un jugador nuevo: solo el mazo básico, seleccionado. */
  static createDefault(): DeckCollection {
    return new DeckCollection(new Set([DEFAULT_DECK_ID]), DEFAULT_DECK_ID);
  }

  /**
   * Reconstruye la colección desde datos persistidos. El básico SIEMPRE
   * se considera poseído (garantía del dominio, no depende de lo guardado
   * en disco); si el mazo seleccionado guardado ya no es válido (dato
   * corrupto, o dejó de poseerse), se cae de forma segura al básico en
   * vez de propagar un estado inconsistente.
   */
  static restore(ownedDeckIds: readonly DeckSetupId[], selectedDeckId: DeckSetupId): DeckCollection {
    const owned = new Set<DeckSetupId>([DEFAULT_DECK_ID, ...ownedDeckIds]);
    const safeSelectedId = owned.has(selectedDeckId) ? selectedDeckId : DEFAULT_DECK_ID;
    return new DeckCollection(owned, safeSelectedId);
  }

  getOwnedDeckIds(): DeckSetupId[] {
    return Array.from(this.ownedDeckIds);
  }

  getSelectedDeckId(): DeckSetupId {
    return this.selectedDeckId;
  }

  hasDeck(deckId: DeckSetupId): boolean {
    return this.ownedDeckIds.has(deckId);
  }

  /**
   * true si el jugador posee algo más que el mazo básico — condición que
   * determina si corresponde ofrecer la pantalla de selección de mazo
   * antes de una partida (ver requirement_scene_flow_and_selection).
   */
  ownsMoreThanBasic(): boolean {
    return this.ownedDeckIds.size > 1;
  }

  canPurchase(deckId: DeckSetupId): boolean {
    return !this.hasDeck(deckId);
  }

  /** Un mazo comprado no puede volver a comprarse — lanza si ya se posee. */
  withPurchasedDeck(deckId: DeckSetupId): DeckCollection {
    if (this.hasDeck(deckId)) {
      throw new Error(`Deck "${deckId}" is already owned`);
    }
    return new DeckCollection(new Set([...this.ownedDeckIds, deckId]), this.selectedDeckId);
  }

  /** Solo se puede seleccionar un mazo que ya se posee. */
  withSelectedDeck(deckId: DeckSetupId): DeckCollection {
    if (!this.hasDeck(deckId)) {
      throw new Error(`Cannot select deck "${deckId}": not owned`);
    }
    return new DeckCollection(this.ownedDeckIds, deckId);
  }
}
