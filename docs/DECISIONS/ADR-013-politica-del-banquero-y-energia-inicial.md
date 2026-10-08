# ADR-013: Política del Banquero y energía inicial (rebalance Fase A + B)

**Estado:** Aceptada · **Registrada:** 2026-10-08 · **Unidad:** rebalance de balance —
Fase A (fórmula de la oferta + energía inicial) y Fase B (penalidad −5000 → −1000,
commit previo `1ea9aa7`)

## Contexto

La simulación de referencia mostraba que **aceptar la PRIMERA oferta dominaba**: con la
penalidad todavía en −5000, EV aceptar = **2151** vs EV seguir jugando = **1893** — el
jugador racional aceptaba siempre y el tablero perdía toda tensión. El **break-even de la
penalidad quedaba en ≈3670**, o sea que −5000 estaba muy del lado incorrecto (de ahí la
Fase B, que la bajó a −1000 en `1ea9aa7`).

La fórmula vieja del `OfferCalculator` era `0.2 × carta_secreta + 0.8 × promedio`,
multiplicada por **×0.85 de riesgo** y pisada por el tope "nunca supera el promedio puro":

- La **carta secreta entraba con peso 0.2**: la oferta dependía de una carta que el jugador
  no ve, y con cartas altas la mezcla **chocaba contra el tope con frecuencia real** — el
  cap estaba constantemente activo en vez de ser salvaguarda.
- El ctor tenía un parámetro `bonusPercentage` que en producción **nunca se pasaba**
  (`new OfferCalculator()` sin args): parámetro muerto.
- El cálculo no tenía una fuente de aleatoriedad inyectable: el dominio no puede depender
  de `Math.random()` y el **Desafío Diario** necesita muestras reproducibles por fecha UTC
  (mismo día → mismas ofertas para todos).
- La **energía inicial era 50 %**, justo en el techo de la zona `low` (ámbar): el HUD
  arrancaba "en problemas" antes de que pasara nada.

## Decisión

- **(a) Fuente única `src/domain/value-objects/BankerPolicy.ts` (24 LOC)** — cinco
  constantes; ningún otro archivo puede hardcodear estos números:

  | Constante | Valor |
  |---|---|
  | `OFFER_ROUND_FACTORS` | `[0.75, 0.85, 0.95]` por ronda de oferta (1ª/2ª/3ª); rondas > 3 usan el último |
  | `OFFER_NOISE` | `0.20` → ruido uniforme ±20 % |
  | `OFFER_MIN_RATIO` | `0.5` — piso de la oferta (red de seguridad) |
  | `OFFER_MAX_RATIO` | `1.2` — techo, aplicado **después** del bono del Negociador |
  | `STARTING_ENERGY_RATIO` | `0.6` — energía inicial y revive = 60 % del techo |

- **(b) Fórmula nueva** en `OfferCalculator.calculate(closedCards, roundNumber, negotiatorBonus?)`:

  ```
  oferta = round(clamp(promedio × factor[ronda] × (1 + ruido) × (1 + bonoNegociador),
                       0.5 × promedio, 1.2 × promedio))
  ```

  - `promedio` = promedio de las cartas **cerradas** del tablero; la carta secreta **salió
    del cálculo** (ya no mezcla peso 0.2).
  - Sin ×0.85 de riesgo (los factores por ronda lo reemplazan) y **sin** el param muerto
    `bonusPercentage` del ctor (eliminado).
  - El bono Negociador (+15 %) se aplica **antes** del clamp.

- **(c) Generador inyectado por constructor**: `constructor(private readonly random: () => number)`.
  **UNA muestra por oferta**, validada en `[0,1)` (lanza si cae afuera); el dominio nunca
  llama `Math.random()`. La muestra se convierte en ruido
  `noise = (muestra − 0.5) × 2 × OFFER_NOISE`.

- **(d) Dos backends del generador**, cableados por sesión en `GameScene`:
  - Partida normal → `IRandomProvider.nextFloat()` (`CryptoRandomProvider`:
    `Uint32 / 2^32`; `DeterministicRandomProvider`: **0.5 → ruido exacto 0** para tests
    predecibles).
  - Desafío Diario → `DailyBoard.createDailyBankerRandom(dateKey)`: PRNG con sal
    `${DAILY_SEED_SALT}:banker:${dateKey}` — misma fecha UTC → mismas muestras para todos,
    con sal **separada** de la del tablero (los mazos diarios no contaminan el ruido).
  - `GameSessionFactory.createGameSessionWithSelection(values, secretIndex, offerRandom)`
    toma el generador como **3.er parámetro obligatorio**; `createGameSession(provider)`
    deriva `() => provider.nextFloat()`.

- **(e) `Banker.makeOffer(closedCards, negotiatorBonus?)`** perdió el parámetro
  `secretCard` — el Banker solo decide cuándo y cuánto, sobre cartas cerradas.

- **(f) Energía inicial y revive = 60 %** del techo vigente (`EnergyLevel.STARTING_RATIO =
  STARTING_ENERGY_RATIO`): revivir te deja en el **mismo punto que una partida nueva** —
  ni ventaja ni desventaja extra.

- **(g) Fase B (commit previo `1ea9aa7`):** penalidad de derrota/abandono −5000 → **−1000**
  (`LOSS_PENALTY_AMOUNT`). Fase A + B juntas cierran el rebalance.

## Consecuencias

- **Spec de balance duro:** `src/domain/value-objects/BankerPolicy.balance.spec.ts`
  (234 LOC) — **50.000 partidas sembradas** que drivean `GameSession` real →
  EV de aceptar (1ª/2ª/3ª/nunca) = **2365.9 / 2538.2 / 2756.4 / 2838.0** (refs de usuario
  2370 / 2531 / 2749 / 2801, tolerancia ±6 %); **orden** 1ª < 2ª < 3ª ≤ nunca; ratio ≥ 0.75;
  derrotas **5,6 %** y **25,3 %** (bandas 3-9 % y 22-30 %); `thr90` con ruido ±10 % =
  2823.8 ≤ nunca = 2838. Tocar cualquier constante de `BankerPolicy` sin re-tunear la
  fórmula rompe este spec — es el test que falla primero.
- **El techo 1.2 solo "liga" con el Negociador:** con los factores actuales el máximo sin
  bono es 0.95 × 1.20 = 1.14 < 1.2; **el piso 0.5 es red de seguridad** — el mínimo real es
  0.75 × 0.80 = **0.6** (1ª oferta con ruido −20 %), jamás se alcanza 0.5.
- **La barra arranca en zona `healthy`/verde** (60 % ≥ 51) antes que en `low`/ámbar (50 %):
  el jugador ve un estado sano al abrir la partida.
- **Sin cambios i18n:** ningún texto visible afirma la fórmula (el tutorial dice "oferta
  cada 3 cartas", que sigue vigente).
- **Gates:** 4 en verde — `npx jest` selectivo → `npm run typecheck` (0) →
  `npm run lint` (0) → `npm test` = **50 suites / 555 tests** (base 49/548).
- **Pendientes deliberadamente fuera de alcance:** (1) escudo + tanque ≈ 0 % de probabilidad
  de derrota — riesgo nulo con ambas compras, futuro rebalance; (2) precios de mejoras de
  la tienda parecen altos (sin tocar); (3) la barra arranca en zona sana en vez de ámbar
  (consecuencia de (f), a reconsiderar si el onboarding pierde urgencia).
