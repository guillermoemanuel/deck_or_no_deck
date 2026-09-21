import { IProgressionRepository } from '../../domain/ports/IProgressionRepository';
import { ProgressionEvent } from '../../domain/events/ProgressionEvents';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
import { IProgressionService, PurchaseDeckResult } from '../../domain/ports/IProgressionService';
import { DeckSetupId, getDeckSetup } from '../../domain/value-objects/DeckSetups';
import { DeckCollection } from '../../domain/entities/DeckCollection';
import { IRandomProvider } from '../../domain/ports/IRandomProvider';
import { computePeriodicBonusStatus, PeriodicBonusStatus, PERIODIC_BONUS_VALUES } from '../../domain/value-objects/PeriodicBonus';

/**
 * Fachada de meta-progresion: implementa IProgressionService.
 *
 * Administra el acumulado global de monedas Y la colección de mazos
 * temáticos — ambos persistentes (sobreviven entre partidas). La gestión
 * de upgrades de partida (consumibles, en memoria) vive en
 * GameSession/SessionUpgrades — ver PurchaseSessionUpgradeUseCase.
 */
export class ProgressionManager implements IProgressionService {
  private readonly eventBus = new SimpleEventEmitter<ProgressionEvent>();

  constructor(
    private readonly repository: IProgressionRepository,
    // Inyectado (no `Math.random()` directo) por la misma razón de
    // siempre: dominio desacoplado de la fuente de aleatoriedad concreta,
    // testeable con un fake determinista. Usado únicamente para barajar
    // los valores del bono periódico — ver generatePeriodicBonusCardValues().
    private readonly randomProvider: IRandomProvider
  ) {}

  onEvent(listener: (event: ProgressionEvent) => void): () => void {
    return this.eventBus.subscribe(listener);
  }

  getCoins(): number {
    return this.repository.getCoins();
  }

  awardGameplayCoins(amount: number): void {
    this.repository.addCoins(amount);
    this.eventBus.emit({ type: 'CoinsChanged', newTotal: this.getCoins(), delta: amount });
  }

  spendCoins(amount: number): boolean {
    const coinsBefore = this.getCoins();
    const spent = this.repository.spendCoins(amount);
    if (spent) {
      this.eventBus.emit({ type: 'CoinsChanged', newTotal: this.getCoins(), delta: -(coinsBefore - this.getCoins()) });
    }
    return spent;
  }

  applyLossPenalty(amount: number): void {
    // REQ: si el saldo no alcanza para cubrir la penalización, el
    // acumulado queda en negativo — a propósito, no se usa spendCoins().
    this.repository.applyPenalty(amount);
    this.eventBus.emit({ type: 'CoinsChanged', newTotal: this.getCoins(), delta: -amount });
  }

  getPeriodicBonusStatus(now: number = Date.now()): PeriodicBonusStatus {
    return computePeriodicBonusStatus(this.repository.getPeriodicBonusCycleStart(), now);
  }

  resolvePeriodicBonusExpiry(now: number = Date.now()): boolean {
    if (this.getPeriodicBonusStatus(now).state !== 'expired') {
      return false;
    }
    // El ciclo expiró sin reclamarse: arranca uno nuevo desde `now`, con
    // lo que vuelve a reportar 'locked' (12hs de espera) en la próxima
    // consulta — ver PeriodicBonus.ts para el razonamiento completo.
    this.repository.setPeriodicBonusCycleStart(now);
    return true;
  }

  generatePeriodicBonusCardValues(): number[] {
    return this.randomProvider.shuffle(PERIODIC_BONUS_VALUES);
  }

  claimPeriodicBonus(value: number, now: number = Date.now()): void {
    this.repository.setPeriodicBonusCycleStart(now);
    // Evita un CoinsChanged con delta 0 (y su animación de "+0" en el
    // HUD) cuando la carta elegida resulta ser la de valor 0.
    if (value > 0) {
      this.awardGameplayCoins(value);
    }
  }

  resetAllProgress(): void {
    const coinsBefore = this.getCoins();
    this.repository.clearAll();
    this.eventBus.emit({ type: 'CoinsChanged', newTotal: this.getCoins(), delta: -coinsBefore });
    this.emitDeckCollectionChanged(this.loadDeckCollection());
  }

  getOwnedDeckIds(): DeckSetupId[] {
    return this.loadDeckCollection().getOwnedDeckIds();
  }

  getSelectedDeckId(): DeckSetupId {
    return this.loadDeckCollection().getSelectedDeckId();
  }

  hasMoreThanBasicDeck(): boolean {
    return this.loadDeckCollection().ownsMoreThanBasic();
  }

  /**
   * Compra un mazo temático: si no se posee y el saldo alcanza, cobra su
   * precio (spendCoins — nunca deja saldo negativo por una compra) y
   * recién ENTONCES persiste la colección actualizada. El dinero nunca
   * se descuenta sin que el mazo quede efectivamente desbloqueado.
   */
  purchaseDeck(deckId: DeckSetupId): PurchaseDeckResult {
    const collection = this.loadDeckCollection();
    if (!collection.canPurchase(deckId)) {
      return { success: false, reason: 'already_owned' };
    }

    const { price } = getDeckSetup(deckId);
    if (!this.spendCoins(price)) {
      return { success: false, reason: 'insufficient_coins' };
    }

    const updated = collection.withPurchasedDeck(deckId);
    this.persistDeckCollection(updated);
    return { success: true };
  }

  selectDeck(deckId: DeckSetupId): boolean {
    const collection = this.loadDeckCollection();
    if (!collection.hasDeck(deckId)) {
      return false;
    }
    this.persistDeckCollection(collection.withSelectedDeck(deckId));
    return true;
  }

  private loadDeckCollection(): DeckCollection {
    return DeckCollection.restore(this.repository.getOwnedDeckIds(), this.repository.getSelectedDeckId());
  }

  private persistDeckCollection(collection: DeckCollection): void {
    this.repository.saveDeckCollection(collection.getOwnedDeckIds(), collection.getSelectedDeckId());
    this.emitDeckCollectionChanged(collection);
  }

  private emitDeckCollectionChanged(collection: DeckCollection): void {
    this.eventBus.emit({
      type: 'DeckCollectionChanged',
      ownedDeckIds: collection.getOwnedDeckIds(),
      selectedDeckId: collection.getSelectedDeckId()
    });
  }
}