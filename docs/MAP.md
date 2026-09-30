# MAPA del código

> Inventario por archivo: líneas, si tiene spec, y **peligrosidad**.
> Peligrosidad = qué tan fácil es romper algo sin que los tests lo atrapen:
> 🔴 alto (sin tests / lógica oculta / mucha superficie) · 🟡 medio · 🟢 bajo (lógica pura con spec).
>
> Fecha del censo: 2026-09-30 · 142 archivos TS · ~20.000 líneas · 108 fuente + 34 specs.
> Actualizar este archivo cuando se agreguen/eliminen archivos relevantes (entrada en `LOG.md`).

---

## `src/domain/` — 1.985 líneas · 13 specs · la capa más protegida 🟢

### entities/
| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `GameSession.ts` | 282 | ✅ 592 L | Raíz de agregado. Contiene también `DefaultEnergyDrainRule` y la interfaz `EnergyDrainRule`. 🟡 |
| `DeckManager.ts` | 148 | ✅ | Intercambio de roles preservando IDs. Las factories `fromValues*` solo las usa su spec. |
| `SessionUpgrades.ts` | 104 | ✅ | Flags de sesión; `consumeRevive()` existe por el bug del revive infinito. |
| `DeckCollection.ts` | 78 | ✅ | Colección inmutable de mazos. |
| `Card.ts` | 25 | — (cubierto por DeckManager) | VO, constructor privado + `Card.create()`. |

### value-objects/
| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `DeckSetups.ts` | 217 | ❌ | **10 mazos** con texturas/temas. 🟡 cambiarlo toca `PreloadScene` + registry de efectos. |
| `EnergyDeltaTable.ts` | 64 | ✅ (vía `DefaultEnergyDrainRule.spec`) | Tabla de drenaje + chequeo de integridad al cargar. **Invariante.** |
| `DailyChallenge.ts` | 112 | ✅ | Reglas del desafío diario. |
| `EnergyLevel.ts` | 75 | ✅ | VO con clamp `[0, ceiling]`. |
| `PeriodicBonus.ts` | 65 | ✅ | Bono 12 h; rango `[500…5000]` (el 0 salió en 1.3.1). |
| `PlayerRecords.ts` | 69 | ✅ | Récords personales. |
| `DailyBoard.ts` | 63 | ✅ | Calendario determinista (seed por fecha UTC). |
| `CaseValues.ts` | 23 | — | Valores posibles de carta. |
| `SessionUpgradeCatalog.ts` | 96 | ❌ | **Costos y conflictos de la tienda.** 🟡 fuente única de precios. |

### services/ · state/ · events/ · ports/
| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `OfferCalculator.ts` | 53 | ✅ 145 L | Fórmula de la oferta + **cap al promedio puro**. Invariante. |
| `Banker.ts` | 46 | ✅ | Cadencia de 3; usa `Date.now()` (única impureza de tiempo en domain). |
| `GameStateMachine.ts` | 81 | ✅ | Guards que lanzan. `start()`/`idle` muertos. |
| `GameEvents.ts` | 38 | — | 17 variantes de `GameEvent`. `SecretCardChosen` muerta. |
| `ProgressionEvents.ts` | 6 | — | 3 variantes. `UpgradePurchased` muerta. |
| `ports/*.ts` (8 archivos) | 285 | — | Interfaces; contratos documentados con JSDoc. |

---

## `src/application/` — 1.655 líneas · 11 specs · casi toda verde 🟢

| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `use-cases/PurchaseSessionUpgradeUseCase.ts` | 168 | ✅ 306 L | 3 switches paralelos sobre `SessionUpgradeId` + conflictos. 🟡 |
| `use-cases/OpenCardUseCase.ts` | 92 | ✅ 288 L | Cascada de prioridades de outcome. **Orden es contrato.** 🟡 |
| `use-cases/ReviveWithAdUseCase.ts` | 79 | ✅ | Orden: consumir revive → revivir. |
| `use-cases/MultiplyRewardUseCase.ts` | 59 | ✅ | Flag `isProcessing` sincrónico (carrera de doble click). |
| `use-cases/ResolveDealUseCase.ts` | 40 | ✅ | Emite `DealAccepted` **y** `GameWon` (ver ADR-001). |
| `use-cases/SwapFinalSecretCardUseCase.ts` | 37 | ✅ | — |
| `use-cases/SwapSecretCardUseCase.ts` | 29 | ✅ | — |
| `onboarding/OnboardingFlow.ts` | 104 | ✅ | Acciones show/hide/none por hint. |
| `records/GameResultTracker.ts` | 55 | ✅ | Eventos → un `GameResult` inmutable. |
| `records/GameOutcomeRecorder.ts` | 54 | ✅ | Escribe récords + desafío diario. |
| `factories/GameSessionFactory.ts` | 35 | ✅ | **Duplica** la construcción de `DeckManager.fromValuesWithSelection` (ver PLAYBOOK). |
| `dto/GameStateDTO.ts` | 30 | ❌ | **Código muerto** (`GameStateMapper.toDTO` sin llamadas). |
| `use-cases/testing/collectEvents.ts` | 11 | — | Helper: acumula eventos para asserts. |

