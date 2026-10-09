# MAPA del código

> Inventario por archivo: líneas, si tiene spec, y **peligrosidad**.
> Peligrosidad = qué tan fácil es romper algo sin que los tests lo atrapen:
> 🔴 alto (sin tests / lógica oculta / mucha superficie) · 🟡 medio · 🟢 bajo (lógica pura con spec).
>
> Fecha del censo: 2026-10-09 (cierre **audio SFX — 21 efectos nuevos + base de audio**,
> 3 commits: `52dd63e` base · `aeca320` partida · Commit 3 interfaz sin hash aún) ·
> **188 archivos TS · 128 fuente + 60 specs · 27.924 L — censo COMPLETO medido con
> `wc -l`**: por capa `domain/` **5.126** (20 specs) · `application/` **4.111** (14) ·
> `infrastructure/` **4.167** (11) · `presentation/` **12.634** (9) · `shared/` **1.464**
> (6) · raíz (`main.ts` 385 + `vite-env.d.ts` 37) **422**. Detalle del cierre de audio:
> **+10 archivos** (5 fuente + 5 specs) → de 178 a 188 y **+1.103 L** —
> `infrastructure/audio/AudioData.ts` (36 L) **movido** a `shared/audio/AudioData.ts`
> (**101 L**, neto 0 archivos) + `shared/audio/AudioData.spec.ts` (**56 L**, nuevo) +
> **9 archivos nuevos en `presentation/audio/` (682 L)**: `GameplaySfx.ts` 45 + spec 66,
> `GameplaySoundtrack.ts` 126 + spec 159, `HeartbeatLoop.ts` 82 + spec 75, `UiSfx.ts` 32 +
> spec 63, `testing/fakeScheduler.ts` 34; recontados `AudioService.ts` 262 → **308** y su
> spec 100 → **184**, `PreloadScene.ts` → **146** (+10), `CardView.ts` 294 → **299**,
> `GameSceneController.ts` 638 → **662** (+24, soundtrack); Commit 3 (staged) **+251/−25 en
> 13 archivos**: `ShopScene` 793 → **816**, `HowToPlayScene` 882 → **920**, `MainMenuScene`
> 582 → **588**, `UIScene` 507 → **514**, `ResultScene` 554 → **566**,
> `DeckSelectionScene` 490 → **496**, `BankerOfferPanel` 329 → **341**, `ConfirmDialog`
> 165 → **173**, `DailyChallengeBanner` 121 → **129**, `HudIconButton` 263 → **268**,
> `SoundFullscreenControls` 212 → **214**, `SwapEventModal` 241 → **245**.
> Cierre previo — 2026-10-08 (cierre **ADR-014 — regla anti-farmeo de la 1ª ronda**,
> Commit 2 del rebalance) · **178 archivos TS · 123 fuente + 55 specs · 26.821 L —
> censo COMPLETO medido con `wc -l`** (cierra el pendiente del recount): por capa
> `domain/` **5.126** (20 specs) · `application/` **4.111** (14) · `infrastructure/`
> **4.073** (11) · `presentation/` **11.782** (5) · `shared/` **1.307** (5) · raíz
> (`main.ts` 385 + `vite-env.d.ts` 37) **422**. Detalle del cierre ADR-014:
> **+8 archivos** (3 fuente + 5 specs — ver abajo) → de 170 a 178; recontados
> `BankerPolicy.ts` 24 → **35**, `OfferCalculator.ts` 65 → **77** y su spec 117 → **151**,
> `GameSessionFactory.ts` 42 → **51** y su spec 88 → **161**,
> `LocalStorageProgressionRepository.ts` 165 → **206**, `ProgressionManager.ts` 152 → **164**
> y su spec 246 → **285**, `GameSceneController.ts` 624 → **638**, `GameScene.ts` 618 →
> **642**, `BankerOfferPanel.ts` 305 → **329**, `OnboardingCoach.ts` 200 → **208**,
> `HowToPlayScene.ts` 868 → **882**, `LanguageData.ts` 478 → **489**, `ports/*.ts` 351 →
> **376**, `testing/*` 301 → **317**.
> Últimos cierres previos — 2026-10-08 (cierre **ADR-013 — rebalance del banquero**:
> fórmula de la oferta por rondas + energía inicial 60 %, Fase A + B) · **170 archivos TS
> · 120 fuente + 50 specs** (recount parcial, ver su entrada más abajo); 2026-10-06
> (música de gameplay por mazo) · 168 / 49; 2026-10-04 (cierre de la **unidad B4 —
> ADR-012**, aviso inline de ads en la tienda, CG-MON-006; el mismo día cerraron la
> unidad B3 — CG-MON-005, la unidad **B2 — ADR-011**, `muteAudio`
> de la plataforma, CG-MON-002, la unidad B1/ADR-010, la unidad
> A1/ADR-008, la unidad A3/ADR-009, la enmienda ADR-007 y la unidad ADR-007 del 2026-10-02) ·
> **167 archivos TS · 24.881 líneas · 119 fuente + 48 specs**
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
> **Cierre A3 2026-10-04 (ADR-009 — `ads_disabled` como estado permanente, CG-PUB-003):**
> **sin archivos nuevos** (mismo censo de 162 archivos / 45 specs); crecieron **9 archivos
> → +290 L** (`git diff --numstat`, medido con `wc -l`): `domain/ports/ICrazyGamesService.ts`
> 78→**86** (+8; total `ports/*.ts` 317→**325**), `infrastructure/services/CrazyGamesService.ts`
> 408→**461** (+53) + `.spec.ts` 252→**294** (+42), `application/use-cases/ReviveWithAdUseCase.ts`
> 143→**168** (+25) + `.spec.ts` 515→**571** (+56), `MultiplyRewardUseCase.ts` 130→**154**
> (+24) + `.spec.ts` 392→**439** (+47), `ListAvailableUpgradesUseCase.spec.ts` 74→**91**
> (+17), `infrastructure/services/testing/FakeCrazyGamesService.ts` 111→**129** (+18) →
> **162 archivos / 45 specs / 24.065 L**; por capa: `domain/` **4.145** (+8),
> `application/` **3.433** (+169), `infrastructure/` **3.405** (+113).
> **Cierre B1 2026-10-04 (ADR-010 — bloqueador de UI durante el ciclo del ad,
> CG-MON-001):** **+2 archivos nuevos** — `presentation/scenes/AdBlockerScene.ts`
> (**118 L**) y `AdBlockerScene.spec.ts` (**95 L**) — y crecieron **4 archivos**
> (`wc -l`): `domain/ports/ICrazyGamesService.ts` 86→**95** (+9; total `ports/*.ts`
> 325→**334**), `infrastructure/services/CrazyGamesService.ts` 461→**483** (+22) +
> `.spec.ts` 294→**310** (+16), `main.ts` 353→**370** (+17) →
> **164 archivos / 46 specs / 24.342 L**; por capa: `domain/` **4.154** (+9),
> `application/` **3.433** (sin cambios), `infrastructure/` **3.443** (+38),
> `presentation/` **11.651** (+213).
> **Cierre B2 2026-10-04 (ADR-011 — `muteAudio` de la plataforma, CG-MON-002):**
> **+3 archivos nuevos** — `infrastructure/audio/AudioService.spec.ts` (**100 L**, el
> primer spec de `audio/`), `infrastructure/config/resolveMuteAudioOverride.ts`
> (**34 L**) y `.spec.ts` (**36 L**) — y crecieron **6 archivos** (`wc -l` medido,
> `git status --short` confirma que son los únicos tocados): `domain/ports/ICrazyGamesService.ts`
> 95→**105** (+10; total `ports/*.ts` 334→**344**), `infrastructure/audio/AudioService.ts`
> 231→**262** (+31), `infrastructure/services/CrazyGamesService.ts` 483→**543** (+60) +
> `.spec.ts` 310→**400** (+90), `infrastructure/services/OwnRewardedAdService.ts`
> 310→**324** (+14), `infrastructure/services/testing/FakeCrazyGamesService.ts`
> 129→**143** (+14), `main.ts` 370→**385** (+15) →
> **167 archivos / 48 specs / 24.745 L**; por capa: `domain/` **4.164** (+10),
> `application/` **3.433** (sin cambios), `infrastructure/` **3.822** (+379),
> `presentation/` **11.651** y `shared/` **1.254** (sin cambios; la suma de las capas +
> raíz `main.ts` 385 + `vite-env.d.ts` 37 = 24.746 ≈ total `wc -l` 24.745, el ±1 es la
> diferencia `wc -l` vs conteo ya conocida).
> **Cierre B3 2026-10-04 (CG-MON-005 — aviso de rewarded en la fila de la tienda):**
> **sin archivos nuevos** (mismo censo de 167 archivos / 48 specs); tocaron solo 2
> archivos: `shared/i18n/LanguageData.ts` **467 → 467** (6 líneas de descripción
> reescritas, LOC neto cero — `git diff --numstat` 6/6) y su spec `LanguageData.spec.ts`
> 44 → **75** (+31, test de contrato nuevo) →
> **167 archivos / 48 specs / 24.776 L**; por capa: `shared/` **1.254 → 1.285** (+31),
> el resto igual (suma de capas + `main.ts` 385 + `vite-env.d.ts` 37 = 24.777 ≈ total 24.776;
> el ±1 sigue siendo `wc -l` vs conteo: `LanguageData.ts` no termina en newline, `wc -l`
> da 466 y el conteo de líneas 467).
> **Cierre B4 2026-10-04 (ADR-012 — aviso inline de ads en la tienda, CG-MON-006):**
> **sin archivos nuevos** (mismo censo de 167 archivos / 48 specs); tocaron **4 archivos,
> solo adiciones** (`git diff --numstat` 49/0 · 22/0 · 22/0 · 12/0 = **+105 L**, medido
> con `wc -l`): `application/use-cases/ListAvailableUpgradesUseCase.ts` 29 → **51** (+22,
> método `adsNotice()`) + `.spec.ts` 91 → **140** (+49, describe de 5 tests),
> `presentation/scenes/ShopScene.ts` 771 → **793** (+22, aviso inline a `height/2 − 176`),
> `shared/i18n/LanguageData.ts` `wc -l` 466 → **478** (+12; conteo **467 → 479**) →
> **167 archivos / 48 specs / 24.881 L**; por capa: `application/` **3.433 → 3.504** (+71),
> `presentation/` **11.651 → 11.673** (+22), `shared/` **1.285 → 1.297** (+12),
> `domain/` 4.164 e `infrastructure/` 3.822 sin cambios (suma de capas + `main.ts` 385 +
> `vite-env.d.ts` 37 = 24.882 ≈ total `wc -l` 24.881; el ±1 sigue siendo `wc -l` vs
> conteo por el newline final de `LanguageData.ts`).
> **Cierre 2026-10-06 (música de gameplay por mazo — quedó fuera del MAP en su momento,
> registrado ahora):** +1 spec `domain/value-objects/DeckSetups.spec.ts` (**30 L**) →
> 168 archivos / 49 specs; `DeckSetups.ts` 217 → **234** (+17, campo `musicGameplay`).
> **Cierre 2026-10-08 (ADR-013 — rebalance del banquero, Fase A + B):** **+2 archivos** —
> `domain/value-objects/BankerPolicy.ts` (**24 L**) y
> `domain/value-objects/BankerPolicy.balance.spec.ts` (**234 L**) → **170 archivos / 120
> fuente + 50 specs**; recontados: `OfferCalculator.ts` 53 → **65** (+12) y su spec 145 →
> **117** (−28), `Banker.ts` 46 → **52** (+6), `EnergyLevel.ts` 104 → **105** (+1),
> `DailyBoard.ts` 63 → **77** (+14), `factories/GameSessionFactory.ts` 35 → **42** (+7),
> `services/CryptoRandomProvider.ts` 57 → **67** (+10), `scenes/GameScene.ts` 610 → **618**
> (+8), `ports/*.ts` 344 → **351** (`IRandomProvider.nextFloat()`), `testing/*` 291 →
> **301** (`DeterministicRandomProvider.nextFloat()` = 0.5); `GameSession.ts` **282 sin
> cambio**. El **total de líneas no se recontó** en este cierre de docs: además de los
> archivos listados, pudieron cambiar specs tocados por la refactorización
> (Banker/EnergyLevel/DailyBoard/GameSessionFactory) — el próximo censo con `wc -l` lo cierra.
> Actualizar este archivo cuando se agreguen/eliminen archivos relevantes (entrada en `LOG.md`).

