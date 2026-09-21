import { DeckSetupId } from '../value-objects/DeckSetups';

/**
 * Puerto de persistencia del acumulado global de monedas Y de la
 * colección de mazos temáticos del jugador — ambos sobreviven entre
 * partidas (a diferencia de los upgrades de partida única, que viven
 * solo en memoria dentro de GameSession/SessionUpgrades).
 */
export interface IProgressionRepository {
  getCoins(): number;
  addCoins(amount: number): void;
  spendCoins(amount: number): boolean;

  /**
   * Descuenta `amount` del saldo SIN verificar que alcance — a diferencia
   * de spendCoins(), permite que el acumulado quede en números negativos.
   * Uso previsto: penalización por perder la partida (energía a 0%).
   */
  applyPenalty(amount: number): void;

   /** Epoch ms en que arrancó el ciclo vigente del bono periódico (ver PeriodicBonus.ts). */
   getPeriodicBonusCycleStart(): number;
   /** Persiste el inicio de un nuevo ciclo del bono periódico (al reclamarlo o al expirar sin reclamar). */
   setPeriodicBonusCycleStart(timestamp: number): void;

  /** IDs de los mazos temáticos que el jugador ya posee (incluye siempre 'basic'). */
  getOwnedDeckIds(): DeckSetupId[];

  /** ID del mazo actualmente seleccionado para la próxima partida. */
  getSelectedDeckId(): DeckSetupId;

  /** Persiste el estado completo de la colección (posesión + selección) de una sola vez. */
  saveDeckCollection(ownedDeckIds: DeckSetupId[], selectedDeckId: DeckSetupId): void;

  /**
   * Borra POR COMPLETO los datos persistidos (saldo a 0, colección de
   * mazos reseteada al básico, sin rastro en localStorage). Uso previsto:
   * botón "Salir" del modal de fin de partida.
   */
  clearAll(): void;
}
