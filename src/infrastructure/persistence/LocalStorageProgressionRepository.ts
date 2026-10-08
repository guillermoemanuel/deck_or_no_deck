import { IProgressionRepository } from '../../domain/ports/IProgressionRepository';
import { DeckSetupId, DEFAULT_DECK_ID, isDeckSetupId } from '../../domain/value-objects/DeckSetups';
import { freshPeriodicBonusCycleStart } from '../../domain/value-objects/PeriodicBonus';
import { FirstRoundDealStreak } from '../../domain/value-objects/FirstRoundDealStreak';

interface PersistedProgressionData {
  readonly schemaVersion: number;
  coins: number;
  /** IDs de los mazos temáticos comprados (sin incluir 'basic' — ese siempre se asume poseído). */
  ownedDeckIds: string[];
  selectedDeckId: string;

  /** Epoch ms en que arrancó el ciclo vigente del bono periódico — ver PeriodicBonus.ts. */
  periodicBonusCycleStart: number;

  /**
   * Estado de la regla anti-farmeo de la 1ª ronda (ADR-014) — ver
   * FirstRoundDealStreak.ts. Ausente en saves v4; se backfillea a 0/0.
   */
  firstRoundDealStreak: { consecutiveFirstRoundDeals: number; cappedGamesRemaining: number };
}

const STORAGE_KEY = 'speculation_game_progression_v1';
// Historial de saltos de esquema:
// - v2 -> v3: se agregaron `ownedDeckIds`/`selectedDeckId` (mazos
//   temáticos coleccionables). Un save de la version anterior (sin estos
//   campos) se descarta limpiamente via createDefault() — no hay forma
//   segura de "migrar" un esquema que no tenia el concepto de mazos.
// - v3 -> v4: se agrego `periodicBonusCycleStart` (bono periodico de
//   12hs). A diferencia del salto anterior, aca SI hay un default
//   no-destructivo para el campo nuevo — ver migrateIfNeeded() mas abajo:
//   un save v3 se completa con ese default en vez de resetearse entero.
//   No tiene sentido borrarle las monedas y los mazos comprados a un
//   jugador existente solo por agregar el bono.
// - v4 -> v5: se agrego `firstRoundDealStreak` (regla anti-farmeo, ADR-014).
//   Mismo criterio no-destructivo: un save v4 se completa con (0, 0) —
//   nadie tiene la regla recien instalada — preservando saldo, mazos y bono.
const CURRENT_SCHEMA_VERSION = 5;
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

  getFirstRoundDealStreak(): FirstRoundDealStreak {
    // restore() sanea en cada lectura: si el JSON guardado quedó corrupto
    // (o alguien editó el save a mano), la regla se trata como inactiva en
    // vez de tirar la partida con una excepción.
    return FirstRoundDealStreak.restore(
      this.cache.firstRoundDealStreak?.consecutiveFirstRoundDeals,
      this.cache.firstRoundDealStreak?.cappedGamesRemaining
    );
  }

  setFirstRoundDealStreak(streak: FirstRoundDealStreak): void {
    this.cache.firstRoundDealStreak = {
      consecutiveFirstRoundDeals: streak.consecutiveFirstRoundDeals,
      cappedGamesRemaining: streak.cappedGamesRemaining
    };
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
    // Migracion v4 -> v5 (regla anti-farmeo, ADR-014): backfill no-
    // destructivo. Un save v4 no tiene `firstRoundDealStreak`, asi que se
    // completa con (0, 0) — nadie arranca topado — en vez de tirar todo el
    // progreso; ver el comentario en CURRENT_SCHEMA_VERSION mas arriba.
    if (data.schemaVersion === 4) {
      return {
        ...data,
        schemaVersion: CURRENT_SCHEMA_VERSION,
        firstRoundDealStreak: { consecutiveFirstRoundDeals: 0, cappedGamesRemaining: 0 }
      };
    }
    // Migración v3 -> v4 (bono periódico): backfill no-destructivo. Un
    // save v3 no tiene `periodicBonusCycleStart`, así que se completa con
    // el default de "recién ahora queda disponible" en vez de tirar todo
    // el progreso — ver el comentario en CURRENT_SCHEMA_VERSION más arriba.
    if (data.schemaVersion === 3) {
      return {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        coins: data.coins,
        ownedDeckIds: data.ownedDeckIds,
        selectedDeckId: data.selectedDeckId,
        periodicBonusCycleStart: freshPeriodicBonusCycleStart(Date.now()),
        firstRoundDealStreak: { consecutiveFirstRoundDeals: 0, cappedGamesRemaining: 0 }
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
      periodicBonusCycleStart: freshPeriodicBonusCycleStart(Date.now()),
      // Regla anti-farmeo: un jugador nuevo nunca estuvo topado.
      firstRoundDealStreak: { consecutiveFirstRoundDeals: 0, cappedGamesRemaining: 0 }
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
