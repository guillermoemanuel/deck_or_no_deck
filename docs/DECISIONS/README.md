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
| [008](ADR-008-vite-fullscreen-boton-propio.md) | Botón de pantalla completo propio sujeto al modo de ads (`VITE_FULLSCREEN`) | Aceptada |
| [009](ADR-009-ads-disabled-estado-permanente.md) | `ads_disabled`: dos adErrors de CrazyGames son estados permanentes (política 2 en el mismo intento) | Aceptada |
| [010](ADR-010-bloqueador-de-ui-durante-ads.md) | Bloqueador de UI durante todo el ciclo del ad (fase `'requesting'` + `AdBlockerScene`) | Aceptada |
| [011](ADR-011-muteaudio-de-plataforma.md) | `muteAudio` de la plataforma con prioridad sobre el toggle in-game (capa `platformMuted`) | Aceptada |
| [012](ADR-012-aviso-inline-de-ads-en-la-tienda.md) | Aviso inline de ads ocultos en la tienda (política `adsNotice()` en aplicación) | Aceptada |
| [013](ADR-013-politica-del-banquero-y-energia-inicial.md) | Política del Banquero (oferta por rondas con ruido inyectado) y energía inicial 60 % — rebalance Fase A + B | Aceptada |
| [014](ADR-014-regla-anti-farmeo-primera-ronda.md) | Regla anti-farmeo de la 1ª ronda: cap de oferta (1/2/5/10) + cuenta regresiva de 5 partidas | Aceptada |
