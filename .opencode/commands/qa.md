---
description: Corre la batería de gates (specs, typecheck, lint, suite completa) y reporta
agent: qa
subagent: true
---

Corré la batería de verificación completa sobre el estado actual del repo:
$ARGUMENTS

Ejecutá en orden: `npx jest <specs indicados>` (si no se indican, omitir) →
`npm run typecheck` → `npm run lint` → `npm test` → `git status --short`.
Devolvé el formato de salida de este agente (GATE 1..4 PASS/FAIL + archivos tocados +
`VEREDICTO: VERDE/ROJO`), pegando el primer error completo si algo falla.
No modifiques archivos.