---

## `src/domain/` — 5.126 líneas · 20 specs · la capa más protegida 🟢

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
| `DeckSetups.ts` | 234 | ✅ 30 L | **10 mazos** con texturas/temas + campo **`musicGameplay`** (pista por mazo que carga `PreloadScene`; el spec valida que el `.ogg` exista en `public/assets/audio/music/`). 🟡 cambiarlo toca `PreloadScene` + registry de efectos. |
| `EnergyDeltaTable.ts` | 64 | ✅ (vía `DefaultEnergyDrainRule.spec`) | Tabla de drenaje + chequeo de integridad al cargar. **Invariante.** |
| `DailyChallenge.ts` | 119 | ✅ 169 L | Reglas del desafío diario. `previewDailyCompletion()` es la vista previa de la recompensa y `completeDaily` delega en ella (test de propiedad). |
| `EnergyLevel.ts` | 105 | ✅ 183 L | VO con clamp `[0, ceiling]` + **`STARTING_RATIO` = 0.6** (energía inicial y revive, ADR-013) + **zonas de la barra**: `EnergyZone`, `ENERGY_CRITICAL_MAX_PERCENT` (20), `ENERGY_LOW_MAX_PERCENT` (50), `getEnergyZone()` — la vista solo traduce zona → color. |
| `GamePenalties.ts` | 14 | ✅ 20 L | **Fuente única de la penalidad** (`LOSS_PENALTY_AMOUNT` = −1000); la consumen `OpenCardUseCase`, `UIScene` y `main.ts`. |
| `PeriodicBonus.ts` | 65 | ✅ | Bono 12 h; rango `[500…5000]` (el 0 salió en 1.3.1). |
| `PlayerRecords.ts` | 69 | ✅ | Récords personales. |
| `DailyBoard.ts` | 77 | ✅ | Calendario determinista (seed por fecha UTC) + `createDailyBankerRandom(dateKey)`: PRNG con sal `${DAILY_SEED_SALT}:banker:` para el ruido de la oferta (ADR-013). |
| `CaseValues.ts` | 35 | ✅ 23 L | Valores posibles de carta + umbral de carta alta (`HIGH_CASE_VALUE_MIN` = 1000, `isHighCaseValue()`) — consumido por `CardView`. |
| `SessionUpgradeCatalog.ts` | 125 | ✅ 55 L | **Costos y conflictos de la tienda** + `requiresRewardedAd` (set de ads con spec; la *disponibilidad* la deciden `ListAvailableUpgradesUseCase` y `PurchaseSessionUpgradeUseCase`) + **`costOf(id)`**: helper único del monto (lo consumen los 3 use-cases de ads y los specs; ADR-006). 🟡 fuente única de precios. |
| `BankerPolicy.ts` | 35 | ✅ 234 L + farming 257 L | **Fuente única de la política del Banquero, la energía inicial y el anti-farmeo**: ADR-013 `OFFER_ROUND_FACTORS` [0.75, 0.85, 0.95], `OFFER_NOISE` 0.20, `OFFER_MIN_RATIO` 0.5, `OFFER_MAX_RATIO` 1.2, `STARTING_ENERGY_RATIO` 0.6 + **ADR-014** `FIRST_ROUND_STREAK_TRIGGER` 4, `CAPPED_GAMES_DURATION` 5, `CAPPED_OFFER_VALUES` [1, 2, 5, 10] — ningún otro archivo puede hardcodear estos números. Su spec `BankerPolicy.balance.spec.ts` (234 L) valida la política con **50.000 partidas sembradas** (EVs, orden de ofertas, bandas de derrota) y `FirstRoundDealStreak.farming.spec.ts` (257 L) la economía anti-farmeo. **Invariante.** |
| `FirstRoundDealStreak.ts` | 109 | ✅ 165 L + farming 257 L | **VO de la regla anti-farmeo (ADR-014)**: `consecutiveFirstRoundDeals ∈ [0,3]` + `cappedGamesRemaining ∈ [0,5]`; ctor **valida** (lanza), `restore()` **sanea** (dato de storage podrido → `0/0`), `withGameEnd(outcome)` aplica las 5 reglas (activa a los 4 tratos; countdown solo con rechazo de la topada), `drawCappedOfferValue(u)` mapea a `[1,2,5,10]`, singleton `INACTIVE`. 🟢 |

