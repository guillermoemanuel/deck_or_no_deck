---
description: Planificar un cambio (read-only, delega exploración y entrega un plan)
agent: architect
---

Planificá este trabajo: $ARGUMENTS

Seguí el protocolo de este agente (leer `docs/LOG.md` → `docs/PLAYBOOK.md` → `AGENTS.md`
→ solo si hace falta `docs/ARCHITECTURE.md`/`docs/DECISIONS/`), delegá la exploración de
código a subagentes `explore` con briefs acotados, y entregá el plan en el formato
obligatorio de este agente (objetivo · archivos exactos · zona/agente ejecutor ·
invariantes · test esperado · gates · riesgos · alcance negativo).

Si el cambio toca `domain/`/`application/`, el plan debe incluir el spec.
Si toca invariantes numéricos o contratos de eventos, marcalo como *requiere aprobación*.
No modifiques ningún archivo: después de presentar el plan, esperá la aprobación
para correr `/build`.
