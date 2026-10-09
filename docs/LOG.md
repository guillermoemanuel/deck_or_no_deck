# LOG de sesiones de trabajo (append-only)

> **Formato:** entrada más reciente arriba. Solo se agrega, nunca se reescribe.
> Obligatorio al cerrar cualquier tarea de Build: una entrada breve con
> *qué se tocó*, *cómo se verificó* y *qué quedó pendiente*.
> El estado detallado del código vive en `docs/MAP.md`; el porqué en `docs/DECISIONS/`.

---

## 2026-10-09 · feat(audio): 21 SFX nuevos + base de audio (manifiesto único, volumen por clave, sfx de partida e interfaz)

**Qué se tocó en `src/` (3 commits atómicos, rojo→verde):**

1. **Commit 1 `52dd63e` — base de audio:** `src/infrastructure/audio/AudioData.ts` **movido**
   a `src/shared/audio/AudioData.ts` (dato puro: presentation puede importarlo sin violar la
   flecha §2); **23 claves** en `AUDIO_MANIFEST.sfx` (21 nuevas + `sfx-card-open`/`sfx-offer`)
   + export `SFX as const` (símbolos canónicos). En `AudioService` (262 → **308 L**): mapa
   clave→volumen con fórmula `(options.volume ?? sfxVolume) × volumenDelManifiesto`
   (**bugfix** `bug_sfx_volumen_ignorado`: el volumen del manifiesto se declaraba y se
   ignoraba), anti-apilado de la misma clave en <40 ms con reloj inyectable (exento
   `sfx-coins-count`), `warnMissing(key)` con la carpeta real según familia (sfx/music — antes
   apuntaba a `/public/audio/README.md`, inexistente) y **borrado `static preload()`**
   (código muerto). `PreloadScene` recorre `AUDIO_MANIFEST.sfx` (fuente única; antes cableaba
   a mano solo 2 claves — bug de fuente dual). 21 mp3 nuevos en
   `public/assets/audio/sfx/` + `docs/SFX-MANIFEST.md`. Tests: `AudioService.spec` 5 → **9**
   (+4) y guardián nuevo `src/shared/audio/AudioData.spec.ts` (4 tests: paridad símbolo ↔
   manifest **23 = 23**, sin duplicados, mp3 físicos con `fs.existsSync`).
2. **Commit 2 `c83a308` — sonidos de la partida:** nuevos `src/presentation/audio/`
   `GameplaySfx.ts` (`cardSfxKeyForValue` por rangos ≤100 / ≤750 / ≤10000 / jackpot + fuente
   única de constantes del latido: 25 %/12 %, 900/650 ms, lose 900 ms),
   `HeartbeatLoop.ts` (scheduler inyectado `HeartbeatScheduler`, primer latido **inmediato**,
   token anti-tick-tardío), `GameplaySoundtrack.ts` (consumidor puro de `GameEvent`:
   DEAL/NO_DEAL/SWAP/WIN **sin doble fanfarria** ADR-001 / LOSE retardado 900 ms tras
   `ENERGY_DEPLETED` y cancelable por `GameRevived` / heartbeat stop) + 3 specs (**40 tests**)
   + doble compartido `presentation/audio/testing/fakeScheduler.ts`. `CardView.reveal()`
   juega la variante vía `cardSfxKeyForValue(value)`; `GameSceneController` instancia el
   soundtrack (adapter `scene.time.delayedCall` / `remove(false)`), llama `onEvent` al inicio
   de `handleEvent()` y su **primer handler `SHUTDOWN`** → `soundtrack.stop()`.
3. **Commit 3 `d6b8693` (SFX de interfaz):** nuevo `src/presentation/audio/UiSfx.ts`
   (`bindUiClick(target, audio?)` — punto único del click genérico `SFX.CLICK`, interfaz
   estructural `ClickTarget` sin Phaser; sin `audio` no se registra nada) + `UiSfx.spec.ts`
   (4 tests); binds en: `HudIconButton` (5 call sites: UIScene ×3, SoundFullscreenControls
   ×2), `ResultScene` (`createActionButton` + `SFX.RECORD` en `isNewBestPayout`), `ShopScene`
   (`attachButtonInteractions` + ✕, `SFX.PURCHASE` en éxitos de mejora, `SFX.UNLOCK` en
   éxitos de mazo), `SwapEventModal` y `ConfirmDialog` (call sites en el controller /
   `MainMenuScene`), `MainMenuScene` (4 botones + selector de idioma), `DeckSelectionScene`
   (ACEPTAR), `HowToPlayScene` (TDZ de `getServices` resuelto + 4 binds + `SFX.WHOOSH` en
   `exitToMainMenu` — única transición animada), `UIScene` (`SFX.BONUS_CLAIM` en
   `claimPeriodicBonus`), `DailyChallengeBanner` (`SFX.BONUS_CLAIM` en el clic),
   `BankerOfferPanel` (`SFX.BANKER_ANNOYED` en el bloque de oferta topada ADR-014 +
   `'sfx-offer'` → `SFX.OFFER`).
4. **Sin uso deliberado** (documentado en `PLAYBOOK.md` §3 para que nadie los "conecte" sin
   decisión): `sfx-drumroll` (la secuencia final real dura ~1,11 s < los 1,2 s del redoble y
   el plan prohibía sumar esperas), `sfx-coins-count` (`ResultScene` no tiene animación de
   conteo) y la clave `SFX.CARD_OPEN` (las variantes por valor la reemplazan; el mp3 sigue
   cargado).