### services/ · state/ · events/ · ports/
| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `OfferCalculator.ts` | 77 | ✅ 151 L | Fórmula ADR-013: `round(clamp(promedio × factor[ronda] × (1+ruido) × (1+bono), 0.5×, 1.2×))` — solo cartas cerradas (la secreta ya no entra con peso 0.2, sin ×0.85); UNA muestra por oferta del generador inyectado por ctor. **Desde ADR-014:** 3.er param opcional `firstRoundCap` → `min(oferta final, cap)` en ronda 1, aplicado **después** del bono y los clamps. Invariante. |
| `Banker.ts` | 52 | ✅ | Cadencia de 3; `makeOffer(closedCards, bonoNegociador?)` ya **NO** recibe la carta secreta (ADR-013); usa `Date.now()` (única impureza de tiempo en domain). |
| `GameStateMachine.ts` | 81 | ✅ | Guards que lanzan. `start()`/`idle` muertos. |
| `GameEvents.ts` | 38 | — | 17 variantes de `GameEvent`. `SecretCardChosen` muerta. |
| `ProgressionEvents.ts` | 6 | — | 3 variantes. `UpgradePurchased` muerta. |
| `ports/*.ts` (8 archivos) | 376 | — | Interfaces; `IRandomProvider` gana **`nextFloat()`** (ruido de la oferta, ADR-013); **`IProgressionRepository`/`IProgressionService` ganan `get/setFirstRoundDealStreak`** (ADR-014); contratos documentados con JSDoc (`IProgressionService.awardGameplayCoins` incluye reembolsos; `ICrazyGamesService.rewardedAdStatus()` define la **política de 2 grupos** del reembolso — ADR-006 + ADR-009, que agrega el motivo permanente `ads_disabled` y fija el orden "lo permanente manda sobre el cooldown"; `AdLifecyclePhase` = `'requesting' \| 'started' \| 'ended'` con la **garantía de par** `requesting→ended` — ADR-010; `onMuteAudioChange()` notifica el **valor inicial sin importar el orden** init↔suscripción y cada cambio de `game.settings.muteAudio`, los adapters sin plataforma nunca notifican — ADR-011). |

