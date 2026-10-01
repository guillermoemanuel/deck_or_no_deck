# MAPA del código

> Inventario por archivo: líneas, si tiene spec, y **peligrosidad**.
> Peligrosidad = qué tan fácil es romper algo sin que los tests lo atrapen:
> 🔴 alto (sin tests / lógica oculta / mucha superficie) · 🟡 medio · 🟢 bajo (lógica pura con spec).
>
> Fecha del censo: 2026-10-01 (refrescado tras el **cierre de los dos límites aceptados**:
> exhaustividad de `applyEffect` + reembolso por fallo ambiental, y tras la **ampliación
> del alcance del reembolso** mismo día — de nuevo crecieron `MultiplyRewardUseCase.ts`/
> `.spec` y `ReviveWithAdUseCase.ts`/`.spec`) ·
> 148 archivos TS · 21.353 líneas · 110 fuente + 38 specs
> (LOC = `wc -l`, **incluyen specs**; Fase 4: +`GamePenalties.ts`/`.spec`; Fase 4 parte 2:
> +`CaseValues.spec.ts` y +`SessionUpgradeCatalog.spec.ts`; cierre anterior:
> +`ListAvailableUpgradesUseCase.ts`/`.spec`; este cierre: **sin archivos nuevos** —
> solo crecieron `PurchaseSessionUpgradeUseCase`/`.spec`, `MultiplyRewardUseCase`/`.spec`,
> `ReviveWithAdUseCase`/`.spec`, `ResultScene`, `LanguageData`, `SessionUpgradeCatalog`,
> `IProgressionService` y `ListAvailableUpgradesUseCase.spec`).
> Actualizar este archivo cuando se agreguen/eliminen archivos relevantes (entrada en `LOG.md`).

---

## `src/domain/` — 4.108 líneas · 16 specs · la capa más protegida 🟢

### entities/
| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `GameSession.ts` | 282 | ✅ 592 L | Raíz de agregado. Contiene también `DefaultEnergyDrainRule` y la interfaz `EnergyDrainRule`. 🟡 |
| `DeckManager.ts` | 148 | ✅ | Intercambio de roles preservando IDs. Las factories `fromValues*` solo las usa su spec. |
| `SessionUpgrades.ts` | 173 | ✅ 281 L | Flags de sesión + `getState()/isOwned()/canPurchase()`: **las 8 reglas de upgrades viven acá** (UI y use-case delegan). `consumeRevive()` existe por el bug del revive infinito. |
| `DeckCollection.ts` | 78 | ✅ | Colección inmutable de mazos. |
| `Card.ts` | 25 | — (cubierto por DeckManager) | VO, constructor privado + `Card.create()`. |

### value-objects/
| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `DeckSetups.ts` | 217 | ❌ | **10 mazos** con texturas/temas. 🟡 cambiarlo toca `PreloadScene` + registry de efectos. |
| `EnergyDeltaTable.ts` | 64 | ✅ (vía `DefaultEnergyDrainRule.spec`) | Tabla de drenaje + chequeo de integridad al cargar. **Invariante.** |
| `DailyChallenge.ts` | 119 | ✅ 169 L | Reglas del desafío diario. `previewDailyCompletion()` es la vista previa de la recompensa y `completeDaily` delega en ella (test de propiedad). |
| `EnergyLevel.ts` | 104 | ✅ 183 L | VO con clamp `[0, ceiling]` + **zonas de la barra**: `EnergyZone`, `ENERGY_CRITICAL_MAX_PERCENT` (20), `ENERGY_LOW_MAX_PERCENT` (50), `getEnergyZone()` — la vista solo traduce zona → color. |
| `GamePenalties.ts` | 14 | ✅ 20 L | **Fuente única de la penalidad** (`LOSS_PENALTY_AMOUNT` = −5000); la consumen `OpenCardUseCase`, `UIScene` y `main.ts`. |
| `PeriodicBonus.ts` | 65 | ✅ | Bono 12 h; rango `[500…5000]` (el 0 salió en 1.3.1). |
| `PlayerRecords.ts` | 69 | ✅ | Récords personales. |
| `DailyBoard.ts` | 63 | ✅ | Calendario determinista (seed por fecha UTC). |
| `CaseValues.ts` | 35 | ✅ 23 L | Valores posibles de carta + umbral de carta alta (`HIGH_CASE_VALUE_MIN` = 1000, `isHighCaseValue()`) — consumido por `CardView`. |
| `SessionUpgradeCatalog.ts` | 125 | ✅ 55 L | **Costos y conflictos de la tienda** + `requiresRewardedAd` (set de ads con spec; la *disponibilidad* la deciden `ListAvailableUpgradesUseCase` y `PurchaseSessionUpgradeUseCase`) + **`costOf(id)`**: helper único del monto (lo consumen los 3 use-cases de ads y los specs; ADR-006). 🟡 fuente única de precios. |

