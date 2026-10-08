# Testing

> Estado al 2026-10-04 (unidad **B4 / CG-MON-006 + ADR-012**: aviso inline de ads en la
> tienda): **48 suites · 546 tests** —
> verdes en el último gate (typecheck 0 · lint 0 · `npm test` OK · `npm run build` ✓;
> medido: 48 `*.spec.ts` en `src` — **sin archivos nuevos**; **541 del cierre B3 + 5 de
> B4** = 5 declaraciones `it(` nuevas en el describe
> `adsNotice() — aviso inline de la tienda (CG-MON-006)` de
> `ListAvailableUpgradesUseCase.spec.ts` — adblock → `'adblock'` · ads_disabled →
> `'ads_disabled'` · available → `null` · ambos cooldowns → `null` · sdk_unavailable →
> `null` (rojo por método inexistente: la suite no compilaba) → ese spec queda en **10
> tests** (5 previos + 5) → **541 + 5** = 546; `LanguageData.spec` cubre las 2 claves
> nuevas por su contrato de paridad EN/ES, sin test propio extra).
> Conteo previo (B3): **540 del cierre B2/ADR-011 + 1 de B3** = 1 declaración `it(`
> nueva en `LanguageData.spec` — *'every upgrade that requires a rewarded ad declares the
> requirement in its description (EN and ES)'*, rojo con `sinAviso` de 6 entradas
> `en/es × double_reward/triple_reward/revive` → ese spec queda en **6 tests** y
> `shared/i18n` suma 1 → **540 + 1** = 541).
> Conteo previo (B2): **527 del cierre B1/ADR-010 + 13 de B2** = 5 declaraciones `it(`
> nuevas en `AudioService.spec` (primer spec de `audio/`) + 4 en
> `resolveMuteAudioOverride.spec` (los dos rojos por módulo inexistente) + 4 nuevas en
> el describe de muteAudio de `CrazyGamesService.spec` (16 → **20**) → **527 + 13** = 540.
> Conteo previo (B1): **522 del cierre A3/ADR-009 + 5 de B1** = 5 declaraciones `it(`
> nuevas, todas en el spec nuevo `AdBlockerScene.spec` — rojo por módulo inexistente;
> `CrazyGamesService.spec` **sin cambio de conteo** (16): sus 4 tests de phases se
> actualizaron al contrato nuevo y 1 sumó la aserción **de par** en el timeout de 15 s →
> en B1 quedó **499 + 28** = 527. Conteo previo: **513 del cierre A1/ADR-008 + 9 de A3** = 5 `it(`
> nuevas + 2 filas `it.each` de 2 casos c/u → `CrazyGamesService.spec` **+2**,
> `ReviveWithAdUseCase.spec` **+3**, `MultiplyRewardUseCase.spec` **+3**,
> `ListAvailableUpgradesUseCase.spec` **+1** — todos rojo→verde; el rojo de infra era
> `Expected: "ads_disabled"/"adblock", Received: "cooldown_retryable"`). Conteo del 513:
> 489 declaraciones `it(`/`test(` sin contar `it.each` + 24 casos de `it.each` (21
> previas + 3 de `resolveAdsMode.spec`) → A3 **494 + 28** = 522. El cierre A1 fue
> **504 + 9**: `resolveFullscreenEnabled.spec` **5** (red→verde: `Cannot find module`)
> y `SoundFullscreenControls.spec` **4** (red→verde: `Expected 1, Received 2` — el bug
> CG-PUB-002 reproducido). Detalle del cierre 2026-10-02 (467 + 34 = 501):
> `resolveAdsMode` 7 · `RewardCooldownTracker` 8 · `OwnRewardedAdService` 15 ·
> `AdOverlayScene.resolution` 4).
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
| `domain/` | 20 | alta (umbral 88/80/90/88) | 🟢 incluye `FirstRoundDealStreak.spec` (20 tests) y `FirstRoundDealStreak.farming.spec` (3 tests de simulación con semilla fija, ADR-014) |
| `application/` | 14 | alta (umbral 88/82/90/88, nuevo en Fase 4) | 🟢 incluye `FirstRoundDealStreakTracker.spec` (13) y `RecordFirstRoundDealOutcomeUseCase.spec` (7) — ADR-014 |
| `infrastructure/` | 11 | parcial | 🟡 sin spec: `jsonStorage`, `CryptoRandomProvider` (+7 specs: 3 con ADR-007 — `resolveAdsMode`, `RewardCooldownTracker`, `OwnRewardedAdService` — `resolveFullscreenEnabled` con ADR-008 (5 tests) y de ADR-011 **`AudioService.spec` (5 tests, primer spec de `audio/`)** y **`resolveMuteAudioOverride.spec` (4 tests)** — con eso `infrastructure/config` quedó en **3 specs / 16 tests**; y **`LocalStorageProgressionRepository.spec` (ADR-014: migraciones v3→v5/v4→v5, saneo del streak, `clearAll`)** que cerró el hueco que este renglón declaraba |
| `shared/` | 5 | buena | 🟢 `LanguageData.spec` con **6 tests** (+1 de CG-MON-005: toda mejora con `requiresRewardedAd` declara el requisito de ad en su descripción, EN y ES) |
| `presentation/` | 5 | casi nada (fuera del collector) | 🔴 ver §5 — specs: `DeckCelebrationEffect.spec`, `AdOverlayScene.resolution.spec` (lógica pura), `AdOverlayScene.spec.ts` (3 tests, mock de `'phaser'` en node), `AdBlockerScene.spec.ts` (5 tests del listener, mock de `'phaser'` en node; ADR-010) y `SoundFullscreenControls.spec` (4 tests, mock de `'phaser'` + `HudIconButton` al estilo del anterior; ADR-008 — incluye la regresión del botón heredado); el resto de escenas sin test |

---

## 3. Dobles de test disponibles (reusar, no reinventar)

| Doble | Ubicación | Sirve para |
|---|---|---|
| `FakeProgressionRepository` | `infrastructure/persistence/testing/` | monedas/mazos/bono en memoria; helpers `seedCoins()`, `seedPeriodicBonusCycleStart()`, **`seedFirstRoundDealStreak()`** (ADR-014; `clearAll()` también limpia el streak) |
| `FakeRecordsRepository` · `FakeDailyChallengeRepository` | ídem | estado inicial sembrado por constructor |
| `FakeOnboardingRepository` | ídem | hints vistos/saltados |
| `FakeCrazyGamesService` | `infrastructure/services/testing/` | `setNextAdResult()`, `setAvailable()`, `setRewardedStatus()`, **`setRewardedStatusAfterNextAd()`** (ADR-009: el próximo rewarded falla y el estado queda permanente **en vuelo**, como el SDK real), contadores de llamadas, `emitAdLifecycle()`, **`emitMuteAudioChange()`** (ADR-011: dispara `onMuteAudioChange` a sus suscriptores) |
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

**Las escenas de `presentation/` no se unit-testean con Phaser** (decisión mantenida):
dependen del ciclo de vida de Phaser y un test ahí sería mayormente mocks. Lo que sí se
testea en `presentation/` es **lógica pura o componentes con `'phaser'` mockeado en node**
(`DeckCelebrationEffect.spec`, `AdOverlayScene.resolution.spec`, `AdOverlayScene.spec`,
`AdBlockerScene.spec` — solo el cable `createAdBlockerListener`, ADR-010 —,
`SoundFullscreenControls.spec` — este último reproduce el bug CG-PUB-002).

Ganancia de cobertura barata en cambio: **mover la lógica a `domain`/`application` y
testearla ahí**. No queda ningún caso de ese tipo (lógica oculta en escenas sin test): el
único pendiente —el filtro de ads de la tienda (`ShopScene.renderUpgradesTab`)— migró a
`ListAvailableUpgradesUseCase` (aplicación, 100 % de cobertura) y figura abajo, en la
tabla de resueltos. El **aviso inline** de CG-MON-006 (ADR-012) siguió el mismo criterio:
la política "¿corresponde avisar?" vive en `adsNotice()` (5 tests) y la escena solo dibuja.

**Ya resueltos en Fase 4 (2026-09-30)** — mismo mecanismo (regla extraída a `domain`/`application` +
test ahí); quedan acá solo como contexto histórico:

| Qué | Dónde vivía | Mecanismo |
|---|---|---|
| Estado de mejora (poseída/bloqueada/nivel) | `ShopScene.upgradeStatusFor()` (~70 L) | `SessionUpgrades.getState()` (+ `isOwned`/`canPurchase`); la vista quedó en ~32 L, solo presentación |
| Regla de recompensa diaria (+1 racha) | `DailyChallengeBanner` | `previewDailyCompletion()`; `completeDaily` delega en ella — test de propiedad: preview ≡ lo que paga |
| Penalidad de abandono (−1000) en 3 sitios | literal en `OpenCardUseCase` + constante en `GameAbandonGuard` (importada por `UIScene`/`main.ts`) | `LOSS_PENALTY_AMOUNT` en `domain/value-objects/GamePenalties.ts` (spec propio) |
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
`http://localhost:5174`):** último smoke general de ads: **2026-10-05** (ver la sección
*Smoke general del Sprint B* más abajo). Los **11 ítems verificados en vivo** — ítems
**1-4 y 9-11**
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
Los flujos además siguen cubiertos por `MultiplyRewardUseCase.spec.ts` (19 tests) y
`ReviveWithAdUseCase.spec.ts` (22 tests).

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

