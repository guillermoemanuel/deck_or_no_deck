---
description: Ejecutar trabajo con gates obligatorios (typecheck, lint, tests) y cierre en LOG
---

Ejecutá este trabajo siguiendo `AGENTS.md`: $ARGUMENTS

Procedimiento:

1. **Contexto mínimo**: leé `docs/LOG.md` (últimas entradas, para no duplicar trabajo en
   curso), `docs/PLAYBOOK.md` §1 (¿ya existe algo parecido?) y `AGENTS.md`.
   No cargues `docs/ARCHITECTURE.md` salvo que el cambio cruce capas.
2. **Elegí UNA zona y delegá** (o hacelo directamente si el cambio es de 1-2 archivos):
   `domain-builder` (domain+application) · `ui-builder` (presentation+i18n) ·
   `infra-builder` (infrastructure+shared+config) · `test-engineer` (solo specs).
   **Nunca dos zonas en paralelo sobre el mismo archivo.**
3. Comportamiento nuevo en `domain`/`application` → **primero el test rojo**.
4. **Gates** en este orden: `npx jest <specs>` → `npm run typecheck` → `npm run lint`
   → `npm test`. Opcional: delegar la batería al agente `qa`.
5. **Revisión**: delegar al agente `reviewer` sobre el diff (`VEREDICTO: …`).
6. **Cierre**: entrada en `docs/LOG.md` (agente `memory-keeper`), ADR si hubo decisión,
   y commit atómico con mensaje que diga *qué* y *por qué*.

Si algo sale rojo, no cierres: reportá qué gate falla y por qué.
