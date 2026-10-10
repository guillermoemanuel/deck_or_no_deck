import { PurchaseDeckUseCase } from './PurchaseDeckUseCase';
import { IProgressionService } from '../../domain/ports/IProgressionService';
import { DeckSetupId, DECK_SETUPS, DECK_SETUP_IDS, getDeckSetup } from '../../domain/value-objects/DeckSetups';
import { ProgressionManager } from '../../infrastructure/persistence/ProgressionManager';
import { FakeProgressionRepository } from '../../infrastructure/persistence/testing/FakeProgressionRepository';
import { DeterministicRandomProvider } from '../../infrastructure/services/testing/DeterministicRandomProvider';

/**
 * Los mazos base se DERIVAN del catálogo (los que no declaran
 * `requiresAllBaseDecks`), nunca un "10" hardcodeado.
 */
const BASE_DECK_IDS = DECK_SETUP_IDS.filter(id => !DECK_SETUPS[id].requiresAllBaseDecks);

function buildContext(ownedDeckIds: DeckSetupId[], coins: number) {
  const repository = new FakeProgressionRepository();
  repository.seedCoins(coins);
  repository.saveDeckCollection(ownedDeckIds, 'basic');
  const progression: IProgressionService = new ProgressionManager(repository, new DeterministicRandomProvider());
  // Spy con call-through: verifica SI el puerto fue invocado (y con qué id)
  // sin alterar su comportamiento real de cobro.
  const purchaseDeckSpy = jest.spyOn(progression, 'purchaseDeck');
  const useCase = new PurchaseDeckUseCase(progression);
  return { repository, progression, purchaseDeckSpy, useCase };
}

describe('PurchaseDeckUseCase', () => {
  describe('locked_prerequisite — el rechazo va ANTES de cobrar (PLAYBOOK §2.7)', () => {
    it('falta UN mazo base: retorna locked_prerequisite y purchaseDeck NUNCA es invocado', () => {
      const owned = BASE_DECK_IDS.filter(id => id !== 'ovni');
      const { repository, purchaseDeckSpy, useCase } = buildContext(owned, 100000);

      const result = useCase.execute('chessmaster');

      expect(result).toEqual({ success: false, reason: 'locked_prerequisite' });
      expect(purchaseDeckSpy).not.toHaveBeenCalled();
      expect(repository.getCoins()).toBe(100000); // no se cobró nada
    });

    it('colección inicial (solo basic): mismo rechazo sin invocar purchaseDeck', () => {
      const { repository, purchaseDeckSpy, useCase } = buildContext(['basic'], 100000);

      const result = useCase.execute('chessmaster');

      expect(result).toEqual({ success: false, reason: 'locked_prerequisite' });
      expect(purchaseDeckSpy).not.toHaveBeenCalled();
      expect(repository.getCoins()).toBe(100000); // no se cobró nada
    });
  });

  describe('delegación en IProgressionService.purchaseDeck', () => {
    it('con los 10 base poseídos compra chessmaster: éxito, cobro y colección actualizada', () => {
      const { repository, purchaseDeckSpy, useCase } = buildContext([...BASE_DECK_IDS], 100000);

      const result = useCase.execute('chessmaster');

      expect(result).toEqual({ success: true });
      expect(purchaseDeckSpy).toHaveBeenCalledWith('chessmaster');
      expect(repository.getOwnedDeckIds()).toContain('chessmaster');
      // El precio lo cobra el puerto (fuente única DECK_SETUPS) — acá solo
      // se afirma que se descontó lo que publica el catálogo.
      expect(repository.getCoins()).toBe(100000 - getDeckSetup('chessmaster').price);
    });

    it('insufficient_coins pasa tal cual (el puerto decide el precio, este use-case no)', () => {
      const { purchaseDeckSpy, useCase } = buildContext([...BASE_DECK_IDS], 0);

      const result = useCase.execute('chessmaster');

      expect(result).toEqual({ success: false, reason: 'insufficient_coins' });
      expect(purchaseDeckSpy).toHaveBeenCalledTimes(1);
    });

    it('already_owned pasa tal cual aunque falte un base: el chequeo de dueño va PRIMERO', () => {
      const owned: DeckSetupId[] = [...BASE_DECK_IDS.filter(id => id !== 'ovni'), 'chessmaster'];
      const { repository, purchaseDeckSpy, useCase } = buildContext(owned, 100000);

      const result = useCase.execute('chessmaster');

      expect(result).toEqual({ success: false, reason: 'already_owned' });
      expect(purchaseDeckSpy).toHaveBeenCalledTimes(1);
      expect(repository.getCoins()).toBe(100000); // el puerto no cobra por already_owned
    });

    it('un mazo base (sin el flag) se compra delegando normalmente, sin chequeo de prerequisito', () => {
      const { repository, purchaseDeckSpy, useCase } = buildContext(['basic'], 100000);

      const result = useCase.execute('ovni');

      expect(result).toEqual({ success: true });
      expect(purchaseDeckSpy).toHaveBeenCalledWith('ovni');
      expect(repository.getOwnedDeckIds()).toContain('ovni');
    });
  });
});
