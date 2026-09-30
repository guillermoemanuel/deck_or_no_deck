# LOG de sesiones de trabajo (append-only)

> **Formato:** entrada más reciente arriba. Solo se agrega, nunca se reescribe.
> Obligatorio al cerrar cualquier tarea de Build: una entrada breve con
> *qué se tocó*, *cómo se verificó* y *qué quedó pendiente*.
> El estado detallado del código vive en `docs/MAP.md`; el porqué en `docs/DECISIONS/`.

---

## 2026-09-30 · Smoke manual de la Fase 4 (verificación en navegador)

**Tarea:** recorrer a mano en el navegador los comportamientos extraídos a `domain` en la
Fase 4 (partes 1 y 2) y dejar constancia de qué se verificó en vivo.

**Archivos tocados:** `docs/LOG.md` (esta entrada) y `docs/testing.md` (§5: línea de
estado del smoke bajo el checklist). **Ningún archivo de `src/`.**

**Verificado en vivo** (dev server `http://localhost:5174`, todo ✅):

- Banner del Desafío Diario anuncia **1.000 / racha 1** con racha rota.
- Tienda: **Tanque Nivel II muestra "Requiere Nivel I" con botón de costo gris e inerte**
  (caso `locked` de `SessionUpgrades.getState()`); Nivel I clickeable.
- Barra de energía en las fronteras: **50 % → ámbar** (no verde), **20 % → rojo + texto
  `#ff3366` + pulso**, **0 % → rojo sin pulso**, y **verde** al subir de 50 con Tanque
  Nivel I.
- Carta de **$1.000 roja** vs **$750 verde** (frontera `isHighCaseValue`).
- Abandono: modal con **5.000** y el saldo baja exactamente 5.000 (puede quedar negativo).
- Partida terminada: lo cobrado por el desafío diario **coincide con lo anunciado** → la
  propiedad `previewDailyCompletion ≡ completeDaily` verificada en vivo.
- Idioma EN↔ES y bono periódico forzado: sin anomalías.

**No es un fallo — ads en local:** en local **aparecen** Duplicar/Triplicar/Revivir en la
tienda porque `index.html:29` carga el SDK real de CrazyGames (`sdk.crazygames.com`) y
`isRewardedAdAvailable()` devuelve `true` con el SDK inicializado. **La rama "oculta" del
filtro NO se ejercitó en vivo**; queda como pendiente (se puede forzar bloqueando
`*crazygames-sdk-v3.js*` en DevTools → Network y recargando).

**Pendientes del smoke (no corridos en esta oportunidad):** los 4 ítems largos del
checklist de `docs/testing.md` §5 — partida con DEAL/no-deal + swap de mitad y final
(ítems 1-2), revivir con anuncio (3), y tienda con/sin fondos, con conflicto y compra de
mazo (4).

---

## 2026-09-30 · Fase 4 (parte 2) — Umbrales de presentación al dominio

**Tarea:** extraer a `domain` los 3 umbrales que vivían hardcodeados en presentation
(color/valor de carta, zonas de la barra de energía, lista de mejoras con rewarded ad).

**Archivos tocados (9 en código + 5 docs de cierre):**

- `src/` (9), por capa:
  - **domain** (6): `value-objects/EnergyLevel.ts` + `EnergyLevel.spec.ts`
    (`EnergyZone`, `ENERGY_CRITICAL_MAX_PERCENT` = 20, `ENERGY_LOW_MAX_PERCENT` = 50,
    `getEnergyZone()` sin clamp — la vista acota a 0-100 antes de consultar),
    `value-objects/CaseValues.ts` + **`CaseValues.spec.ts` (nuevo)**
    (`HIGH_CASE_VALUE_MIN` = 1000, `isHighCaseValue()`),
    `value-objects/SessionUpgradeCatalog.ts` + **`SessionUpgradeCatalog.spec.ts` (nuevo)**
    (campo `requiresRewardedAd?: boolean`).
  - **presentation** (3): `components/EnergyBarView.ts` (relleno/label/pulso derivan de la
    zona; `colorForPercentage` → `colorForZone`), `components/CardView.ts`
    (`value >= 1000` → `isHighCaseValue(value)`), `scenes/ShopScene.ts` (la constante
    local `REWARDED_AD_UPGRADE_IDS` **fue borrada**; el filtro es
    `SESSION_UPGRADE_CATALOG.filter(u => rewardedAdsUsable || !u.requiresRewardedAd)`).
- `docs/` + raíz (cierre de los 2 bloqueantes del reviewer): `docs/LOG.md` (esta entrada),
  `docs/testing.md` (conteos; en §5 las filas de carta y energía pasan a "ya resueltos" y
  la de ads queda marcada *parcialmente resuelta*), `docs/MAP.md` (censo refrescado),
  `docs/ARCHITECTURE.md` (conteo + 3 reglas nuevas en la tabla de invariantes),
  `AGENTS.md` (35 → 37 `*.spec.ts`).

**Qué se ganó:**

- Los 3 umbrales pasan a tener spec en dominio: **frontera de energía 50/20**
  (`getEnergyZone`: 51 healthy, 50 low, 20 critical, más valores fuera de rango),
  **frontera de carta 1000** (`isHighCaseValue`: 999 false / 1000 true + el filtro real
  `[1000, 5000, 10000, 25000]`), y el **set de ads que depende de rewarded**
  (`requiresRewardedAd` exactamente en `double_reward`, `triple_reward`, `revive`).
- Desaparece la última lista hardcodeada de IDs que solo existía en una escena: la lista
  vive en el catálogo de dominio y la vista solo filtra con ella.
- Specs: **35 → 37 archivos**; línea base de tests **411 → 425**.

