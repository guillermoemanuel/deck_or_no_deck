# LOG de sesiones de trabajo (append-only)

> **Formato:** entrada más reciente arriba. Solo se agrega, nunca se reescribe.
> Obligatorio al cerrar cualquier tarea de Build: una entrada breve con
> *qué se tocó*, *cómo se verificó* y *qué quedó pendiente*.
> El estado detallado del código vive en `docs/MAP.md`; el porqué en `docs/DECISIONS/`.

---

## 2026-10-01 · ADR-006 enmendado: motivo en el puerto + 2 políticas de reembolso

**Tarea:** sincronizar documentación (`docs/` + `AGENTS.md`, nada en `src/`) tras el
cambio ya implementado y en verde (código en el árbol, **commit pendiente**) que resolvió
la tensión **"cooldown
autoinfligido vs fallo ambiental"**, cerrando los **4 hallazgos bloqueantes del
`reviewer`**. Decisión del usuario de hoy (tercera sobre ADR-006): distinguir el **motivo**
del fallo con 2 políticas en vez de reembolsar ante todo fallo.

**Qué cambió en el código (ya en verde, no tocado por esta entrada):**
- Puerto `ICrazyGamesService` → **`rewardedAdStatus(): RewardedAdStatus`**
  (`'available' | 'sdk_unavailable' | 'adblock' | 'cooldown_no_fill' |
  'cooldown_retryable'`); `isRewardedAdAvailable()` queda como azúcar (`=== 'available'`).
- **Política 1 — `cooldown_retryable`** (cualquier fallo que no sea sin-fill; ahí cae la
  **cancelación del jugador**: en producción `adError` sin fill → `'ad_unavailable'`,
  todo lo demás → `'error'`) → motivo nuevo **`'ads_cooldown'`**, **sin reembolso**, sin
  tocar `refunded`, sin pedir el anuncio; UI `RESULT_AD_COOLDOWN` con botones **encendidos**
  (reintento real a los 60 s). Evita el forfeit autoinfligido: cancelar el anuncio de
  Revivir ya no disparaba un reembolso que cerraba la chance de revivir.
- **Política 2 — `sdk_unavailable` | `adblock` | `cooldown_no_fill`** → reembolso único
  `'refunded'` (XOR intacto). `cooldown_no_fill` **mantiene cubierto** el caso sin-fill
  persistente (no se reabrió ese hueco). `ad_failed` sigue sin reembolsar y reintentable.

**Archivos de código (9, no tocados acá):** `domain/ports/ICrazyGamesService.ts`,
`infrastructure/services/CrazyGamesService.ts` (`lastRewardedFailure` en `settle()`),
`infrastructure/services/testing/FakeCrazyGamesService.ts` (`setRewardedStatus()`;
`setRewardedAvailable(false)` → `'adblock'`), `application/use-cases/MultiplyRewardUseCase.ts`
y `ReviveWithAdUseCase.ts` + sus specs (**+12 tests: 6 infra + 6 aplicación**; 4 tests
viejos renombrados porque sus títulos afirmaban la política vieja; las specs de transición
`ad_failed → cooldown → refunded` **ya no existen**), `presentation/scenes/ResultScene.ts`,
`shared/i18n/LanguageData.ts` (**144 → 145 claves**: `RESULT_AD_COOLDOWN` en/en+es).

**Hallazgos del `reviewer` y cómo se cerraron (los 4, en esta entrada):**
1. **`docs/DECISIONS/ADR-006`** enmendado con revisión fechada: cláusula del predicado
   booleano falso (incluido cooldown) → **2 grupos de `rewardedAdStatus()`**; borrada la
   frase "un segundo click dentro de la ventana reembolsa y cierra el reclamo"; conteos
   13/16 → **16/19**; contexto con la tercera decisión; UI con `RESULT_AD_COOLDOWN`.
