# PLAYBOOK — gotchas, duplicaciones conocidas y trampas

> **Leer antes de crear algo nuevo.** Todo lo que ya existe (o ya se rompió) está acá.
> Regla: si vas a escribir código que *se parece* a algo de esta lista, reusá o extráé
> primero — no agregues la copia número N+1.
> Cada descubrimiento nuevo se agrega acá (y si implica una decisión, un ADR).

---

## 1. Duplicaciones existentes (aceptadas, pero vivas)

### 🔁 8 copias del botón "Casino de Lujo"
Misma receta (panel `0x121218` + borde dorado + zona hit oculta + tween hover + tween press),
en: `MainMenuScene.createCasinoButton` · `DeckSelectionScene.createCasinoButton` ·
`ResultScene.createActionButton` · `UIScene.createModalButton` ·
`BankerOfferPanel.createArcadeButton` · `SwapEventModal.createButton` ·
`ConfirmDialog.createButton` · `ShopScene.paintButtonChrome`+`attachButtonInteractions`.
Los comentarios de cada uno se referencian entre sí: la duplicación es **conocida**.
→ Si tocás el estilo de un botón, asumí que hay 7 copias más.
**El sonido del click, en cambio, es único desde ADR-015:** todos van por
`UiSfx.bindUiClick(target, audio)` — no copies `audio.play(SFX.CLICK)` a mano en un
botón nuevo; lo que sigue duplicado es solo el chrome visual.

### 🔁 Paleta de colores repetida en ≥11 archivos
`COLOR_GOLD = 0xffd76a`, `COLOR_GOLD_DIM = 0xd4af37`, `FONT_FAMILY = 'Georgia, …'`
aparecen en `GameSceneController`, `UIScene`, `ResultScene`, `MainMenuScene`,
`BankerOfferPanel`, `ConfirmDialog`, `DailyChallengeBanner`, `ShopScene`,
`DeckSelectionScene`, `HowToPlayScene` **y `AdOverlayScene`** (2026-10-02, ADR-007:
`PANEL_FILL = 0x121218` + `COLOR_GOLD` + acento, copiados a mano del chrome de
modal de `ShopScene`/`HowToPlayScene`, incluido el ✕ circular de cierre).
**Drift ya ocurrido:** `COLOR_PANEL_BG` = `0x0a0e17` en 5 archivos pero `0x0a0f1d` en `ResultScene`.
→ Son **11 copias** de la paleta "Casino de Lujo" y una **más** del chrome de modal:
si tocás el estilo, asumí que hay 10 copias más (extractor pendiente, ver deuda de
naming justo abajo).

### 🔁 Tween contador + pulso infinito (3 copias)
`BankerOfferPanel.animateOfferAmountCounter` · `GameSceneController.animateRevealedValueCounter` ·
`ResultScene.startHeadlinePulse`.

### 🔁 Secuencia "volver al menú" (2 copias)
`UIScene.confirmExitToMainMenu` y `ResultScene.exitToMainMenu`: mismo `stop ×3 + start`,
distintas estrategias de seguridad.

### 🔁 Pausar `GameScene` detrás de un modal (2 copias)
`UIScene` (con red de seguridad en SHUTDOWN) vs `ShopScene` (sin ella).

### 🔁 Penalidad de abandono/derrota aplicada en 3 call sites (constante única)
`UIScene.confirmExitToMainMenu` (voluntaria), `main.ts` `beforeunload` (forzada) y
`OpenCardUseCase` (derrota normal). La cifra vive en **un solo lugar**:
`LOSS_PENALTY_AMOUNT` (`domain/value-objects/GamePenalties.ts`) — hasta la Fase 4 había
un literal `5000` en `OpenCardUseCase` más una constante de penalidad duplicada en
`presentation/GameAbandonGuard.ts`. No re-hardcodear 5000 en ningún call site nuevo.

### 🔁 Regla del tanque de energía calculada en 2 lugares
`GameSession.applyEnergyTankUpgrade` (`level === 1 ? 1.25 : 1.5`) **y**
`PurchaseSessionUpgradeUseCase.applyEffect` (hardcodea el mismo `capacityMultiplier`).
**Nada garantiza que estén sincronizados** — si cambia uno, cambia el otro.

