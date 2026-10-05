# Testing

> Estado al 2026-10-04 (enmienda **ADR-007**: `AdOverlayScene` al boot): **43 suites · 504 tests** —
> verdes en el último gate (typecheck 0 · lint 0 · `npm run build` OK; medido: 43
> `*.spec.ts` en `src`; 480 declaraciones `it(`/`test(` sin contar `it.each` + 24 filas
> de `it.each` (21 previas + 3 de `resolveAdsMode.spec`) = 504 → **501 del cierre
> ADR-007 + 3** de `AdOverlayScene.spec` (nueva, red→verde). Detalle del cierre
> 2026-10-02 (467 + 34 = 501): `resolveAdsMode` 7 · `RewardCooldownTracker` 8 ·
> `OwnRewardedAdService` 15 · `AdOverlayScene.resolution` 4).
> Runner: **Jest + ts-jest** (no vitest). Entorno: `node` (sin DOM).

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
| `infrastructure/` | 7 | parcial | 🟡 sin spec: `LocalStorageProgressionRepository`, `jsonStorage`, `CryptoRandomProvider`, `AudioService` (+3 specs nuevas con ADR-007: `resolveAdsMode`, `RewardCooldownTracker`, `OwnRewardedAdService`) |
| `shared/` | 5 | buena | 🟢 |
| `presentation/` | 3 | casi nada (fuera del collector) | 🔴 ver §5 — specs: `DeckCelebrationEffect.spec`, `AdOverlayScene.resolution.spec` (lógica pura) y `AdOverlayScene.spec.ts` (3 tests, mock de `'phaser'` en node); el resto de escenas sin test |

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

1. Partida completa (*2026-10-01*, verificado): abrir cartas → oferta → DEAL →
   resultado → cobrar (premio acreditado).
2. NO DEAL hasta el final (*2026-10-01*, verificado): swap mitad de partida → swap
   final → victoria/derrota (los dos swaps aparecieron).
3. Energía a 0 → revivir con anuncio (*2026-10-01*, verificado — el SDK real abre el
   anuncio en localhost) → seguir jugando: consumo cobrado **sin** reembolso, energía
   restaurada, partida continúa.
4. Tienda (*2026-10-01*, verificado): comprar mejora **con fondos** (descuenta y se
   aplica), **conflicto** Duplicar/Triplicar (mensaje y **sin cargo**), **sin fondos**
   (saldo intacto) y **comprar mazo** desde el menú (descuenta y desbloquea).
5. Cambiar idioma en el menú → verificar textos de escenas, tutorial y modales.
6. Salir al menú a mitad de partida → verificar penalidad y saldo.
7. Bono periódico (forzar `periodicBonusCycleStart` en localStorage).
8. **Guard de ads en la tienda** (*2026-10-01*, verificado): **receta corregida** —
   la vieja (bloquear `*crazygames-sdk-v3.js*` y recargar) **no puede** mostrar el
   mensaje: al reabrir la tienda, `ListAvailableUpgradesUseCase` oculta las filas con
   `requiresRewardedAd`, así que no hay botón que clicear. La receta válida es la
   **caída en caliente**: abrir la tienda con los ads OK → `window.CrazyGames = null`
   (consola) → clic en Duplicar → la fila muestra *"Requiere anuncio recompensado —
   no hay anuncios ahora."* y **no se descuentan monedas** (el guard corre antes de
   `spendCoins`). Verificado además: **rama oculta** del filtro — reabrí la tienda con
   el SDK caído y Duplicar/Triplicar/Revivir **desaparecen**; al restaurar el SDK,
   reaparecen. El mensaje de conflicto con ads caídos **no es alcanzable** (Triplicar
   está oculta en ese estado) — el conflicto quedó verificado en el ítem 4.
9. **Reembolso por SDK caído — victoria** (*2026-10-01*, verificado): comprar Duplicar,
   llegar a la
   victoria con el SDK caído → mensaje `RESULT_AD_REFUNDED`
   (*"No hay anuncios disponibles — te devolvimos las monedas."*), botones Duplicar/Triplicar
   **apagados** (alpha 0.4, sin click) y el saldo devuelto **una sola vez** (revisar
   `localStorage` — un reintento no puede sumar dos veces).
10. **Reembolso por SDK caído — derrota** (*2026-10-01*, verificado): comprar Revivir,
     perder con el
    SDK caído → ídem: mensaje de reembolso, botón Revivir **apagado**, saldo
    devuelto una sola vez.
11. **Regresión feliz con SDK OK** (*2026-10-01*, verificado): mismos ítems 9-10 sin
     caer el SDK →
    el anuncio se muestra, el efecto se entrega y **no hay reembolso** (saldo sin
    devolución); recomendar dentro del cooldown → `RESULT_AD_COOLDOWN` con botones
    **vivos** y reintento efectivo a los 60 s.