---

## `src/application/` — 4.111 líneas · 14 specs · casi toda verde 🟢

| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `use-cases/PurchaseSessionUpgradeUseCase.ts` | 184 | ✅ 438 L | Cobra + aplica efecto; delega en `SessionUpgrades` (`isOwned`/`canPurchase`) — Fase 4: los 2 switches privados de reglas se movieron al dominio, queda solo el switch de efectos/eventos. **Guard de ads**: 4.º parámetro `ICrazyGamesService`; rechaza `ads_unavailable` sin `spendCoins` cuando `requiresRewardedAd` y no hay rewarded disponible (después de `conflicting_upgrade`/`not_applicable`). **Exhaustividad**: guarda `const exhaustive: never = upgradeId` al final de `applyEffect` (2026-10-01) + spec `it.each` que recorre los ids del catálogo (36 tests). 🟡 |
| `use-cases/OpenCardUseCase.ts` | 94 | ✅ 288 L | Cascada de prioridades de outcome. **Orden es contrato.** Penalidad de derrota desde `GamePenalties`. 🟡 |
| `use-cases/ReviveWithAdUseCase.ts` | 168 | ✅ 571 L | Orden: consumir revive → revivir. Política por **`rewardedAdStatus()`** (ADR-006 enmendado + ADR-009): `sdk_unavailable`/`adblock`/`ads_disabled`/`cooldown_no_fill` → reembolso único (`'refunded'`, invariante XOR, vía `policyTwoRefund()`); `cooldown_retryable` → `'ads_cooldown'` sin reembolso y sin tocar `refunded`; sin puerto de progresión devuelve el motivo real `'sdk_unavailable'`. **Tras un rewarded fallido re-evalúa el motivo**: si quedó permanente reembolsa en el MISMO intento. 🟡 |
| `use-cases/MultiplyRewardUseCase.ts` | 154 | ✅ 439 L | Flag `isProcessing` sincrónico (carrera de doble click). Misma política por **`rewardedAdStatus()`** (2 grupos, ADR-006 + ADR-009: `ads_disabled` pre-consumo y re-evaluación post-fallo → `policyTwoRefund()`); **precondición**: no recibe la sesión, la tenencia de la mejora la garantiza presentación (JSDoc). |
| `use-cases/ResolveDealUseCase.ts` | 40 | ✅ | Emite `DealAccepted` **y** `GameWon` (ver ADR-001). |
| `use-cases/SwapFinalSecretCardUseCase.ts` | 37 | ✅ | — |
| `use-cases/SwapSecretCardUseCase.ts` | 29 | ✅ | — |
| `use-cases/ListAvailableUpgradesUseCase.ts` | 51 | ✅ 140 L | **Qué muestra la tienda**: filtra el catálogo por `requiresRewardedAd` según `ICrazyGamesService.isRewardedAdAvailable()`. Comportamiento idéntico al filtro que tenía `ShopScene`; cobertura 100 %. Con ADR-009 basta que `rewardedAdStatus()` sea `ads_disabled`: el predicado vuelve `false` solo y **ocultan/filtran las 3 filas de rewarded** (spec: 5 filas). **Desde ADR-012:** `adsNotice(): 'adblock' \| 'ads_disabled' \| null` decide el **aviso inline** de la tienda (CG-MON-006) — solo motivos permanentes; cooldowns y `sdk_unavailable` no avisan; relee `rewardedAdStatus()` como `execute()`. Su contraparte de compra es `PurchaseSessionUpgradeUseCase` (ver arriba). |
| `onboarding/OnboardingFlow.ts` | 104 | ✅ | Acciones show/hide/none por hint. |
| `records/GameResultTracker.ts` | 55 | ✅ | Eventos → un `GameResult` inmutable. |
| `records/GameOutcomeRecorder.ts` | 54 | ✅ | Escribe récords + desafío diario. |
| `records/FirstRoundDealStreakTracker.ts` | 81 | ✅ 249 L | **Segundo tracker puro (ADR-014)**: eventos → un `FirstRoundDealGameOutcome` (reporta como máximo 1 vez; `DealAccepted` dispara el reporte y cubre el `GameWon` posterior; `GameLost` pendiente hasta `flush()`; abandono no reporta). 🟢 |
| `use-cases/RecordFirstRoundDealOutcomeUseCase.ts` | 28 | ✅ 100 L | `execute(outcome, isDaily)`: no-op en el Desafío Diario; `withGameEnd` + escritura vía `IProgressionService` solo si cambió. Sin eventos nuevos. 🟢 |
| `factories/GameSessionFactory.ts` | 51 | ✅ 161 L | **Duplica** la construcción de `DeckManager.fromValuesWithSelection` (ver PLAYBOOK). `createGameSessionWithSelection(values, secretIndex, offerRandom, streak?)` — generador de ruido como **3.er parámetro obligatorio** y streak anti-farmeo como **4.º opcional** (sortea el cap con UNA muestra extra **solo si activo** — ADR-014); `createGameSession(provider)` pasa `() => provider.nextFloat()` (ADR-013). |
| `dto/GameStateDTO.ts` | 30 | ❌ | **Código muerto** (`GameStateMapper.toDTO` sin llamadas). |
| `use-cases/testing/collectEvents.ts` | 11 | — | Helper: acumula eventos para asserts. |

