import { ListAvailableDecksUseCase, DeckShopEntry } from './ListAvailableDecksUseCase';
import { DeckSetupId, DECK_SETUPS, DECK_SETUP_IDS } from '../../domain/value-objects/DeckSetups';
import { ProgressionManager } from '../../infrastructure/persistence/ProgressionManager';
import { FakeProgressionRepository } from '../../infrastructure/persistence/testing/FakeProgressionRepository';
import { DeterministicRandomProvider } from '../../infrastructure/services/testing/DeterministicRandomProvider';

/**
 * Los mazos base se DERIVAN del catálogo (los que no declaran
 * `requiresAllBaseDecks`), nunca un "10" hardcodeado: si mañana se agrega
 * un mazo normal, el prerequisito de chessmaster crece solo.
 */
const BASE_DECK_IDS = DECK_SETUP_IDS.filter(id => !DECK_SETUPS[id].requiresAllBaseDecks);

/** Colección persistida a mano (los mazos que el jugador "ya tiene"). */
function buildUseCase(ownedDeckIds: DeckSetupId[]): ListAvailableDecksUseCase {
  const repository = new FakeProgressionRepository();
  repository.saveDeckCollection(ownedDeckIds, 'basic');
  const progression = new ProgressionManager(repository, new DeterministicRandomProvider());
  return new ListAvailableDecksUseCase(progression);
}

function revealedOf(entries: readonly DeckShopEntry[], deckId: DeckSetupId): boolean {
  const entry = entries.find(e => e.deckId === deckId);
  if (!entry) {
    throw new Error(`La tienda no devolvió la entrada del mazo "${deckId}"`);
  }
  return entry.revealed;
}

describe('ListAvailableDecksUseCase', () => {
  it('devuelve 11 entradas EN EL ORDEN de DECK_SETUP_IDS', () => {
    const useCase = buildUseCase(['basic']);

    const result = useCase.execute();

    expect(result).toHaveLength(DECK_SETUP_IDS.length);
    expect(result.map(e => e.deckId)).toEqual([...DECK_SETUP_IDS]);
  });

  it('con todos los mazos base poseídos, TODAS las entradas están revealed (chessmaster incluido)', () => {
    const useCase = buildUseCase([...BASE_DECK_IDS]);

    const result = useCase.execute();

    expect(result.every(e => e.revealed)).toBe(true);
  });

  it('con UN mazo base faltante, chessmaster queda oculto (revealed=false) y el resto revealed', () => {
    const missingBase: DeckSetupId = 'ovni';
    const useCase = buildUseCase(BASE_DECK_IDS.filter(id => id !== missingBase));

    const result = useCase.execute();

    expect(revealedOf(result, 'chessmaster')).toBe(false);
    for (const entry of result) {
      if (entry.deckId !== 'chessmaster') {
        expect({ deck: entry.deckId, revealed: entry.revealed }).toEqual({ deck: entry.deckId, revealed: true });
      }
    }
  });

  it('basic está SIEMPRE revealed (colección recién creada: solo posee basic)', () => {
    const useCase = buildUseCase(['basic']);

    const result = useCase.execute();

    expect(revealedOf(result, 'basic')).toBe(true);
    // De paso: con solo basic, el mazo oculto efectivamente está oculto.
    expect(revealedOf(result, 'chessmaster')).toBe(false);
  });

  it('chessmaster YA poseído aunque falte un base (edge de save) → revealed=true', () => {
    const missingBase: DeckSetupId = 'ovni';
    const useCase = buildUseCase([...BASE_DECK_IDS.filter(id => id !== missingBase), 'chessmaster']);

    const result = useCase.execute();

    expect(revealedOf(result, 'chessmaster')).toBe(true);
  });
});