**Estado — smoke manual COMPLETO (última ejecución 2026-10-01 en
`http://localhost:5174`):** los **11 ítems verificados en vivo** — ítems **1-4 y 9-11**
el 2026-10-01 (detalle abajo) e ítems **5-7** el 2026-09-30 (idioma EN↔ES, abandono con
penalidad −5000 que puede dejar saldo negativo, bono periódico forzado). Notas de esa
última corrida que siguen vigentes: la tienda en local muestra
Duplicar/Triplicar/Revivir porque en el modo default (`VITE_ADS=crazygames`) `main.ts`
carga el SDK real de CrazyGames **dinámicamente** (`loadCrazyGamesSdk()` — el `<script>`
del SDK **ya no** está en `index.html`, desde ADR-007) y `isRewardedAdAvailable()` devuelve
`true` (lo consultan `ListAvailableUpgradesUseCase`
al listar y `PurchaseSessionUpgradeUseCase` al comprar, no la escena); **la rama
"oculta" del filtro YA se ejercitó en vivo** (ítem 8, 2026-10-01) además de estar
cubierta por `ListAvailableUpgradesUseCase.spec.ts`; y la tienda abierta **sin partida
activa** (menú principal) arranca en la pestaña "Mazos" — las mejoras de sesión solo se
compran desde el HUD durante una partida.

**Ítems 9-11 (reembolso por fallo ambiental, ADR-006) — VERIFICADOS en vivo
2026-10-01.** Receta usada: en lugar de bloquear `*crazygames-sdk-v3.js*` (eso exigiría
recargar y mataría la sesión en curso), el SDK se derrumba **en caliente** desde la
consola — `window.__cg = window.CrazyGames; window.CrazyGames = null;` — porque
`CrazyGamesService.isAvailable()` relee `window.CrazyGames?.SDK?.ad` en **cada**
llamada (`CrazyGamesService.ts:155`). Resultados:
- **Ítem 9 (victoria):** Duplicar comprado con el SDK OK y consumido con el SDK caído →
  `RESULT_AD_REFUNDED`, botones Duplicar/Triplicar apagados, saldo devuelto **una sola
  vez** (un intento de re-click no sumó dos veces).
- **Ítem 10 (derrota):** ídem con Revivir → `RESULT_AD_REFUNDED`, botón apagado, saldo
  devuelto una sola vez.
- **Ítem 11 (SDK OK):** el SDK real en localhost **abrió el anuncio** (caso A) y al
  terminar se entregó el efecto **sin reembolso**; cancelar y recomentar dentro de los
  60 s mostró `RESULT_AD_COOLDOWN` con los botones **vivos**, y a los 60 s el reintento
  volvió a pedir el anuncio (camino nuevo de ADR-006 enmendado).
Los flujos además siguen cubiertos por `MultiplyRewardUseCase.spec.ts` (16 tests) y
`ReviveWithAdUseCase.spec.ts` (19 tests).

### Smoke del modo `portal` (`VITE_ADS=portal`) — VERIFICADO 2026-10-02 (regresión del primer ad: 2026-10-04)

Creado el 2026-10-02 con la unidad ADR-007. **Los 11 ítems de arriba corren en modo
default** (`crazygames`); estos 6 son el equivalente para el adapter propio. Los 6
**verificados en vivo el 2026-10-02** con `VITE_ADS=portal npm run dev` (ítem 6 con
`VITE_ADS=none`):

1. `VITE_ADS=portal npm run dev` → la tienda muestra Duplicar/Triplicar/Revivir (el
   adapter propio reporta `available` sin SDK externo) y la pestaña Red **no** pide
   `sdk.crazygames.com`.
2. Comprar Duplicar → llegar a la victoria → click → overlay de **3 s completo** →
   efecto entregado **sin reembolso** (saldo sin devolución).
3. Mismo camino pero **✕ cancelar** antes de los 3 s → `RESULT_AD_COOLDOWN` con botones
   **vivos** y reintento real a los 60 s.
4. Análogo con **Revivir en la derrota** (pasos 2-3 con Revivir en vez de Duplicar).
5. Midgame (swap de mitad de partida) → overlay **corto** con la leyenda
   `AD_OVERLAY_HINT_MIDGAME` (mismo countdown de 3 s).
6. `VITE_ADS=none npm run dev` → filas de ads **ocultas** en la tienda (degradación
   explícita, sin script del SDK) — además `grep sdk.crazygames.com dist/*` limpio en un
   build `portal`/`none`.

**Resultado (2026-10-02):** los 6 ítems OK — el adapter propio no pidió
`sdk.crazygames.com`; el overlay bloqueó el tablero detrás y completó los 3 s sin
reembolso; la ✕ produjo `RESULT_AD_COOLDOWN` con botones vivos y el reintento a los 60 s
volvió a abrir el overlay; Revivir en derrota cobró el consumo sin reembolsar y la
partida siguió; el midgame mostró su overlay corto con `AD_OVERLAY_HINT_MIDGAME` en el
flujo de la pantalla de resultado; y en `none`, `window.CrazyGames` quedó `undefined` con
Duplicar/Triplicar/Revivir ausentes y el resto de mejoras visibles (en ambos idiomas).

> **✅ Regresión verificada en vivo 2026-10-04** (usuario: "funciona todo ok") — el
> ítem 2 se hizo **de primera, con la página recargada** en `VITE_ADS=portal`: overlay al
> instante, consola **sin** `Scene key not found` ni warn del watchdog. Era justo el caso
> que rompía la carrera `scene.add()`+`scene.start()` en runtime
> (`Scene key not found: AdOverlayScene` →
> watchdog 15 s → `RESULT_AD_COOLDOWN` en el primer ad de la sesión). Hoy
> `AdOverlayScene` está en el `config.scene` de `main.ts` y `presentAdOverlay()` degrada
> en 0 s si faltara; repetir ítem 2 con **sesión fresca** (recargar y reclamar Duplicar
> sin jugar antes) al tocar el registro de escenas o el presenter.

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
