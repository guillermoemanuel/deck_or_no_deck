# Testing

> Estado al 2026-10-01 (cierres de límites + ampliación del alcance del reembolso +
> enmienda ADR-006 "motivo en el puerto + 2 políticas"): **38 suites · 467 tests** —
> verdes en el último gate (typecheck 0 · lint 0 · umbrales de cobertura verdes;
> medido: 38 `*.spec.ts` en `src`; 446 declaraciones `it(`/`test(` sin contar `it.each`
> + 21 filas de 2 `it.each` (13 + 8) = 467). Runner: **Jest + ts-jest** (no vitest).
> Entorno: `node` (sin DOM).

---

## 1. Comandos

```bash
npm test                      # suite completa (~25-35 s)
npx jest src/domain/entities/GameSession.spec.ts     # UN archivo
npx jest -t "energy tank"     # por nombre de test
npx jest --watch              # (o npm run test:watch)
npm run test:coverage         # cobertura + umbrales
npm run typecheck             # tsc --noEmit — INCLUYE los specs
npm run lint                  # eslint src
```

**Orden de verificación obligatorio al terminar cualquier cambio:**
1. `npx jest <specs afectados>` (iterar acá, es rápido)
2. `npm run typecheck`
3. `npm run lint`
4. `npm test` (suite completa)

---

## 2. Política de cobertura

`jest.config.js`:
- **Colecciona** de `src/domain/**`, `src/application/**` y `infrastructure/persistence/ProgressionManager.ts`.
- **Umbrales por capa** (fijados en la Fase 4, 2026-09-30):
  `domain/` stmts 88 · branches 80 · functions 90 · lines 88 ·
  `application/` stmts 88 · branches 82 · functions 90 · lines 88.
  (Medido ese día: domain 92.2/81.5/94.5/92.0 · application 93.4/88.6/95.5/93.3 —
  el margen y la regla "si bajás un umbral, justificá en `LOG.md`" están en el propio `jest.config.js`.)
- Excluye `*.spec.ts` y `**/testing/**`.

| Capa | Specs | Cobertura real | Estado |
|---|---|---|---|
| `domain/` | 16 | alta (umbral 88/80/90/88) | 🟢 |
| `application/` | 12 | alta (umbral 88/82/90/88, nuevo en Fase 4) | 🟢 |
| `infrastructure/` | 4 | parcial | 🟡 sin spec: `LocalStorageProgressionRepository`, `jsonStorage`, `CryptoRandomProvider`, `AudioService` |
| `shared/` | 5 | buena | 🟢 |
| `presentation/` | 1 | casi nada | 🔴 ver §5 |

---

## 3. Dobles de test disponibles (reusar, no reinventar)

| Doble | Ubicación | Sirve para |
|---|---|---|
| `FakeProgressionRepository` | `infrastructure/persistence/testing/` | monedas/mazos/bono en memoria; helpers `seedCoins()`, `seedPeriodicBonusCycleStart()` |
| `FakeRecordsRepository` · `FakeDailyChallengeRepository` | ídem | estado inicial sembrado por constructor |
| `FakeOnboardingRepository` | ídem | hints vistos/saltados |
| `FakeCrazyGamesService` | `infrastructure/services/testing/` | `setNextAdResult()`, `setAvailable()`, contadores de llamadas, `emitAdLifecycle()` |
| `DeterministicRandomProvider` | ídem | shuffle invertido o `fixedOrder` → tableros deterministas |
| `collectEvents(bus)` | `application/use-cases/testing/` | acumula eventos para asserts de secuencia (usado en 6 de 8 specs de use-cases) |
| `installStorage()` | helper en `LocalStorageRecordsRepositories.spec.ts` | `window.localStorage` con Map |
| `installFakeSdk()` + `flushMicrotasks()` | helper en `CrazyGamesService.spec.ts` | SDK falso con callbacks disparados a mano + fake timers |
| `FakeLocalStorage` | helper en `LanguageManager.spec.ts` + `jest.resetModules()` | instancia fresca del singleton |
| `NoDrainRule` / `ZeroDrainRule` / `FixedDrainRule` / `InstantLossDrainRule` | inline en specs | estratégias de energía |

**No existe** fake de `IAudioService` — si un test necesita audio, crearlo en
`infrastructure/audio/testing/FakeAudioService.ts` (mismo patrón que los demás).

---

## 4. Convenciones de test del repo

