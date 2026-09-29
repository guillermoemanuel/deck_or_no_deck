/**
 * Decide si "NUEVO JUEGO" debe pedir confirmación. Borra el progreso guardado:
 * monedas, mazos comprados y récords personales (el Desafío Diario se
 * conserva a propósito: ver IDailyChallengeRepository).
 *
 * - 'none': no hay nada que perder (0 monedas, solo el mazo básico y sin
 *   partidas registradas) → se empieza directo, sin diálogo.
 * - 'progress': hay algo que perder → se pide confirmación.
 */
export type NewGameWarning = 'none' | 'progress';

export function getNewGameWarning(coins: number, ownsMoreThanBasicDeck: boolean, hasRecords: boolean): NewGameWarning {
  return coins > 0 || ownsMoreThanBasicDeck || hasRecords ? 'progress' : 'none';
}
