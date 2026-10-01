# Testing

> Estado al 2026-09-30 (guard de compra por ads): **38 suites · 435 tests · todos verdes**
> (medido: 38 `*.spec.ts` en `src`; 422 declaraciones `it(`/`test(` + 13 de un `it.each`).
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
| Guard de compra por ads (fila visible con ads caídos) — *2026-09-30* | `PurchaseSessionUpgradeUseCase` cobraba sin consultar el puerto de ads | rechazo `ads_unavailable` **antes** de `spendCoins` (`crazyGamesService` como 4° parámetro, cableado en `GameScene`) + clave i18n `SHOP_UPGRADE_ADS_UNAVAILABLE`; spec de esa clase al **100 %** (28 tests) |

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

### Límites aceptados del guard de compra por ads (2026-09-30 — no son bugs de esta vuelta)

1. **TOCTOU compra→consumo.** El guard chequea al *comprar*; si los ads caen *después*,
   el efecto vía anuncio no se entrega: `ResultScene` (double/triple) y
   `ReviveWithAdUseCase` no consultan `isRewardedAdAvailable()`. Cerrarlo exigiría
   chequeo también al consumir, o reembolso automático. Aceptado por ahora.
2. **Exhaustividad de `applyEffect`.** El `switch` de `PurchaseSessionUpgradeUseCase` no
   tiene aserción `never`: como devuelve `void`, `noImplicitReturns` no obliga a cubrir
   todos los casos, así que un id nuevo en la unión `SessionUpgradeId` (+ catálogo)
   compilaría y **cobraría sin aplicar efecto**. Mitigación propuesta: un spec que
   recorra `SESSION_UPGRADE_CATALOG` y verifique que cada id tiene rama de efecto.

---

## 6. Estado histórico reciente

- **2026-09-30 · Fase 0 (`fa036a3`)**: suite pasaba de 3 suites rojas / 5 tests a verde.
  - `PeriodicBonus.spec`: rango actualizado a `[500…5000]` (cambio de producto en `1.3.1`).
  - `PurchaseSessionUpgradeUseCase.spec`: costos derivados del catálogo.
  - `LanguageManager`: **bug de fuente** — elección manual igual al default no se persistía
    y la detección del SDK la pisaba en la próxima carga (ADR-004).
  - `tsconfig` dejó de excluir specs; se agregó ESLint mínimo.
