import { Card } from '../../domain/entities/Card';

/**
 * Payload que CaseSelectionScene pasa a GameScene via scene.start(key, data).
 * candidateCards son los 13 "maletines" generados en la fase de seleccion
 * (ver prepareGameSetup); selectedSecretCardId es el id que el jugador
 * reservo como su Carta Secreta antes de que el tablero exista.
 */
export interface GameSceneData {
  readonly candidateCards: Card[];
  readonly selectedSecretCardId: string;
}
