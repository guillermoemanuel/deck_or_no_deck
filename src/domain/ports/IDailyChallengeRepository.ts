import { DailyChallengeState } from '../value-objects/DailyChallenge';

/**
 * Persistencia del Desafío Diario. A propósito NO se borra con "NUEVO
 * JUEGO": si se borrara, reiniciar el progreso permitiría volver a jugar y
 * cobrar el desafío del mismo día.
 */
export interface IDailyChallengeRepository {
  get(): DailyChallengeState;
  save(state: DailyChallengeState): void;
}