---

## `src/infrastructure/` — 4.167 líneas · 11 specs · zona de riesgo medio 🟡

| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `services/CrazyGamesService.ts` | 543 | ✅ 400 L | Init memoizado, ads single-flight, timeouts 15 s/120 s, `AdResult` nunca lanza. **`rewardedAdStatus()`** clasifica el cooldown por MOTIVO (`cooldown_no_fill` vs `cooldown_retryable`) — define la política de reembolso (ADR-006). **Desde ADR-009:** `notePermanentError()` (llamada desde el `adError` **antes de `settle()`) cachea `adsDisabledBasicLaunch` → flag `adsDisabled` y `{code:'adblock'}` → `adblockDetected`**; el orden del status pone lo permanente primero (`sdk_unavailable` → `adblock` → `ads_disabled` → cooldown). **Desde ADR-010:** `requestAd()` emite `'requesting'` al abrir el Promise (después del guard `adInProgress`) y `settle()` cierra el ciclo con `'ended'` si sigue abierto (sin-fill / timeout 15 s / excepción del SDK) — **garantía de par** `requesting→ended`. **Desde ADR-011:** `bindMuteAudioSetting()` (en `init().then()`) lee `game.settings?.muteAudio` y registra `game.addSettingsChangeListener?`; `noteMuteAudio()` notifica al Set `muteAudioListeners` solo si cambió o es el inicial (`muteAudioKnown` resuelve la carrera init↔suscripción) — sin SDK nunca notifica. **Desde ADR-007:** el cooldown de 60 s lo delega en `RewardCooldownTracker` (fuente única) y el `<script>` del SDK ya no lo pone `index.html` — la inyección es dinámica desde `main.ts`, solo en modo `crazygames`. 🟡 |
| `services/OwnRewardedAdService.ts` | 324 | ✅ 338 L | **Adapter propio** (ADR-007, `VITE_ADS=portal`): pide el overlay al presenter inyectado (`AdOverlayScene`, desde presentation); status solo `available`/`cooldown_*` (nunca `adblock`/`sdk_unavailable`); ✕ → `user_cancelled` honesto → `cooldown_retryable`; **watchdog 15 s** (presenter colgado → `'error'` retryable y resultado tardío descartado); midgame sin tocar el tracker; `getUserLocale()` → `navigator.language`; telemetría no-op; **`onMuteAudioChange()` stub que nunca notifica** (sin plataforma no hay setting — ADR-011). |
| `services/RewardCooldownTracker.ts` | 86 | ✅ 101 L | **Fuente única del cooldown de 60 s** con motivo (`no_fill`/`other` → `cooldown_no_fill`/`cooldown_retryable`), extraído de `CrazyGamesService` para que los 2 adapters produzcan estados idénticos (ADR-006/007). Reloj inyectable; nunca lanza. 🟢 |
| `config/resolveAdsMode.ts` | 83 | ✅ 66 L | `VITE_ADS` → modo efectivo: **estricto** — solo los 3 literales exactos (espacios/mayúsculas/typos → default `crazygames` + `console.warn`; `undefined`/vacío → default sin warn). Espejo por construcción del gate plegable de `main.ts` (ADR-007). 🟢 |
| `config/resolveFullscreenEnabled.ts` | 70 | ✅ 71 L | `VITE_FULLSCREEN` + `adsMode` → booleano del botón fullscreen propio (**pareja invariante de `VITE_ADS`**, ADR-008): default seguro `false` sin env/basura; en `crazygames` **siempre** `false` aunque el env diga `'true'` (se ignora + `console.warn` — la plataforma prohíbe el botón, CG-PUB-002); en `portal`/`none` solo los literales exactos `'true'`/`'false'` (cualquier variante → `false` + warn con el crudo). El flag sale de `main.ts` en el bag `GameServices.fullscreenEnabled` — presentation no lee env directo. 🟢 |
| `config/resolveMuteAudioOverride.ts` | 34 | ✅ 36 L | **Override local de `?muteAudio=`** (ADR-011, patrón de `resolveFullscreenEnabled`): `true`/`false` si el parámetro está presente y es válido, `null` si no está (**manda el SDK**) o si el valor es basura (`?muteAudio=si`, `TRUE`, vacío → `null` + `console.warn`). `false` sirve para **negar** el mute de plataforma en local y probar en modos sin SDK. 🟢 |
| `persistence/LocalStorageProgressionRepository.ts` | 206 | ✅ 125 L | **Esquema v5** (ADR-014): `migrateIfNeeded()` v3→v5 (todos los campos) y v4→v5 (backfill `firstRoundDealStreak` `(0,0)`); validación al cargar el streak (enteros, rangos → si no, `0/0`); `clearAll`/`createDefault` incluyen el campo. Bloque de comentarios con merge artifact (L17-28). 🟡 |
| `persistence/ProgressionManager.ts` | 164 | ✅ 285 L | Fachada de meta-progresión + eventos. **Desde ADR-014:** delega `get/setFirstRoundDealStreak` en el repo (sin evento propio). |
| `audio/AudioService.ts` | 308 | ✅ 184 L | **Desde ADR-011:** capa `platformMuted` (mute de la plataforma) separada del pref `muted`; fuente única `applyMute()` → `sound.mute = muted \|\| platformMuted`; `isMuted()` = **efectivo**; `setPlatformMuted()` es método **concreto** (no está en el puerto `IAudioService`, solo lo llama `main.ts`). Anclado a `Phaser.Game`. **Desde ADR-015:** volumen por clave `(options.volume ?? sfxVolume) × volumenDelManifiesto` (el volumen del manifiesto ya no se ignora), anti-apilado de la misma clave <40 ms (reloj inyectable, exento `sfx-coins-count`), `warnMissing(key)` con la carpeta real según familia, `static preload()` **borrado** (era código muerto con path inexistente). 🟡 |
| `persistence/LocalStorageOnboardingRepository.ts` | 75 | ✅ | — |
| `persistence/LocalStorageRecordsRepository.ts` | 46 | ✅ (compartido) | `gamesPlayed` se recalcula = wins+losses. |
| `persistence/LocalStorageDailyChallengeRepository.ts` | 43 | ✅ (compartido) | — |
| `services/CryptoRandomProvider.ts` | 67 | ❌ | Muestreo por rechazo con `crypto.getRandomValues` + **`nextFloat()`** = `Uint32 / 2^32` (ruido de la oferta, ADR-013). |
| `persistence/jsonStorage.ts` | 36 | ❌ | Helper tolerante a fallos; **solo lo usan Records y Daily** (Progression/Onboarding tienen try/catch propio). |
| `testing/*` (5 archivos · 6 fakes) | 317 | — | Fakes — `DeterministicRandomProvider.nextFloat()` = **0.5 → ruido de oferta 0** (ADR-013); `FakeProgressionRepository.seedFirstRoundDealStreak()` siembra el streak anti-farmeo y `clearAll()` lo limpia (ADR-014); ver `docs/testing.md` (`FakeCrazyGamesService.setRewardedStatus()` simula cada `RewardedAdStatus` y **`setRewardedStatusAfterNextAd()`** (ADR-009) simula un adError que vuelve el estado permanente **en vuelo**, durante el `await` del use-case; **`emitMuteAudioChange()`** (ADR-011) emite un cambio de `game.settings.muteAudio` a los suscriptores de `onMuteAudioChange`). |

