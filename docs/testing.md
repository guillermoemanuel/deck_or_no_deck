# Testing

> Estado al 2026-09-30 (Fase 4, parte 2): **37 suites · 425 tests · todos verdes**.
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
| `application/` | 11 | alta (umbral 88/82/90/88, nuevo en Fase 4) | 🟢 |
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
| `collectEvents(bus)` | `application/use-cases/testing/` | acumula eventos para asserts de secuencia (usado en 6 de 7 specs de use-cases) |
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
testearla ahí**. Sigue vivo en escenas sin ningún test:

| Lógica oculta en presentación | Archivo | Dónde debería vivir |
|---|---|---|
| Filtro de compras por disponibilidad de ads **(parcialmente resuelto)** | `ShopScene.renderUpgradesTab()` | use-case |

Sobre esa fila: la lista de *qué* mejoras dependen de ads ya vive en dominio
(`SessionUpgradeCatalog.requiresRewardedAd`, con spec que fija el set
double/triple/revive), pero la decisión de *ocultarlas cuando no hay anuncios* —la
disponibilidad— sigue en `ShopScene.renderUpgradesTab()`; moverla a un use-case queda
pendiente.

**Ya resueltos en Fase 4 (2026-09-30)** — mismo mecanismo (regla extraída a `domain` +
test ahí); quedan acá solo como contexto histórico:

| Qué | Dónde vivía | Mecanismo |
|---|---|---|
| Estado de mejora (poseída/bloqueada/nivel) | `ShopScene.upgradeStatusFor()` (~70 L) | `SessionUpgrades.getState()` (+ `isOwned`/`canPurchase`); la vista quedó en ~32 L, solo presentación |
| Regla de recompensa diaria (+1 racha) | `DailyChallengeBanner` | `previewDailyCompletion()`; `completeDaily` delega en ella — test de propiedad: preview ≡ lo que paga |
| Penalidad de abandono (−5000) en 3 sitios | literal en `OpenCardUseCase` + constante en `GameAbandonGuard` (importada por `UIScene`/`main.ts`) | `LOSS_PENALTY_AMOUNT` en `domain/value-objects/GamePenalties.ts` (spec propio) |
| Umbral de carta alta (≥1000) — *Fase 4 parte 2, 2026-09-30* | `CardView.reveal()` (`value >= 1000`) | `HIGH_CASE_VALUE_MIN` + `isHighCaseValue()` en `domain/value-objects/CaseValues.ts`, spec en `CaseValues.spec.ts` (frontera 999/1000) |
| Zonas de energía (>50 / >20, pulso crítico) — *Fase 4 parte 2, 2026-09-30* | `EnergyBarView` (`colorForPercentage`) | `EnergyZone` + `getEnergyZone()` en `domain/value-objects/EnergyLevel.ts`, fronteras 50/20 con spec en `EnergyLevel.spec.ts`; la vista solo traduce zona → color |

Además: **smoke manual** por feature (checklist sugerido, ~5 min):

1. Partida completa: abrir cartas → oferta → DEAL → resultado → cobrar.
2. NO DEAL hasta el final → swap mitad de partida → swap final → victoria/derrota.
3. Energía a 0 → revivir con anuncio (fake en local) → seguir jugando.
4. Tienda: comprar mejora con y sin fondos, con conflicto, y comprar mazo.
5. Cambiar idioma en el menú → verificar textos de escenas, tutorial y modales.
6. Salir al menú a mitad de partida → verificar penalidad y saldo.
7. Bono periódico (forzar `periodicBonusCycleStart` en localStorage).

---

## 6. Estado histórico reciente

- **2026-09-30 · Fase 0 (`fa036a3`)**: suite pasaba de 3 suites rojas / 5 tests a verde.
  - `PeriodicBonus.spec`: rango actualizado a `[500…5000]` (cambio de producto en `1.3.1`).
  - `PurchaseSessionUpgradeUseCase.spec`: costos derivados del catálogo.
  - `LanguageManager`: **bug de fuente** — elección manual igual al default no se persistía
    y la detección del SDK la pisaba en la próxima carga (ADR-004).
  - `tsconfig` dejó de excluir specs; se agregó ESLint mínimo.
