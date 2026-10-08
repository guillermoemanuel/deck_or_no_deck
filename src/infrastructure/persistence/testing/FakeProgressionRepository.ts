import { IProgressionRepository } from '../../../domain/ports/IProgressionRepository';
import { DeckSetupId, DEFAULT_DECK_ID } from '../../../domain/value-objects/DeckSetups';
import { freshPeriodicBonusCycleStart } from '../../../domain/value-objects/PeriodicBonus';
import { FirstRoundDealStreak } from '../../../domain/value-objects/FirstRoundDealStreak';

/**
 * Repositorio en memoria — mismo contrato que LocalStorageProgressionRepository,
 * pero sin tocar window.localStorage.
 */
export class FakeProgressionRepository implements IProgressionRepository {
  private coins = 0;
  private ownedDeckIds: DeckSetupId[] = [DEFAULT_DECK_ID];
  private selectedDeckId: DeckSetupId = DEFAULT_DECK_ID;
  // Por defecto "disponible de inmediato" — mismo criterio que createDefault()
  // en LocalStorageProgressionRepository (ver freshPeriodicBonusCycleStart()).
  private periodicBonusCycleStart: number = freshPeriodicBonusCycleStart(Date.now());
  private firstRoundDealStreak: FirstRoundDealStreak = FirstRoundDealStreak.INACTIVE;

  getCoins(): number {
    return this.coins;
  }

  addCoins(amount: number): void {
    if (amount < 0) throw new Error('addCoins does not accept negative amounts');
    this.coins += amount;
  }

  spendCoins(amount: number): boolean {
    if (this.coins < amount) return false;
    this.coins -= amount;
    return true;
  }

  applyPenalty(amount: number): void {
    this.coins -= amount;
  }

  getPeriodicBonusCycleStart(): number {
    return this.periodicBonusCycleStart;
  }

  setPeriodicBonusCycleStart(timestamp: number): void {
    this.periodicBonusCycleStart = timestamp;
  }

  getFirstRoundDealStreak(): FirstRoundDealStreak {
    return this.firstRoundDealStreak;
  }

  setFirstRoundDealStreak(streak: FirstRoundDealStreak): void {
    this.firstRoundDealStreak = streak;
  }

  getOwnedDeckIds(): DeckSetupId[] {
    return [...this.ownedDeckIds];
  }

  getSelectedDeckId(): DeckSetupId {
    return this.selectedDeckId;
  }

  saveDeckCollection(ownedDeckIds: DeckSetupId[], selectedDeckId: DeckSetupId): void {
    this.ownedDeckIds = [...ownedDeckIds];
    this.selectedDeckId = selectedDeckId;
  }

  clearAll(): void {
    this.coins = 0;
    this.ownedDeckIds = [DEFAULT_DECK_ID];
    this.selectedDeckId = DEFAULT_DECK_ID;
    this.firstRoundDealStreak = FirstRoundDealStreak.INACTIVE;
  }

  /** Helper de test, no forma parte del puerto — para arrancar un escenario con saldo. */
  seedCoins(amount: number): void {
    this.coins = amount;
  }

  /** Helper de test, no forma parte del puerto — fuerza el ciclo del bono periódico a un instante dado. */
  seedPeriodicBonusCycleStart(timestamp: number): void {
    this.periodicBonusCycleStart = timestamp;
  }

  /** Helper de test, no forma parte del puerto — fuerza el estado de la regla anti-farmeo (ADR-014). */
  seedFirstRoundDealStreak(consecutiveFirstRoundDeals: number, cappedGamesRemaining: number): void {
    this.firstRoundDealStreak = FirstRoundDealStreak.restore(consecutiveFirstRoundDeals, cappedGamesRemaining);
  }
}