---

## `src/presentation/` — 12.634 líneas · 9 specs · **zona más frágil** 🔴

### Puntos calientes (mayor riesgo al tocar)
| Archivo | LOC | Spec | Por qué es peligroso |
|---|---|---|---|
| `controllers/GameSceneController.ts` | 662 | ❌ | Switch `handleEvent()` de ~250 líneas / 14 casos: timers mágicos (1800/1600/750/2600 ms), launches de escena, flags anti-cheat. Constructor de **14 parámetros posicionales**. **Desde ADR-014:** en `BankerOfferMade` calcula `cappedRemainingGames` (ronda 1 y monto ∈ `CAPPED_OFFER_VALUES`) y se lo pasa al panel. **Desde ADR-015:** instancia `GameplaySoundtrack` (adapter `scene.time.delayedCall`/`remove(false)`), alimenta `onEvent` al inicio de `handleEvent()` y su **primer handler `SHUTDOWN`** llama `soundtrack.stop()`. |
| `scenes/GameScene.ts` | 642 | ❌ | Composition root de la partida (40 imports) + layout + decisión de producto. Cablea el puerto de ads al use-case de compra, el **generador de ruido de oferta** por sesión (diario → sal del día; normal → `nextFloat()`, ADR-013) y el **streak anti-farmeo** a la factory (diario → `INACTIVE`, ADR-014); `setupOutcomeRecording` suscribe los **2 trackers** con un solo `flush()` en SHUTDOWN. |
| `scenes/ShopScene.ts` | 816 | ❌ | `upgradeStatusFor()` (~32 L) delega en `SessionUpgrades.getState()`; la lista visible la pide a `listAvailableUpgrades` (la aplicación decide qué filtra — la escena no consulta `isRewardedAdAvailable`); mensajes temporales de fila vía `showTemporaryRowMessage` (conflicto Duplicar/Triplicar y ads caídos, sin timer duplicado); compra de mazos sin use-case. **Desde ADR-012 (CG-MON-006):** `renderUpgradesTab()` dibuja el **aviso inline** a `height/2 − 176` (UNA línea, sin `wordWrap` a propósito, ámbar `#ffd166`) cuando `adsNotice()` devuelve un motivo — la política vive en el use-case, la escena solo dibuja. |
| `scenes/HowToPlayScene.ts` | 920 | ❌ | Bulk en `TUTORIAL_SLIDES` (declarativo → riesgo bajo pese al tamaño). **Desde ADR-014:** caption de la regla anti-farmeo en el paso 3. |
| `scenes/MainMenuScene.ts` | 588 | ❌ | Layout + selector de idioma + `resetAllProgress()` destructivo. |
| `scenes/UIScene.ts` | 514 | ❌ | 3 modales, aplica penalidad vía `GamePenalties`, único `setInterval`-like (timer de 30 s del bono). |
| `scenes/ResultScene.ts` | 566 | ❌ | Flujos de rewarded/midgame ad; guarda botones en el registry. Reembolso (ADR-006): `'refunded'` → `RESULT_AD_REFUNDED` + `disableActionButton` apaga Duplicar/Triplicar/Revivir; `'ads_cooldown'` → `RESULT_AD_COOLDOWN` y **NO** apaga (reintento a los 60 s). |
| `scenes/DeckSelectionScene.ts` | 496 | ❌ | Grilla + preview + re-lanzamiento de `PreloadScene`. |
| `scenes/AdOverlayScene.ts` (+ `.resolution.ts`) | 301 + 70 | ✅ 123 + 46 L | **Overlay del anuncio propio** (ADR-007, solo `VITE_ADS=portal`): countdown 3 s con timer de escena, ✕ cancela, backdrop bloqueador, pausa `GameScene` mientras dura, failsafes `SHUTDOWN`/`DESTROY` (la promise nunca se cuelga). **Registrada en el `config.scene` de `main.ts` (última de la lista — se dibuja arriba de todo; ADR-007 enmienda 2026-10-04); `presentAdOverlay()` — la función **presenter** que `main.ts` inyecta al adapter, inversión de dependencia: infrastructure no importa presentation — solo pide el `start` y degrada en 0 s con `{ completed: false }` si la escena faltara** (BUGFIX: la pareja `scene.add()`+`scene.start()` en runtime era una carrera con la cola de Phaser — primer ad de la sesión → `Scene key not found` → watchdog 15 s). La resolución single-shot vive en `.resolution.ts` (lógica pura); la escena además tiene `.spec.ts` (3 tests, mock de `'phaser'` en node — incluye la degradación red→verde). Paleta/chrome copiados de Shop/HowToPlay (PLAYBOOK §1). |
| `scenes/AdBlockerScene.ts` | 118 | ✅ 95 L | **Bloqueador de UI durante el ciclo del ad del SDK** (ADR-010, CG-MON-001): backdrop interactivo **sin handler** (absorbe los clicks de las escenas debajo) + spinner con tween (sin texto → sin i18n) + **pausa `GameScene` con flag local**, reanuda en `SHUTDOWN` — mismo mecanismo probado de `AdOverlayScene`. **En el `config.scene` de `main.ts` al FINAL** (boot, nunca `add()` en runtime — lección ADR-007). El cable `createAdBlockerListener(game)`: `'requesting'`/`'started'` → `game.scene.start` una sola vez por ciclo (flag `active`), `'ended'` → `stop` solo si estaba activo — **`main.ts` la conecta SOLO si `adsMode !== 'portal'`** (en portal manda `AdOverlayScene`; los dos apilarían fondo y spinner sobre el countdown). API correcta: `start`, no `launch` (`SceneManager` no tiene `launch`). 🟡 |

