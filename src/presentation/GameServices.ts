import { ICrazyGamesService } from '../domain/ports/ICrazyGamesService';
import { ProgressionManager } from '../infrastructure/persistence/ProgressionManager';
import { IRandomProvider } from '../domain/ports/IRandomProvider';
import { IAudioService } from '../domain/ports/IAudioService';
import { IOnboardingRepository } from '../domain/ports/IOnboardingRepository';
import { IRecordsRepository } from '../domain/ports/IRecordsRepository';
import { IDailyChallengeRepository } from '../domain/ports/IDailyChallengeRepository';
import { GameOutcomeRecorder } from '../application/records/GameOutcomeRecorder';

/**
 * Contrato del "bag" de dependencias que viaja en game.registry.
 * Tipado explicito evita castings inseguros al leer el registry desde cada escena.
 */
export interface GameServices {
  readonly crazyGamesService: ICrazyGamesService;
  readonly progressionManager: ProgressionManager;
  readonly randomProvider: IRandomProvider;
  // AUDITORÍA DE AUDIO: se agrega el puerto de audio al mismo "bag" de
  // dependencias que ya usan crazyGamesService/randomProvider — así todas
  // las escenas/controladores obtienen la MISMA instancia (singleton a
  // nivel Game) en vez de instanciar su propio AudioManager como antes.
  readonly audioService: IAudioService;
  // Estado de los consejos contextuales in-game (ver OnboardingFlow). Separado
  // de progressionManager a propósito: "NUEVO JUEGO" no debe reactivarlos.
  readonly onboardingRepository: IOnboardingRepository;
  // Récords personales (se borran con "NUEVO JUEGO") y Desafío Diario (NO se
  // borra: evita cobrarlo dos veces el mismo día reiniciando el progreso).
  readonly recordsRepository: IRecordsRepository;
  readonly dailyChallengeRepository: IDailyChallengeRepository;
  readonly outcomeRecorder: GameOutcomeRecorder;
}

export function getServices(scene: Phaser.Scene): GameServices {
  const services = scene.registry.get('services') as GameServices | undefined;
  if (!services) {
    throw new Error('GameServices not found in registry — was main.ts wiring skipped?');
  }
  return services;
}