2. **`AGENTS.md`**: §4 reescrito (política leída con `rewardedAdStatus()`, no con el
   predicado; retryable → `ads_cooldown` sin reembolsar; sdk/adblock/no_fill → `'refunded'`)
   y §3 **144 → 145 claves**.
3. **`docs/testing.md`**: header **38 suites · 467 tests** (446 `it(` + 21 filas de 2
   `it.each`); ítems 9-11 con conteos **16/19**; límite 2 reescrito con las 2 políticas y
   los **títulos reales** de las specs nuevas (`CrazyGamesService.spec.ts` 14 — 6 de
   `rewardedAdStatus()` —, `MultiplyRewardUseCase.spec.ts` 16, `ReviveWithAdUseCase.spec.ts` 19).
   **`docs/MAP.md`**: censo 148 archivos / **21.806** líneas (domain 4.137 · application
   3.264 · infrastructure 2.167 · presentation 10.786 · shared 1.238 · root 214), LOC
   refrescados (puerto 317 en la fila de ports, `CrazyGamesService` 408/252, fakes
   6 archivos/259, use-cases 143/515 y 130/392, `ResultScene` 554, `LanguageData` 451),
   política por `rewardedAdStatus()` en las 2 celdas de use-cases, **145 claves**.
   **`docs/ARCHITECTURE.md`** (145 claves + contrato del puerto) y **`docs/PLAYBOOK.md`**
   (145 = 290 ÷ 2).
4. **`docs/LOG.md`**: esta entrada.

**Gates:** typecheck **0** · lint **0** · coverage **umbrales verdes** · **38 suites /
467 tests** (todo en verde al abrir la tarea). Verificación final de docs con grep:
sin rastros de la política vieja en `docs/` + `AGENTS.md` fuera de las **entradas
históricas de este LOG** (append-only: las entradas anteriores describen la política
ya reemplazada, la vigente es la de esta entrada).

**Pendientes:** smoke navegador ítems 9-11 de `docs/testing.md` · migración a **Vite 8**
· archivos `.opencode/` sin commitear · commit atómico del cambio de código + docs.

---

## 2026-10-01 · Alcance del reembolso ampliado a `isRewardedAdAvailable()`

**Tarea:** cerrar documentalmente (docs + ADR, nada en `src/`) la ampliación de producto
decidida por el usuario hoy: *"si no hay anuncios cuando consumís, te devolvemos el
dinero"*. Sobre las 3 opciones presentadas — **(a)** reembolsar ante **todo fallo**,
**(b)** **distinguir el motivo** del fallo, **(c)** **mantener solo SDK ausente** — eligió
**(a)**. Este cierre cierra el bloque "Queda ABIERTO" de la entrada anterior (sub-caso
del límite 2 en `testing.md`).

**Qué y por qué (código ya implementado en la sesión; gates `qa` VERDE):** el chequeo de
reembolso en `MultiplyRewardUseCase.execute()` y `ReviveWithAdUseCase.execute()` pasó de
`!isAvailable()` a **`!isRewardedAdAvailable()`**: ahora también cubre **adblock
detectado** y la **ventana de cooldown de 60 s** tras un rewarded fallido — los dos
caminos que dejaban el dinero trabado (compras, `ad_failed`, reintento infinito sin
efecto porque ese motivo no reembolsa). Invariante XOR, monto `costOf(id)`,
`'refunded'` y `ad_failed` sin reembolso: intactos.

**Archivos de código (4, todos en `src/application/`):** `use-cases/MultiplyRewardUseCase.ts`
(predicado + comentario BUGFIX ampliado), `use-cases/MultiplyRewardUseCase.spec.ts`
(**10 → 13** tests: +adblock/cooldown, +invariante con ads de vuelta, +transición),
`use-cases/ReviveWithAdUseCase.ts` (ídem), `use-cases/ReviveWithAdUseCase.spec.ts`
(**13 → 16** tests, mismos +3).