### 🔁 Monedas acreditadas por 6 call sites de producción (fuente única)
`awardGameplayCoins(x)` aparece en `OpenCardUseCase`, `ResolveDealUseCase`,
`SwapFinalSecretCardUseCase`, `ReviveWithAdUseCase` (reembolso ADR-006 + premio por
victoria inmediata), `MultiplyRewardUseCase` (bonus + reembolso ADR-006) y
`GameOutcomeRecorder` (recompensa del desafío). Hoy es consistente: **el único camino de
acreditar monedas es el puerto `IProgressionService.awardGameplayCoins`** (su JSDoc
incluye los reembolsos) — nunca sumar saldo directo desde la UI.

### 🔁 Fábrica de sesión duplicada
`GameSessionFactory.createGameSessionWithSelection` reimplementa línea por línea
`DeckManager.fromValuesWithSelection` (mismo loop, mismos `card_${idx}`).

### 🔁 Predicado de ads de la tienda evaluado en 2 use-cases
`ListAvailableUpgradesUseCase` (qué muestra la fila) y
`PurchaseSessionUpgradeUseCase` (rechazo `ads_unavailable` sin cobrar) evalúan
`definition.requiresRewardedAd && !isRewardedAdAvailable()`. La **fuente de verdad es
única** —el flag del catálogo (`SessionUpgradeCatalog.ts`) y el puerto `ICrazyGamesService`—,
así que hoy la duplicación es solo la línea del predicado: aceptable.
→ Si la regla crece (p. ej. "sin fill reciente", ventana de tiempo, umbral de calidad),
extraer un helper de `application/` y que ambos use-cases lo llamen — **no** escribir un
tercer copy.

### 🔁 Specs con `buildSession()` propio
Cada spec de use-case arma su sesión a mano en vez de reusar la factory
(hay hasta un hack `values[0] === 100000 ? { drainFor: () => 100 } : …` en
`OpenCardUseCase.spec.ts`).

### 🔁 Deuda de naming: puerto `ICrazyGamesService` con ≥2 adapters (ADR-007, decisión 4)
El puerto sigue llamándose `ICrazyGamesService` (y su impl `CrazyGamesService`) pero
desde ADR-007 lo implementan **2 adapters reales** — `CrazyGamesService` (SDK de
CrazyGames) y `OwnRewardedAdService` (anuncio propio) — más `FakeCrazyGamesService`
en specs. El nombre miente: ya no hay nada de CrazyGames en el contrato. **Rename
pendiente a `IAdService`** si se acepta el churn (imports/fakes/specs en las 4 capas);
hoy la única mitigación es el JSDoc del puerto y de `main.ts` (`type AdService`).
Registrado acá como prometió ADR-007 §Decisión: **no** renombrar "de paso" en otra
unidad — si se hace, es una tarea propia con sus 4 gates.

---

## 2. Contratos frágiles (cambiar = leer primero el spec)

1. **`ResolveDealUseCase.acceptDeal()` emite `DealAccepted` Y `GameWon`.**
   `GameSceneController` compensa con el flag `dealResultLaunched` para no lanzar
   `ResultScene` dos veces. Ver ADR-001.
2. **Orden de outcomes en `OpenCardUseCase.execute`** — cascada de `if/return`.
   Cada orden es un bugfix; cambiar el orden rompe el juego (una oferta puede tapar
   una victoria, etc.).
3. **Orden "consumir revive → revivir"** en `ReviveWithAdUseCase` (bug del revive infinito).
4. **`MultiplyRewardUseCase.isProcessing` se setea sincrónicamente antes del primer `await`**
   para cerrar la ventana de doble click.
5. **`DeckManager.swapSecretCard` preserva IDs e intercambia valores/roles.** Cualquier
   cambio acá afecta también al handler `SecretCardSwapped` de `GameSceneController`,
   que debe re-skinnear el slot correcto.
6. **Añadir un mazo nuevo**: `DeckSetups.ts` + texturas en `public/assets/` +
   `DeckCelebrationEffectRegistry` (no compila si falta el efecto) + `PreloadScene`.
7. **Orden de rechazos en `PurchaseSessionUpgradeUseCase.execute`** — cascada
   `unknown_upgrade → conflicting_upgrade → not_applicable → ads_unavailable →
   insufficient_coins → cobrar + applyEffect`. Cada precedencia tiene test
   (`PurchaseSessionUpgradeUseCase.spec.ts`, 36 tests al 2026-10-01): agregar un chequeo nuevo **antes**
   de `spendCoins` y verificá que no pise el motivo que la UI ya traduce.

---

## 3. Código muerto (no "arreglar" sin confirmar intención)

