import { IProgressionService } from '../../domain/ports/IProgressionService';
import { FirstRoundDealGameOutcome } from '../../domain/value-objects/FirstRoundDealStreak';

/**
 * Aplica el desenlace de una partida TERMINADA a la regla anti-farmeo
 * (ADR-014) y lo persiste con el progreso.
 *
 * El desenlace lo produce FirstRoundDealStreakTracker (application/records)
 * a partir del flujo de eventos; este use case decide SOLO dos cosas:
 *
 * 1. Regla 5 — el Desafío Diario queda EXCLUIDO: no suma racha, no topa y
 *    no cuenta regresiva (`isDaily` → no-op).
 * 2. La transición de estado vive en el VO `FirstRoundDealStreak`
 *    (`withGameEnd`), que implementa las reglas 1, 2 y 4.
 *
 * No emite eventos: la UI consulta el estado al abrir el popup de oferta.
 */
export class RecordFirstRoundDealOutcomeUseCase {
  constructor(private readonly progressionService: IProgressionService) {}

  execute(outcome: FirstRoundDealGameOutcome, isDaily: boolean): void {
    if (isDaily) {
      return;
    }
    const updated = this.progressionService.getFirstRoundDealStreak().withGameEnd(outcome);
    this.progressionService.setFirstRoundDealStreak(updated);
  }
}