**Gates:** `qa` VERDE **38 suites / 453 tests** · typecheck 0 · lint 0 · cobertura verde
(al momento de abrir esta tarea). Durante el cierre documental, `test-engineer` agregó en
paralelo la spec de transición (1 test por spec) → **455 tests medidos con grep al cerrar**
(434 declaraciones `it(`/`test(` sin `it.each` + 21 filas de 2 `it.each` (13 + 8) = 455 ·
38 `*.spec.ts`). **Pendiente: re-run de `npm test` tras el merge para confirmar 455 en verde.**

**Hallazgos del `reviewer` y cómo se cerraron:**
1. **Docs y ADR contradiciendo el código nuevo** (predicado viejo `isAvailable()`,
   "SDK ausente" como alcance completo, límite 2 "abierto", conteos 10/13/449) →
   **cerrados con esta entrada**: `ADR-006` (Decisión con predicado nuevo y fecha;
   "Pendiente (decisión de producto)" movido a Decisión como **resuelto 2026-10-01** con
   su texto original conservado; matiz de 60 s en `ad_failed`; conteos 13/16),
   `docs/testing.md` (header 455, ítems 9-11 con conteos, §5 límite 2 **CERRADO** con el
   alcance nuevo y la nota de reintento), `AGENTS.md` §4 (invariante con
   `isRewardedAdAvailable()` + matiz 60 s), `docs/MAP.md` (2 celdas "Reembolso por SDK
   ausente" → predicado completo; LOC refrescados: 106/291 y 128/408, subtotal
   application 2.796 → 3.017, total 21.132 → 21.353).
2. **Faltaba la spec de la transición `ad_failed → cooldown → refunded`** → agregada por
   `test-engineer` en ambos specs: clic 1 con cancelación del jugador → `ad_failed` sin
   reembolso → el servicio arma el cooldown de 60 s → clic 2 dentro de la ventana →
   reembolsa `costOf(id)` exactamente una vez y cierra el reclamo → clic 3 (ads vuelven)
   sigue `'refunded'`, sin segundo crédito.

**Hechos de comportamiento que quedaron documentados:**
- `CrazyGamesService.requestAd()` **NO consulta el cooldown** (chequea solo
  `isAvailable()` + `adInProgress`): la ventana de 60 s la protege **el pre-chequeo**
  `isRewardedAdAvailable()` del use-case al consumir (más los guards de tienda).
- El cooldown de 60 s lo pone **cualquier** rewarded fallido
  (`settle()` → `rewardedBlockedUntil = now + 60000`), **incluida la cancelación del
  jugador** → un segundo click dentro de la ventana **reembolsa en vez de reintentar** y
  cierra el reclamo; reintentar de verdad exige esperar los 60 s.

**Docs tocados (5):** `docs/DECISIONS/ADR-006-reembolso-por-fallo-ambiental.md`,
`docs/testing.md`, `AGENTS.md` (§4), `docs/MAP.md` (censo), `docs/LOG.md` (esta entrada).

**Pendientes:** re-run de gates con los 455 · smoke navegador ítems 9-11 de `docs/testing.md`
(no corridos; el subagente no tuvo permiso de shell, no pudo ejecutar `git`/`npm`).

---

## 2026-10-01 · Cierre de los dos límites aceptados (exhaustividad + reembolso por fallo ambiental)

**Tarea:** cerrar documentalmente los dos "límites aceptados" que `docs/testing.md` §5
dejó abiertos el 2026-09-30, y registrar la decisión de producto asociada (ADR-006).

**Qué y por qué (código ya implementado; gates verificados por `qa` VERDE y `reviewer`
APROBADO):**

- **Límite A — exhaustividad de `applyEffect`.** El switch de
  `PurchaseSessionUpgradeUseCase` cierra con una guarda de tipos en tiempo de
  **compilación** (`const exhaustive: never = upgradeId; void exhaustive;`, con los
  `break` cambiados a `return;` y **sin `default`**): un 9.º id en `SessionUpgradeId` ya
  no compila. Complemento en runtime: spec `it.each` que recorre los **8** ids de
  `SESSION_UPGRADE_CATALOG` y afirma que la compra deja el efecto observable en la sesión
  real — si mañana hay un 9.º id sin rama, ese test falla. Ruptura verificada: sin un
  `case`, typecheck pasa **sin** la guarda y falla **con** ella.
