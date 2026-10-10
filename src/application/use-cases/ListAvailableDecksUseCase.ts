import { IProgressionService } from '../../domain/ports/IProgressionService';
import { DeckSetupId, DECK_SETUPS, DECK_SETUP_IDS } from '../../domain/value-objects/DeckSetups';

/** Una fila de la tienda de mazos: `revealed=false` = carta "?" oculta. */
export interface DeckShopEntry {
  readonly deckId: DeckSetupId;
  readonly revealed: boolean;
}

/**
 * Mazos base del catálogo: los que NO declaran `requiresAllBaseDecks`.
 * Derivado del flag (nunca un "10" hardcodeado): si mañana se agrega un
 * mazo normal, el prerequisito del mazo oculto crece solo. Es la fuente
 * única compartida con PurchaseDeckUseCase.
 */
export const BASE_DECK_IDS: readonly DeckSetupId[] = DECK_SETUP_IDS.filter(
  id => !DECK_SETUPS[id].requiresAllBaseDecks
);

/**
 * Decide qué mazos muestra la tienda AHORA. Mismo patrón que
 * ListAvailableUpgradesUseCase: el catálogo del dominio solo declara el
 * DATO (`requiresAllBaseDecks` en chessmaster) y acá se aplica la regla
 * sobre los mazos que el jugador posee hoy (IProgressionService).
 *
 * chessmaster queda oculto (carta "?") hasta poseer todos los demás mazos
 * base; una vez adquirido se muestra siempre (edge de save: un save
 * corrupto/parcheado podría tenerlo sin todos los base, y ocultar un mazo
 * ya pagado sería peor que mostrarlo).
 */
export class ListAvailableDecksUseCase {
  constructor(private readonly progression: IProgressionService) {}

  /** Las 11 entradas EN EL ORDEN de DECK_SETUP_IDS, con su visibilidad actual. */
  execute(): DeckShopEntry[] {
    const owned = this.progression.getOwnedDeckIds();
    const ownsAllBaseDecks = BASE_DECK_IDS.every(id => owned.includes(id));

    return DECK_SETUP_IDS.map(deckId => {
      const config = DECK_SETUPS[deckId];
      // Oculto SOLO si declara el flag, aún faltan base Y no se posee a sí
      // mismo — cualquier otra combinación queda a la vista.
      const revealed = !config.requiresAllBaseDecks || ownsAllBaseDecks || owned.includes(deckId);
      return { deckId, revealed };
    });
  }
}
