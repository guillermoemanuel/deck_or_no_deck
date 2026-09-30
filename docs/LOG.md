# LOG de sesiones de trabajo (append-only)

> **Formato:** entrada más reciente arriba. Solo se agrega, nunca se reescribe.
> Obligatorio al cerrar cualquier tarea de Build: una entrada breve con
> *qué se tocó*, *cómo se verificó* y *qué quedó pendiente*.
> El estado detallado del código vive en `docs/MAP.md`; el porqué en `docs/DECISIONS/`.

---

## 2026-09-30 · Fase 3 — Arquitectura agéntica (OpenCode)

**Tarea:** definir agentes especializados y comandos del flujo en OpenCode.

**Archivos creados (13, ninguno en `src/`):**

`.opencode/agents/` →
- `architect.md` (primary, read-only: diseña planes),
- `reviewer.md` (subagent, read-only: checklist sobre el diff),
- `qa.md` (subagent, read-only: gates),
- `domain-builder.md` (edita solo `src/domain/**` y `src/application/**`),
- `ui-builder.md` (edita solo `src/presentation/**` + `src/shared/i18n/LanguageData.ts`),
- `infra-builder.md` (infrastructure, shared, main.ts, index.html, public, configs —
  con `LanguageData.ts` denegado),
- `test-engineer.md` (solo `*.spec.ts`, `*/testing/**`, `jest.config.js`),
- `memory-keeper.md` (solo `docs/**`, `AGENTS.md`, `README.md`).

`.opencode/commands/` →
- `/plan` (agente architect),
- `/build` (ejecuta con gates),
- `/review` (reviewer en sesión hijo),
- `/qa` (qa en sesión hijo),
- `/log` (memory-keeper en sesión hijo).

**Diseño:**
- Permisos por zona con `edit deny *` + `allow` explícito (última regla gana).
- Los builders solo pueden correr los gates por shell.
- `qa` y `memory-keeper` en modelo pequeño (`opencode/mimo-v2.6-flash-free`).
- `architect`, builders y `reviewer` heredan el modelo de la sesión.

**Verificación:** gates con el agente `qa` (typecheck, lint, suite completa) —
verificación delegada al agente qa.

**Pendiente:** Fase 4 — testing (umbrales de cobertura sobre `application/`,
extracción a `domain` de lógica hoy en `ShopScene`/`EnergyBarView`, checklist de smoke).

---

## 2026-09-30 · Fase 2 — Reescritura de `AGENTS.md`

**Tarea:** convertir `AGENTS.md` de descripción arquitectónica a **contrato operativo**.

**Archivos tocados:** `AGENTS.md` (reescrito, 104 líneas) · `docs/LOG.md` (esta entrada).

**Qué cambió respecto de la versión anterior:**
- Corregidas las derivas: `npx vitest` → **Jest**; `npm run lint` ahora **existe** (Fase 0);
  eliminadas las referencias a entidades inexistentes (`Money`, `EnergyBar` en domain).
- La descripción larga de capas/patrones/flujos **ya no vive acá**: apunta a
  `docs/ARCHITECTURE.md` (evita duplicar y desincronizar dos descripciones).
- Secciones nuevas y accionables: orden de lectura previa (0), tabla de archivos de alto
  riesgo (3), invariantes numéricos (4), contrato de eventos (5), gates de terminado (7).
- Nuevo criterio de cierre: entrada en `docs/LOG.md` + ADR si hubo decisión + commit atómico.

**Verificación:** `npm run lint` ✅ · `npm run typecheck` ✅ (0 errores).
Docs y config: sin cambios en `src/`, suite heredada verde de `fa036a3`.

**Pendiente:** Fase 3 — agentes especializados en `.opencode/agent/` + comandos
`/plan`, `/build`, `/review`.

---

## 2026-09-30 · Fase 1 — Memoria persistente del proyecto

**Tarea:** volcar a documentos todo lo producido por la ingeniería inversa de la sesión.

**Archivos creados (ninguno en `src/`):**
`docs/ARCHITECTURE.md` · `docs/MAP.md` · `docs/PLAYBOOK.md` · `docs/testing.md` ·
`docs/LOG.md` · `docs/DECISIONS/README.md` + ADR-001…005.

**Verificación:** sin cambios de código → `npm test` / `typecheck` / `lint` verdes
(estado heredado de `fa036a3`).

**Contenido:** arquitectura por capas con reglas de dependencia verificables, flujo de
partida y de meta-progresión, mapa de los 142 archivos con LOC/specs/peligrosidad,
duplicaciones y código muerto conocidos, deriva documental, política de testing y
5 ADRs (doble emitido del deal, ausencia de `Money`, tipado concreto en `GameServices`,
persistencia del idioma manual, bono sin 0).

**Pendiente:** Fase 2 — reescribir `AGENTS.md` (sigue con `vitest`, `Money` y `EnergyBar`
ficticios).

---

## 2026-09-30 · Fase 0 — Estabilizar la base

**Tarea:** dejar la suite verde, que `typecheck` cubra specs y que el lint exista.

**Commits:** `fa036a3` "Fase 0: suite verde, typecheck de specs y lint real".

**Archivos tocados:**
- `src/domain/value-objects/PeriodicBonus.spec.ts` — rango acordado `[500…5000]`
  (el 0 salió del bono en `DOND_BETA.1.3.1` y el spec quedó viejo).
- `src/application/use-cases/PurchaseSessionUpgradeUseCase.spec.ts` — costos derivados
  del catálogo con `costOf(id)` en vez de hardcodeados (350/400/550 → 500/750/1000 reales).
- `src/shared/i18n/LanguageManager.ts` — **bugfix**: `setLanguage()` persiste siempre la
  elección manual, aunque coincida con el idioma activo (ver ADR-004).
- `src/shared/i18n/LanguageManager.spec.ts` — removido un `eslint-disable` huérfano.
- `tsconfig.json` — dejó de excluir `**/*.spec.ts` → `tsc --noEmit` valida los 34 specs.
- `package.json` + `package-lock.json` + `eslint.config.mjs` — script `lint` con ESLint
  mínimo (9 reglas, sin type-aware).

**Verificación (los 3 gates):**
`npm test` → 34/34 suites, 394/394 tests ✅ · `npm run typecheck` → 0 errores (34 specs
incluidos) ✅ · `npm run lint` → 0 errores, 0 warnings ✅.

**Estado inicial:** 3 suites rojas / 5 tests fallando (`PeriodicBonus`,
`PurchaseSessionUpgradeUseCase`, `LanguageManager`) — **todos preexistentes al HEAD**,
ninguno causado por el WIP sin commitear.

**Deuda dejada / sin decidir:**
- `npm audit`: `brace-expansion` (high, arreglable con `npm audit fix`) y
  `esbuild`/`vite` (moderate, exige Vite 8 = breaking).
- WIP del usuario sin commitear: 15 archivos + `AGENTS.md` + `speculation-game.zip`.
- `main` local va adelante de `origin/main` (sin push).
