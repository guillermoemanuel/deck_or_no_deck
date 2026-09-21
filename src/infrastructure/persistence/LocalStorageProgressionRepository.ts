import { IProgressionRepository } from '../../domain/ports/IProgressionRepository';
import { DeckSetupId, DEFAULT_DECK_ID, isDeckSetupId } from '../../domain/value-objects/DeckSetups';
import { freshPeriodicBonusCycleStart } from '../../domain/value-objects/PeriodicBonus';

interface PersistedProgressionData {
  readonly schemaVersion: number;
  coins: number;
  /** IDs de los mazos temáticos comprados (sin incluir 'basic' — ese siempre se asume poseído). */
  ownedDeckIds: string[];
  selectedDeckId: string;

  /** Epoch ms en que arrancó el ciclo vigente del bono periódico — ver PeriodicBonus.ts. */
  periodicBonusCycleStart: number;
}

const STORAGE_KEY = 'speculation_game_progression_v1';
// Se sube la versión de esquema: se agrega `periodicBonusCycleStart` (bono
// Se sube la versión de esquema: se agregan `ownedDeckIds`/`selectedDeckId`
// periódico de 12hs). A diferencia del salto de esquema anterior (mazos
// (mazos temáticos coleccionables). Un save de la version anterior (sin
// temáticos, donde no existía forma segura de migrar un save viejo), acá
// estos campos) se descarta limpiamente via createDefault() — no hay forma
// SÍ hay un default no-destructivo para el campo nuevo — ver
// segura de "migrar" un esquema que no tenía el concepto de mazos.
// migrateIfNeeded() más abajo: un save v3 existente se completa con ese
// default en vez de resetearse por completo. No tiene sentido borrarle las
// monedas y los mazos comprados a un jugador existente solo por agregar
// el bono.
const CURRENT_SCHEMA_VERSION = 4;
/**
 * Adapter: implementa el puerto de dominio usando localStorage.
 * Aisla TODO el acceso a window.localStorage — si mañana migramos
 * a un backend con cuentas de usuario, solo se reemplaza esta clase.
 */
export class LocalStorageProgressionRepository implements IProgressionRepository {
  private cache: PersistedProgressionData;

  constructor() {
    this.cache = this.load();
  }

  getCoins(): number {
    return this.cache.coins;
  }

  addCoins(amount: number): void {
    if (amount < 0) {
      throw new Error('addCoins does not accept negative amounts; use spendCoins instead');
    }
    this.cache.coins += amount;
    this.persist();
  }

  spendCoins(amount: number): boolean {
    if (amount < 0) {
      throw new Error('spendCoins requires a positive amount');
    }
    if (this.cache.coins < amount) {
      return false;
    }
    this.cache.coins -= amount;
    this.persist();
    return true;
  }

  applyPenalty(amount: number): void {
    if (amount < 0) {
      throw new Error('applyPenalty requires a positive amount');
    }
    // A diferencia de spendCoins(), NO se verifica que el saldo alcance —
    // el acumulado puede quedar en negativo (penalización por perder).
    this.cache.coins -= amount;
    this.persist();
  }

  getPeriodicBonusCycleStart(): number {
    return this.cache.periodicBonusCycleStart;
  }
  setPeriodicBonusCycleStart(timestamp: number): void {
    this.cache.periodicBonusCycleStart = timestamp;
    this.persist();
  }

  getOwnedDeckIds(): DeckSetupId[] {
    // Filtra cualquier id corrupto/desconocido que pudiera haber quedado
    // guardado (ej. un mazo retirado del catálogo en una versión futura).
    return this.cache.ownedDeckIds.filter(isDeckSetupId);
  }

  getSelectedDeckId(): DeckSetupId {
    return isDeckSetupId(this.cache.selectedDeckId) ? this.cache.selectedDeckId : DEFAULT_DECK_ID;
  }

  saveDeckCollection(ownedDeckIds: DeckSetupId[], selectedDeckId: DeckSetupId): void {
    this.cache.ownedDeckIds = ownedDeckIds;
    this.cache.selectedDeckId = selectedDeckId;
    this.persist();
  }

  clearAll(): void {
    this.cache = this.createDefault();
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('[LocalStorageProgressionRepository] Failed to clear progression', error);
    }
  }

  private load(): PersistedProgressionData {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        return this.createDefault();
      }

      const parsed = JSON.parse(raw) as PersistedProgressionData;
      return this.migrateIfNeeded(parsed);
    } catch (error) {
      console.warn('[LocalStorageProgressionRepository] Corrupted save data, resetting.', error);
      return this.createDefault();
    }
  }

  private migrateIfNeeded(data: PersistedProgressionData): PersistedProgressionData {
    if (data.schemaVersion === CURRENT_SCHEMA_VERSION) {
      return data;
    }
    // Migración v3 -> v4 (bono periódico): backfill no-destructivo. Un
    // save v3 no tiene `periodicBonusCycleStart`, así que se completa con
    // el default de "recién ahora queda disponible" en vez de tirar todo
    // el progreso — ver el comentario en CURRENT_SCHEMA_VERSION más arriba.
    if (data.schemaVersion === 3) {
      return {
        ...data,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        periodicBonusCycleStart: freshPeriodicBonusCycleStart(Date.now())
      };
    }
    console.warn('[LocalStorageProgressionRepository] Unknown or outdated schema version, resetting.');
    return this.createDefault();
  }

  

  private createDefault(): PersistedProgressionData {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      coins: 0,
      ownedDeckIds: [DEFAULT_DECK_ID],
      selectedDeckId: DEFAULT_DECK_ID,
       // Ver freshPeriodicBonusCycleStart(): un jugador nuevo ve el bono
      // disponible de inmediato (con su ventana completa de 24hs), en vez
      // de tener que esperar 12hs para conocer la mecánica por primera vez.
      periodicBonusCycleStart: freshPeriodicBonusCycleStart(Date.now())
    };
  }

  private persist(): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.cache));
    } catch (error) {
      console.error('[LocalStorageProgressionRepository] Failed to persist progression', error);
    }
  }
}
