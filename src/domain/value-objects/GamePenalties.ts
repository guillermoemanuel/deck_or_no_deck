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
 *
 * Fase B del rebalance del banquero: el valor bajó de 5000 a 1000. Con
 * −5000, esquivar la derrota valía (Δderrota × 5000) más que el premio
 * extra de jugar hasta el final, así que aceptar la PRIMERA oferta era
 * siempre la jugada óptima y no existía dilema deal/no deal.
 */
export const LOSS_PENALTY_AMOUNT = 1000;
