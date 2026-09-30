---
description: Registrar en docs/LOG.md la entrada de la tarea que se acaba de cerrar
agent: memory-keeper
subagent: true
---

Registrá en `docs/LOG.md` la entrada de cierre de esta tarea: $ARGUMENTS

Entrada nueva arriba (append-only), con: fecha · tarea · archivos tocados ·
gates ejecutados con su resultado · deuda/pendientes que quedaron abiertos.
Si hubo una decisión de diseño, creá el ADR correspondiente en `docs/DECISIONS/` y
sumalo al índice; si cambió la arquitectura, actualizá `docs/ARCHITECTURE.md` o
`docs/MAP.md` según corresponda. No toques `src/`.