**Verificación:** gates en verde delegados en los agentes `qa` y `reviewer` de
`.opencode/` — **37 suites / 425 tests**, typecheck 0 errores, lint 0, cobertura por capa
OK. El reviewer marcó 2 hallazgos bloqueantes —esta entrada de LOG y la deriva documental
(conteos viejos + 2 filas de `testing.md` que seguían listando umbrales ya extraídos)— y
**ambos se cierran aquí**: entrada nueva en `LOG.md` y `testing.md`/`MAP.md`/
`ARCHITECTURE.md`/`AGENTS.md` refrescados.

**Pendientes:**

- Filtro de ads en `ShopScene.renderUpgradesTab()` queda **parcialmente resuelto**: la
  lista de qué mejoras dependen de ads vive en el catálogo (`requiresRewardedAd`, con
  spec), pero la decisión de *disponibilidad* (ocultarlas cuando el entorno no puede
  mostrar anuncios) sigue en la escena; moverla a un use-case queda abierto.
- `README.md` sigue sin corregir (deriva conocida, ver `PLAYBOOK.md` §4).
- `npm audit`: 3 vulnerabilidades en devDependencies (`PLAYBOOK.md` §5).

**Nota de proceso:** el censo de `MAP.md` se refrescó midiendo cada archivo con `wc -l`.
Lo planificado para la ronda decía `EnergyLevel.ts` 98 LOC y `CaseValues.ts` 36; medido
sobre el código dan **104 y 35** — prevalece la medida y así quedó escrito. Totales
actuales: 146 archivos TS · 20.486 líneas.

---

## 2026-09-30 · Fase 4 — Testing y extracción de lógica a dominio

**Tarea:** bajar la lógica de negocio atrapada en presentation/application al dominio y
fijar umbrales de cobertura por capa.

**Archivos tocados (18 en código/config + docs de cierre):**

- `jest.config.js` — umbrales por capa.
- `src/` (13), por capa:
  - **domain** (6): `value-objects/GamePenalties.ts` + `GamePenalties.spec.ts` (**nuevos**),
    `value-objects/DailyChallenge.ts` + spec, `entities/SessionUpgrades.ts` + spec.
  - **application** (2): `use-cases/OpenCardUseCase.ts`, `use-cases/PurchaseSessionUpgradeUseCase.ts`.
  - **presentation** (4): `GameAbandonGuard.ts`, `scenes/ShopScene.ts`, `scenes/UIScene.ts`,
    `components/DailyChallengeBanner.ts`.
  - **raíz** (1): `main.ts`.
- `.opencode/agents/` (4, corrección de permisos de shell): `domain-builder`, `infra-builder`,
  `test-engineer`, `ui-builder`.
- `docs/` (cierre de los hallazgos del reviewer): `AGENTS.md`, `docs/ARCHITECTURE.md`,
  `docs/MAP.md`, `docs/PLAYBOOK.md`, `docs/testing.md`, `docs/LOG.md` (esta entrada).
  Desincronizaciones nuevas detectadas mientras se corregía todo y también corregidas:
  los totales LOC por capa de `MAP.md` no eran reproducibles → pasados a `wc -l` medido;
  `PLAYBOOK.md` §4 decía "pendiente corregir en la Fase 2" (ya hecha) → separada la deriva
  resuelta de la que sigue abierta (solo `README`); `ARCHITECTURE.md` apuntaba a
  `main.ts:80` para las escenas (hoy es `:81` por el import nuevo).

**Qué se ganó:**

- Penalidad en **1 lugar** en vez de 3 (un literal `5000` + una constante duplicada en
  `GameAbandonGuard`): ahora `LOSS_PENALTY_AMOUNT` en `domain/value-objects/GamePenalties.ts`,
  consumida por `OpenCardUseCase`, `UIScene` y `main.ts`.
- Regla de recompensa del desafío diario en **1 función** con test de propiedad
  (`previewDailyCompletion` ≡ lo que paga `completeDaily`); `DailyChallengeBanner` consume el preview.
- Las 8 reglas de upgrades en **1 entidad** con **10 specs** (`SessionUpgrades.getState` /
  `isOwned` / `canPurchase`), en vez de 3 switches (2 privados en `PurchaseSessionUpgradeUseCase`
  + 1 en `ShopScene`).
- `ShopScene.upgradeStatusFor()` de ~70 a ~32 líneas, solo presentación (campo `owned` →
  `buttonDisabled`); además usa `findSessionUpgradeDefinition()` en vez de `.find(…)!)`.
- Umbrales `application` **nuevos** (88/82/90/88 stmts/branches/functions/lines) y `domain`
  subidos (80/85/85 branches/functions/lines → 88/80/90/88).
- Código muerto eliminado: `getActiveStreak()` (había quedado sin consumidores).

**Verificación:** gates en verde delegados en los agentes `qa` y `reviewer` de `.opencode/` —
**35 suites / 411 tests**, typecheck 0 errores, lint 0, cobertura por capa OK. El reviewer
marcó 2 hallazgos bloqueantes (docs desfasados respecto de la Fase 4 y código muerto) y
**ambos se cerraron**: docs corregidos en esta entrada (grep por la constante vieja de
penalidad en `docs/` y `AGENTS.md` → 0 resultados; `getActiveStreak` ya no existe en `src/`).

**Nota de proceso:** primera ejecución del flujo agéntico completo
`/plan` → builders → `/review` → `/qa` → `/log`. Un hallazgo del reviewer fueron permisos
de shell mal acotados en 4 builders (faltaba `npm test*`) — corregido en `.opencode/agents/`.

**Pendiente:** Fase 4 restante (opcional) — extraer a dominio los umbrales de
`EnergyBarView`/`CardView`. Sigue abierta la deuda de `npm audit` (3 vulnerabilidades en
devDependencies — `PLAYBOOK.md` §5).

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