| Qué | Dónde | Señal |
|---|---|---|
| `GameStateDTO` / `GameStateMapper.toDTO` | `application/dto/GameStateDTO.ts` | sin llamadas en producción; arrastra `GameSession.getCardsOpenedCount()` |
| **3 claves SFX cargadas sin uso deliberado**: `sfx-drumroll`, `sfx-coins-count`, `SFX.CARD_OPEN` | `shared/audio/AudioData.ts` (+ sus mp3 en `public/assets/audio/sfx/`) | **No "conectar" sin decisión** (ADR-015): `sfx-drumroll` — la secuencia final real dura ~1,11 s, menos que los 1,2 s del redoble, y el plan prohibía sumar esperas; `sfx-coins-count` — `ResultScene` no tiene animación de conteo (por eso está además exento del anti-apilado de 40 ms, por si algún día se usa); `SFX.CARD_OPEN` — las variantes por valor (`cardSfxKeyForValue` en `presentation/audio/GameplaySfx.ts`) la reemplazan; `card-open.mp3` sigue cargado como genérico. |
| `GameEvent.SecretCardChosen` | `domain/events/GameEvents.ts` | declarado, ni emisor ni consumidor |
| `ProgressionEvent.UpgradePurchased` | `domain/events/ProgressionEvents.ts` | idem; ningún doc lo da por vivo (corregido 2026-09-30) |
| `GameStateMachine.start()` / estado `idle` | `domain/state/` | `GameSession` arranca en `'playing'` |
| `GameSceneData` | `presentation/scenes/GameScene.types.ts` | referencia a `CaseSelectionScene`, escena inexistente |
| `GameSession.startingEnergyBonus` | `domain/entities/GameSession.ts` | solo lo pasa su spec (resto del "Tanque de Reserva" viejo) |
| `DeckManager.fromValues*` | `domain/entities/DeckManager.ts` | solo lo usan specs; producción va por la factory |
| Comentario de penalidad tachado | `UIScene.ts` | legado de la migración a i18n |
| Rama `wantsDouble && wantsTriple` | `ResultScene.buildWonActions` (~L263) | **Potencialmente muerta** (2026-10-01): inalcanzable con el catálogo actual — `SessionUpgradeCatalog.conflictsWith` prohíbe double+triple y `SessionUpgrades` no persiste entre partidas; los flags se calculan en vivo. **No borrada**: es la red de seguridad ante cualquier bug de lógica que otorgue ambos a la vez (si se borrara, un doble flag mostraría un solo botón). Evaluación pendiente del usuario (ADR-006 la documenta). |

---

## 4. Deriva documental detectada (docs vs realidad)

**Corregido en la Fase 2** (reescritura de `AGENTS.md`): `npx vitest` → **Jest**;
`npm run lint` inexistente → **creado en la Fase 0** (`fa036a3`); referencias a `Money`
y `EnergyBar` como entidades de dominio → **no existen** (ADR-002).

**Corregido el 2026-09-30** (reescritura de `README.md`: ahora es corto y cierto — qué es
el juego, cómo levantarlo, gates, estructura mínima y punta a `AGENTS.md`/`docs/`; el
detalle ya vivía en `ARCHITECTURE.md`, el estado en `LOG.md`/`MAP.md`, y las bitácoras
antiguas §10–15 quedan en el historial de git). Derivas medidas que se cerraron:

- `README` §4.2 describía `ProgressionManager.getShopCatalog()` / `purchaseUpgrade()` →
  API **eliminada** (0 ocurrencias en `src/`; hoy `ActiveSessionBridge` +
  `PurchaseSessionUpgradeUseCase`).
- `README` §5 marcaba `CryptoRandomProvider` como "pendiente" → **implementado**
  (`main.ts:52`).
- `README` §13.1 decía "6 mazos" → hay **10** (ids en `DeckSetups.ts`).
- `README` §14.2 decía "57 claves i18n" → había **142** (284 líneas de clave ÷ 2 idiomas);
  con el guard de compra por ads (mismo día) son **143** (286 ÷ 2) — con el reembolso por
  fallo ambiental (2026-10-01, `RESULT_AD_REFUNDED`) **144** (288 ÷ 2), con la enmienda
  ADR-006 (2026-10-01, `RESULT_AD_COOLDOWN`) **145** (290 ÷ 2) y con ADR-007
  (2026-10-02, `AD_OVERLAY_TITLE`/`AD_OVERLAY_HINT`/`AD_OVERLAY_HINT_MIDGAME`) **148**
  (296 ÷ 2 — hoy el valor vigente, medido en `LanguageData.ts`).