### Smoke general del Sprint B (modo `crazygames` con el QA Tool) — **PASSED 2026-10-05**

Ejecutado el **2026-10-05** por el usuario: build de Vite servido en `localhost:4173`,
modo `crazygames`, QA Tool de CrazyGames + adblocker real. **Los 5 puntos PASARON:**

1. **Carga/SDK:** 1 request a `sdk.crazygames.com/crazygames-sdk-v3.js` (200), consola
   sin errores.
2. **CG-MON-001 (ADR-010):** backdrop + spinner al instante del click en "Jugar de
   nuevo" (midgame); botones sin navegar durante el ad; bloqueador que se cierra solo al
   terminar/fallar (incluido el caso sin fill); un solo `requestAd` por click — detalle
   en la sección B1 de abajo.
3. **CG-MON-002 (ADR-011):** `?muteAudio=true` mudo total desde el arranque y botón del
   HUD sin re-encender; `?muteAudio=false`/ausente → sonido normal — detalle en la
   sección `muteAudio` de abajo.
4. **CG-MON-005:** tienda pestaña Mejoras — las 3 filas rewarded visibles con
   `(requiere anuncio)` / `(requires ad)` en la descripción.
5. **CG-MON-006 (ADR-012):** con adblocker activo — 3 filas ocultas + **línea ámbar de
   UNA sola línea** bajo el caption (`SHOP_ADS_HIDDEN_ADBLOCK` ES: *"Bloqueador de
   anuncios detectado: Duplicar, Triplicar y Revivir están ocultos. Desactívalo para
   verlos."*), sin popup y sin errores de consola: status `adblock` (no
   `sdk_unavailable`) — la distinción del ADR-012 funcionó en la vida real.