- **Límite B — TOCTOU compra→consumo → reembolso por fallo ambiental** (decisión de
  producto del usuario, elegida sobre "conceder sin anuncio" y "solo documentar"). Al
  consumir Duplicar/Triplicar/Revivir, si `isAvailable()` es `false` (SDK entero ausente):
  `awardGameplayCoins(costOf(id))` **una sola vez**, motivo `'refunded'` (nuevo en las
  uniones `MultiplyRewardResult` y `ReviveResult`) y todo intento posterior devuelve
  `'refunded'` sin efecto — **invariante reembolso XOR efecto** (nunca ambos: sería
  explotable). `ad_failed` (cancelación del jugador o fill muerto) **no** reembolsa y
  sigue reintentable. UI: clave nueva **`RESULT_AD_REFUNDED`** (en/es) en `ResultScene` y
  botones apagados al reembolsar (helper `disableActionButton`). `costOf(id)` pasó a ser
  el helper único de dominio del monto (`SessionUpgradeCatalog`).

**Cambio por archivo (11 modificados, medido con `git status`/`git diff --stat`):**

- **Código (11):** `application/use-cases/PurchaseSessionUpgradeUseCase.ts` (guard
  `never` + `return;`) y su `.spec.ts` (**36 tests**: 28 + `it.each` de 8 ids);
  `application/use-cases/MultiplyRewardUseCase.ts` (refundo + `refunded`) y su
  `.spec.ts` (**10**); `application/use-cases/ReviveWithAdUseCase.ts` (refundo, motivo
  `refunded`, puerto de progresión opcional) y su `.spec.ts` (**13**);
  `application/use-cases/ListAvailableUpgradesUseCase.spec.ts` (solo títulos `it`);
  `domain/ports/IProgressionService.ts` (JSDoc de `awardGameplayCoins` ampliado a
  reembolsos); `domain/value-objects/SessionUpgradeCatalog.ts` (+`costOf()`);
  `presentation/scenes/ResultScene.ts` (483 → **538 L**: `RESULT_AD_REFUNDED`,
  `disableActionButton`, caveats); `shared/i18n/LanguageData.ts` (+1 clave en `en` y `es`
  → **144**).
- **Docs (8):** `AGENTS.md` (§3: 144 claves; §4: invariante reembolso XOR);
  `docs/DECISIONS/ADR-006-reembolso-por-fallo-ambiental.md` (nuevo) + su fila en el índice
  `docs/DECISIONS/README.md`; `docs/testing.md`
  (límites 1/2 → cerrados + 3 ítems de smoke nuevos **no corridos** + conteos);
  `docs/ARCHITECTURE.md` (144 claves); `docs/MAP.md` (censo y LOC); `docs/PLAYBOOK.md`
  (rama `wantsDouble && wantsTriple`, call sites de `awardGameplayCoins`); `docs/LOG.md`
  (esta entrada).

**Gates finales (reportados por `qa`, VERDE):** **38 suites / 449 tests** · typecheck 0 ·
lint 0 · cobertura por capa verde. **Conteos medidos por mí:** 38 `*.spec.ts` · 428
declaraciones `it(`/`test(` + 21 filas de 2 `it.each` (13 + 8) = 449 · **144** claves por
idioma en `LanguageData.ts` (288 líneas de clave ÷ 2; paridad en/es garantida por
`LanguageData.spec.ts`) · 148 archivos TS · **21.132** líneas.