- `README` daba el evento `UpgradePurchased` por vivo → **nunca se emite**.
- El árbol de directorios del `README` nombraba `Money`, `EnergyBar`, `Upgrade` → no
  existen (ADR-002).
- `README` §7 listaba "escena de menú principal" como pendiente → `MainMenuScene`
  existe; §8 decía "agregar mejora en `Upgrade.ts` / `UPGRADE_CATALOG`" → ni el archivo
  ni el símbolo existen (hoy `SessionUpgradeCatalog.ts` / `SESSION_UPGRADE_CATALOG`).
- `README` §3 presentaba como "catálogo actual" el viejo catálogo persistente
  (Blindaje/Negociador/Tanque de Reserva, `startingEnergyBonus`) → el catálogo real son
  **8 mejoras de sesión**; `startingEnergyBonus` es código muerto (§3 arriba).
- `README` §14.2 decía "migración de escenas a i18n pendiente" → migrada (ya contradicha
  por la §15 del propio README).

**Queda abierto:** ninguno sobre el `README`. Toda deriva nueva detectada se anota acá.

---

## 5. Trampas de entorno / tooling

- **`npm run typecheck` ahora sí cubre los specs** (desde `fa036a3`). Antes podías dejar
  "todo verde" con los specs rotos.
- **`tsconfig` tiene `noUnusedLocals` + `noUnusedParameters` + `noImplicitReturns`**:
  los switches sobre uniones son exhaustivos por compilación — no les agregues `default`
  que oculte un caso nuevo.
- **Jest corre con `testEnvironment: 'node'`** → no hay `window`/`localStorage` reales.
  Quien necesite storage debe instalar el fake local (ver `LanguageManager.spec.ts` y
  `installStorage()` en `LocalStorageRecordsRepositories.spec.ts`).
- **Los specs no están en el `include` de Vite** (no afectan el bundle), pero sí en `tsc`.
- **`public/assets/` pesa 18 MB** con ~104 archivos; al reemplazar texturas usar
  `removeTextureIfExists()` antes (regla de `AGENTS.md`) o Phaser reusa la vieja.
- **`npm audit` (2026-09-30)**: `npm audit fix` resolvió las 2 high de `brace-expansion`
  (solo `package-lock.json`; suite verde después — 38/429 en ese momento). **Quedan** `esbuild`/`vite`
  (moderate + high): su único fix es `vite@8.3.1` = breaking change — decisión explícita
  pendiente del usuario.
- **Phaser `SceneManager`: `add()` se defiere, `start()` no** (bug del 2026-10-04,
  ADR-007 enmienda): con `isProcessing === true`, `add()` va a `_pending` (aún no
  registra) mientras `start()` consulta `getScene` **síncrono** → `Scene key not found`
  → promise del presenter colgada → watchdog 15 s → cooldown. La pareja `add()`+`start()`
  en el mismo tick es una carrera; solo se ve en el **primer** uso de la sesión (al frame
  siguiente `processQueue()` ya registró la escena). Por eso `AdOverlayScene` está en el
  `config.scene` de `main.ts` (dormida) y `presentAdOverlay()` solo hace `start()` con
  degradación en 0 s. No registres escenas en runtime con esa pareja.
- **Git**: historial de 8 commits con mensajes `DOND_BETA.x.y.z`; `main` local va adelante
  de `origin/main`. `speculation-game.zip` no está en `.gitignore`.

---

## 6. Estilo que este repo espera

- Comentarios en **español**, narrando la **causa raíz**, con marca `BUGFIX (ticket)` y a
  veces nombre de bug (`bug_deal_modal_reveal`, `bug_card_focus`).
- **No hay TODO/FIXME/HACK**: la deuda se documenta en prosa (`PLAYBOOK.md`, ADRs, `docs/LOG.md`). No introduzcas markers.
- Exports nombrados (la única excepción es `languageManager`, default export).
- Tipado explícito en firmas (`: void`, `: Promise<AdResult>`), `readonly` donde se pueda,
  uniones discriminadas para resultados, `as const` + `satisfies` en i18n.
- Casts a `any` solo en la frontera Phaser/SDK (con `as unknown as`); `no-explicit-any` es warning.
- i18n obligatoria: **cero strings visibles hardcodeados**. Clave nueva → `LanguageData.ts`
  en `en` **y** `es`.