**Cierre técnico post-smoke:** `.env` revierto a `VITE_ADS=portal` +
`VITE_FULLSCREEN=true` (config dev del usuario), preview detenido y `npm run build`
corrido para dejar `dist/` consistente con el `.env` revierto; repo limpio (solo
`dist.zip` untracked).

### Smoke del modo `crazygames` con el QA Tool — **PASSED 2026-10-05** (B1 / ADR-010)

CG-MON-001 tapó la UI durante todo el ciclo del ad con `AdBlockerScene` (fase
`'requesting'` + garantía de par `requesting→ended` en el puerto). Cubierto por specs
(5 tests del listener en `AdBlockerScene.spec` + las 4 secuencias de phases y la
aserción de par del timeout de 15 s en `CrazyGamesService.spec`); **smoke en vivo con el
QA Tool APROBADO 2026-10-05**:

1. ✓ Con el QA Tool en modo `crazygames`, clic en **"Jugar de nuevo"** durante el
   rewarded (midgame) → backdrop + spinner **al instante** y **NO navega** hasta
   `adFinished`/`adError` (tablero detrás bloqueado y en pausa); los botones no navegan
   durante el ad.
2. ✓ El bloqueador se **cierra solo** al terminar/fallar el anuncio — también en el caso
   **sin fill** (no se queda clavado).
