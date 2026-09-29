import { PlayerRecords } from '../value-objects/PlayerRecords';

/**
 * Persistencia de los récords personales. Se borra con "NUEVO JUEGO"
 * (son parte del progreso que el jugador acepta perder).
 */
export interface IRecordsRepository {
  get(): PlayerRecords;
  save(records: PlayerRecords): void;
  reset(): void;
}