- Archivo `X.spec.ts` junto a `X.ts`. Describe = clase/método; `it` en **inglés**.
- Los bugs corregidos dejan **test de regresión** con nombre alusivo
  (`bug_deal_modal_reveal`) o comentario `BUGFIX`.
- **Los precios NO se hardcodean en specs**: usar `costOf(id)` (catálogo real) —
  introducido en `fa036a3` porque un rebalanceo de precios dejó la suite en rojo.
- Doble verificación cuando hay regla numérica: assert del valor esperado **y** del
  invariante (ej. "triple cuesta el doble del double").
- Un cambio de comportamiento empieza por **un test que falla**, después la corrección.

---

## 5. Huecos y estrategia

**`presentation/` no se unit-testea con Phaser** (decisión mantenida): las escenas
dependen del ciclo de vida de Phaser y un test ahí sería mayormente mocks.

Ganancia de cobertura barata en cambio: **mover la lógica a `domain`/`application` y
testearla ahí**. No queda ningún caso de ese tipo (lógica oculta en escenas sin test): el
único pendiente —el filtro de ads de la tienda (`ShopScene.renderUpgradesTab`)— migró a
`ListAvailableUpgradesUseCase` (aplicación, 100 % de cobertura) y figura abajo, en la
tabla de resueltos.

**Ya resueltos en Fase 4 (2026-09-30)** — mismo mecanismo (regla extraída a `domain`/`application` +
test ahí); quedan acá solo como contexto histórico:

| Qué | Dónde vivía | Mecanismo |
|---|---|---|
| Estado de mejora (poseída/bloqueada/nivel) | `ShopScene.upgradeStatusFor()` (~70 L) | `SessionUpgrades.getState()` (+ `isOwned`/`canPurchase`); la vista quedó en ~32 L, solo presentación |
| Regla de recompensa diaria (+1 racha) | `DailyChallengeBanner` | `previewDailyCompletion()`; `completeDaily` delega en ella — test de propiedad: preview ≡ lo que paga |
| Penalidad de abandono (−5000) en 3 sitios | literal en `OpenCardUseCase` + constante en `GameAbandonGuard` (importada por `UIScene`/`main.ts`) | `LOSS_PENALTY_AMOUNT` en `domain/value-objects/GamePenalties.ts` (spec propio) |
| Umbral de carta alta (≥1000) — *Fase 4 parte 2, 2026-09-30* | `CardView.reveal()` (`value >= 1000`) | `HIGH_CASE_VALUE_MIN` + `isHighCaseValue()` en `domain/value-objects/CaseValues.ts`, spec en `CaseValues.spec.ts` (frontera 999/1000) |
| Zonas de energía (>50 / >20, pulso crítico) — *Fase 4 parte 2, 2026-09-30* | `EnergyBarView` (`colorForPercentage`) | `EnergyZone` + `getEnergyZone()` en `domain/value-objects/EnergyLevel.ts`, fronteras 50/20 con spec en `EnergyLevel.spec.ts`; la vista solo traduce zona → color |
| Filtro de ads de la tienda (ocultar Duplicar/Triplicar/Revivir sin rewarded) — *2026-09-30* | `ShopScene.renderUpgradesTab()` (filtraba inline con `isRewardedAdAvailable()` y `requiresRewardedAd`) | `ListAvailableUpgradesUseCase` (aplicación) + `ListAvailableUpgradesUseCase.spec.ts` (100 %); la escena solo llama `getServices(this).listAvailableUpgrades.execute()` |
| Guard de compra por ads (fila visible con ads caídos) — *2026-09-30* | `PurchaseSessionUpgradeUseCase` cobraba sin consultar el puerto de ads | rechazo `ads_unavailable` **antes** de `spendCoins` (`crazyGamesService` como 4° parámetro, cableado en `GameScene`) + clave i18n `SHOP_UPGRADE_ADS_UNAVAILABLE`; spec de esa clase al **100 %** (36 tests al
  2026-10-01: 28 + el `it.each` de exhaustividad) |

Además: **smoke manual** por feature (checklist sugerido, ~5 min):

