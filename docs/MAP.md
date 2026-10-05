# MAPA del código

> Inventario por archivo: líneas, si tiene spec, y **peligrosidad**.
> Peligrosidad = qué tan fácil es romper algo sin que los tests lo atrapen:
> 🔴 alto (sin tests / lógica oculta / mucha superficie) · 🟡 medio · 🟢 bajo (lógica pura con spec).
>
> Fecha del censo: 2026-10-04 (cierre de la **unidad A1 — ADR-008**, `VITE_FULLSCREEN`;
> los cierres previos del mismo día fueron la enmienda ADR-007 y la unidad ADR-007
> del 2026-10-02) ·
> **162 archivos TS · 23.775 líneas · 117 fuente + 45 specs**
> (LOC = conteo de líneas por archivo, **incluyen specs** — en los cierres previos no corrieron
> `cloc` ni `wc -l` (el total de entonces se derivó del censo previo **21.806** + deltas uno a
> uno) —, mientras el cierre A1 del 2026-10-04 sí midió con `wc -l`; el detalle histórico: **+1.403** de los 10 archivos nuevos + **119** de
> `main.ts` (214→333) + **16** de
> `LanguageData` (451→467); el resto conserva su LOC del censo previo (al re-contarlos con
> `wc -l` algunas escenas dan **±1 L**: diferencia `wc -l` vs conteo de líneas, sin
> cambios reales atribuibles a esas unidades); Fase 4: +`GamePenalties.ts`/`.spec`; Fase 4 parte 2: +`CaseValues.spec.ts` y
> +`SessionUpgradeCatalog.spec.ts`; cierre anterior: +`ListAvailableUpgradesUseCase.ts`/`.spec`;
> este cierre: **10 archivos nuevos** — `vite-env.d.ts`,
> `infrastructure/config/resolveAdsMode.ts`/`.spec`,
> `infrastructure/services/RewardCooldownTracker.ts`/`.spec`,
> `infrastructure/services/OwnRewardedAdService.ts`/`.spec`,
> `presentation/scenes/AdOverlayScene.ts` + `AdOverlayScene.resolution.ts`/`.spec` +
> `AdOverlayScene.spec.ts`
> — y **crecieron** `main.ts` y `LanguageData.ts`).
> Cierre 2026-10-04 (enmienda ADR-007 — bugfix de la carrera `add`/`start`): +1 spec
> `presentation/scenes/AdOverlayScene.spec.ts` (123 L) → 159 archivos / 43 specs;
> `AdOverlayScene.ts` **275 → 301** (+26) y `main.ts` **333 → 348** (+15) → total 23.508).
> **Cierre A1 2026-10-04 (ADR-008 — botón fullscreen propio, CG-PUB-002):** +3 archivos
> — `infrastructure/config/resolveFullscreenEnabled.ts` (70 L) + `.spec.ts` (71 L) y
> `presentation/components/SoundFullscreenControls.spec.ts` (107 L) = **+248 L** — y
> crecieron `main.ts` **348 → 353** (+5), `GameServices.ts` **44 → 49** (+5),
> `vite-env.d.ts` **28 → 37** (+9); las 4 escenas con el call site nuevo
> (`MainMenuScene` 582, `HowToPlayScene` 868, `DeckSelectionScene` 490, `UIScene` 507)
> **sin cambio de LOC** → 162 archivos / 45 specs / 23.775 L (medido con `wc -l`;
> del total de la sección `presentation/` salen **+112**: el spec nuevo 107 + `GameServices` 5).
> Fuera del censo TS: `.opencode/agents/ads-adapter.md` 74 L y
> `.opencode/commands/ads-adapter.md` 16 L (la tool `/ads-adapter` ahora escribe el par
> de envs `VITE_ADS` + `VITE_FULLSCREEN`).
> Actualizar este archivo cuando se agreguen/eliminen archivos relevantes (entrada en `LOG.md`).

---

## `src/domain/` — 4.137 líneas · 16 specs · la capa más protegida 🟢

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
| `ports/*.ts` (8 archivos) | 317 | — | Interfaces; contratos documentados con JSDoc (`IProgressionService.awardGameplayCoins` incluye reembolsos; `ICrazyGamesService.rewardedAdStatus()` define la **política de 2 grupos** del reembolso, ADR-006). |

---

## `src/application/` — 3.264 líneas · 12 specs · casi toda verde 🟢

| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `use-cases/PurchaseSessionUpgradeUseCase.ts` | 184 | ✅ 438 L | Cobra + aplica efecto; delega en `SessionUpgrades` (`isOwned`/`canPurchase`) — Fase 4: los 2 switches privados de reglas se movieron al dominio, queda solo el switch de efectos/eventos. **Guard de ads**: 4.º parámetro `ICrazyGamesService`; rechaza `ads_unavailable` sin `spendCoins` cuando `requiresRewardedAd` y no hay rewarded disponible (después de `conflicting_upgrade`/`not_applicable`). **Exhaustividad**: guarda `const exhaustive: never = upgradeId` al final de `applyEffect` (2026-10-01) + spec `it.each` que recorre los ids del catálogo (36 tests). 🟡 |
| `use-cases/OpenCardUseCase.ts` | 94 | ✅ 288 L | Cascada de prioridades de outcome. **Orden es contrato.** Penalidad de derrota desde `GamePenalties`. 🟡 |
| `use-cases/ReviveWithAdUseCase.ts` | 143 | ✅ 515 L | Orden: consumir revive → revivir. Política por **`rewardedAdStatus()`** (ADR-006 enmendado): `sdk_unavailable`/`adblock`/`cooldown_no_fill` → reembolso único (`'refunded'`, invariante XOR); `cooldown_retryable` → `'ads_cooldown'` sin reembolso y sin tocar `refunded`; sin puerto de progresión devuelve el motivo real `'sdk_unavailable'`. 🟡 |
| `use-cases/MultiplyRewardUseCase.ts` | 130 | ✅ 392 L | Flag `isProcessing` sincrónico (carrera de doble click). Misma política por **`rewardedAdStatus()`** (2 grupos, ADR-006); **precondición**: no recibe la sesión, la tenencia de la mejora la garantiza presentación (JSDoc). |
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

## `src/infrastructure/` — 3.292 líneas · 8 specs · zona de riesgo medio 🟡

| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `services/CrazyGamesService.ts` | 408 | ✅ 252 L | Init memoizado, ads single-flight, timeouts 15 s/120 s, `AdResult` nunca lanza. **`rewardedAdStatus()`** clasifica el cooldown por MOTIVO (`cooldown_no_fill` vs `cooldown_retryable`) — define la política de reembolso (ADR-006). **Desde ADR-007:** el cooldown de 60 s lo delega en `RewardCooldownTracker` (fuente única) y el `<script>` del SDK ya no lo pone `index.html` — la inyección es dinámica desde `main.ts`, solo en modo `crazygames`. |
| `services/OwnRewardedAdService.ts` | 310 | ✅ 338 L | **Adapter propio** (ADR-007, `VITE_ADS=portal`): pide el overlay al presenter inyectado (`AdOverlayScene`, desde presentation); status solo `available`/`cooldown_*` (nunca `adblock`/`sdk_unavailable`); ✕ → `user_cancelled` honesto → `cooldown_retryable`; **watchdog 15 s** (presenter colgado → `'error'` retryable y resultado tardío descartado); midgame sin tocar el tracker; `getUserLocale()` → `navigator.language`; telemetría no-op. |
| `services/RewardCooldownTracker.ts` | 86 | ✅ 101 L | **Fuente única del cooldown de 60 s** con motivo (`no_fill`/`other` → `cooldown_no_fill`/`cooldown_retryable`), extraído de `CrazyGamesService` para que los 2 adapters produzcan estados idénticos (ADR-006/007). Reloj inyectable; nunca lanza. 🟢 |
| `config/resolveAdsMode.ts` | 83 | ✅ 66 L | `VITE_ADS` → modo efectivo: **estricto** — solo los 3 literales exactos (espacios/mayúsculas/typos → default `crazygames` + `console.warn`; `undefined`/vacío → default sin warn). Espejo por construcción del gate plegable de `main.ts` (ADR-007). 🟢 |
| `config/resolveFullscreenEnabled.ts` | 70 | ✅ 71 L | `VITE_FULLSCREEN` + `adsMode` → booleano del botón fullscreen propio (**pareja invariante de `VITE_ADS`**, ADR-008): default seguro `false` sin env/basura; en `crazygames` **siempre** `false` aunque el env diga `'true'` (se ignora + `console.warn` — la plataforma prohíbe el botón, CG-PUB-002); en `portal`/`none` solo los literales exactos `'true'`/`'false'` (cualquier variante → `false` + warn con el crudo). El flag sale de `main.ts` en el bag `GameServices.fullscreenEnabled` — presentation no lee env directo. 🟢 |
| `persistence/LocalStorageProgressionRepository.ts` | 165 | ❌ | **Sin spec directo.** Migración v3→v4. Bloque de comentarios con merge artifact (L17-28). 🔴 |
| `persistence/ProgressionManager.ts` | 152 | ✅ 246 L | Fachada de meta-progresión + eventos. |
| `audio/AudioService.ts` | 231 | ❌ | **Sin spec ni fake.** Anclado a `Phaser.Game`. `preload()` muerto con path erróneo. 🔴 |
| `persistence/LocalStorageOnboardingRepository.ts` | 75 | ✅ | — |
| `persistence/LocalStorageRecordsRepository.ts` | 46 | ✅ (compartido) | `gamesPlayed` se recalcula = wins+losses. |
| `persistence/LocalStorageDailyChallengeRepository.ts` | 43 | ✅ (compartido) | — |
| `services/CryptoRandomProvider.ts` | 57 | ❌ | Muestreo por rechazo con `crypto.getRandomValues`. |
| `persistence/jsonStorage.ts` | 36 | ❌ | Helper tolerante a fallos; **solo lo usan Records y Daily** (Progression/Onboarding tienen try/catch propio). |
| `audio/AudioData.ts` | 36 | ❌ | Manifiesto: 1 música + 2 sfx. |
| `testing/*` (6 archivos) | 259 | — | Fakes — ver `docs/testing.md` (`FakeCrazyGamesService.setRewardedStatus()` simula cada `RewardedAdStatus`). |

