import { ProgressionEvent } from '../events/ProgressionEvents';
import { DeckSetupId } from '../value-objects/DeckSetups';
import { PeriodicBonusStatus } from '../value-objects/PeriodicBonus';

export type PurchaseDeckResult =
  | { success: true }
  | { success: false; reason: 'already_owned' | 'insufficient_coins' };

/**
 * Puerto de la fachada de progresión — maneja el acumulado global de
 * monedas persistente Y la colección de mazos temáticos (ambos
 * sobreviven entre partidas). La gestión de upgrades de partida
 * (consumibles, en memoria) vive en GameSession/SessionUpgrades, no
 * aquí — ver PurchaseSessionUpgradeUseCase para esa orquestación.
 */
export interface IProgressionService {
  getCoins(): number;

  /**
   * Acredita monedas persistentes (premios de partida, bonus de anuncios
   * y reembolsos de mejoras que no se pudieron entregar).
   */
  awardGameplayCoins(amount: number): void;

  /** Descuenta monedas persistentes si el saldo alcanza; false si no. */
  spendCoins(amount: number): boolean;

  /**
   * Penalización por perder la partida (energía a 0%): descuenta
   * `amount` SIEMPRE, permitiendo saldo negativo.
   */
  applyLossPenalty(amount: number): void;

  /**
   * Botón "Salir": borra por completo el progreso persistente (saldo a 0,
   * localStorage limpio y colección de mazos reseteada al básico).
   */
  resetAllProgress(): void;

  /** IDs de los mazos temáticos que el jugador ya posee (incluye siempre 'basic'). */
  getOwnedDeckIds(): DeckSetupId[];

  /** ID del mazo con el que arrancará la próxima partida. */
  getSelectedDeckId(): DeckSetupId;

  /** true si el jugador posee algo más que el mazo básico (gatilla DeckSelectionScene). */
  hasMoreThanBasicDeck(): boolean;

  /** Compra un mazo temático: cobra su precio y lo agrega a la colección persistente. */
  purchaseDeck(deckId: DeckSetupId): PurchaseDeckResult;

  /** Selecciona un mazo ya poseído para la próxima partida; false si no se posee. */
  selectDeck(deckId: DeckSetupId): boolean;

  /** Estado vigente del bono periódico ("locked" | "available" | "expired") — ver PeriodicBonus.ts. */
  getPeriodicBonusStatus(now?: number): PeriodicBonusStatus;
  /**
   * Si el bono vigente expiró sin reclamarse, arranca un nuevo ciclo de
   * 12hs desde `now` y retorna true. No hace nada (retorna false) si
   * todavía no expiró — es intencionalmente idempotente y segura de
   * llamar en cada apertura de UIScene.
   */
  resolvePeriodicBonusExpiry(now?: number): boolean;
  /**
   * Baraja los `PERIODIC_BONUS_VALUES` (uno por carta, sin repetir) para
   * el bono vigente. Llamar solo cuando `getPeriodicBonusStatus` reporta
   * 'available' — no valida el estado por sí misma (esa es
   * responsabilidad de quien orquesta, para mantener esto puro/testeable).
   */
  generatePeriodicBonusCardValues(): number[];
  /**
   * Reclama el bono: acredita `value` (monedas persistentes) y cierra el
   * ciclo actual, arrancando uno nuevo de 12hs desde `now`.
   */
  claimPeriodicBonus(value: number, now?: number): void;

  onEvent(listener: (event: ProgressionEvent) => void): () => void;
}