### Audio (`src/presentation/audio/` — 9 archivos · 682 L, ADR-015)
| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `GameplaySfx.ts` | 45 | ✅ 66 L | Fuente única de constantes: latido 25 %/12 %, 900/650 ms, `LOSE_AFTER_DEPLETED_DELAY_MS` 900 ms + `cardSfxKeyForValue(value)` (≤100 → LOW, ≤750 → MID, ≤10000 → HIGH, resto → JACKPOT). 🟢 |
| `HeartbeatLoop.ts` | 82 | ✅ 75 L | Bucle con `HeartbeatScheduler` inyectado (producción: `scene.time.delayedCall`); primer latido **inmediato** al cruzar el umbral; token anti-tick-tardío. 🟢 |
| `GameplaySoundtrack.ts` | 126 | ✅ 159 L | Traductor puro `GameEvent` → sfx: deal/no-deal/swap/revive, win **sin doble fanfarria** (flag `dealAccepted`, ADR-001), lose 900 ms tras `EnergyDepleted` cancelable, heartbeat. Sin Phaser; habla por `IAudioService`; `play()` best-effort. 🟢 |
| `UiSfx.ts` | 32 | ✅ 63 L | `bindUiClick(target, audio?)`: punto único del click genérico `SFX.CLICK` de la UI; interfaz estructural `ClickTarget` (sin Phaser); sin `audio` → sin bind. 🟢 |
| `testing/fakeScheduler.ts` | 34 | — | Doble compartido `createFakeScheduler()`: timers armados/cancelados/disparados a mano (`fake.timers`, `activeTimers()`). |

### Componentes (los "tontos" — ✅ cumplen la regla)
`BankerOfferPanel` 341 (ADR-015: `SFX.OFFER` al ofrecer y `SFX.BANKER_ANNOYED` con la
oferta topada) · `CardView` 299 (color/valor derivan de `isHighCaseValue` del dominio;
`reveal()` suena la variante por valor vía `cardSfxKeyForValue`) ·
`PeriodicBonusModal` 272 · `HudIconButton` 268 · `SwapEventModal` 245 ·
`EnergyBarView` 248 (relleno/label/pulso derivan de `EnergyLevel.getEnergyZone`; la vista
solo traduce zona → color) · `SoundFullscreenControls` 214 (✅ **spec 107 L** con 4 tests desde ADR-008: default `false` del 3.er argumento, botón solo con `true` + fullscreen disponible, sin botón muerto en iOS/iframe) ·
`OnboardingCoach` 200 · `ConfirmDialog` 173 · `DailyChallengeBanner` 129 (usa
`previewDailyCompletion` del dominio) ·
`PayoutBoardView` 129 · `ParticleManager` 97 · `LocalizedText` 78 (auto-suscripción).
El click genérico de todos va por `UiSfx.bindUiClick` (ADR-015) — ver PLAYBOOK §1: el chrome
del botón sigue duplicado, el sonido no.

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

