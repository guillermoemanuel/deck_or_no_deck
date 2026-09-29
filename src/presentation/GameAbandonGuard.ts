import Phaser from 'phaser';

const REGISTRY_KEY = 'gameAbandonGuard:isActive';

/**
 * Monto de la penalización por abandono de partida (voluntario desde el
 * botón "Salir" de UIScene, o forzado por cierre/recarga del navegador).
 * Mismo valor y mismo mecanismo (`IProgressionService.applyLossPenalty`,
 * puede dejar el saldo en negativo) que `OpenCardUseCase` ya aplica al
 * perder por agotamiento de energía.
 */
export const ABANDON_PENALTY_AMOUNT = 5000;

/**
 * GameAbandonGuard: flag booleano persistido en `registry` (el mismo
 * mecanismo que ya usan GameServices y ActiveSessionBridge) que responde
 * a una única pregunta: **¿hay una partida REALMENTE en curso tal que
 * abandonarla ahora mismo merece la penalización de -5000?**
 *
 * Se opera sobre `Phaser.Data.DataManager` directamente — no sobre
 * `Phaser.Scene` — para poder invocarse tanto desde cualquier escena
 * (`scene.registry`) como desde el listener global `beforeunload` en
 * main.ts (`game.registry`). Ambos apuntan al MISMO DataManager
 * subyacente (Phaser comparte un único registry por Game), así que el
 * flag es una única fuente de verdad compartida entre el mundo de Phaser
 * y el mundo del navegador.
 *
 * Trazabilidad del ciclo de vida (`isGameActive`) — quién lo toca y por qué:
 * - `activateGameAbandonGuard()`: GameScene.onSecretCardChosen(), en el
 *   mismo instante que `setActiveSessionBridge()` — el momento exacto en
 *   que la GameSession real arranca. Antes de elegir la Carta Secreta no
 *   hay saldo en riesgo, así que no hay nada que penalizar.
 * - `deactivateGameAbandonGuard()`: GameSceneController, en cada evento
 *   que dispara la transición NORMAL hacia ResultScene —
 *   'DealAccepted', 'GameWon' y 'GameLost'. A partir de ese instante la
 *   partida ya se resolvió por sí misma (por el flujo normal del juego o,
 *   en el caso de 'GameLost', porque OpenCardUseCase ya aplicó la
 *   penalización de energía una única vez) — cerrar la pestaña o volver
 *   al menú desde ahí NUNCA debe penalizar de nuevo.
 * - Se REACTIVA en 'GameRevived': revivir la partida (upgrade "Revivir")
 *   la vuelve a poner genuinamente en curso, así que un abandono
 *   POSTERIOR a la revivida sí debe volver a penalizar.
 */
const PENALTY_FREE_KEY = 'gameAbandonGuard:penaltyFreeSession';

/**
 * Marca la sesión como "sin castigo" (Desafío Diario): mientras esté activa,
 * `activateGameAbandonGuard` no hace nada — así ni cerrar la pestaña ni salir
 * al menú restan monedas, ni siquiera tras un revive (que reactiva el guard).
 */
export function setPenaltyFreeSession(registry: Phaser.Data.DataManager, penaltyFree: boolean): void {
  registry.set(PENALTY_FREE_KEY, penaltyFree);
}

export function activateGameAbandonGuard(registry: Phaser.Data.DataManager): void {
  if (registry.get(PENALTY_FREE_KEY) === true) {
    return;
  }
  registry.set(REGISTRY_KEY, true);
}

export function deactivateGameAbandonGuard(registry: Phaser.Data.DataManager): void {
  registry.set(REGISTRY_KEY, false);
}

export function isGameAbandonGuardActive(registry: Phaser.Data.DataManager): boolean {
  return registry.get(REGISTRY_KEY) === true;
}