**Docs (esta sesión):** ADR-015 nuevo (`docs/DECISIONS/ADR-015-manifiesto-de-audio-unico-y-politica-de-reproduccion.md`)
+ fila en `docs/DECISIONS/README.md`; `docs/ARCHITECTURE.md` (sección de audio: manifiesto
único en `shared/audio/`, `AudioService` con volumen por clave/anti-apilado/sin `preload()`,
`presentation/audio/` con la regla Phaser-puerto-silencio); `docs/MAP.md` (censo COMPLETO con
`wc -l`: **188 archivos TS · 128 fuente + 60 specs · 27.924 L** — +10 archivos y +1.103 L
sobre el censo ADR-014 —, filas de `shared/audio/AudioData.ts` y de los 9 archivos de
`presentation/audio/`, LOCs recontados de los 13 archivos del Commit 3); `docs/PLAYBOOK.md`
(§3: fila `AudioService.preload()` eliminada — resuelta; nota nueva con los 3 SFX sin uso;
§1: el click de botones ya es único vía `UiSfx.bindUiClick`, la duplicación del chrome sigue
viva); `docs/testing.md` (estado 2026-10-09, specs por capa 20/14/11/**9/6**,
`createFakeScheduler` en la tabla de dobles, ítem 12 del smoke: checklist de escucha);
`docs/SFX-MANIFEST.md` (la nota de `CardView` ya no describe el bug de la clave genérica y
apunta a `src/shared/audio/`); `AGENTS.md` §1 (el conteo de specs del comando `typecheck`
decía 48 — ya estaba desfasado desde ADR-014 y quedaba más lejos: → **60**, único cambio
fuera de `docs/`).

**Cómo se verificó (4 gates por commit, verdes; reviewer: VEREDICTO APROBADO en los 3):**

1. `npx jest <specs afectados>` selectivo → **13** tests (commit 1) → **40** (commit 2) →
   **44** (commit 3) ✓
2. `npm run typecheck` → **0 errores** · `npm run lint` → **0 problemas** ✓
3. `npm test` → **670 tests / 60 suites** (base: 618 / 55) ✓
4. Sin cambios de `domain/`/`application/`, eventos, i18n, música ni ADR-011.

**PENDIENTES:**

- **Smoke manual de escucha** (NO ejecutado): checklist en `docs/testing.md` §5, **ítem 12** —
  clicks en menú/tutorial/HUD/tienda/tabs/✕ → `sfx-click`; whoosh solo al salir del tutorial;
  purchase/unlock solo en éxito de compra; record solo con nueva mejor apuesta;
  banker-annoyed solo con oferta topada (ADR-014); bonus-claim al reclamar el bono periódico
  y al clic del banner diario; Trato/No trato y cartas **sin** click genérico.
- **Volumen efectivo de `sfx-card-open`/`sfx-offer` bajó a 0.42 (0.7 × 0.6)**: el bugfix del
  volumen del manifiesto los atenúa — ajuste de mezcla a validar/corregir en ese smoke.

---

## 2026-10-08 · feat(balance): regla anti-farmeo de la 1ª ronda (ADR-014) — cap de oferta + cuenta regresiva de 5 partidas

**Qué se tocó en `src/` (hecho por la unidad, rojo→verde):**

1. **Fuente única `domain/value-objects/BankerPolicy.ts` (24 → 35 L):** +`FIRST_ROUND_STREAK_TRIGGER` 4, `CAPPED_GAMES_DURATION` 5, `CAPPED_OFFER_VALUES` `[1, 2, 5, 10]`.
2. **VO nuevo `domain/value-objects/FirstRoundDealStreak.ts` (109 L):** `consecutiveFirstRoundDeals ∈ [0,3]` + `cappedGamesRemaining ∈ [0,5]`; ctor valida (lanza), `restore()` sanea (storage podrido → `0/0`), `withGameEnd(outcome)` con las 5 reglas (activa a los **4** tratos consecutivos → `(0,5)`; cuenta regresiva **solo** al rechazar la oferta topada; aceptarla / perder en cartas 1-3 / abandono no decrementan), `drawCappedOfferValue(u)` → `[1,2,5,10]`, singleton `INACTIVE`.
3. **Cap en `domain/services/OfferCalculator.ts` (65 → 77 L):** 3.er param opcional `firstRoundCap` — solo ronda 1, `min(oferta final, cap)` aplicado **después** del bono Negociador y de los clamps de ADR-013.
4. **`application/factories/GameSessionFactory.ts` (42 → 51 L):** 4.º param opcional `streak?` (default `INACTIVE`) — si está activo consume **UNA muestra extra** del `offerRandom` para sortear el cap y después arma el calculator; si no, no consume nada (la secuencia de ruido de ADR-013 queda intacta).
5. **Tracker puro nuevo `application/records/FirstRoundDealStreakTracker.ts` (81 L)** (patrón `GameResultTracker`): `DealAccepted` dispara el reporte (cubre el `GameWon` posterior), `GameLost` queda pendiente hasta `flush()`, abandono no reporta; reporta `rejectedRound1Offer = vio la 1ª y no la aceptó`.
6. **Use case nuevo `application/use-cases/RecordFirstRoundDealOutcomeUseCase.ts` (28 L):** `execute(outcome, isDaily)` — no-op en el Desafío Diario; `withGameEnd` + escritura vía `IProgressionService` solo si cambió; sin eventos nuevos.
7. **Persistencia esquema v4 → v5:** puertos `IProgressionRepository`/`IProgressionService` con `get/setFirstRoundDealStreak`; `ProgressionManager` delega (sin evento); `LocalStorageProgressionRepository` (165 → 206 L) con migración v4→v5 backfill `(0,0)` y v3→v5 directo, validación al cargar (enteros, `[0,3]`/`[0,5]`, si no → `0/0`) y `clearAll`/`createDefault` con el campo; `FakeProgressionRepository` + `seedFirstRoundDealStreak()`.
8. **Presentación:** `GameScene` lee el streak (diario → `INACTIVE`) y lo pasa a la factory, y `setupOutcomeRecording` suscribe los 2 trackers con un solo `flush()` en SHUTDOWN; `GameSceneController` calcula `cappedRemainingGames` (ronda 1 **y** monto ∈ `CAPPED_OFFER_VALUES` — chequear el monto excluye el diario sin preguntar `dailyDateKey`) y se lo pasa a `BankerOfferPanel` (4.º param opcional, aviso en y≈204 con singular/plural); `HowToPlayScene` caption en el paso 3; `OnboardingCoach` bubble 104 → 110 px (`BUBBLE_Y` 662 → 666) para el cuerpo de 3 líneas.
9. **i18n `LanguageData.ts` (150 → 153 claves):** `BANKER_CAPPED_NOTICE_SINGULAR`/`_PLURAL`, `TUTORIAL_BANKER_CAPPED_CAPTION` (en+es, paridad de placeholders) y frase anti-farmeo añadida a `ONBOARDING_BANKER_BODY`.
10. **Specs nuevos/ampliados (rojo primero):** `FirstRoundDealStreak.spec` (20), `FirstRoundDealStreak.farming.spec` (3), `OfferCalculator` cap (+34 L → 151), `GameSessionFactory.spec` (+73 → 161), `FirstRoundDealStreakTracker.spec` (13, con 2 de integración: sesión real + `ResolveDealUseCase` + progresión fake), `RecordFirstRoundDealOutcomeUseCase.spec` (7), **`LocalStorageProgressionRepository.spec` nuevo (125 L — cerró el hueco que `testing.md:78` declaraba)**, `ProgressionManager.spec` (+39).

**Docs (esta sesión):** ADR-014 nuevo (`docs/DECISIONS/ADR-014-regla-anti-farmeo-primera-ronda.md`) + fila en `docs/DECISIONS/README.md`; `AGENTS.md` §4 (invariante anti-farmeo); `docs/ARCHITECTURE.md` (composition root de GameScene con los 2 trackers, fila de invariante anti-farmeo, persistencia v5); `docs/MAP.md` (**censo COMPLETO con `wc -l` que cierra el pendiente del recount**: 178 archivos · 123 fuente + 55 specs · 26.821 L, totales por capa reales, +8 filas/deltas de este cierre); `docs/testing.md` (specs por capa 20/14/11/5/5, `LocalStorageProgressionRepository` ya no figura como hueco, helper `seedFirstRoundDealStreak`).

**Cómo se verificó (4 gates, verdes):**

1. `npx jest <specs afectados>` selectivo → verde a lo largo del cambio (streak 20, cap 27, factory 11, tracker 13, use case 7, persistencia 39, farming 3, i18n) ✓
2. `npm run typecheck` → **0 errores** ✓ · `npm run lint` → **0 problemas** ✓
3. `npm test` → **55 suites / 618 tests** (base: 50/555) ✓
4. **Simulación de granjero** (`FirstRoundDealStreak.farming.spec`, 20.000 partidas sembradas, `GameSession` real): monedas/carta con regla = **557.0** (banda 480-620) vs sin regla = **797.0** (≈798); jugador p=0.7 → **30.2 %** de partidas topadas (banda 27-37 %); granjero determinista → 53.5 % topadas; toda oferta de 1ª con regla activa ∈ `CAPPED_OFFER_VALUES`.

**PENDIENTES:**

- **Escudo + tanque ≈ 0 % de derrota:** con ambas compras la probabilidad de perder es nula (riesgo nulo) — futuro rebalance, sin tocar (heredado de ADR-013).
- **Precios de mejoras de la tienda** parecen altos — sin tocar.
- **Ajustar la economía de mazos por tiempo** (10 mazos temáticos sin curva propia de recompensa) — sin tocar.

---

## 2026-10-08 · feat(balance): rebalance del Banquero (ADR-013) — fórmula de oferta por rondas + energía inicial 60 %

**Qué se tocó en `src/` (hecho por la unidad, ya commiteado; esta sesión solo documenta):**

1. **Fase A — fuente única nueva `domain/value-objects/BankerPolicy.ts` (24 LOC):**
   `OFFER_ROUND_FACTORS` `[0.75, 0.85, 0.95]` (rondas > 3 usan el último), `OFFER_NOISE` 0.20,
   `OFFER_MIN_RATIO` 0.5, `OFFER_MAX_RATIO` 1.2, `STARTING_ENERGY_RATIO` 0.6.
2. **`OfferCalculator.ts` (65 LOC):** fórmula nueva
   `round(clamp(promedio × factor[ronda] × (1+ruido) × (1+bonoNegociador), 0.5×promedio, 1.2×promedio))`
   — la carta secreta **salió** del cálculo (antes `0.2×secreta + 0.8×promedio`), sin ×0.85
   de riesgo y sin el param muerto `bonusPercentage` del ctor; generador `() => number` en
   `[0,1)` **inyectado por constructor** (UNA muestra por oferta; nunca `Math.random` en dominio).
3. **`Banker.makeOffer(closedCards, bonoNegociador?)`** perdió el parámetro `secretCard`.
4. **`EnergyLevel`:** `STARTING_RATIO` 0.5 → **0.6** — energía inicial y revive = 60 % del techo.
5. **`DailyBoard.createDailyBankerRandom(dateKey)`:** PRNG con sal `${DAILY_SEED_SALT}:banker:${dateKey}`
   (misma fecha UTC → mismas muestras para todos; sal separada del tablero).
   **`IRandomProvider.nextFloat()`** implementado en `CryptoRandomProvider` (`Uint32/2^32`) y
   `DeterministicRandomProvider` (0.5 → ruido exacto 0).
6. **`GameSessionFactory.createGameSessionWithSelection(values, secretIndex, offerRandom)`** con
   3.er parámetro obligatorio (`createGameSession(provider)` → `() => provider.nextFloat()`);
   **`GameScene`** cablea un generador fresco por sesión (diario → sal del día; normal → crypto).
7. **Spec nuevo `domain/value-objects/BankerPolicy.balance.spec.ts` (234 LOC).**
8. **Fase B (commit previo `1ea9aa7`):** penalidad de derrota/abandono −5000 → −1000
   (`LOSS_PENALTY_AMOUNT`). Fase A no tiene hash propio: su commit es el de este mismo cambio.

**Docs (esta sesión):** ADR-013 nuevo (`docs/DECISIONS/ADR-013-politica-del-banquero-y-energia-inicial.md`)
+ fila en el índice `docs/DECISIONS/README.md`; `AGENTS.md` §4 (energía 60 % + fórmula actual);
`docs/ARCHITECTURE.md` (fila de energía inicial, filas de oferta → fórmula/fuente única, puerto
`IRandomProvider`); `docs/MAP.md` (cierre 2026-10-08: +2 archivos → 170/50, LOCs recontados de los
archivos tocados, y registro del cierre de audio 2026-10-06 que había quedado fuera del MAP);
`docs/PLAYBOOK.md` §3 (fila muerta `OfferCalculator.bonusPercentage` eliminada — resuelta el
2026-10-08: el parámetro se sacó del ctor); `docs/testing.md` **sin cambios** (no describía ni el
50 % inicial ni la fórmula vieja como invariante actual).

**Cómo se verificó (4 gates, verdes — corridos por la unidad):**

1. `npx jest <specs afectados>` selectivo → verde ✓
2. `npm run typecheck` → **0 errores** ✓ · `npm run lint` → **0 problemas** ✓
3. `npm test` → **50 suites / 555 tests** (base: 49/548) ✓
4. Spec de balance **N = 50.000** partidas sembradas que drivean `GameSession` real:
   EVs aceptar 1ª/2ª/3ª/nunca = **2365.9 / 2538.2 / 2756.4 / 2838.0** (refs de usuario
   2370/2531/2749/2801, ±6 %); orden 1ª < 2ª < 3ª ≤ nunca; ratio ≥ 0.75; derrotas **5,6 %**
   y **25,3 %** (bandas 3-9 % y 22-30 %); `thr90` con ruido ±10 % = 2823.8 ≤ nunca = 2838.

**PENDIENTES:**

- **Escudo + tanque ≈ 0 % de derrota:** con ambas compras la probabilidad de perder es nula
  (riesgo nulo) — futuro rebalance, sin tocar.
- **Precios de mejoras de la tienda** parecen altos — sin tocar.
- **Consecuencia ADR-013:** la barra de energía arranca en zona sana/verde (60 %) en vez de
  ámbar — deliberado; reconsiderar si el onboarding pierde urgencia.
- **`docs/MAP.md`:** total de líneas sin recountar (recount parcial por archivo; el próximo
  censo completo con `wc -l` lo cierra).

---

## 2026-10-06 · feat(audio): música de gameplay propia por mazo — campo `DeckSetups.musicGameplay`

**Qué se tocó (`src/`, red→verde — hecho por la unidad, no por esta sesión de docs):**

1. **`domain/value-objects/DeckSetups.ts`:** campo nuevo **requerido**
   `musicGameplay: string` en `IDeckConfig` (nombre de archivo **sin extensión** bajo
   `public/assets/audio/music/`), con los **10 mazos** apuntando hoy a
   `'clasic_gameplay'` (mientras no existan pistas propias). Reemplaza al placeholder
   comentado `bgmKey` de "Extensibilidad futura" (quedan `sfxFlipKey` y `accentColor`).
2. **`presentation/scenes/PreloadScene.ts`:** la carga de la música pasa de
   **hardcodeada a dinámica** — `assets/audio/music/${activeSetup.musicGameplay}.mp3`
   bajo la clave genérica **`music_gameplay`**, precedido del nuevo helper
   **`removeAudioIfExists()`** (espejo del `removeTextureIfExists()` existente). Causa
   raíz: el `LoaderPlugin` de Phaser saltea cualquier archivo cuya clave ya existe en la
   caché (`File.hasCacheConflict` → `LoaderPlugin.keyExists`), mismo mecanismo del
   BUGFIX de texturas de ese archivo — sin el remove, cambiar de mazo seguiría sonando
   la pista vieja.
3. **`presentation/scenes/GameScene.ts`:** **SIN cambios** — `playMusic('music_gameplay')`
   sigue igual: la elección del archivo ocurre en `PreloadScene` (patrón de claves
   genéricas `'card-back'` que el propio PreloadScene documenta).
4. **`domain/value-objects/DeckSetups.spec.ts` (NUEVO, 2 tests):** (1) cada mazo declara
   `musicGameplay` no vacío; (2) el `.mp3` correspondiente **existe realmente** en
   `public/assets/audio/music/` (`fs.existsSync`).

**Spec red→verde:** el spec se escribió PRIMERO y falló en rojo con
`TS2339: Property 'musicGameplay' does not exist on type 'IDeckConfig'` → verde (2 tests).

**Cómo se verificó (4 gates, todos verdes — corridos por la unidad):**

1. `npx jest src/domain/value-objects/DeckSetups.spec.ts` → rojo (TS2339) → **verde (2 tests)** ✓
2. `npx jest src/domain` → **17 suites / 234 tests** ✓
3. `npm run typecheck` → **0 errores** ✓ · `npm run lint` → **0 problemas** ✓
4. `npm test` → **49 suites / 548 tests** (base del sprint: 48/546) ✓

**Qué queda pendiente / deuda conocida:**

- **Pistas mp3 propias por mazo:** hoy los 10 campos apuntan a `clasic_gameplay`; el
  smoke **audible** real llega cuando existan archivos por mazo — con el cambio actual el
  comportamiento audible **no cambia**.
- **Código muerto detectado:** `AudioService.preload()` (lector de `AUDIO_MANIFEST` en
  `AudioData.ts`) no lo llama nadie; `PreloadScene` carga el audio por su cuenta.
  Candidato a `docs/PLAYBOOK.md`; **no se tocó en este commit**.

---

## 2026-10-05 · Sprint B — smoke manual APROBADO (modo `crazygames`, QA Tool de CrazyGames)

**Qué se verificó (smoke guiado por el usuario; build de Vite servido en
`localhost:4173`, modo `crazygames`, QA Tool de CrazyGames + adblocker real) — los 5
puntos PASARON:**

1. **Carga/SDK:** 1 request a `sdk.crazygames.com/crazygames-sdk-v3.js` (200), consola
   sin errores.
2. **B1 · CG-MON-001 (ADR-010):** backdrop + spinner al instante del click en "Jugar de
   nuevo" (midgame); los botones NO navegan durante el ad; el bloqueador se cierra solo
   al terminar/fallar el anuncio — verificado también el caso **sin fill** (no se queda
   clavado); **un solo `requestAd`** por click.
3. **B2 · CG-MON-002 (ADR-011):** `?muteAudio=true` → juego totalmentemente mudo desde
   el arranque y el botón de sonido del HUD **NO** re-enciende; `?muteAudio=false` / sin
   parámetro → sonido normal (música a volumen correcto).
4. **B3 · CG-MON-005:** tienda pestaña Mejoras — las 3 filas rewarded visibles con
   `(requiere anuncio)` / `(requires ad)` en la descripción.
5. **B4 · CG-MON-006 (ADR-012):** con adblocker activo — 3 filas ocultas + **línea ámbar
   de una sola línea** bajo el caption (`SHOP_ADS_HIDDEN_ADBLOCK` ES: *"Bloqueador de
   anuncios detectado: Duplicar, Triplicar y Revivir están ocultos. Desactívalo para
   verlos."*), sin popup y sin errores de consola: el status fue `adblock` (no
   `sdk_unavailable`) — la distinción del ADR-012 funcionó en la vida real.

**Cierre técnico post-smoke:** `.env` revierto a `VITE_ADS=portal` +
`VITE_FULLSCREEN=true` (config dev del usuario), preview detenido y `npm run build`
corrido para dejar `dist/` consistente con el `.env` revierto. Repo limpio (solo
`dist.zip` untracked).

**Docs (tarea de esta sesión, `memory-keeper`, solo `docs/`):** esta entrada · cierre de
los 4 smokes del Sprint B en sus entradas (B1-B4) y en la lista global de la entrada A3 ·
`docs/testing.md` (secciones B1 y `muteAudio` → **PASSED 2026-10-05** + sección nueva
*Smoke general del Sprint B*) · `ADR-010`/`ADR-011`/`ADR-012`: el bullet de verificación
sin correr → estado **"Cerrado (smoke 2026-10-05)"**. **Sin ADR nuevo** (es
verificación, no decisión).

**Cómo se verificó (grep en `docs/`):** **0** frases de smoke sin cerrar del Sprint B ni
del `muteAudio`; los smokes heredados de sprints anteriores (ítems 1-4 de
`docs/testing.md`, ADR-006) quedan como estaban — histórico, no se reescribe.

**Qué queda pendiente:** nada del Sprint B. Siguen abiertos los pendientes heredados de
sprints anteriores y las acciones fuera del repo (APS en Developer Portal, Vite 8,
`dist.zip`), sin cambios.

---

## 2026-10-04 · Sprint B B4 — CG-MON-006: aviso inline de ads en la tienda (ADR-012)

**Qué pasó (hallazgo P2 de la auditoría de publicación 2026-10-04):** cuando
`ListAvailableUpgradesUseCase` ocultaba Duplicar/Triplicar/Revivir por falta de ads, el
jugador veía **5 filas sin ningún aviso** de por qué faltaban 3 (requisito de CrazyGames:
manejar adblock *gracefully*; la auditoría exigió aviso **inline, NO popup**). La clave
vieja `SHOP_UPGRADE_ADS_UNAVAILABLE` solo se mostraba como mensaje **temporal al intentar
comprar** una fila filtrada — no servía para filas que no se ven.

**Fix (`src/`, red→verde — hecho por la unidad, no por esta sesión de docs):**
1. **Nuevo `ListAvailableUpgradesUseCase.adsNotice(): 'adblock' | 'ads_disabled' |
   null`** (aplicación): la política testeable de "¿corresponde el aviso?" vive en
   `application/`, la escena solo dibuja. **Solo motivos PERMANENTES**: `adblock` /
   `ads_disabled` → sí; `cooldown_retryable`/`cooldown_no_fill` → NO (transitorio 60 s,
   el aviso parpadearía y la fila reaparece sola); `sdk_unavailable` → NO (ambiguo: modo
   `none`/dev, SDK sin cargar o CDN caído — avisaría "desactivá tu adblocker" donde no lo
   hay). Relee `rewardedAdStatus()` en cada llamada (como `execute()`).
2. **`ShopScene.renderUpgradesTab()`:** dibuja el aviso **inline, UNA línea centrada a
   `height/2 - 176`** (bajo el caption a −200, sobre la primera fila a −160; hueco
   ~32 px → con origin 0.5 y 15 px entra una línea). Copy corto y **sin `wordWrap` a
   propósito** (dos líneas pisarían la primera fila — comment en la escena). Ámbar
   `#ffd166` (paleta existente); `adblock → SHOP_ADS_HIDDEN_ADBLOCK`,
   `ads_disabled → SHOP_ADS_HIDDEN_DISABLED`.
3. **i18n nuevas claves EN+ES** en `shared/i18n/LanguageData.ts` (junto a
   `SHOP_UPGRADE_ADS_UNAVAILABLE`; esa queda intacta para el path de compra):
   `SHOP_ADS_HIDDEN_ADBLOCK` y `SHOP_ADS_HIDDEN_DISABLED` → **148 → 150 claves** × en/es.

**Specs red→verde:** `ListAvailableUpgradesUseCase.spec.ts` gana
`describe('adsNotice() — aviso inline de la tienda (CG-MON-006)')` con **5 tests**
(adblock→`'adblock'` · ads_disabled→`'ads_disabled'` · available→`null` · ambos
cooldowns→`null` · sdk_unavailable→`null`); rojo por método inexistente (la suite no
compilaba). El spec pasa de 5 a **10 tests** (`grep -c "it("`) → **48 suites / 546
tests** (base B3: 48/541). Sin archivos nuevos (48 `*.spec.ts`); `LanguageData.spec`
cubre las claves nuevas por su contrato de paridad EN/ES.

**Docs (tarea de esta sesión, `memory-keeper`):** **ADR-012** nuevo
(`ADR-012-aviso-inline-de-ads-en-la-tienda.md`) + fila `012` en
`docs/DECISIONS/README.md`; `docs/MAP.md` (censo → **167 archivos / 48 specs / 24.881 L**,
medido con `wc -l` + `git diff --numstat` 49/0, 22/0, 22/0 y 12/0 = +105 L: `ListAvailableUpgradesUseCase.ts`
29→**51**, su spec 91→**140**, `ShopScene.ts` 771→**793**, `LanguageData.ts` 466→**478**
de `wc -l` = **479** de conteo); `docs/testing.md` (**48/546**, spec en 10);
`docs/ARCHITECTURE.md` (`adsNotice()` en la invariante "mejoras con rewarded ad" +
**150 claves** i18n); **`AGENTS.md`** §3 corregido: `LanguageData.ts` **148 → 150 claves** y `ShopScene.ts`
**771 → 793 L** (desincronizaciones doc↔código detectadas al cerrar — manda el código);
esta entrada.

**Cómo se verificó:** gates en verde corridos por la unidad (a esta sesión el runner
`jest`/`npm` le fue denegado por permisos): `npm run typecheck` 0 ✓ · `npm run lint` 0 ✓ ·
`npm test` → **48 suites / 546 tests** (base 48/541) ✓ · `npm run build` ✓ (8,4 s).
Verificación de docs por esta sesión: `wc -l` en los 4 archivos tocados,
`git diff --numstat` (solo adiciones: 49/22/22/12), `grep -c "it("`
(`ListAvailableUpgradesUseCase.spec` = 10), `find src -name "*.spec.ts" | wc -l` (48) y
grep en `docs/*.md`: **ninguna doc afirmaba que las filas ocultas "no avisan" nada** (no
había texto que corregir).

**Estado (smoke):** **APROBADO 2026-10-05** — el aviso inline de la tienda se vio en
vivo: las 3 filas con el tag del ad (punto 4) y, con adblocker real, las 3 ocultas +
línea ámbar de UNA línea bajo el caption (punto 5) — status `adblock`, no
`sdk_unavailable`: la distinción del ADR-012 funcionó en la vida real. Ver la entrada
del 2026-10-05. `ads_disabled` quedó fuera de esa corrida (solo simularlo en **Basic
Launch**). **Deuda nueva:** ninguna.

---

## 2026-10-04 · Sprint B B3 — CG-MON-005: aviso de rewarded en la fila de la tienda

**Qué pasó (hallazgo P2 de la auditoría de publicación 2026-10-04):** la tienda no
declaraba que Duplicar/Triplicar/Revivir **exigen mirar un anuncio** — el "(Ad)" solo
aparecía en los botones `RESULT_*` (`RESULT_DOUBLE_BUTTON` y cía), ya **dentro** del flujo
de uso. Requisito de CrazyGames (docs.crazygames.com/requirements/ads/): los rewarded no
pueden dispararse "deceptively". La fila es lo único que ve el jugador antes de comprar y
`ShopScene` renderiza `definition.description` (wordWrap 280 px, hasta 3 líneas por
`ROW_SPACING_Y`), así que el marcador vive en la descripción del catálogo.

**Fix (`src/`, red→verde — hecho por la unidad, no por esta sesión de docs):**
1. **`shared/i18n/LanguageData.ts`** (solo 6 strings: las 3 descripciones con
   `requiresRewardedAd: true`, EN + ES; LOC neto **467 → 467**): ahora cierran con el
   requisito visible en la fila — EN `(requires ad)` · ES `(requiere anuncio)` (ej.
   `Habilita "Duplicar x2" en la pantalla final de esta partida (requiere anuncio).`).
   En ES el tag es **castellano** aunque los `RESULT_*` existentes usan `(Ad)` en ambos
   idiomas: esos quedaron intactos (fuera del alcance del hallazgo).
2. **Nuevo contrato en `LanguageData.spec.ts`** (red primero): *'every upgrade that
   requires a rewarded ad declares the requirement in its description (EN and ES)'* —
   filtra `SESSION_UPGRADE_CATALOG` por `requiresRewardedAd === true`, exige
   `/\(requires ad\)/` en EN y `/\(requiere anuncio\)/` en ES sobre `upgrade.description` y
   acumula faltantes como `lang:id` (mensaje de fallo legible). Rojo: `sinAviso` con **6
   entradas** (`en/es × double_reward/triple_reward/revive`); verde: **+1 test**.
   Importa el catálogo desde `domain/value-objects/SessionUpgradeCatalog` (los specs
   pueden cruzar capas).

**Specs red→verde:** `LanguageData.spec` **+1** (5 → **6 tests**) → **48 suites / 541
tests** (base B2: 48/540). Sin archivos nuevos.

**Docs (tarea de esta sesión, `memory-keeper`):** **sin ADR** (cambio de copy i18n, no de
diseño); `docs/MAP.md` (censo → **167 archivos / 48 specs / 24.776 L**, medido con
`wc -l`/`grep -c ""`: `LanguageData.spec.ts` 44 → **75 L** (+31), `LanguageData.ts`
**467 sin cambio de LOC**, `shared/` 1.254 → **1.285**), `docs/testing.md` (**48/541**;
`shared/i18n` suma 1 test → `LanguageData.spec` con 6), esta entrada.

**Cómo se verificó:** gates en verde corridos por la unidad (a esta sesión el runner le
fue denegado por permisos): `npm run typecheck` 0 ✓ · `npm run lint` 0 ✓ · `npm test` →
**48 suites / 541 tests** (base 48/540) ✓ · build no hizo falta re-correr (solo strings).
Verificación de docs por esta sesión: `wc -l`/`grep -c ""` en los 2 archivos tocados,
`git diff --numstat` (6/6 en `LanguageData.ts`, +31/0 en el spec), conteo de `it(` en
`LanguageData.spec` (6) y grep en `*.md`: **ninguna doc afirmaba que la tienda no
advirtiera** el requisito de ad (el único "aviso" documentado es el bloqueador de UI de
ADR-010).

**Estado (smoke):** **APROBADO 2026-10-05** — las 3 filas rewarded visibles con
`(requiere anuncio)` / `(requires ad)` en la descripción (punto 4; ver entrada del
2026-10-05). `CG-MON-006` también quedó verificado en vivo (punto 5) y los smokes de
B1/B2 cerraron el mismo día (puntos 2 y 3). **Deuda nueva:** ninguna.

---

## 2026-10-04 · Sprint B B2 — CG-MON-002: `muteAudio` de la plataforma (ADR-011)

**Qué pasó (hallazgo P1 de la auditoría de publicación 2026-10-04):** `muteAudio`
tenía **0 matches en `src/`** — el juego ignoraba que el jugador pudo silenciarlo desde
la UI de CrazyGames, y `game.settings` no estaba tipado. Requisito oficial
(docs.crazygames.com/sdk/game, *Game Settings*): leer `game.settings.muteAudio`,
registrarse en `addSettingsChangeListener` y — *"This setting should take priority over
your in-game audio settings … be sure this doesn't enable the audio back if it is
disabled in the SDK settings."* También documenta `?muteAudio=true` como override local.

**Fix (`src/`, red→verde — hecho por la unidad, no por esta sesión de docs):**
1. **`infrastructure/audio/AudioService.ts`:** capa `platformMuted` **SEPARADA** del
   pref del jugador (`muted`): `setPlatformMuted()` nuevo método **concreto** (NO subió
   al puerto `IAudioService` — solo lo consume `main.ts`); fuente única
   `applyMute()` → `sound.mute = muted || platformMuted`; `isMuted()` devuelve el
   **efectivo**; `toggleMuted()` apunta al efectivo (con la plataforma silenciando, el
   click queda como pref "que suene" y suena al liberar — jamás re-enciende contra la
   plataforma); guard de `play()` con `isMuted()`. `playMusic` intacto (la capa no toca
   `this.muted`: la música nace a volumen normal y la silencia el mixer).
2. **Puerto `ICrazyGamesService.ts`:** `onMuteAudioChange(listener) → () => void` —
   notifica el valor **INICIAL** (si ya se conoció) y cada cambio, orden libre entre
   `init()` y la suscripción; los 3 implementadores: `CrazyGamesService` (real),
   `OwnRewardedAdService` (stub que nunca notifica), `FakeCrazyGamesService`
   (Set + `emitMuteAudioChange()` para specs).
3. **`CrazyGamesService.ts`:** `game.settings?: { muteAudio?: boolean }` +
   `game.addSettingsChangeListener?` en el `declare global`; campos
   `muteAudio`/`muteAudioKnown`/`muteAudioListeners`; `bindMuteAudioSetting()` en
   `init().then()`; `noteMuteAudio()` solo notifica si cambió o es el inicial. Sin SDK →
   nunca notifica.
4. **Nuevo `infrastructure/config/resolveMuteAudioOverride.ts`** (patrón
   `resolveFullscreenEnabled`): `?muteAudio=true|false` → booleano; ausente → `null`
   (manda el SDK); inválido → `null` + `console.warn`. `false` sirve para negar el mute
   de plataforma en local.
5. **`main.ts`:** wiring tras `new AudioService(game)` — override gana y se saltea la
   suscripción; si no, `onMuteAudioChange(→ setPlatformMuted)`. Funciona en los 3 modos
   de `VITE_ADS`.

**Specs red→verde:** nuevo `AudioService.spec.ts` (5 tests — rojo por módulo sin spec) ·
nuevo `resolveMuteAudioOverride.spec.ts` (4 tests) · `CrazyGamesService.spec.ts` describe
nuevo de muteAudio (**+4**; `installFakeSdk` extendido con `game.settings` +
`addSettingsChangeListener` + `emitMuteAudio()`) → **48 suites / 540 tests** (base B1:
46/527).

**Docs (tarea de esta sesión, `memory-keeper`):** ADR nuevo
`docs/DECISIONS/ADR-011-muteaudio-de-plataforma.md` + fila `011` en
`docs/DECISIONS/README.md`, `docs/MAP.md` (censo → **167 archivos / 48 specs /
24.745 L**, medido con `wc -l`; nuevos `AudioService.spec.ts` 100 L,
`resolveMuteAudioOverride.ts` 34 L + `.spec.ts` 36 L; deltas `ICrazyGamesService.ts`
95→**105** [ports 334→344], `AudioService.ts` 231→**262**, `CrazyGamesService.ts`
483→**543** + spec 310→**400**, `OwnRewardedAdService.ts` 310→**324**,
`FakeCrazyGamesService.ts` 129→**143**, `main.ts` 370→**385**),
`docs/testing.md` (**48/540**; `infrastructure/` → 10 specs, `audio` gana su primer
spec, `config` → 3 specs), `docs/ARCHITECTURE.md` (§2 wiring del override, §5 contrato
`onMuteAudioChange`, §7 capa `platformMuted`, conteo de specs 43→48), `AGENTS.md`
(conteo de specs del typecheck 42→48), esta entrada.

**Cómo se verificó:** gates en verde (corridos por la unidad, no por esta sesión de
docs — a esta sesión el runner le fue denegado por permisos): `npm run typecheck` 0 ✓ ·
`npm run lint` 0 ✓ · `npm test` → **48 suites / 540 tests** (base 46/527) ✓ ·
`npm run build` ✓ (7,6 s). Verificación de docs por esta sesión: censo nuevo con
`wc -l` (total y por capa), conteo de `it(`/`it.each` en los 3 specs tocados (5 + 4 + 4
= 13 → 527 + 13 = 540) y grep en `*.md`: ninguna doc decía que `muteAudio` estuviera
sin implementar ni describía el ciclo de ads como solo `started`/`ended`.

**Estado (smoke):** **APROBADO 2026-10-05** — `?muteAudio=true` → juego totalmente
mudo desde el arranque y el botón del HUD **no** re-enciende; `?muteAudio=false` / sin
parámetro → sonido normal (música a volumen correcto); punto 3, ver entrada del
2026-10-05. El smoke ejecutó el camino del override local, que alimenta la misma
`setPlatformMuted()`; la conmutación desde la UI de la plataforma queda cubierta por
specs (`CrazyGamesService.spec` describe de muteAudio + `AudioService.spec`).
`CG-MON-005`, `CG-MON-006` y B1 cerraron el mismo día (puntos 4, 5 y 2). **Deuda
nueva:** ninguna.

---

## 2026-10-04 · Sprint B B1 — CG-MON-001: bloqueador de UI durante el ciclo del ad (ADR-010)

**Qué pasó (hallazgo P1 de la auditoría de publicación 2026-10-04):** en modo
`crazygames` **nada bloqueaba la UI durante el ciclo del ad**
(`request → adStarted → adFinished/adError`): `ResultScene` dejaba "Jugar de nuevo"/
"Ir al Menú" vivos, la navegación corría con el ad en vuelo (el guard `adInProgress`
rechazaba el 2.º `requestAd`, pero `onComplete()` navegaba igual en el `finally`,
reiniciando GameScene a mitad de anuncio) y detrás seguían GameScene/UIScene.
Requisito oficial incumplido: *"Block the UI until either an adFinished or adError
event occurs"* (docs.crazygames.com/requirements/ads/). En modo `portal` NO ocurría
(`AdOverlayScene` ya bloquea).

**Fix (`src/`, red→verde — hecho por la unidad, no por esta sesión de docs):**
1. **Puerto `ICrazyGamesService.ts`:** `AdLifecyclePhase` suma **`'requesting'`**
   (señal de bloquear ANTES de que el ad se vea, ventana request→started donde el
   juego sigue clicable) + **garantía de par** documentada: todo ciclo abierto con
   `'requesting'` cierra con EXACTAMENTE un `'ended'`, aunque nunca haya habido
   `'started'` (sin fill o timeout de arranque también cierran).
2. **`CrazyGamesService.requestAd`:** emite `'requesting'` al abrir el Promise (después
   del guard `adInProgress`); `closeLifecycle()` cierra el ciclo; `settle()` emite
   `'ended'` si el ciclo sigue abierto (cubre sin-fill, timeout de arranque 15 s y
   excepción del SDK). El `'ended'` tardío de un ad que arranca después del timeout
   sigue funcionando (ciclo visual late `started → ended`, simétrico para audio).
3. **Nuevo `presentation/scenes/AdBlockerScene.ts`** (en el `config.scene` de `main.ts`
   **al final** de la lista — lección ADR-007: boot, nunca `add()` en runtime):
   backdrop interactivo **sin handler** (mismo mecanismo probado de `AdOverlayScene`)
   + **spinner** con tween de Phaser (sin texto → sin claves i18n); **pausa GameScene**
   con flag local (no "presta" una pausa ajena), reanuda en `SHUTDOWN`;
   `createAdBlockerListener(game)`: `'requesting'`/`'started'` → `start` una sola vez
   por ciclo (flag `active`), `'ended'` → `stop` solo si estaba activo. Nota: el API
   correcto en top-level es **`game.scene.start`** — `launch` no existe en `SceneManager`
   (es de `ScenePlugin`).
4. **`main.ts`:** registra la escena y cablea
   `onAdLifecycle(createAdBlockerListener(game))` **solo si `adsMode !== 'portal'`**
   (en portal manda `AdOverlayScene`; los dos apilarían fondo y spinner sobre el
   countdown); comentario de `type AdService` "5 usos" → "6 usos".

**Specs red→verde:** `CrazyGamesService.spec.ts` — 4 aserciones de phases actualizadas
al contrato nuevo (rojo: `[]`/`['started','ended']` vs `['requesting']` /
`['requesting','ended']` / `['requesting','started','ended']` /
`['requesting','ended','started','ended']`), 1 test renombrado y 1 aserción **nueva de
par** en el timeout de 15 s (conteo de la spec sin cambios: 16) ·
**nuevo `AdBlockerScene.spec.ts`** (5 tests del listener — rojo por módulo
inexistente).

**Docs (tarea de esta sesión, `memory-keeper`):** ADR nuevo
`docs/DECISIONS/ADR-010-bloqueador-de-ui-durante-ads.md` + fila `010` en
`docs/DECISIONS/README.md`, `docs/MAP.md` (censo → **164 archivos / 46 specs / 24.342 L**;
nuevos `AdBlockerScene.ts` 118 L + `.spec.ts` 95 L; deltas `ICrazyGamesService.ts`
86→**95** [ports 325→334], `CrazyGamesService.ts` 461→**483** + spec 294→**310**,
`main.ts` 353→**370**), `docs/testing.md` (**46/527**, `presentation/` → 5 specs,
`AdBlockerScene.spec` 5), `docs/ARCHITECTURE.md` (§5 unión de fases
`requesting | started | ended` + garantía de par; §7 escenas 10 → 11), esta entrada.

**Cómo se verificó:** gates en verde (corridos por la unidad, no por esta sesión de
docs) — `npm run typecheck` 0 ✓ (de paso corrigió el `TS2339` intermedio: `launch` no
existe en `SceneManager`) · `npm run lint` 0 ✓ · `npm test` → **46 suites / 527 tests**
(base 45/522) ✓ · `npm run build` ✓ (8 s; el warning de chunk de Phaser es
preexistente). Verificación de docs por grep: ninguna doc describe el ciclo como solo
`started`/`ended`.

**Estado (smoke):** **APROBADO 2026-10-05** — backdrop + spinner al instante del click
en "Jugar de nuevo" (midgame), los botones no navegan durante el ad, el bloqueador se
cierra solo al terminar/fallar (incluido el caso **sin fill**) y **un solo `requestAd`**
por click; punto 2, ver entrada del 2026-10-05. La regresión del modo `portal` (overlay
de countdown intacto) ya constaba verificada el 2026-10-04. `CG-MON-002`,
`CG-MON-005` y `CG-MON-006` cerraron el mismo día (puntos 3, 4 y 5). **Deuda nueva:**
ninguna.

---

## 2026-10-04 · Publicación A4 — nombre canónico "Deck or No Deck" alineado en docs

**Qué se tocó (solo docs + README; `src/` intacto):**
1. `README.md:1` H1 → `# Deck or No Deck (speculation-game)`.
2. `docs/ARCHITECTURE.md:1` H1 → `# Arquitectura — Deck or No Deck (speculation-game)`.
3. `package.json` `description` → arranca con "Deck or No Deck — …" (tocado por el
   orquestador, fuera de este agente); **`name: speculation-game` se mantiene**
   (decisión del usuario).
4. `index.html` `<title>` ya era `Deck or No Deck` ✓ — sin tocar.
5. `docs/MAP.md` H1 ("MAPA del código") no nombra el proyecto — sin cambios.

**Cómo se verificó (grep):** grep del nombre erróneo anterior → **0** en docs/ y README
tras el fix (solo estaba en los 2 H1 corregidos; este LOG tampoco lo repite, para no
ensuciar greps futuros). Referencias legítimas al programa TV
*Deal or No Deal* intactas: `README.md:3` ("estilo *Deal or No Deal*") y el "estilo
Deal or No Deal" del `description` de `package.json`. Las otras apariciones de "Deck or
No Deck" son historial de este LOG (append-only, no se reescribe) e i18n en
`LanguageData.ts` (correcto).

**Gates (DoD):** corridos por el orquestador después de esta entrada → `npm run typecheck`
**0 errores** · `npm run lint` **0** · `npm test` → **45 suites / 522 tests en verde**
(idéntico a A3: solo cambiaron 2 H1 de docs + `description` de `package.json`, nada de
`src/`).

**Qué quedó pendiente:** cierra el ítem "naming canónico" que venía
abierto desde las entradas 2026-10-01/02. Sin ADR (cambio de naming, no de diseño).

---

## 2026-10-04 · Publicación A3 — CG-PUB-003: `ads_disabled` como estado permanente (ADR-009)

**Qué pasó (hallazgo de la auditoría de publicación 2026-10-04, `CG-PUB-003`):** en
**Basic Launch** el SDK de CrazyGames reporta cada rewarded con
`adError {code: 'adsDisabledBasicLaunch'}` y el repo **no mapeaba** ese código **ni**
`{code: 'adblock'}` → ambos caían en `reason: 'error'` genérico → `ad_failed` + cooldown
`cooldown_retryable` = **POLÍTICA 1 de ADR-006 (sin reembolso)** para un fallo que nunca
se cura. Resultado: en la Tienda el jugador **pagaba monedas** por
Duplicar/Triplicar/Revivir y cada 60 s perdía más intentos en un botón que **nunca
funciona** — criterio de rechazo QA *"no rewarded buttons without effect"* — y el dinero
quedaba trabado (`ad_failed` no reembolsa por diseño). Agravante: `hasAdblock()` corre **en
el init** (antes de que exista la extensión) y puede no detectarla, así que el único aviso
disponible — el `adError` del SDK — se descartaba.

**Fix (`src/`, red→verde):**
1. **Dominio — puerto `ICrazyGamesService.ts`:** nuevo motivo permanente
   **`'ads_disabled'`** en la unión `RewardedAdStatus`, documentado en su JSDoc y en el de
   `rewardedAdStatus()`: los permanentes son `sdk_unavailable`, `adblock`, `ads_disabled`.
2. **Infra — `CrazyGamesService.ts`:** campo `adsDisabled`; helper `errorCodeOf()` (lee
   `code` o `reason`, tolerancia heredada — `isUnfilled()` ahora lo usa);
   `notePermanentError(error)` invocado desde el `adError` **ANTES de `settle()`**:
   `adsDisabledBasicLaunch` → `adsDisabled = true`; `adblock` → `adblockDetected = true`.
   `rewardedAdStatus()` orden: `sdk_unavailable` → `adblock` → **`ads_disabled`** →
   cooldown → `available` (**lo permanente manda sobre el cooldown de 60 s**).
3. **Aplicación:** `ReviveWithAdUseCase` y `MultiplyRewardUseCase` — bloque de POLÍTICA 2
   extraído a `policyTwoRefund(...)`; `case 'ads_disabled'` pre-consumo (junto a
   `sdk_unavailable`/`adblock`/`cooldown_no_fill`); y **clave**: después de un
   `showRewardedAd()` fallido **re-evalúan `rewardedAdStatus()`** — si el adError volvió el
   estado permanente (`'ads_disabled'`/`'adblock'`) aplican la política 2 **YA** (reembolso
   exacto `costOf(id)`) en vez de `'ad_failed'` sin reembolso. Invariante **reembolso XOR
   efecto intacto**. `ListAvailableUpgradesUseCase` y el guard de
   `PurchaseSessionUpgradeUseCase` **sin cambios**: `isRewardedAdAvailable()` vuelve
   `false` solo → ocultan/filtran las 3 filas de rewarded.
4. **Fake (testing):** `FakeCrazyGamesService.setRewardedStatusAfterNextAd(status)` —
   simula el SDK real: si el próximo rewarded falla, el estado pasa a ser permanente en
   vuelo.

**Specs red→verde (9 tests nuevos):** `CrazyGamesService.spec.ts` **+2** (rojo
`Expected: "ads_disabled"/"adblock", Received: "cooldown_retryable"`; además afirma que
**no** vuelve con el cooldown a los 60 s) · `ReviveWithAdUseCase.spec.ts` **+3** (rojo:
`ad_failed` sin reembolso) · `MultiplyRewardUseCase.spec.ts` **+3** ·
`ListAvailableUpgradesUseCase.spec.ts` **+1** (`setRewardedStatus('ads_disabled')` → 5
filas, sin double/triple/revive).

**Docs (tarea de esta sesión, `memory-keeper`):** `docs/DECISIONS/ADR-009-ads-disabled-estado-permanente.md`
+ fila `009` en `docs/DECISIONS/README.md`, `docs/MAP.md` (censo → **162 archivos / 45
specs / 24.065 L**; deltas: `ICrazyGamesService.ts` 78→86 [ports 317→325],
`CrazyGamesService.ts` 408→**461** + spec 252→**294**, `ReviveWithAdUseCase.ts` 143→**168**
+ spec 515→**571**, `MultiplyRewardUseCase.ts` 130→**154** + spec 392→**439**,
`ListAvailableUpgradesUseCase.spec.ts` 74→**91**, `FakeCrazyGamesService.ts` 111→**129**
[`testing/*` 259→277]), `docs/testing.md` (45/**522**, +9 desglosados por spec,
`FakeCrazyGamesService` con `setRewardedStatusAfterNextAd`), `docs/ARCHITECTURE.md` §5
(unión `rewardedAdStatus()` con `ads_disabled` + adapter propio nunca lo produce),
`AGENTS.md` §4 (el grupo permanente de la política 2 ahora incluye `ads_disabled` —
enumeración desactualizada por el fix), esta entrada.

**Cómo se verificó:** gates en verde (corridos por la unidad, no por esta sesión de docs) —
`npx jest` 4 specs (62 tests) ✓ con rojo→verde de los 9 · `npm run typecheck` 0 ✓ ·
`npm run lint` 0 ✓ · `npm test` → **45 suites / 522 tests** (base 45/513) ✓ ·
`npm run build` ✓ (6,5 s; el warning de chunk >750 kB de Phaser es preexistente).

**Qué quedó pendiente:** **A4** (README + `package.json` `description` con el nombre
canónico **"Deck or No Deck"**) · **APS en Developer Portal** (acción fuera del repo —
decisión del usuario) · **Sprint B** de la auditoría (`CG-MON-001`, `CG-MON-002`,
`CG-MON-005`, `CG-MON-006`) — **cerrado con smoke APROBADO 2026-10-05**, ver entrada
nueva · **smoke en modo `crazygames` con el QA Tool** (último smoke de ese modo:
**2026-10-05**) · **Vite 8** (decisión del usuario) · **`dist.zip`** dejado como
está (decisión del usuario).

---

## 2026-10-04 · Publicación A1 — CG-PUB-002: botón de fullscreen propio fuera de CrazyGames (ADR-008)

**Qué pasó (hallazgo de la auditoría de publicación 2026-10-04, P0 `CG-PUB-002`):**
CrazyGames **prohíbe** los botones de pantalla completa propios (*"Custom in-game
fullscreen buttons are prohibited"*). `SoundFullscreenControls.ts:85` tenía
`showFullscreenButton = true` como default mientras su JSDoc juraba `false` — drift
desde `c9680f4` (2026-09-28) — y ninguna de las 4 escenas pasaba el 3.er argumento →
`MainMenuScene:197`, `HowToPlayScene:599`, `DeckSelectionScene:167`, `UIScene:130`
heredaban el botón prohibido **en todos los modos**, incluido el default
`VITE_ADS=crazygames` (el que se publica).

**Fix (`src/`, diseño del usuario = env pareja del adapter):**
1. **Nuevo `resolveFullscreenEnabled(raw, adsMode)`** (`infrastructure/config/`, al lado
   de `resolveAdsMode`, misma rigidez de literales exactos): default seguro **`false`**
   sin env/basura; en `crazygames` **siempre** `false` (si el env dice `'true'` se
   ignora + `console.warn` — la plataforma manda); en `portal`/`none` acepta solo
   `'true'`/`'false'` exactos; cualquier variante (espacios, mayúsculas, typos) →
   `false` + warn con el valor crudo; `undefined`/vacío → `false` sin warn.
2. **Wiring**: `main.ts:40` resuelve `import.meta.env.VITE_FULLSCREEN` con el `adsMode`
   ya resuelto y lo inyecta en el bag como **`GameServices.fullscreenEnabled`** (campo
   nuevo); las 4 escenas pasan `services.fullscreenEnabled` como 3.er argumento;
   default del constructor → **`false`** y JSDoc de la clase corregido (borró la
   afirmación falsa + cita ADR-008). Presentation no lee env directo.
3. **`vite-env.d.ts`** tipa `readonly VITE_FULLSCREEN?: 'true' | 'false'`.
4. **Tool `/ads-adapter`** (`.opencode/agents/ads-adapter.md` 74 L +
   `.opencode/commands/ads-adapter.md` 16 L): ahora escribe el **PAR** en `.env` —
   `crazygames` → `VITE_FULLSCREEN=false`; `portal`/`none` → `true`; el reporte
   MODO/BUILD/BUNDLE muestra ambas envs.
5. **`.env.example`**: bloque comentado de `VITE_FULLSCREEN` con el mapping.
6. **Specs red→verde (9 tests):** `resolveFullscreenEnabled.spec.ts` (5; el rojo era
   `Cannot find module`) y `SoundFullscreenControls.spec.ts` (4; el rojo era
   `Expected 1, Received 2` — el bug reproducido; mockea `phaser` + `HudIconButton` al
   estilo de `DeckCelebrationEffect.spec`).

**Docs (tarea de esta sesión, `memory-keeper`):** `docs/DECISIONS/ADR-008…md` + fila en
`docs/DECISIONS/README.md`, `docs/MAP.md` (censo → **162 archivos / 45 specs / 23.775 L**,
fila nueva `resolveFullscreenEnabled` 70 L, `main.ts` 348→353, `GameServices` 44→49,
`vite-env.d.ts` 28→37, `presentation/` 4 specs), `docs/testing.md` (45/513, filas
`infrastructure/` 8 y `presentation/` 4), `docs/ARCHITECTURE.md` §2 (par de envs
`VITE_ADS` + `VITE_FULLSCREEN`), `AGENTS.md` §3 (mención en la fila de `main.ts`),
esta entrada.

**Cómo se verificó:** gates en verde — `npx jest` specs afectados (16 en
`config/` + `components/`) ✓ · rojo→verde de los 9 tests nuevos ✓ · `npm run typecheck` 0 ✓ ·
`npm run lint` 0 ✓ · `npm test` → **45 suites / 513 tests** (base 43/504) ✓ ·
**verificación en vivo de la tool**: `/ads-adapter crazygames` → PASS (`.env` =
crazygames/false, bundle 1 match `sdk.crazygames.com`) y `/ads-adapter portal` → PASS
(0 matches); los 2 builds PASS.

**Qué quedó pendiente:** **A3** (ads_disabled) en curso · **A4** (README/package con el
nombre canónico **"Deck or No Deck"**) · **APS en portal** (decisión del usuario —
acción fuera del repo) · sobrantes **`dist.zip`** (dejado como está por decisión del
usuario). `.env` local restaurado en `portal`/`true`.

---

## 2026-10-04 · BUGFIX ADR-007: `AdOverlayScene` al boot — carrera `add`/`start` en el primer ad del modo portal

**Qué pasó (bug en `src/`, ya fixeado):** en modo `VITE_ADS=portal` el **primer**
reclamo de Duplicar de la sesión fallaba (`RESULT_AD_LOADING` → `RESULT_AD_FAILED` →
`RESULT_AD_COOLDOWN`; consola: `Scene key not found: AdOverlayScene`) y "después
funcionaba bien". Causa raíz probada contra `node_modules/phaser/src/scene/SceneManager.js`
(Phaser 3.90.0): `presentAdOverlay()` hacía `scene.add()` + `scene.start()` en runtime,
pero `SceneManager.add()` **se defiere a `_pending`** cuando `isProcessing` es `true`
(no registra la escena todavía) y `SceneManager.start()` **no** se defiere → `getScene`
sincrónico no encuentra la clave → no arranca nada → promise del presenter colgada →
**watchdog de 15 s** de `OwnRewardedAdService` → `'error'` → **cooldown 60 s**. Al frame
siguiente `processQueue()` registraba la escena dormida (`autoStart: false`), por eso
los reclamos siguientes andaban.

**Fix (`src/`):** (1) `main.ts` (348 L): `AdOverlayScene` importada (línea 5) y **al
final** de `config.scene` (última = se dibuja arriba de todo, la posición que le daba el
registro en runtime). (2) `AdOverlayScene.ts` (275 → 301 L): `presentAdOverlay()` ya
**no** llama a `scene.add()` — chequea `game.scene.getScene(AD_OVERLAY_KEY)` y si falta
→ `console.error` + `Promise.resolve({ completed: false })` (**degradación en 0 s**,
nunca llega al watchdog); JSDoc marcado `BUGFIX (ADR-007 enmienda 2026-10-04)`.
(3) Nuevo `src/presentation/scenes/AdOverlayScene.spec.ts` (123 L, **3 tests**; mockea
`'phaser'` como `DeckCelebrationEffect.spec` — entorno node, sin jsdom).

**Docs (tarea de esta sesión, `memory-keeper`):** `docs/DECISIONS/ADR-007…md` (+enmienda
2026-10-04 y las dos fechas en el header), `docs/ARCHITECTURE.md` §7 (10 escenas),
`docs/MAP.md` (fila `AdOverlayScene` 301 L, fila `main.ts` 348, censo → 159 archivos /
43 specs, `presentation/` 3 specs), `docs/testing.md` (43/504, `AdOverlayScene 3`, fila
`presentation/`, nota de regresión en el smoke de portal), `docs/PLAYBOOK.md` §5 (trampa
nueva: `add()` difiere / `start()` no), esta entrada.

**Cómo se verificó:** gates en verde — `npx jest src/presentation/scenes` → 2 suites /
7 tests ✓ · rojo→verde del test de degradación (antes de fix: `Received: "sin resolver"`)
✓ · `npm run typecheck` 0 ✓ · `npm run lint` 0 ✓ · `npm test` → **43 suites / 504 tests**
(base 42/501) ✓ · `npm run build` ✓ · **smoke manual PASADO (2026-10-04, en vivo con el
usuario):** recargó con `VITE_ADS=portal` y reclamó Duplicar **de primera** → overlay al
instante, consola **sin** `Scene key not found` ni warn del watchdog.

**Qué quedó pendiente:** sobrantes sin resolver: `dist.zip` y `M .env.example`.
**Observación opcional (no reproducida):** si algún día aparecen errores `Uncaught` en la
consola, un frame que aborta antes de `render()` deja `isProcessing` trabado — la misma
condición que gatilló la carrera; el usuario **no** reportó errores en el smoke del
2026-10-04, así que no es pendiente activo.

---

## 2026-10-02 · Tooling: agente + comando `ads-adapter` (build por `VITE_ADS`)

**Qué se tocó:** `.opencode/agents/ads-adapter.md` (agente nuevo, `mode: subagent`),
`.opencode/commands/ads-adapter.md` (comando `/ads-adapter <modo>` → `agent: ads-adapter`,
`subagent: true`) y `.gitignore` (+`.env`). Nada en `src/` ni en docs de producto.

**Qué hace:** con un modo pedido (`crazygames` | `portal` | `none`, literal **exacto** —
misma regla estricta que `resolveAdsMode`) escribe `VITE_ADS=` en `.env` (persistente y
compatible con cualquier shell de Windows; no toca `.env.example`), corre `npm run build`
y verifica el bundle contra ADR-007: grep de `sdk.crazygames.com` en `dist/` con **>0**
matches para `crazygames` y **0** para `portal`/`none`. Reporte MODO/BUILD/BUNDLE +
VEREDICTO. Patrón calcado de `crazygames-auditor` + `crazygames-audit`.

**Cómo se verificó:** flujo simulado a mano con el procedimiento del agente — `portal`:
`.env` ignorado (`git check-ignore` OK), build verde, **0 matches**; `crazygames`: build
verde, **1 match** (el loader dinámico en el JS); gates en verde (typecheck 0 · lint 0 ·
42 suites / 501 tests). Formato de frontmatter contra la doc oficial de OpenCode V2
(`subagent` es el campo vigente; `subtask` es alias deprecado).

**Qué quedó pendiente:** invocar `/ads-adapter <modo>` de verdad (el catálogo de
subagentes de esta sesión es fijo — probar tras reiniciar OpenCode); `.env` queda en
`VITE_ADS=crazygames` (default); `.env.example` tenía un cambio propio del usuario
(línea de ejemplo) que **no** se tocó ni se commiteó; `dist.zip` sigue sin dueño claro.

---

## 2026-10-02 · Smoke del modo portal verificado en vivo (6/6 ítems, ADR-007)

**Qué se tocó:** solo `docs/testing.md` (checklist del modo `portal` marcado
*VERIFICADO 2026-10-02* + párrafo de resultado) y esta entrada. Nada en `src/`.

**Cómo se verificó** (smoke manual guiado, `VITE_ADS=portal npm run dev` en
`http://localhost:5174` y luego `VITE_ADS=none`):
1. **Visibilidad**: con `portal`, la tienda muestra Duplicar/Triplicar/Revivir y la pestaña
   Red **no** pide `sdk.crazygames.com`. ✔
2. **Overlay completo**: Duplicar → victoria → overlay de 3 s bloqueando el tablero →
   efecto entregado **sin reembolso** (sin devolución de los 3000). ✔
3. **Cancelación**: ✕ dentro de los 3 s → `RESULT_AD_COOLDOWN` con botones **vivos**,
   sin reembolso → reintento real a los 60 s (volvió a abrir el overlay). ✔
4. **Revivir en derrota**: overlay completo → revive y la partida continúa, consumo
   cobrado sin reembolso. ✔
5. **Midgame**: overlay corto con `AD_OVERLAY_HINT_MIDGAME` en el flujo de la pantalla
   de resultado. ✔
6. **`VITE_ADS=none`**: `window.CrazyGames === undefined`, sin pedir el SDK, filas de ads
   **ocultas** (resto de mejoras visibles en ambos idiomas); grep de `sdk.crazygames.com`
   en `dist/` limpio para `portal`/`none` (corrido en la fase de gates). ✔

**Qué quedó pendiente:** Vite 8 (decisión del usuario); archivos `.opencode/` sin
commitear; `dist.zip` en la raíz sin dueño claro (artefacto sin explicación, no tocado);
naming canónico "Deck or No Deck"; regresión de los 11 ítems en modo `crazygames` si se
toque el camino feliz.

---

## 2026-10-02 · Sincronización de docs tras la unidad ADR-007 (anuncio propio + `VITE_ADS`)

**Tarea:** llevar toda la documentación al código de la unidad **ADR-007**, ya implementada
en verde y commiteada localmente (7 commits `be1beac..56bd5d0`, **sin pushear**). Solo
`docs/` + `AGENTS.md` (+ `.env.example`, ver pendiente): **nada en `src/`**, sin commits.

**Qué se tocó (los 5 bloques):**
1. **Decisiones** — `docs/DECISIONS/README.md`: fila de **007** en la tabla. `ADR-007`
   ampliado con **Consecuencias (enmienda 2026-10-02, estado sigue *Aceptada*)**: las 3
   decisiones conscientes de la revisión — (a) ventana de carga en modo `crazygames` con
   el script dinámico (`reportGameplayStart()` puede descartarse; **telemetría, no ads**,
   aceptado), (b) **watchdog de 15 s** en `OwnRewardedAdService` (presenter colgado →
   `'error'` retryable; resultado tardío descartado), (c) `resolveAdsMode` **estricto**
   (cualquier desviación → default + warn) para equivaler por construcción al espejo
   plegable de `main.ts`. `ADR-006`: la mención `rewardedBlockedUntil = now + 60000` ahora
   apunta a `RewardCooldownTracker.noteFailure()` (`blockedUntil = ahora + 60000`) —
   **política intacta**, solo cambió dónde vive el campo.
2. **Contrato/estado** — `AGENTS.md`: §3 `LanguageData.ts` **145 → 148 claves**; fila de
   `main.ts` con la **selección del adapter de ads por `VITE_ADS`** (ADR-007) y §1
   38 → **42** `*.spec.ts`. §4 (invariantes) sin cambios.
3. **Mapa/prueba** — `docs/MAP.md` censo **2026-10-02**: **158 archivos TS · 23.344 líneas ·
   116 fuente + 42 specs**; los **10 archivos nuevos arriba** (`vite-env.d.ts`,
   `resolveAdsMode`+spec, `RewardCooldownTracker`+spec, `OwnRewardedAdService`+spec,
   `AdOverlayScene`+`.resolution`+spec) y `main.ts` **214 → 333 L** medido,
   `CrazyGamesService` (408 L, delega cooldown), `LanguageData` **451 → 467 L / 148 claves**,
   `index.html` ya **no** carga el SDK. `docs/testing.md`: header **42 suites · 501 tests**
   (477 `it(` + 24 filas de `it.each` = 467 previos + 34 de las 4 specs nuevas), tabla de
   specs por capa (infra 7 · presentation 2), la nota que decía "`index.html:29` carga el
   SDK" corregida (hoy carga en **dinámico** desde `main.ts`) y **checklist de smoke del
   modo `portal`** — 6 ítems **nuevos, NO corridos**.
4. **Arquitectura** — `docs/ARCHITECTURE.md`: composition root con la tabla de los **3
   modos** de `VITE_ADS` y boot `script → init → juego`, puerto con **2 adapters** +
   `RewardCooldownTracker`, overlay propio con **presenter inyectado** (escena 10.ª
   registrada en runtime), i18n **148**, 42 specs. `docs/PLAYBOOK.md` §1: **(a)** deuda de
   naming `ICrazyGamesService` → `IAdService` (decisión 4 del ADR-007, anotada como
   prometió) y **(b)** `AdOverlayScene` registrado como copia **≥11** de la paleta
   "Casino de Lujo" y del chrome de modal/✕; §4 serie de claves i18n llevada a **148**.
5. **Entorno** — `.env.example` **existe** (placeholder "sin variables"): iba a documentar
   `VITE_ADS=crazygames|portal|none` pero el tool lo **rechazó con permiso denegado**
   (fuera de `docs/`+`AGENTS.md`+`README.md`) → **queda pendiente**.

**Por qué:** ADR-007 + decisiones del usuario (overlay de 3 s, adapter por env, sin rename
del puerto) + los hallazgos de la revisión (1 bloqueante + 3 corregidos/documentados).

**Cómo se verificó (gates de la unidad, en verde al abrirla):** typecheck **0** · lint **0**
· **42 suites / 501 tests** · coverage con **umbrales verdes** · `npm run build` ✅ y
`VITE_ADS=portal npm run build` ✅ con **cero** `sdk.crazygames.com` en `dist/` · `qa`
gates 1-4 **PASS** · `reviewer`: 1 hallazgo bloqueante + 3 corregidos/documentados
(alineación `resolveAdsMode`↔gate, watchdog 15 s, race de carga aceptada, copia de paleta
en PLAYBOOK).
**Verificación de ESTA tarea (grep sobre docs vigentes):** "145 claves" → **0** fuera del
historial de este LOG · "`index.html:29` carga el SDK" → **0** · `rewardedBlockedUntil` →
**0** (solo historial del LOG) · ADR-007 **presente** en `docs/DECISIONS/README.md` ·
`src/` intacto.
**Método:** `cloc`/`wc -l` y `git` **no corrieron** (tool `shell` con permiso denegado en
esta sesión): los LOC se midieron línea a línea con la tool de lectura y el total de MAP es
el censo previo **+ deltas medidos** (los archivos no listados conservan su LOC anterior).

**Qué quedó pendiente:** **(1)** documentar `VITE_ADS` en `.env.example` (permiso
denegado); **(2)** smoke manual del modo `portal` — los 6 ítems nuevos de `docs/testing.md`;
**(3)** pendientes de siempre: `.opencode/` sin commitear, naming canónico "Deck or No
Deck" (+ rename `IAdService` en PLAYBOOK §1), Vite 8 (decisión del usuario). Unidad sin
pushear (`be1beac..56bd5d0`).

---

## 2026-10-01 · Smoke 1-4 y 8 verificado en vivo — checklist de smoke COMPLETO

**Qué se tocó:** solo `docs/testing.md` (ítems 1-4 y 8 marcados *verificado
2026-10-01*, receta del ítem 8 corregida, estado de cabecera reescrito) y esta entrada.
Nada en `src/`.

**Cómo se verificó (smoke manual guiado en `http://localhost:5174`):**
- **Ítem 1:** partida completa → DEAL → cobrar con el premio acreditado. ✔
- **Ítem 2:** NO DEAL al final; swaps de mitad y de partida aparecieron. ✔
- **Ítem 3:** Revivir comprado en tienda (1250) → energía a 0 → anuncio real abierto en
  localhost → efecto entregado **sin reembolso**, energía restaurada, partida
  continúa. ✔
- **Ítem 4 (4 checks):** mejora con fondos (descuenta + aplica), conflicto
  Duplicar/Triplicar (**mensaje y sin cargo**), sin fondos (saldo intacto) y compra de
  mazo desde el menú (descuenta + desbloquea). ✔
- **Ítem 8 — receta CORREGIDA:** la vieja (bloquear `*crazygames-sdk-v3.js*` y
  recargar) **no puede** mostrar el mensaje del guard: al reabrir la tienda
  `ListAvailableUpgradesUseCase` oculta las filas `requiresRewardedAd` y no hay botón
  que clicear. Receta válida = **caída en caliente** (`window.CrazyGames = null` con la
  tienda ya abierta) → mensaje *"Requiere anuncio recompensado — no hay anuncios
  ahora."* y **sin cargo** (el guard corre antes de `spendCoins`). Además se verificó
  la **rama oculta** del filtro (filas desaparecen con el SDK caído y reaparecen al
  restaurarla) — la rama que quedó pendiente de vivo desde 2026-09-30. El conflicto
  con ads caídos no es alcanzable (Triplicar está oculta); quedó cubierto en el 4. ✔

**Estado:** los **11 ítems del smoke están verificados en vivo** (1-4 y 9-11 el
2026-10-01; 5-7 el 2026-09-30).

**Qué quedó pendiente:** Vite 8 (decisión del usuario); archivos `.opencode/` sin
commitear; naming canónico "Deck or No Deck"; smoke de regresión completo cuando se
toque algo del camino feliz.

---

## 2026-10-01 · Smoke 9-11 verificado en vivo (reembolso + cooldown, ADR-006)

**Qué se tocó:** solo `docs/testing.md` (ítems 9-11 marcados *verificado 2026-10-01*,
estado de cabecera actualizado, receta y resultados del smoke) y esta entrada. Nada en
`src/`.

**Cómo se verificó (smoke manual guiado en `http://localhost:5174`):**
- **Receta nueva:** el SDK se derrumba **en caliente** desde la consola
  (`window.__cg = window.CrazyGames; window.CrazyGames = null;`) en vez de bloquear
  `*crazygames-sdk-v3.js*` en DevTools — eso exigiría recargar y mataría la sesión en
  curso (la tienda compra sobre la sesión activa). Funciona porque
  `CrazyGamesService.isAvailable()` relee `window.CrazyGames?.SDK?.ad` en cada llamada.
- **Ítem 9 (victoria):** Duplicar comprado con SDK OK → consumido con SDK caído →
  `RESULT_AD_REFUNDED`, botones apagados, saldo devuelto **una sola vez** (re-click sin
  segundo abono). ✔
- **Ítem 10 (derrota):** ídem con Revivir (energía a 0) → `RESULT_AD_REFUNDED`, botón
  apagado, saldo devuelto una sola vez. ✔
- **Ítem 11 (SDK OK):** el SDK real **abrió el anuncio** (caso A) y al terminar el efecto
  se entregó **sin reembolso**; cancelar y recomendar dentro de los 60 s →
  `RESULT_AD_COOLDOWN` con los botones **vivos**, y a los 60 s el reintento volvió a
  pedir el anuncio. ✔

**Qué quedó pendiente:** smoke ítems **1-4** (partida completa, swap, revivir con anuncio,
tienda) y **8** (guard de compra con el SDK bloqueado vía DevTools — la receta de esa
página); Vite 8; archivos `.opencode/` sin commitear; naming canónico del título.

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