**Hallazgos del `reviewer` y cómo se cerraron:** 2 **bloqueantes** — documentación y ADR
faltantes (esta entrada + `ADR-006`); 5 **medios** — (1) case muerto `'sdk_unavailable'`
en `MultiplyRewardUseCase` eliminado (el multiply reembolsa, ya no lo devuelve);
(2) comentarios que exageraban el alcance del reembolso **precisados** a "solo SDK
ausente"; (3) precondición del multiply ("la mejora debe estar comprada") **documentada**
en su JSDoc — el use-case no recibe la sesión y reembolsa a ciegas; (4) caveat de vida
del flag `refunded` (ligado a la instancia que `ResultScene` recrea en `create()`)
agregado en la escena; (5) comentario falso sobre `sessionStorage` **corregido** —
`SessionUpgrades` no persiste, los flags se calculan en vivo; 1 **bajo** — títulos `it`
traducidos a inglés.

**Queda ABIERTO (redefinido, no borrado — sub-caso del límite 2 en `testing.md`):** el
reembolso cubre **solo SDK ausente**. Si el SDK está pero `isRewardedAdAvailable()` es
`false` (cooldown/fill muerto), el consumo cae en `ad_failed` → sin reembolso, reintento
infinito y, si los ads no vuelven, el dinero queda trabado. **Decisión de producto
pendiente del usuario** si se cubre ese caso (la condición del reembolso sería
`isRewardedAdAvailable()`).

---

## 2026-09-30 · Guard de compra por ads (deuda del reviewer de la Fase 4)

**Tarea:** cerrar documentalmente el guard que impide comprar mejoras dependientes de
rewarded ads cuando el entorno no puede mostrarlos, y sincronizar los docs tocados.

