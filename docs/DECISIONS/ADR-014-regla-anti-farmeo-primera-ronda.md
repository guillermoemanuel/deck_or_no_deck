# ADR-014: Regla anti-farmeo de la 1ª ronda (cap de oferta + cuenta regresiva)

**Estado:** Aceptada · **Registrada:** 2026-10-08 · **Unidad:** anti-farmeo —
Commit 2 del rebalance (tras ADR-013)

## Contexto

La simulación de granjero (ACEPTAR la oferta de la 1ª ronda siempre) es la estrategia
más rentable del juego: ≈ **797 monedas por carta abierta** — farmear tratos rápidos
ciclando partidas de 3 cartas rinde casi el doble que jugar por la carta secreta sin
tensión. No hay ningún castigo por repetir el trato de la 1ª ronda: el Banquero
"pierde" cada vez y el jugador nunca lo hace.

Restricciones del diseño:

- El Desafío Diario es **por fecha, mismo tablero para todos** — la secuencia de ruido
  del banquero debe seguir siendo idéntica entre todos los jugadores de un día.
- El dominio **nunca** llama `Math.random()` (ADR-013): todo sorteo va por el
  generador inyectado.
- Abandonar la partida no debe modificar contadores (anti-cheat: `beforeunload`).
- Persistencia existente en esquema **v4** (y v3) — la migración debe ser
  retrocompatible: campos ausentes → `0/0`.

## Decisión

- **(a) Fuente única `src/domain/value-objects/BankerPolicy.ts`** — tres constantes
  nuevas (mismo espíritu que ADR-013: ningún otro archivo puede hardcodear estos
  números):

  | Constante | Valor |
  |---|---|
  | `FIRST_ROUND_STREAK_TRIGGER` | `4` — tratos de 1ª ronda **consecutivos** que activan la regla |
  | `CAPPED_GAMES_DURATION` | `5` — partidas que queda activa (cuenta regresiva de 5 a 0) |
  | `CAPPED_OFFER_VALUES` | `[1, 2, 5, 10]` — catálogo de caps; se sortea **UNO** por activación |

- **(b) Value Object `domain/value-objects/FirstRoundDealStreak.ts`** — estado puro:
  `consecutiveGames ∈ [0,3]` + `cappedGamesRemaining ∈ [0,5]`. El ctor valida
  (enteros, rangos — lanza si no); `restore()` **sanea** en vez de lanzar (dato de
  storage podrido → `0/0`, nunca rompe la partida); `withGameEnd(outcome)` aplica las
  reglas; `drawCappedOfferValue(u)` mapea la muestra a `[1,2,5,10]`; `INACTIVE` es el
  singleton `0/0`. Reglas en `withGameEnd`:
  1. Inactiva + acepta la 1ª → `consecutive + 1`; al llegar a **4** → activa
     (`(0, 5)`, el 4 nunca se almacena).
  2. Inactiva + cualquier otro final (rechaza, pierde antes de la oferta, gana por
     tablero) → reset a `0/0`.
  3. **Activa** + rechaza la oferta topada de la 1ª → `remaining − 1` (0 → `0/0`).
  4. Activa + acepta la topada / pierde en cartas 1-3 / gana → **sin cambio**.
  5. El Desafío Diario **nunca** alimenta la regla (ver e).
- **(c) Cap de la oferta** en `OfferCalculator.calculate(...)`: **3.er param opcional
  `firstRoundCap`** — solo en ronda 1,
  `oferta_final = min(oferta, cap)` aplicado **después** del bono Negociador y de los
  clamps (es decir, después de `min(…, 1.2×promedio)`): el cap es lo último que manda.
- **(d) Sorteo único por partida** en `GameSessionFactory.createGameSessionWithSelection(values,
  secretIndex, offerRandom, streak?)` (4º param opcional, default `INACTIVE`): si
  `streak.isActive` consume **UNA muestra extra** de `offerRandom()` ANTES del ruido
  → `drawCappedOfferValue`; si no, **no consume nada**. Consecuencia: la secuencia de
  ruido de ADR-013 queda intacta para quien no está topado, y el generador diario
  (que recibe `INACTIVE`) no varía jamás.
- **(e) Exclusión del Desafío Diario, doble barrera:** `GameScene` le pasa
  `FirstRoundDealStreak.INACTIVE` a la factory (la oferta diaria nunca lleva cap y su
  secuencia de ruido sigue siendo idéntica para todos) **y**
  `RecordFirstRoundDealOutcomeUseCase.execute(outcome, isDaily)` es **no-op** cuando
  `isDaily` (no lee ni escribe contadores).
- **(f) Tracker puro `application/records/FirstRoundDealStreakTracker.ts`** — mismo
  patrón que `GameResultTracker` (reporta como máximo una vez por partida):
  - `DealAccepted` **dispara el reporte** (`firstRoundDealAccepted =
    offer.roundNumber === 1`) y así cubre el `GameWon` que llega después.
  - `GameWon`/`GameLost` con oferta de 1ª ronda vista y no aceptada →
    `rejectedRound1Offer = true`; `GameLost` queda **pendiente** hasta `flush()`
     (SHUTDOWN) para no contar derrotas revividas con anuncio.
  - **Abandono no reporta** (nunca llegan GameWon/GameLost → `flush()` sin pendiente).