## `src/shared/` — 1.464 líneas · 6 specs 🟢

| Archivo | LOC | Spec | Nota |
|---|---|---|---|
| `audio/AudioData.ts` | 101 | ✅ 56 L | **Manifiesto único de audio (ADR-015)**: `AUDIO_MANIFEST` (1 música + **23 sfx**) + `SFX as const` (símbolos canónicos que usa presentation). Lo consumen `PreloadScene` (carga) y `AudioService` (volumen por clave). Guardián en el spec: paridad símbolo ↔ manifest ↔ mp3 físico. 🟢 |
| `i18n/LanguageData.ts` | 489 | ✅ 75 L | **153 claves × en/es** (2026-10-01: +`RESULT_AD_REFUNDED` y +`RESULT_AD_COOLDOWN`; 2026-10-02 ADR-007: +`AD_OVERLAY_TITLE`, +`AD_OVERLAY_HINT`, +`AD_OVERLAY_HINT_MIDGAME`), `as const` + `satisfies` → autocomplete de claves. 2026-10-04 CG-MON-005: las 3 descripciones con `requiresRewardedAd` cierran con el requisito de ad visible en la fila (`(requires ad)` EN / `(requiere anuncio)` ES) — contrato en el spec (+1 test, 6 en total). 2026-10-04 CG-MON-006 (ADR-012): +`SHOP_ADS_HIDDEN_ADBLOCK` y +`SHOP_ADS_HIDDEN_DISABLED` (EN+ES, aviso inline de la tienda; 148 → 150 claves). 2026-10-08 ADR-014: +`BANKER_CAPPED_NOTICE_SINGULAR`/`_PLURAL`, +`TUTORIAL_BANKER_CAPPED_CAPTION` y frase anti-farmeo en `ONBOARDING_BANKER_BODY` (150 → 153 claves, `wc -l` 478 → 489). |
| `i18n/LanguageManager.ts` | 238 | ✅ 284 L | Singleton (único `export default`). Fallback: activo → default → clave. |
| `utils/CompactScreen.ts` | 65 | ✅ | Detección de layout compacto. |
| `utils/EventEmitter.ts` | 24 | ❌ | `SimpleEventEmitter<T>` de 24 líneas — sin test, pero es el corazón de los 2 buses. |
| `utils/TimeFormat.ts` · `NewGameConfirmation.ts` | 14+14 | ✅ | Helpers puros. |
| `types/common.ts` | 3 | — | — |

---

## Raíz

| Archivo | Nota |
|---|---|
| `main.ts` (385) | Composition root global (incluye `ListAvailableUpgradesUseCase`) + **lista `scene` de 11 escenas**, con `AdOverlayScene` y `AdBlockerScene` **al final** (dormidas hasta su primer `start()`, ADR-007 enmienda 2026-10-04 / ADR-010) + **selección del adapter de ads por `VITE_ADS`** vía `resolveAdsMode()` (ADR-007: `crazygames`/`portal`/`none`; en `portal` inyecta el presenter del overlay) + **cable del bloqueador** `onAdLifecycle(createAdBlockerListener(game))` **solo si `adsMode !== 'portal'`** (ADR-010) + **resolución del botón fullscreen propio** `resolveFullscreenEnabled(VITE_FULLSCREEN, adsMode)` → campo `fullscreenEnabled` del bag (ADR-008: el modo manda, default `false`) + **mute de la plataforma** `resolveMuteAudioOverride(window.location.search)` → `setPlatformMuted()`, y si no hay override `onMuteAudioChange(→ setPlatformMuted)` (ADR-011: override gana y se saltea la suscripción, funciona en los 3 modos) + **carga dinámica** del SDK de CrazyGames (`loadCrazyGamesSdk()`, solo modo `crazygames`; el `<script>` salió de `index.html`) + `beforeunload` (gameplayStop + penalidad de abandono con `LOSS_PENALTY_AMOUNT`). |
| `vite-env.d.ts` (37) | Tipos de `import.meta.env` con `VITE_ADS?: 'crazygames' \| 'portal' \| 'none'` y `VITE_FULLSCREEN?: 'true' \| 'false'` — **sin lógica** (la validación vive en `resolveAdsMode.ts` y `resolveFullscreenEnabled.ts`, ADR-007/008). Script global a propósito (fusión con `vite/client`). |
| `index.html` | **Ya NO carga el SDK** (desde ADR-007 el `<script>` de CrazyGames salió de acá — ver `loadCrazyGamesSdk()` en `main.ts`) + overlay "gira el dispositivo". |
| `vite.config.ts` | `base: './'`, esbuild (no terser), `manualChunks` → `phaser-vendor`. |
| `jest.config.js` | `ts-jest`, `node` env, umbrales de cobertura **por capa** (Fase 4): `domain/` 88/80/90/88 y `application/` 88/82/90/88 (stmts/branches/functions/lines). |
| `tsconfig.json` | `strict` + `noUnused*` + `noImplicitReturns`; **incluye specs** desde la Fase 0. |
| `eslint.config.mjs` | Config mínima (9 reglas). Ver comentarios del archivo antes de agregar reglas. |