### services/ · state/ · events/ · ports/
| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `OfferCalculator.ts` | 53 | ✅ 145 L | Fórmula de la oferta + **cap al promedio puro**. Invariante. |
| `Banker.ts` | 46 | ✅ | Cadencia de 3; usa `Date.now()` (única impureza de tiempo en domain). |
| `GameStateMachine.ts` | 81 | ✅ | Guards que lanzan. `start()`/`idle` muertos. |
| `GameEvents.ts` | 38 | — | 17 variantes de `GameEvent`. `SecretCardChosen` muerta. |
| `ProgressionEvents.ts` | 6 | — | 3 variantes. `UpgradePurchased` muerta. |
| `ports/*.ts` (8 archivos) | 288 | — | Interfaces; contratos documentados con JSDoc (`IProgressionService.awardGameplayCoins` incluye reembolsos, ADR-006). |

---

## `src/application/` — 3.017 líneas · 12 specs · casi toda verde 🟢

| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `use-cases/PurchaseSessionUpgradeUseCase.ts` | 184 | ✅ 438 L | Cobra + aplica efecto; delega en `SessionUpgrades` (`isOwned`/`canPurchase`) — Fase 4: los 2 switches privados de reglas se movieron al dominio, queda solo el switch de efectos/eventos. **Guard de ads**: 4.º parámetro `ICrazyGamesService`; rechaza `ads_unavailable` sin `spendCoins` cuando `requiresRewardedAd` y no hay rewarded disponible (después de `conflicting_upgrade`/`not_applicable`). **Exhaustividad**: guarda `const exhaustive: never = upgradeId` al final de `applyEffect` (2026-10-01) + spec `it.each` que recorre los ids del catálogo (36 tests). 🟡 |
| `use-cases/OpenCardUseCase.ts` | 94 | ✅ 288 L | Cascada de prioridades de outcome. **Orden es contrato.** Penalidad de derrota desde `GamePenalties`. 🟡 |
| `use-cases/ReviveWithAdUseCase.ts` | 128 | ✅ 408 L | Orden: consumir revive → revivir. Reembolso si `isRewardedAdAvailable()` es false — SDK ausente / adblock / cooldown 60 s (`'refunded'`, invariante XOR — ADR-006); sin puerto de progresión devuelve el motivo real `'sdk_unavailable'`. 🟡 |
| `use-cases/MultiplyRewardUseCase.ts` | 106 | ✅ 291 L | Flag `isProcessing` sincrónico (carrera de doble click). Reembolso si `isRewardedAdAvailable()` es false — SDK ausente / adblock / cooldown 60 s (`'refunded'`, invariante XOR — ADR-006); **precondición**: no recibe la sesión, la tenencia de la mejora la garantiza presentación (JSDoc). |
| `use-cases/ResolveDealUseCase.ts` | 40 | ✅ | Emite `DealAccepted` **y** `GameWon` (ver ADR-001). |
| `use-cases/SwapFinalSecretCardUseCase.ts` | 37 | ✅ | — |
| `use-cases/SwapSecretCardUseCase.ts` | 29 | ✅ | — |
| `use-cases/ListAvailableUpgradesUseCase.ts` | 29 | ✅ 74 L | **Qué muestra la tienda**: filtra el catálogo por `requiresRewardedAd` según `ICrazyGamesService.isRewardedAdAvailable()`. Comportamiento idéntico al filtro que tenía `ShopScene`; cobertura 100 %. Su contraparte de compra es `PurchaseSessionUpgradeUseCase` (ver arriba). |
| `onboarding/OnboardingFlow.ts` | 104 | ✅ | Acciones show/hide/none por hint. |
| `records/GameResultTracker.ts` | 55 | ✅ | Eventos → un `GameResult` inmutable. |
| `records/GameOutcomeRecorder.ts` | 54 | ✅ | Escribe récords + desafío diario. |
| `factories/GameSessionFactory.ts` | 35 | ✅ | **Duplica** la construcción de `DeckManager.fromValuesWithSelection` (ver PLAYBOOK). |
| `dto/GameStateDTO.ts` | 30 | ❌ | **Código muerto** (`GameStateMapper.toDTO` sin llamadas). |
| `use-cases/testing/collectEvents.ts` | 11 | — | Helper: acumula eventos para asserts. |