---

## `src/infrastructure/` — 1.567 líneas · 4 specs · zona de riesgo medio 🟡

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

## `src/presentation/` — 10.700 líneas · 1 spec · **zona más frágil** 🔴

### Puntos calientes (mayor riesgo al tocar)
| Archivo | LOC | Spec | Por qué es peligroso |
|---|---|---|---|
| `controllers/GameSceneController.ts` | 624 | ❌ | Switch `handleEvent()` de ~250 líneas / 14 casos: timers mágicos (1800/1600/750/2600 ms), launches de escena, flags anti-cheat. Constructor de **14 parámetros posicionales**. |
| `scenes/GameScene.ts` | 607 | ❌ | Composition root de la partida (37 imports) + layout + decisión de producto. |
| `scenes/ShopScene.ts` | 776 | ❌ | `upgradeStatusFor()` reimplementa reglas de dominio; filtra catálogo por disponibilidad de ads; compra de mazos sin use-case. |
| `scenes/HowToPlayScene.ts` | 868 | ❌ | Bulk en `TUTORIAL_SLIDES` (declarativo → riesgo bajo pese al tamaño). |
| `scenes/MainMenuScene.ts` | 582 | ❌ | Layout + selector de idioma + `resetAllProgress()` destructivo. |
| `scenes/UIScene.ts` | 506 | ❌ | 3 modales, aplica penalidad −5000, único `setInterval`-like (timer de 30 s del bono). |
| `scenes/ResultScene.ts` | 483 | ❌ | Flujos de rewarded/midgame ad; guarda botones en el registry. |
| `scenes/DeckSelectionScene.ts` | 490 | ❌ | Grilla + preview + re-lanzamiento de `PreloadScene`. |

### Componentes (los "tontos" — ✅ cumplen la regla)
`BankerOfferPanel` 305 · `CardView` 293 (umbrales de color/valor en la vista ⚠) ·
`PeriodicBonusModal` 272 · `HudIconButton` 263 · `SwapEventModal` 241 ·
`EnergyBarView` 239 (umbrales >50/>20 y pulso crítico ⚠) · `SoundFullscreenControls` 212 ·
`OnboardingCoach` 200 · `ConfirmDialog` 165 · `DailyChallengeBanner` 121 (regla de reward +1 ⚠) ·
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
| `GameAbandonGuard.ts` | 67 | Flag anti-cheat compartido con `beforeunload`. **Contiene `ABANDON_PENALTY_AMOUNT = 5000`** (constante de dominio viviendo en presentación). |
| `mobile/CompactTextFloor.ts` | 50 | Piso de tamaño de fuente en móvil. |
| `GameServices.ts` | 39 | Service locator. **Única importación de infrastructure desde presentation.** |
| `GameMode.ts` | 35 | Payload consume-una-vez en registry (por `restart()` de Phaser). |
| `PenaltyFreeProgression.ts` | 20 | Proxy que anula `applyLossPenalty` (Desafío Diario). |
| `ActiveSessionBridge.ts` | 34 | Única pieza que expone `GameSession` + use-case a otra escena. |
| `scenes/GameScene.types.ts` | 12 | **Muerto** (referencia a `CaseSelectionScene` inexistente). |
| `scenes/ResultScene.types.ts` | 17 | Payload tipado de `ResultScene`. |

---

## `src/shared/` — 1.165 líneas · 5 specs 🟢

| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `i18n/LanguageData.ts` | 445 | ✅ | **142 claves × en/es**, `as const` + `satisfies` → autocomplete de claves. |
| `i18n/LanguageManager.ts` | 238 | ✅ 284 L | Singleton (único `export default`). Fallback: activo → default → clave. |
| `utils/CompactScreen.ts` | 65 | ✅ | Detección de layout compacto. |
| `utils/EventEmitter.ts` | 24 | ❌ | `SimpleEventEmitter<T>` de 24 líneas — sin test, pero es el corazón de los 2 buses. |
| `utils/TimeFormat.ts` · `NewGameConfirmation.ts` | 14+14 | ✅ | Helpers puros. |
| `types/common.ts` | 3 | — | — |

---

## Raíz

| Archivo | Nota |
|---|---|
| `main.ts` (211) | Composition root global + `beforeunload` (gameplayStop + penalidad de abandono). |
| `index.html` | Carga **síncrona** del SDK v3 en `<head>` (sin eso `isAvailable()` es siempre false) + overlay "gira el dispositivo". |
| `vite.config.ts` | `base: './'`, esbuild (no terser), `manualChunks` → `phaser-vendor`. |
| `jest.config.js` | `ts-jest`, `node` env, umbrales de cobertura **solo sobre `src/domain/`** (80/85/85). |
| `tsconfig.json` | `strict` + `noUnused*` + `noImplicitReturns`; **incluye specs** desde la Fase 0. |
| `eslint.config.mjs` | Config mínima (9 reglas). Ver comentarios del archivo antes de agregar reglas. |