3. ✓ Consola: **un solo `requestAd` por click** (nunca un 2.º con el ad en vuelo).
4. ✓ Regresión modo `portal`: overlay de countdown de `AdOverlayScene` intacto, **sin**
   spinner/segundo fondo encima (`AdBlockerScene` no se cablea en portal) — verificado
   2026-10-04, ver *Smoke del modo `portal`*.

### Smoke del `muteAudio` de la plataforma (B2 / ADR-011) — **PASSED 2026-10-05**

CG-MON-002 cableó `game.settings.muteAudio` → `AudioService.setPlatformMuted()` como
capa con prioridad sobre el toggle in-game. Cubierto por specs (`AudioService.spec` 5 ·
`resolveMuteAudioOverride.spec` 4 · `CrazyGamesService.spec` describe de muteAudio 4);
**smoke en vivo APROBADO 2026-10-05** (build en `localhost:4173`, modo `crazygames`):

1. ✓ **`?muteAudio=true`** → juego **totalmente mudo desde el arranque** (música y sfx)
   y el **botón del HUD NO re-enciende** el audio — la capa `platformMuted` manda sobre
   el pref del jugador.
2. ✓ **`?muteAudio=false` / sin parámetro** → sonido normal, **música a volumen
   correcto** (el override `false` niega el mute de plataforma; la ausencia deja el mando
   al SDK) — corre en los 3 modos de `VITE_ADS`.