1. Partida completa: abrir cartas → oferta → DEAL → resultado → cobrar.
2. NO DEAL hasta el final → swap mitad de partida → swap final → victoria/derrota.
3. Energía a 0 → revivir con anuncio (fake en local) → seguir jugando.
4. Tienda: comprar mejora con y sin fondos, con conflicto, y comprar mazo.
5. Cambiar idioma en el menú → verificar textos de escenas, tutorial y modales.
6. Salir al menú a mitad de partida → verificar penalidad y saldo.
7. Bono periódico (forzar `periodicBonusCycleStart` en localStorage).
8. **Guard de ads en la tienda** (NO corrido): con los anuncios caídos (bloquear
   `*crazygames-sdk-v3.js*` en DevTools → Network y recargar) comprar una mejora de ads →
   la fila muestra *"Requiere anuncio recompensado — no hay anuncios ahora."* y **no se
   descuentan monedas**; el conflicto Duplicar/Triplicar sigue mostrando su mensaje igual
   que antes.
9. **Reembolso por SDK caído — victoria** (NO corrido): comprar Duplicar, llegar a la
   victoria con `*crazygames-sdk-v3.js*` bloqueado → mensaje `RESULT_AD_REFUNDED`
   (*"No ads available — your coins were refunded."*), botones Duplicar/Triplicar
   **apagados** (alpha 0.4, sin click) y el saldo devuelto **una sola vez** (revisar
   `localStorage` — un reintento no puede sumar dos veces).
10. **Reembolso por SDK caído — derrota** (NO corrido): comprar Revivir, perder con el
    SDK bloqueado → ídem: mensaje de reembolso, botón Revivir **apagado**, saldo
    devuelto una sola vez.
11. **Regresión feliz con SDK OK** (NO corrido): mismos ítems 9-10 sin bloquear nada →
    el anuncio se muestra, el efecto se entrega y **no hay reembolso** (saldo sin
    devolución).

**Estado — última ejecución 2026-09-30 (smoke manual en `http://localhost:5174`):**
ítems **5, 6 y 7 verificados** en vivo (idioma EN↔ES, abandono con penalidad −5000 que
puede dejar saldo negativo, bono periódico forzado). **No corridos en esta oportunidad**
los 4 ítems largos: **1-2** (partida DEAL/no-deal + swap de mitad y final), **3** (revivir
con anuncio) y **4** (tienda con/sin fondos, con conflicto y compra de mazo). Nota: la
tienda en local muestra Duplicar/Triplicar/Revivir porque `index.html:29` carga el SDK
real de CrazyGames e `isRewardedAdAvailable()` devuelve `true` (hoy lo consultan
`ListAvailableUpgradesUseCase` al listar y `PurchaseSessionUpgradeUseCase` al comprar, no
la escena); **la rama "oculta" del
filtro NO se ejercitó en vivo** — el predicado sí está cubierto por
`ListAvailableUpgradesUseCase.spec.ts`, falta solo el smoke en el navegador (forzar
bloqueando `*crazygames-sdk-v3.js*` en DevTools → Network y recargando).
**Ítem 8 (guard de compra por ads) tampoco corrido** — el predicado está cubierto por
`PurchaseSessionUpgradeUseCase.spec.ts`, falta el smoke en el navegador con el SDK
bloqueado (misma receta del párrafo anterior).

**Ítems 9-11 (reembolso por fallo ambiental, ADR-006) agregados el 2026-10-01 y NO
corridos** — los flujos están cubiertos por `MultiplyRewardUseCase.spec.ts` (16 tests) y
`ReviveWithAdUseCase.spec.ts` (19 tests); falta el smoke en el navegador con el SDK
bloqueado: SDK caído/adblock/sin-fill → `RESULT_AD_REFUNDED` con botones apagados;
cooldown **retryable** (cancelación del jugador u otro fallo) → `RESULT_AD_COOLDOWN`
con botones vivos y reintento a los 60 s.

### Límites del guard de compra por ads — estado al 2026-10-01

*(los dos límites aceptados el 2026-09-30; detalle del porqué en `docs/DECISIONS/ADR-006`)*

1. **Exhaustividad de `applyEffect` — CERRADO (2026-10-01).** Doble cierre:
   guarda de tipos en tiempo de compilación al final del switch (`const exhaustive: never =
   upgradeId;`, cada `case` termina en `return;`, **sin `default`**) → un id nuevo en la
   unión `SessionUpgradeId` **no compila**; y spec `it.each` que recorre los 8 ids de
   `SESSION_UPGRADE_CATALOG` y afirma que la compra deja el efecto aplicado en la sesión
   real → si mañana hay un 9.º id sin rama, el test falla. Ruptura verificada: sin un
   `case`, typecheck pasa sin la guarda y falla con ella.
