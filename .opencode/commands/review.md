---
description: Revisión read-only del diff actual contra el checklist del proyecto
agent: reviewer
subagent: true
---

Revisá los cambios sin commitear (y los del último commit si $ARGUMENTS lo indica):
$ARGUMENTS

Usá `git status --short` y `git diff` como fuente. Pasá el checklist completo de este
agente (capas · specs · i18n · lógica de negocio en presentación · duplicación ·
eventos · invariantes · estilo) y devolvé los hallazgos ordenados por severidad con
`archivo:línea`, cerrando con `VEREDICTO: APROBADO` o `VEREDICTO: CAMBIOS REQUERIDOS`.
No modifiques nada.
