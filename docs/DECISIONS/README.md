# Decisiones de arquitectura (ADR)

Registro corto de decisiones **ya tomadas**, para que ningún agente (ni humano)
las "redescubra" ni las deshaga por error.

**Formato:** Contexto → Decisión → Consecuencias.
**Cómo agregar uno:** `ADR-NNN-titulo-corto.md`, siguiente número libre, y una línea
en la tabla de abajo + entrada en `LOG.md`. Estado inicial de todos: *Aceptada*.
Si una decisión se revierte: marcar *Revertida* + nuevo ADR (no borrar el viejo).

| # | Título | Estado |
|---|---|---|
| [001](ADR-001-deal-aceptado-emite-tambien-game-won.md) | `ResolveDealUseCase` emite también `GameWon` | Aceptada |
| [002](ADR-002-no-existe-value-object-money.md) | No existe `Money`: la moneda es un `number` crudo | Aceptada |
| [003](ADR-003-use-cases-dependen-de-progressionmanager.md) | Los use-cases dependen de `ProgressionManager` (infra), no del puerto crudo | Aceptada |
| [004](ADR-004-idioma-manual-se-persiste-siempre.md) | La elección manual de idioma se persiste siempre | Aceptada |
| [005](ADR-005-bono-periodico-sin-premio-cero.md) | El bono periódico ya no puede dar 0 | Aceptada |
| [006](ADR-006-reembolso-por-fallo-ambiental.md) | Reembolso por fallo ambiental al consumir una mejora de ads | Aceptada |
| [007](ADR-007-anuncio-propio-countdown-y-adapter-por-vite.md) | Anuncio propio (countdown) + adapter de ads por `VITE_ADS` | Aceptada |