---

## `src/infrastructure/` — 2.008 líneas · 4 specs · zona de riesgo medio 🟡

| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `services/CrazyGamesService.ts` | 365 | ✅ 163 L | Init memoizado, ads single-flight, timeouts 15 s/120 s, cooldown 60 s, `AdResult` nunca lanza. |
| `persistence/LocalStorageProgressionRepository.ts` | 165 | ❌ | **Sin spec directo.** Migración v3→v4. Bloque de comentarios con merge artifact (L17-28). 🔴 |
| `persistence/ProgressionManager.ts` | 152 | ✅ 246 L | Fachada de meta-progresión + eventos. |
| `audio/AudioService.ts` | 231 | ❌ | **Sin spec ni fake.** Anclado a `Phaser.Game`. `preload()` muerto con path erróneo. 🔴 |
| `persistence/LocalStorageOnboardingRepository.ts` | 75 | ✅ | — |
| `persistence/LocalStorageRecordsRepository.ts` | 46 | ✅ (compartido) | `gamesPlayed` se recalcula = wins+losses. |
| `persistence/LocalStorageDailyChallengeRepository.ts` | 43 | ✅ (compartido) | — |
| `services/CryptoRandomProvider.ts` | 57 | ❌ | Muestreo por rechazo con `crypto.getRandomValues`. |
| `persistence/jsonStorage.ts` | 36 | ❌ | Helper tolerante a fallos; **solo lo usan Records y Daily** (Progression/Onboarding tienen try/catch propio). |
| `audio/AudioData.ts` | 36 | ❌ | Manifiesto: 1 música + 2 sfx. |
| `testing/*` (5 archivos) | 212 | — | Fakes — ver `docs/testing.md`. |

---

## `src/presentation/` — 10.770 líneas · 1 spec · **zona más frágil** 🔴

### Puntos calientes (mayor riesgo al tocar)
| Archivo | LOC | Spec | Por qué es peligroso |
|---|---|---|---|
| `controllers/GameSceneController.ts` | 624 | ❌ | Switch `handleEvent()` de ~250 líneas / 14 casos: timers mágicos (1800/1600/750/2600 ms), launches de escena, flags anti-cheat. Constructor de **14 parámetros posicionales**. |
| `scenes/GameScene.ts` | 610 | ❌ | Composition root de la partida (37 imports) + layout + decisión de producto. Cablea el puerto de ads al use-case de compra. |
| `scenes/ShopScene.ts` | 771 | ❌ | `upgradeStatusFor()` (~32 L) delega en `SessionUpgrades.getState()`; la lista visible la pide a `listAvailableUpgrades` (la aplicación decide qué filtra — la escena no consulta `isRewardedAdAvailable`); mensajes temporales de fila vía `showTemporaryRowMessage` (conflicto Duplicar/Triplicar y ads caídos, sin timer duplicado); compra de mazos sin use-case. |
| `scenes/HowToPlayScene.ts` | 868 | ❌ | Bulk en `TUTORIAL_SLIDES` (declarativo → riesgo bajo pese al tamaño). |
| `scenes/MainMenuScene.ts` | 582 | ❌ | Layout + selector de idioma + `resetAllProgress()` destructivo. |
| `scenes/UIScene.ts` | 507 | ❌ | 3 modales, aplica penalidad vía `GamePenalties`, único `setInterval`-like (timer de 30 s del bono). |
| `scenes/ResultScene.ts` | 538 | ❌ | Flujos de rewarded/midgame ad; guarda botones en el registry. Reembolso (ADR-006): `RESULT_AD_REFUNDED` + `disableActionButton` apaga Duplicar/Triplicar/Revivir al recibir `'refunded'`. |
| `scenes/DeckSelectionScene.ts` | 490 | ❌ | Grilla + preview + re-lanzamiento de `PreloadScene`. |

