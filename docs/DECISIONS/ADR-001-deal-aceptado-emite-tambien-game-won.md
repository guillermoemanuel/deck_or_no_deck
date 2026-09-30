# ADR-001: `ResolveDealUseCase` emite también `GameWon`

**Estado:** Aceptada · **Registrada:** 2026-09-30

## Contexto
Al aceptar la oferta del banquero, la partida termina. El use-case emite
`DealAccepted { amount, secretCardValue }` **y** `GameWon { finalAmount }` en esa misma
ejecución. Ambos eventos son consumidos por `GameSceneController.handleEvent()`, y ambos
handlers querrían lanzar `ResultScene` → se cerraría dos veces.

## Decisión
Mantener el doble emitido (el dominio sí expresa "se aceptó el deal" y "el juego ganó"
como hechos distintos) y compensar en presentación con el flag `dealResultLaunched`
(`GameSceneController.ts`, seteado en el case `DealAccepted`, consumido en `GameWon`).

## Consecuencias
- `ResultScene` se lanza una sola vez; el payload correcto (`amount`) viene de `DealAccepted`.
- ⚠ Es el **único** punto del sistema donde un defecto de contrato de eventos se parchea
  con estado de presentación. Si alguien cambia el orden o agrega un emisor, debe revisar
  este flag.
- Alternativa futura (no adoptada): que el use-case emita `DealAccepted` con un campo
  `endsWithGame: true` y un solo evento terminal. Rompería specs existentes y el README.