- **(g) Use case `application/use-cases/RecordFirstRoundDealOutcomeUseCase.execute(outcome, isDaily)`**
  — lee el streak vía `IProgressionService`, aplica `withGameEnd` y escribe solo si
  cambió; **sin eventos nuevos** (no emite `GameEvent` — nada de UI depende de él).
- **(h) Persistencia esquema v5** en `LocalStorageProgressionRepository`
  (puertos `IProgressionRepository`/`IProgressionService` con par `get/set
  FirstRoundDealStreak`): migración **v4 → v5** con backfill `(0,0)` y **v3 → v5**
  directo; validación al cargar (enteros, `consecutive ∈ [0,3]`, `remaining ∈
  [0,5]` → si no, `0/0`); `clearAll`/`createDefault` incluyen el campo.
- **(i) UI — aviso solo cuando corresponde:**
  - `BankerOfferPanel(…, cappedRemainingGames?)` dibuja una línea en y≈204 (debajo de
    los botones) con `BANKER_CAPPED_NOTICE_SINGULAR/PLURAL` (1 vs 2..5).
  - `GameSceneController` la pasa **solo si `offer.roundNumber === 1` y el MONTO ∈
    `CAPPED_OFFER_VALUES`** — chequear el monto (el promedio natural de 9 cartas
    cerradas nunca baja de ~149, así que 1-10 solo viene del cap) excluye el diario
    de forma natural, sin preguntar por `dailyDateKey`.
  - Línea corta en el paso 3 de `HowToPlayScene`
    (`TUTORIAL_BANKER_CAPPED_CAPTION`) y frase añadida a `ONBOARDING_BANKER_BODY`;
    la burbuja de onboarding creció de 104 → **110 px** (`BUBBLE_Y` 662 → 666) para
    que el cuerpo de 3 líneas no pise la línea "Más reglas".

## Consecuencias

- **Spec de economía `src/domain/value-objects/FirstRoundDealStreak.farming.spec.ts`**
  (20.000 partidas sembradas, `GameSession`/`EnergyDeltaTable`/`OfferCalculator`
  reales — mismo molde que `BankerPolicy.balance.spec.ts`):
  - Granjero CON regla = **557.0** monedas/carta (banda 480-620); SIN regla =
    **797.0** (≈798) — el farmeo queda a **69 %** del libre, diluido sin matarse.
  - Jugador p=0.7 (acepta la 1ª cuando no está topado; la topada de 1-10 jamás):
    **30.2 %** de partidas jugadas topadas (banda 27-37 %).
  - Toda oferta de 1ª ronda emitida con la regla activa pertenece a
    `CAPPED_OFFER_VALUES` (invariante del cap).
- **Cuenta regresiva solo por rechazo:** aceptar la oferta topada (aunque sea $1)
  no decrementa; perder en cartas 1-3 o ganar tampoco. Abandono = ningún cambio.
- **Ciclo del granjero determinista ≈ 9 partidas:** 4 aceptando la 1ª (acumula) +
  5 rechazando la topada (descuenta). Si el jugador pierde antes de la oferta, la
  racha se reinicia y vuelve a necesitar 4.
- **La regla vive en `GameResultTracker`-style:** un solo evento de suscripción en
  `GameScene.setupOutcomeRecording` (junto a `GameResultTracker`), un solo `flush()`
  en SHUTDOWN; `DealAccepted` cubre el `GameWon` posterior sin doble reporte.
- **Specs nuevos/ampliados:** `FirstRoundDealStreak.spec` (20 tests),
  `OfferCalculator` cap (27 tests con `Banker.spec`), `GameSessionFactory.spec`
  (11), `FirstRoundDealStreakTracker.spec` (13, incl. 2 de integración con sesión
  real + `ResolveDealUseCase`), `RecordFirstRoundDealOutcomeUseCase.spec` (7),
  `LocalStorageProgressionRepository.spec` (nuevo — cierra el hueco de
  `testing.md`), `ProgressionManager.spec` ampliado, `LanguageData.spec` (paridad
  de claves nuevas en en/es), `FirstRoundDealStreak.farming.spec` (3).
- **Gates:** 4 en verde — `npx jest <selectivo>` → `npm run typecheck` (0) →
  `npm run lint` (0) → `npm test`.
- **Pendientes deliberadamente fuera de alcance:** (1) escudo + tanque ≈ 0 % de
  probabilidad de derrota (heredado de ADR-013); (2) precios de mejoras de la tienda
  altos; (3) ajustar la economía de mazos por tiempo. Ninguno de los tres se tocó
  en este commit (tampoco `LOSS_PENALTY_AMOUNT`, `EnergyDeltaTable`, precios del
  catálogo, escudo ni tanque).
