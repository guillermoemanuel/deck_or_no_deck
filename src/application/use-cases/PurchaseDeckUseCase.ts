import { IProgressionService } from '../../domain/ports/IProgressionService';
import { DeckSetupId, DECK_SETUPS } from '../../domain/value-objects/DeckSetups';
import { BASE_DECK_IDS } from './ListAvailableDecksUseCase';

export type PurchaseDeckUseCaseResult =
  | { readonly success: true }
  | {
      readonly success: false;
      readonly reason: 'already_owned' | 'insufficient_coins' | 'locked_prerequisite';
    };

/**
 * Compra un mazo temático delegando el cobro en
 * IProgressionService.purchaseDeck (la fuente única del precio es
 * DECK_SETUPS — este use-case nunca suma ni descuenta monedas por su
 * cuenta) y agrega el rechazo del mazo oculto 'chessmaster': no se puede
 * comprar hasta poseer todos los mazos base del catálogo.
 *
 * Mismo criterio que PurchaseSessionUpgradeUseCase (PLAYBOOK §2.7): el
 * rechazo va ANTES de invocar el cobro — si se rechaza, `purchaseDeck`
 * jamás se ejecuta y no hay forma de que se descuente un solo peso por un
 * mazo que el jugador no debiera poder comprar.
 */
export class PurchaseDeckUseCase {
  constructor(private readonly progression: IProgressionService) {}

  execute(deckId: DeckSetupId): PurchaseDeckUseCaseResult {
    const owned = this.progression.getOwnedDeckIds();

    // 1. Si ya es dueño, delegar en el puerto (responde 'already_owned' sin
    // cobrar). Va ANTES del chequeo de prerequisito para que un mazo oculto
    // ya adquirido (edge de save) no caiga en 'locked_prerequisite'.
    if (owned.includes(deckId)) {
      return this.progression.purchaseDeck(deckId);
    }

    // 2. Mazo oculto con base faltante: rechazo SIN llamar a purchaseDeck.
    // La condición es idéntica a la de ListAvailableDecksUseCase.execute()
    // (mismo flag del catálogo, mismos BASE_DECK_IDS) para que la fila
    // oculta de la tienda y este rechazo nunca se contradigan.
    if (DECK_SETUPS[deckId].requiresAllBaseDecks && BASE_DECK_IDS.some(id => !owned.includes(id))) {
      return { success: false, reason: 'locked_prerequisite' };
    }

    // 3. Caso normal: el puerto cobra el precio publicado por el catálogo y
    // mapea su resultado tal cual (already_owned/insufficient_coins pasan
    // sin traducción — este use-case no duplica la lógica de precios).
    return this.progression.purchaseDeck(deckId);
  }
}