2. **TOCTOU compra→consumo — CERRADO (2026-10-01, ADR-006; enmendado el mismo día:
   motivo en el puerto + 2 políticas).** Al consumir Duplicar/Triplicar/Revivir la
   política se lee con **`ICrazyGamesService.rewardedAdStatus()`** (el motivo), **no**
   con el predicado booleano. Dos grupos con consecuencias opuestas:
   - **`sdk_unavailable` | `adblock` | `cooldown_no_fill` →** reembolso único
     `awardGameplayCoins(costOf(id))`, motivo `'refunded'` y bloqueo de todo reclamo
     posterior — **invariante reembolso XOR efecto**; UI: `RESULT_AD_REFUNDED` y botones
     apagados. Cubre SDK ausente, adblock detectado y cooldown armado por un fallo
     **sin fill** (el reintento no promete nada).
   - **`cooldown_retryable` →** motivo nuevo **`'ads_cooldown'`**, **sin reembolso**, sin
     setear `refunded`, sin pedir el anuncio; UI: clave **`RESULT_AD_COOLDOWN`** y los
     botones **NO** se apagan (reintento real a los 60 s). Ahí cae la **cancelación del
     jugador**: el cooldown de 60 s lo pone cualquier rewarded fallido (`settle()`), así
     que la ventana puede ser **autoinfligida** — reembolsar dentro de ella era un
     forfeit (se perdía para siempre la chance de revivir/duplicar).
   - `ad_failed` (el intento se hizo y falló: cancelación o anuncio no completado) **no**
     reembolsa y sigue reintentable.
   El sub-caso antes abierto (SDK presente pero `isRewardedAdAvailable()` false →
   `ad_failed` sin reembolso y dinero trabado, "decisión de producto pendiente")
   **cerró el 2026-10-01** con el grupo de reembolso; las specs de transición
   `ad_failed → cooldown → refunded` **ya no existen**. Specs de la política nueva
   (títulos reales):
   - `CrazyGamesService.spec.ts` (14): *"tras un rewarded sin fill, rewardedAdStatus()
     es "cooldown_no_fill" durante el cooldown"* · *"tras un rewarded con otro fallo
     (timeout de arranque), rewardedAdStatus() es "cooldown_retryable"* · *"vencido el
     cooldown de 60 s, rewardedAdStatus() vuelve a "available"* · *"con adblock
     detectado, rewardedAdStatus() es "adblock" aunque haya cooldown activo"* · *"sin
     SDK, rewardedAdStatus() es "sdk_unavailable" (lo permanente manda sobre cualquier
     cooldown)"* · *"un rewarded exitoso limpia el cooldown y el motivo previo:
     rewardedAdStatus() vuelve a "available"*.
   - `MultiplyRewardUseCase.spec.ts` (16): *"returns "ads_cooldown" WITHOUT refunding
     while the cooldown is retryable: balance intact, no ad asked, claim still open"* ·
     *"after the 60 s cooldown expires the SAME claim attempts the ad for real and
     delivers the effect"* · *"refunds costOf("double_reward") exactly once when the
     cooldown came from a no-fill failure ("refunded")"* · *"after a player-cancelled
     ad, adblock detected before the next click refunds exactly once and closes the
     claim"* · *"refunds the cost when the SDK IS available but ads are blocked
     (adblock), without ever asking for an ad"* · *"keeps the refund final: with ads
     available again a later attempt returns "refunded" and pays nothing"*.
   - `ReviveWithAdUseCase.spec.ts` (19): los mismos 6 con revive — *"…balance intact,
     revive intact, no ad asked"* · *"…the SAME claim attempts the ad for real and
     revives"* · *"refunds costOf("revive") exactly once when the cooldown came from a
     no-fill failure ("refunded")"* · *"…closes the revive claim"* · *"refunds
     costOf("revive") when the SDK IS available but ads are blocked (adblock)…"* ·
     *"…a later attempt returns "refunded" and never revives"*.

---

## 6. Estado histórico reciente

- **2026-09-30 · Fase 0 (`fa036a3`)**: suite pasaba de 3 suites rojas / 5 tests a verde.
  - `PeriodicBonus.spec`: rango actualizado a `[500…5000]` (cambio de producto en `1.3.1`).
  - `PurchaseSessionUpgradeUseCase.spec`: costos derivados del catálogo.
  - `LanguageManager`: **bug de fuente** — elección manual igual al default no se persistía
    y la detección del SDK la pisaba en la próxima carga (ADR-004).
  - `tsconfig` dejó de excluir specs; se agregó ESLint mínimo.