---

## `src/presentation/` — 11.438 líneas · 4 specs · **zona más frágil** 🔴

### Puntos calientes (mayor riesgo al tocar)
| Archivo | LOC | Spec | Por qué es peligroso |
|---|---|---|---|
| `controllers/GameSceneController.ts` | 624 | ❌ | Switch `handleEvent()` de ~250 líneas / 14 casos: timers mágicos (1800/1600/750/2600 ms), launches de escena, flags anti-cheat. Constructor de **14 parámetros posicionales**. |
| `scenes/GameScene.ts` | 610 | ❌ | Composition root de la partida (37 imports) + layout + decisión de producto. Cablea el puerto de ads al use-case de compra. |
| `scenes/ShopScene.ts` | 771 | ❌ | `upgradeStatusFor()` (~32 L) delega en `SessionUpgrades.getState()`; la lista visible la pide a `listAvailableUpgrades` (la aplicación decide qué filtra — la escena no consulta `isRewardedAdAvailable`); mensajes temporales de fila vía `showTemporaryRowMessage` (conflicto Duplicar/Triplicar y ads caídos, sin timer duplicado); compra de mazos sin use-case. |
| `scenes/HowToPlayScene.ts` | 868 | ❌ | Bulk en `TUTORIAL_SLIDES` (declarativo → riesgo bajo pese al tamaño). |
| `scenes/MainMenuScene.ts` | 582 | ❌ | Layout + selector de idioma + `resetAllProgress()` destructivo. |
| `scenes/UIScene.ts` | 507 | ❌ | 3 modales, aplica penalidad vía `GamePenalties`, único `setInterval`-like (timer de 30 s del bono). |
| `scenes/ResultScene.ts` | 554 | ❌ | Flujos de rewarded/midgame ad; guarda botones en el registry. Reembolso (ADR-006): `'refunded'` → `RESULT_AD_REFUNDED` + `disableActionButton` apaga Duplicar/Triplicar/Revivir; `'ads_cooldown'` → `RESULT_AD_COOLDOWN` y **NO** apaga (reintento a los 60 s). |
| `scenes/DeckSelectionScene.ts` | 490 | ❌ | Grilla + preview + re-lanzamiento de `PreloadScene`. |
| `scenes/AdOverlayScene.ts` (+ `.resolution.ts`) | 301 + 70 | ✅ 123 + 46 L | **Overlay del anuncio propio** (ADR-007, solo `VITE_ADS=portal`): countdown 3 s con timer de escena, ✕ cancela, backdrop bloqueador, pausa `GameScene` mientras dura, failsafes `SHUTDOWN`/`DESTROY` (la promise nunca se cuelga). **Registrada en el `config.scene` de `main.ts` (última de la lista — se dibuja arriba de todo; ADR-007 enmienda 2026-10-04); `presentAdOverlay()` — la función **presenter** que `main.ts` inyecta al adapter, inversión de dependencia: infrastructure no importa presentation — solo pide el `start` y degrada en 0 s con `{ completed: false }` si la escena faltara** (BUGFIX: la pareja `scene.add()`+`scene.start()` en runtime era una carrera con la cola de Phaser — primer ad de la sesión → `Scene key not found` → watchdog 15 s). La resolución single-shot vive en `.resolution.ts` (lógica pura); la escena además tiene `.spec.ts` (3 tests, mock de `'phaser'` en node — incluye la degradación red→verde). Paleta/chrome copiados de Shop/HowToPlay (PLAYBOOK §1). |

