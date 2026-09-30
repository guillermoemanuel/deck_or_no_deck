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

### 🔁 Paleta de colores repetida en ≥10 archivos
`COLOR_GOLD = 0xffd76a`, `COLOR_GOLD_DIM = 0xd4af37`, `FONT_FAMILY = 'Georgia, …'`
aparecen en `GameSceneController`, `UIScene`, `ResultScene`, `MainMenuScene`,
`BankerOfferPanel`, `ConfirmDialog`, `DailyChallengeBanner`, `ShopScene`,
`DeckSelectionScene`, `HowToPlayScene`.
**Drift ya ocurrido:** `COLOR_PANEL_BG` = `0x0a0e17` en 5 archivos pero `0x0a0f1d` en `ResultScene`.

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

### 🔁 Premio pagado por 4 dueños distintos
`awardGameplayCoins(prize)` aparece en `OpenCardUseCase`, `ResolveDealUseCase`,
`SwapFinalSecretCardUseCase` y `ReviveWithAdUseCase`. Hoy es consistente.

### 🔁 Fábrica de sesión duplicada
`GameSessionFactory.createGameSessionWithSelection` reimplementa línea por línea
`DeckManager.fromValuesWithSelection` (mismo loop, mismos `card_${idx}`).

### 🔁 Specs con `buildSession()` propio
Cada spec de use-case arma su sesión a mano en vez de reusar la factory
(hay hasta un hack `values[0] === 100000 ? { drainFor: () => 100 } : …` en
`OpenCardUseCase.spec.ts`).

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

---

## 3. Código muerto (no "arreglar" sin confirmar intención)

| Qué | Dónde | Señal |
|---|---|---|
| `GameStateDTO` / `GameStateMapper.toDTO` | `application/dto/GameStateDTO.ts` | sin llamadas en producción; arrastra `GameSession.getCardsOpenedCount()` |
| `GameEvent.SecretCardChosen` | `domain/events/GameEvents.ts` | declarado, ni emisor ni consumidor |
| `ProgressionEvent.UpgradePurchased` | `domain/events/ProgressionEvents.ts` | idem; el README todavía lo describe como vivo |
| `GameStateMachine.start()` / estado `idle` | `domain/state/` | `GameSession` arranca en `'playing'` |
| `AudioService.preload()` | `infrastructure/audio/` | sin llamadas y con path que no existe |
| `GameSceneData` | `presentation/scenes/GameScene.types.ts` | referencia a `CaseSelectionScene`, escena inexistente |
| `GameSession.startingEnergyBonus` | `domain/entities/GameSession.ts` | solo lo pasa su spec (resto del "Tanque de Reserva" viejo) |
| `OfferCalculator.bonusPercentage` (ctor) | `domain/services/` | producción siempre hace `new OfferCalculator()` |
| `DeckManager.fromValues*` | `domain/entities/DeckManager.ts` | solo lo usan specs; producción va por la factory |
| Comentario de penalidad tachado | `UIScene.ts` | legado de la migración a i18n |

---

## 4. Deriva documental detectada (⚠ README vs realidad)

**Corregido en la Fase 2** (reescritura de `AGENTS.md`): `npx vitest` → **Jest**;
`npm run lint` inexistente → **creado en la Fase 0** (`fa036a3`); referencias a `Money`
y `EnergyBar` como entidades de dominio → **no existen** (ADR-002).

**Sigue abierto (`README.md`, doc histórica):**

- `README` §4.2 describe `ProgressionManager.getShopCatalog()` / `purchaseUpgrade()` → API **eliminada**.
- `README` §5 marca `CryptoRandomProvider` como "pendiente" → **implementado**.
- `README` §13.1 dice "6 mazos" → hay **10**.
- `README` §14.2 dice "57 claves i18n" → hay **142**.
- `README` describe el evento `UpgradePurchased` como vivo → **nunca se emite**.
- El árbol de directorios del `README` nombra `Money`, `EnergyBar`, `Upgrade` → no existen (ADR-002).

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
- **3 vulnerabilidades en devDependencies** (`brace-expansion` high ×2 → `npm audit fix`;
  `esbuild`/`vite` moderate → exige Vite 8, breaking). Sin decidir.
- **Git**: historial de 8 commits con mensajes `DOND_BETA.x.y.z`; `main` local va adelante
  de `origin/main`. `speculation-game.zip` no está en `.gitignore`.

---

## 6. Estilo que este repo espera

- Comentarios en **español**, narrando la **causa raíz**, con marca `BUGFIX (ticket)` y a
  veces nombre de bug (`bug_deal_modal_reveal`, `bug_card_focus`).
- **No hay TODO/FIXME/HACK**: la deuda se documenta en prosa (README "Pendientes",
  `PLAYBOOK.md`, ADRs). No introduzcas markers.
- Exports nombrados (la única excepción es `languageManager`, default export).
- Tipado explícito en firmas (`: void`, `: Promise<AdResult>`), `readonly` donde se pueda,
  uniones discriminadas para resultados, `as const` + `satisfies` en i18n.
- Casts a `any` solo en la frontera Phaser/SDK (con `as unknown as`); `no-explicit-any` es warning.
- i18n obligatoria: **cero strings visibles hardcodeados**. Clave nueva → `LanguageData.ts`
  en `en` **y** `es`.