**Qué y por qué (código, verificado por `qa` VERDE y `reviewer` APROBADO):**
`PurchaseSessionUpgradeUseCase` ahora rechaza con motivo **`'ads_unavailable'` —sin
cobrar—** cualquier mejora con `requiresRewardedAd` cuando
`ICrazyGamesService.isRewardedAdAvailable()` es `false`. El chequeo va **después** de
`conflicting_upgrade`/`not_applicable` y **antes** de `spendCoins`; nuevo **4.º parámetro
del constructor** (`crazyGamesService`), cableado en `GameScene`. En la UI, `ShopScene`
muestra la clave nueva **`SHOP_UPGRADE_ADS_UNAVAILABLE`** (en/es) en la línea de estado de
la fila mediante el helper generalizado **`showTemporaryRowMessage`**, que absorbió a
`showConflictMessage` sin duplicar el timer (2200 ms, con guarda de "no pisar el estado
nuevo"). *Por qué:* era la deuda #1 de la vuelta anterior — con la fila visible y los ads
caídos (cooldown tras rewarded fallido, adblock, SDK ausente) el jugador pagaba monedas por
algo que no podía usar, violando el contrato "el dinero nunca se descuenta sin que el
efecto se aplique".

**Qué cambió por archivo:**

- **Código (6):** `src/application/use-cases/PurchaseSessionUpgradeUseCase.ts` (guard +
  motivo `ads_unavailable` en la unión, JSDoc del contrato) y su `.spec.ts` (**28 tests**,
  306 → 390 L); `src/presentation/scenes/GameScene.ts` (pasa `services.crazyGamesService`);
  `src/presentation/scenes/ShopScene.ts` (`showTemporaryRowMessage`, rama
  `ads_unavailable`, 760 → 771 L); `src/shared/i18n/LanguageData.ts` (+1 clave en `en` y
  `es` → **143**); `src/domain/value-objects/SessionUpgradeCatalog.ts` (solo JSDoc: nombra
  a **los dos** decisorios, no solo a `ListAvailableUpgradesUseCase`).
- **Docs (6):** `AGENTS.md` (§3: 143 claves, `ShopScene` 771 L);
  `docs/PLAYBOOK.md` (§1: predicado de ads evaluado en 2 use-cases — fuente única,
  helper de `application/` si la regla crece; §2: contrato de precedencia de rechazos en
  `execute()`); `docs/testing.md` (conteos, fila de resueltos, smoke ítem 8 **no corrido**,
  2 límites aceptados); `docs/ARCHITECTURE.md` (invariante "mejoras con rewarded ad" con
  **2** consumidores, composition root de `GameScene`, 143 claves);
  `docs/MAP.md` (censo: 148 archivos TS · **20.729** líneas · 110 fuente + 38 specs; LOC
  de los 6 archivos TS que crecieron); `docs/LOG.md` (esta entrada).

**Gates finales (reportados por `qa`, VERDE):** **38 suites / 435 tests** · typecheck 0 ·
lint 0 · cobertura por capa verde · `PurchaseSessionUpgradeUseCase.ts` al **100 %**.
Suite de esa spec: **28 tests**. **Conteos medidos por mí (grep/`find`, `npx jest` corre
denegado por los permisos de shell de este agente):** 38 `*.spec.ts` · 422 declaraciones
`it(`/`test(` + 13 filas de un `it.each` = 435 · 143 claves por idioma en `LanguageData.ts`
(286 líneas de clave ÷ 2; paridad en/es garantizada por `LanguageData.spec.ts`).

**Hallazgos del `reviewer` cerrados en esta vuelta:** (1) **test muerto eliminado** de la
spec de compra; (2) **copia i18n acortada** — el texto en/es se recortó porque la línea de
estado de la fila desborda a ~550 px (`"Requiere anuncio recompensado — no hay anuncios
ahora."`); (3) el JSDoc de `SessionUpgradeCatalog.requiresRewardedAd` nombraba **solo a un
decisor** (el de lista) — ahora nombra a los dos use-cases.

**Desincronizaciones doc↔código corregidas (mandó el código):** `ARCHITECTURE.md` seguía
diciendo que la disponibilidad de ads la decidía *solo* `ListAvailableUpgradesUseCase` y
"142 claves"; `MAP.md` tenía LOC previos al guard (130/306, 760, 445, 142); `AGENTS.md`
"142 claves" y "760 L". Los conteos históricos `38/429` de `LOG.md` y de `PLAYBOOK.md` §5
son correctos **para su fecha** y no se reescriben (append-only / hecho en esa sesión).

**Pendientes (límites aceptados, documentados en `docs/testing.md` §5):**

1. **TOCTOU compra→consumo:** si los ads caen *después* de comprar, el efecto vía anuncio
   no se entrega — `ResultScene` y `ReviveWithAdUseCase` no consultan
   `isRewardedAdAvailable()`. Cerrarlo exigiría chequeo al consumir o reembolso.
2. **Exhaustividad de `applyEffect`:** el `switch` no tiene aserción `never`; un 9.º id de
   `SessionUpgradeId` compilaría y cobraría sin aplicar efecto. Mitigación propuesta: spec
   que recorra `SESSION_UPGRADE_CATALOG`.
3. **Smoke:** ítem 8 de `docs/testing.md` §5 (compra de ads con SDK bloqueado) **no
   corrido**; siguen pendientes los ítems 1-4 largos.

---



**Tarea:** cerrar la deriva histórica del `README.md` (lista de `PLAYBOOK.md` §4,
verificada contra el código y no contra la memoria) y registrar el `npm audit fix`.

**README — qué mentía (medido):**

- §4.2 flujo de meta-progresión: `ProgressionManager.getShopCatalog()` /
  `purchaseUpgrade()` / `repository.purchaseUpgradeLevel()` → **0 ocurrencias en `src/`**
  (API eliminada; hoy van por `ActiveSessionBridge` + `PurchaseSessionUpgradeUseCase`).
- §4.2 emite `ProgressionEvent 'UpgradePurchased'` → **nunca se emite** (solo declarado
  en `ProgressionEvents.ts`).
- §5 `IRandomProvider` → `CryptoRandomProvider` "*(pendiente)*" → **implementado** e
  instanciado en `main.ts:52`.
- §13.1 "6 mazos" → **10** (ids medidos en `DeckSetups.ts`).
- §14.2 "57 claves i18n" → **142** (284 líneas de clave ÷ 2 idiomas en `LanguageData.ts`).
- §2 árbol de directorios: `Money`, `EnergyBar`, `Upgrade` en `domain/` → **no existen**
  (ADR-002).
- §7 listaba "escena de menú principal" como pendiente → `MainMenuScene` existe;
  §8 "agregar mejora en `Upgrade.ts` / `UPGRADE_CATALOG`" → **ni el archivo ni el
  símbolo existen** (hoy `SessionUpgradeCatalog.ts` / `SESSION_UPGRADE_CATALOG`).
- §3 presentaba como "catálogo actual" el catálogo persistente viejo
  (Blindaje/Negociador/Tanque de Reserva con `startingEnergyBonus`) → el catálogo real
  son **8 mejoras de sesión**; `startingEnergyBonus` es código muerto (`PLAYBOOK.md` §3).
- §14.2 "migración de escenas a i18n pendiente" → migrada (ya contradicha por la §15
  del propio README).
- Además: el README **no tenía** cómo levantar el proyecto ni cómo correr los gates, y
  arrastraba bitácoras de sesiones antiguas (§10–15) cuyo contenido útil ya vive en
  `docs/ARCHITECTURE.md` / `docs/PLAYBOOK.md` / ADRs (el texto histórico queda en el
  historial de git, no en la doc viva).

**README — qué quedó:** portada corta y cierta — qué es el juego (mecánicas mínimas
verificadas: 13 cartas, energía al 50 %, oferta cada 3 cartas con tope de promedio,
swap de mitad y Cambio Final), `npm install` / `npm run dev` / `npm run build`, gates con
**Jest** (`npx jest <ruta>`, `npm test`, `typecheck`, `lint`, `test:coverage`), árbol
mínimo de `src/` + `docs/` + `.opencode/`, y punta a `AGENTS.md` y a cada doc de
`docs/`. **Sin conteos ni estado que se envejezca mañana**: el estado vive en
`docs/LOG.md` y `docs/MAP.md`.

**Auditoría:** `npm audit fix` (commit `bfeb7d1`) resolvió las 2 high de
`brace-expansion` — solo `package-lock.json`, **suite 38/429 verde después**. **Quedan
pendientes** `esbuild`/`vite` (moderate + high): su único fix es `vite@8.3.1` = breaking
change — decisión explícita pendiente del usuario.

**Archivos tocados (3):** `README.md` (reescrito: 417 → 64 líneas),
`docs/PLAYBOOK.md` (§4: la deriva del README pasa de "abierta" a corregida con la lista
medida; §3 y §6: referencias al README viejo corregidas; §5: `npm audit` actualizado),
`docs/LOG.md` (esta entrada). **Ningún archivo de `src/`.**

**Verificación:** conteos medidos en el repo: **38** `*.spec.ts` · **142** claves i18n ·
**10** mazos · **8** agentes (`.opencode/agents/`) y **5** comandos
(`.opencode/commands/`) · **9** escenas · scripts reales de `package.json` (`dev`,
`build`, `preview`, `test`, `test:watch`, `test:coverage`, `typecheck`, `lint` —
**no existe `vitest`**) · 17 commits (`git log`). Gates de código: sin cambios en `src/`
→ heredados (último registro en `docs/testing.md`: 38 suites · 429 tests verdes);
`npx jest`/`npm` corren denegados por los permisos de shell de este agente.

---

## 2026-09-30 · Filtro de ads de la tienda bajado a un use-case

**Tarea:** mover a `application` la decisión de ocultar Duplicar/Triplicar/Revivir cuando
el entorno no puede mostrar rewarded ads, y cerrar documentalmente el movimiento.

**Qué cambió y por qué:** la decisión vivía en `ShopScene.renderUpgradesTab()` — código de
presentación, **sin test**. Con ads caídos (Basic Launch sin ads, adblock, SDK ausente, sin
fill reciente) la tienda seguía ofreciendo esas 3 mejoras: QA rechaza botones de rewarded
sin efecto y el jugador pagaría monedas por algo que no puede usar. Hoy la decide
`ListAvailableUpgradesUseCase` (aplicación), que coordina el catálogo del dominio
(`SessionUpgradeDefinition.requiresRewardedAd`) con el puerto `ICrazyGamesService`
(`isRewardedAdAvailable()`) — el dominio solo **declara** la necesidad. La escena quedó
"tonta": solo llama `getServices(this).listAvailableUpgrades.execute()`; el porqué
documental migró al JSDoc del use-case. **Comportamiento idéntico**: mismo predicado
(`rewardedAdsUsable || !u.requiresRewardedAd`), mismo orden y mismos objetos del catálogo.

**Archivos tocados:**

- **Código (6):** nuevos `src/application/use-cases/ListAvailableUpgradesUseCase.ts`
  (29 L) y `ListAvailableUpgradesUseCase.spec.ts` (74 L); `src/presentation/GameServices.ts`
  (campo `listAvailableUpgrades` en el bag, patrón idéntico a `outcomeRecorder`);
  `src/main.ts` (instanciación); `src/presentation/scenes/ShopScene.ts` (ya no filtra
  inline ni consulta `isRewardedAdAvailable()`; sacó `SESSION_UPGRADE_CATALOG` del import);
  `src/domain/value-objects/SessionUpgradeCatalog.ts` (solo el JSDoc del campo apunta al
  use-case nuevo).
- **Docs (5):** `docs/testing.md` (conteos medidos **38 suites / 429 tests**; la fila de
  deuda del filtro de ads se elimina y pasa a la tabla "ya resueltos"), `docs/MAP.md`
  (censo refrescado: 148 archivos TS · 20.593 líneas · 110 fuente + 38 specs),
  `docs/ARCHITECTURE.md` (invariante de rewarded, composition root de `main.ts`, 38 specs),
  `AGENTS.md` (38 specs; fila de riesgo de `ShopScene`), `docs/LOG.md` (esta entrada).
  `docs/PLAYBOOK.md` **sin cambios**: ni §1 ni §3 mencionaban este filtro ni el
  `isRewardedAdAvailable()` de la escena.

**Verificación:** `qa` **VERDE** — **38 suites / 429 tests** (medido: 38 `*.spec.ts` en
`src`; 416 declaraciones `it(`/`test(` + 13 de un `it.each`), typecheck 0, lint 0,
cobertura por capa verde y `ListAvailableUpgradesUseCase.spec.ts` al **100 %**.
`reviewer` **APROBADO** con 4 hallazgos documentales, cerrados en esta entrada.

**Deuda que queda registrada** (hallazgos del reviewer, **no corregidos** en esta vuelta):

1. **Guard de compra latente**: `PurchaseSessionUpgradeUseCase` no consulta
   `isRewardedAdAvailable()`, así que en teoría se podría comprar una mejora dependiente
   de ads cuando el entorno no puede mostrarlos (p. ej. adblock activado con la tienda
   abierta, o tras un rewarded fallido con cooldown). La tienda los oculta al renderizar,
   así que el caso es difícil de alcanzar hoy, pero el guard no existe. Si se cierra, va en
   el use-case de compra con un motivo nuevo en `PurchaseSessionUpgradeResult`
   (+ i18n `en`/`es`).
2. **Sin re-evaluación en vivo**: `execute()` recalcula la lista, pero la escena lo llama
   al crear la escena / cambiar de tab; si los ads se cortan con la tienda ya abierta, los
   botones quedan hasta el próximo render.

**Pendientes heredados:** smoke manual de los ítems 1-4 de `docs/testing.md` §5 (la rama
"oculta" del filtro ya está cubierta por spec, falta ejercitarla en el navegador);
`README.md` sin corregir (`PLAYBOOK.md` §4); `npm audit` (`PLAYBOOK.md` §5).

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
