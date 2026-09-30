/**
 * Penalizaciones fijas de la partida (reglas de negocio puras).
 *
 * El monto se aplica vía `IProgressionService.applyLossPenalty`, que **puede
 * dejar el saldo en negativo** — eso es intencional (ver ADR del anti-cheat y
 * `ProgressionManager.applyLossPenalty`).
 *
 * Antes el valor estaba en tres sitios con riesgo de divergencia: el literal
 * `5000` en `OpenCardUseCase`, la constante `ABANDON_PENALTY_AMOUNT` en
 * `presentation/GameAbandonGuard` y su reexport a `UIScene`/`main.ts`.
 * La fuente única es ésta: `domain` no importa a nadie, y todas las capas
 * importan hacia adentro.
 */
export const LOSS_PENALTY_AMOUNT = 5000;