### Componentes (los "tontos" — ✅ cumplen la regla)
`BankerOfferPanel` 305 · `CardView` 294 (color/valor derivan de `isHighCaseValue` del
dominio) ·
`PeriodicBonusModal` 272 · `HudIconButton` 263 · `SwapEventModal` 241 ·
`EnergyBarView` 248 (relleno/label/pulso derivan de `EnergyLevel.getEnergyZone`; la vista
solo traduce zona → color) · `SoundFullscreenControls` 212 ·
`OnboardingCoach` 200 · `ConfirmDialog` 165 · `DailyChallengeBanner` 121 (usa
`previewDailyCompletion` del dominio) ·
`PayoutBoardView` 129 · `ParticleManager` 97 · `LocalizedText` 78 (auto-suscripción).

### Efectos de celebración de mazo (~2.760 líneas, 15 archivos)
`DeckCelebrationEffect` (interfaz + spec) · `DeckCelebrationEffectRegistry` (`Record` exhaustivo:
agregar un mazo **sin** registrar su efecto no compila) · 10 efectos temáticos
(`VegasRoulette` 379, `GlacierShatter` 296, `WW2Combat` 283, `MedievalSiege` 236,
`BatSwarm` 220, `TarotAura` 190, `EgyptSandstorm` 181, `CyberpunkMatrixRain` 180,
`TheaterSpotlights` 177, `OvniAbduction` 146) · `SpotlightSweep` 103 · `NullCelebrationEffect`.

### Bridges / utilidades de presentación
| Archivo | LOC | Nota |
|---|---|---|
| `GameAbandonGuard.ts` | 58 | Flag anti-cheat compartido con `beforeunload`. **Ya no contiene la penalidad**: `LOSS_PENALTY_AMOUNT` vive en `domain/value-objects/GamePenalties.ts` (Fase 4). |
| `mobile/CompactTextFloor.ts` | 50 | Piso de tamaño de fuente en móvil. |
| `GameServices.ts` | 44 | Service locator (bag con `listAvailableUpgrades`). **Única importación de infrastructure desde presentation.** |
| `GameMode.ts` | 35 | Payload consume-una-vez en registry (por `restart()` de Phaser). |
| `PenaltyFreeProgression.ts` | 20 | Proxy que anula `applyLossPenalty` (Desafío Diario). |
| `ActiveSessionBridge.ts` | 34 | Única pieza que expone `GameSession` + use-case a otra escena. |
| `scenes/GameScene.types.ts` | 12 | **Muerto** (referencia a `CaseSelectionScene` inexistente). |
| `scenes/ResultScene.types.ts` | 17 | Payload tipado de `ResultScene`. |

---

## `src/shared/` — 1.236 líneas · 5 specs 🟢

| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `i18n/LanguageData.ts` | 449 | ✅ | **144 claves × en/es** (2026-10-01: +`RESULT_AD_REFUNDED`), `as const` + `satisfies` → autocomplete de claves. |
| `i18n/LanguageManager.ts` | 238 | ✅ 284 L | Singleton (único `export default`). Fallback: activo → default → clave. |
| `utils/CompactScreen.ts` | 65 | ✅ | Detección de layout compacto. |
| `utils/EventEmitter.ts` | 24 | ❌ | `SimpleEventEmitter<T>` de 24 líneas — sin test, pero es el corazón de los 2 buses. |
| `utils/TimeFormat.ts` · `NewGameConfirmation.ts` | 14+14 | ✅ | Helpers puros. |
| `types/common.ts` | 3 | — | — |

---

## Raíz

| Archivo | Nota |
|---|---|
| `main.ts` (214) | Composition root global (incluye `ListAvailableUpgradesUseCase`) + `beforeunload` (gameplayStop + penalidad de abandono con `LOSS_PENALTY_AMOUNT`). |
| `index.html` | Carga **síncrona** del SDK v3 en `<head>` (sin eso `isAvailable()` es siempre false) + overlay "gira el dispositivo". |
| `vite.config.ts` | `base: './'`, esbuild (no terser), `manualChunks` → `phaser-vendor`. |
| `jest.config.js` | `ts-jest`, `node` env, umbrales de cobertura **por capa** (Fase 4): `domain/` 88/80/90/88 y `application/` 88/82/90/88 (stmts/branches/functions/lines). |
| `tsconfig.json` | `strict` + `noUnused*` + `noImplicitReturns`; **incluye specs** desde la Fase 0. |
| `eslint.config.mjs` | Config mínima (9 reglas). Ver comentarios del archivo antes de agregar reglas. |