Receta de re-ejecución con el QA Tool (silenciar/reactivar desde la UI de la plataforma)
— mismo camino observable que el ítem 1: `onMuteAudioChange → setPlatformMuted`; el
pref del jugador sigue mandando cuando la plataforma no silencia.

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
   - **`sdk_unavailable` | `adblock` | `ads_disabled` | `cooldown_no_fill` →** reembolso único
     `awardGameplayCoins(costOf(id))`, motivo `'refunded'` y bloqueo de todo reclamo
     posterior — **invariante reembolso XOR efecto**; UI: `RESULT_AD_REFUNDED` y botones
     apagados. Cubre SDK ausente, adblock detectado, **ads deshabilitados en Basic Launch**
     (A3/ADR-009: motivo nuevo **`ads_disabled`**) y cooldown armado por un fallo
     **sin fill** (el reintento no promete nada). A3 además: si el `adError` del SDK vuelve
     el estado permanente **durante** el intento, los use-cases re-leen
     `rewardedAdStatus()` y aplican este mismo grupo **en el primer intento** (antes caían
     en `ad_failed` sin reembolso).
   - **`cooldown_retryable` →** motivo nuevo **`'ads_cooldown'`**, **sin reembolso**, sin
     setear `refunded`, sin pedir el anuncio; UI: clave **`RESULT_AD_COOLDOWN`** y los
     botones **NO** se apagan (reintento real a los 60 s). Ahí cae la **cancelación del
     jugador**: el cooldown de 60 s lo pone cualquier rewarded fallido (`settle()`), así
     que la ventana puede ser **autoinfligida** — reembolsar dentro de ella era un
     forfeit (se perdía para siempre la chance de revivir/duplicar).
   - `ad_failed` (el intento se hizo y falló: cancelación o anuncio no completado) **no**
     reembolsa y sigue reintentable — **salvo** que ese fallo haya dejado el estado
     permanente (`ads_disabled`/`adblock`): ahí ADR-009 manda reembolsar en el mismo intento.
   El sub-caso antes abierto (SDK presente pero `isRewardedAdAvailable()` false →
   `ad_failed` sin reembolso y dinero trabado, "decisión de producto pendiente")
   **cerró el 2026-10-01** con el grupo de reembolso; las specs de transición
   `ad_failed → cooldown → refunded` **ya no existen**. Specs de la política nueva
   (títulos reales):
   - `CrazyGamesService.spec.ts` (16 hoy — 14 al cerrar ADR-006 + 2 de ADR-009): *"tras un rewarded sin fill, rewardedAdStatus()
     es "cooldown_no_fill" durante el cooldown"* · *"tras un rewarded con otro fallo
     (timeout de arranque), rewardedAdStatus() es "cooldown_retryable"* · *"vencido el
     cooldown de 60 s, rewardedAdStatus() vuelve a "available"* · *"con adblock
     detectado, rewardedAdStatus() es "adblock" aunque haya cooldown activo"* · *"sin
     SDK, rewardedAdStatus() es "sdk_unavailable" (lo permanente manda sobre cualquier
     cooldown)"* · *"un rewarded exitoso limpia el cooldown y el motivo previo:
     rewardedAdStatus() vuelve a "available"*.
   - `MultiplyRewardUseCase.spec.ts` (19 hoy — 16 + 3 de ADR-009): *"returns "ads_cooldown" WITHOUT refunding
     while the cooldown is retryable: balance intact, no ad asked, claim still open"* ·
     *"after the 60 s cooldown expires the SAME claim attempts the ad for real and
     delivers the effect"* · *"refunds costOf("double_reward") exactly once when the
     cooldown came from a no-fill failure ("refunded")"* · *"after a player-cancelled
     ad, adblock detected before the next click refunds exactly once and closes the
     claim"* · *"refunds the cost when the SDK IS available but ads are blocked
     (adblock), without ever asking for an ad"* · *"keeps the refund final: with ads
     available again a later attempt returns "refunded" and pays nothing"*.
   - `ReviveWithAdUseCase.spec.ts` (22 hoy — 19 + 3 de ADR-009): los mismos 6 con revive — *"…balance intact,
     revive intact, no ad asked"* · *"…the SAME claim attempts the ad for real and
     revives"* · *"refunds costOf("revive") exactly once when the cooldown came from a
     no-fill failure ("refunded")"* · *"…closes the revive claim"* · *"refunds
     costOf("revive") when the SDK IS available but ads are blocked (adblock)…"* ·
     *"…a later attempt returns "refunded" and never revives"*.
   - **+9 de A3 (ADR-009), todos red→verde:** `CrazyGamesService.spec.ts` (2) — *"un adError
     adsDisabledBasicLaunch deja rewardedAdStatus() en "ads_disabled" PERMANENTE (no vuelve
     con el cooldown)"* · *"un adError {code: "adblock"} setea adblock permanente aunque
     hasAdblock() lo haya negado"*; `ReviveWithAdUseCase.spec.ts` y
     `MultiplyRewardUseCase.spec.ts` (3 c/u) — *"con rewardedAdStatus() "ads_disabled" …
     reembolsa costOf(id) exactamente una vez (política 2)"* ·
     `it.each(['ads_disabled', 'adblock'])` *"si el adError del SDK vuelve el estado "%s" al
     consumir, el PRIMER intento ya reembolsa (no "ad_failed")"* (2 casos, 1 llamada al
     anuncio y `refunded` de primera) · y `ListAvailableUpgradesUseCase.spec.ts` (1) —
     *"with rewardedAdStatus() "ads_disabled" the 3 rewarded rows disappear (5 left)"*.

---

## 6. Estado histórico reciente

- **2026-09-30 · Fase 0 (`fa036a3`)**: suite pasaba de 3 suites rojas / 5 tests a verde.
  - `PeriodicBonus.spec`: rango actualizado a `[500…5000]` (cambio de producto en `1.3.1`).
  - `PurchaseSessionUpgradeUseCase.spec`: costos derivados del catálogo.
  - `LanguageManager`: **bug de fuente** — elección manual igual al default no se persistía
    y la detección del SDK la pisaba en la próxima carga (ADR-004).
  - `tsconfig` dejó de excluir specs; se agregó ESLint mínimo.