### Componentes (los "tontos" — ✅ cumplen la regla)
`BankerOfferPanel` 305 · `CardView` 294 (color/valor derivan de `isHighCaseValue` del
dominio) ·
`PeriodicBonusModal` 272 · `HudIconButton` 263 · `SwapEventModal` 241 ·
`EnergyBarView` 248 (relleno/label/pulso derivan de `EnergyLevel.getEnergyZone`; la vista
solo traduce zona → color) · `SoundFullscreenControls` 212 (✅ **spec 107 L** con 4 tests desde ADR-008: default `false` del 3.er argumento, botón solo con `true` + fullscreen disponible, sin botón muerto en iOS/iframe) ·
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
| `GameServices.ts` | 49 | Service locator (bag con `listAvailableUpgrades` y **`fullscreenEnabled`**, ADR-008). **Única importación de infrastructure desde presentation.** |
| `GameMode.ts` | 35 | Payload consume-una-vez en registry (por `restart()` de Phaser). |
| `PenaltyFreeProgression.ts` | 20 | Proxy que anula `applyLossPenalty` (Desafío Diario). |
| `ActiveSessionBridge.ts` | 34 | Única pieza que expone `GameSession` + use-case a otra escena. |
| `scenes/GameScene.types.ts` | 12 | **Muerto** (referencia a `CaseSelectionScene` inexistente). |
| `scenes/ResultScene.types.ts` | 17 | Payload tipado de `ResultScene`. |

---

## `src/shared/` — 1.254 líneas · 5 specs 🟢

| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `i18n/LanguageData.ts` | 467 | ✅ | **148 claves × en/es** (2026-10-01: +`RESULT_AD_REFUNDED` y +`RESULT_AD_COOLDOWN`; 2026-10-02 ADR-007: +`AD_OVERLAY_TITLE`, +`AD_OVERLAY_HINT`, +`AD_OVERLAY_HINT_MIDGAME`), `as const` + `satisfies` → autocomplete de claves. |
| `i18n/LanguageManager.ts` | 238 | ✅ 284 L | Singleton (único `export default`). Fallback: activo → default → clave. |
| `utils/CompactScreen.ts` | 65 | ✅ | Detección de layout compacto. |
| `utils/EventEmitter.ts` | 24 | ❌ | `SimpleEventEmitter<T>` de 24 líneas — sin test, pero es el corazón de los 2 buses. |
| `utils/TimeFormat.ts` · `NewGameConfirmation.ts` | 14+14 | ✅ | Helpers puros. |
| `types/common.ts` | 3 | — | — |

---

## Raíz

| Archivo | Nota |
|---|---|
| `main.ts` (353) | Composition root global (incluye `ListAvailableUpgradesUseCase`) + **lista `scene` de 10 escenas**, con `AdOverlayScene` **al final** (dormida hasta su primer `start()`, ADR-007 enmienda 2026-10-04) + **selección del adapter de ads por `VITE_ADS`** vía `resolveAdsMode()` (ADR-007: `crazygames`/`portal`/`none`; en `portal` inyecta el presenter del overlay) + **resolución del botón fullscreen propio** `resolveFullscreenEnabled(VITE_FULLSCREEN, adsMode)` → campo `fullscreenEnabled` del bag (ADR-008: el modo manda, default `false`) + **carga dinámica** del SDK de CrazyGames (`loadCrazyGamesSdk()`, solo modo `crazygames`; el `<script>` salió de `index.html`) + `beforeunload` (gameplayStop + penalidad de abandono con `LOSS_PENALTY_AMOUNT`). |
| `vite-env.d.ts` (37) | Tipos de `import.meta.env` con `VITE_ADS?: 'crazygames' \| 'portal' \| 'none'` y `VITE_FULLSCREEN?: 'true' \| 'false'` — **sin lógica** (la validación vive en `resolveAdsMode.ts` y `resolveFullscreenEnabled.ts`, ADR-007/008). Script global a propósito (fusión con `vite/client`). |
| `index.html` | **Ya NO carga el SDK** (desde ADR-007 el `<script>` de CrazyGames salió de acá — ver `loadCrazyGamesSdk()` en `main.ts`) + overlay "gira el dispositivo". |
| `vite.config.ts` | `base: './'`, esbuild (no terser), `manualChunks` → `phaser-vendor`. |
| `jest.config.js` | `ts-jest`, `node` env, umbrales de cobertura **por capa** (Fase 4): `domain/` 88/80/90/88 y `application/` 88/82/90/88 (stmts/branches/functions/lines). |
| `tsconfig.json` | `strict` + `noUnused*` + `noImplicitReturns`; **incluye specs** desde la Fase 0. |
| `eslint.config.mjs` | Config mínima (9 reglas). Ver comentarios del archivo antes de agregar reglas. |
