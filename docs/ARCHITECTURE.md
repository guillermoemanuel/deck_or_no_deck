# Arquitectura — Deck or No Deal (speculation-game)

> **Documento vivo.** Es la fuente de verdad sobre *cómo está construido* el código.
> Si un cambio altera este texto, se actualiza en el mismo commit.
> Los *porqués* de las decisiones están en `docs/DECISIONS/` (ADR).
> El estado operativo (qué se hizo, qué está rojo) está en `docs/LOG.md`.
> Inventario por archivo con líneas y tests: `docs/MAP.md`.

---

## 1. Capas y regla de dependencias

```
presentation/  (Phaser 3 — escenas, componentes, efectos)
      ↓ depende de
application/   (use-cases, factory, records, onboarding)
      ↓ depende de
domain/        (entidades, value-objects, servicios, puertos, eventos)

infrastructure/  implementa los ports de domain/  (DIP)
shared/          i18n + EventEmitter + utils — consumible por todas las capas
```

**Regla dura:** las flechas de importación solo apuntan hacia adentro.

| Desde → Hacia | ¿Permitido? | Verificación |
|---|---|---|
| `domain` → cualquier otra capa | **NO** | `grep -rn "from '\.\./" src/domain` debe devolver vacío |
| `application` → `infrastructure` | Solo en `*.spec.ts` (fakes) | producción solo `domain` + `shared` |
| `infrastructure` → `domain`/`shared` | SÍ | `phaser` solo aparece en `AudioService` |
| `presentation` → `infrastructure` | **UNA excepción conocida**: `GameServices.ts:2` | ADR-003 |
| `presentation` → `domain`/`application` | SÍ | — |
| Cualquier capa → `presentation` | **NO** | grep `from '.*presentation` fuera de presentation → vacío |

---

## 2. Composition roots

Hay **dos** lugares donde se instancian concretos:

1. **`src/main.ts`** (global, una vez): `CrazyGamesService`, repositorios LocalStorage,
   `ProgressionManager`, `CryptoRandomProvider`, `AudioService`, `GameOutcomeRecorder`,
   `ListAvailableUpgradesUseCase` (necesita solo el puerto de ads → se instancia global).
   Todo se guarda en `game.registry.set('services', services)`.
   También: init del SDK, locale detectado, `beforeunload` (gameplayStop + anti-cheat),
   manejo de fullscreen/orientación, mute durante anuncios.
2. **`src/presentation/scenes/GameScene.ts`** (por partida): elige la carta secreta,
   crea la `GameSession` vía `GameSessionFactory`, instancia los 7 use-cases
   (`PurchaseSessionUpgradeUseCase` recibe además el puerto de ads, para rechazar
   `ads_unavailable` sin cobrar),
   crea el `GameEvent` bus, construye vistas y `GameSceneController`,
   y publica `ActiveSessionBridge` en el registry.

---

## 3. Flujo de una partida

```
CardView emite 'card-clicked'
   → GameSceneController.bindCardClicks
   → OpenCardUseCase.execute(cardId)
   → GameSession.openCard()  (dominio: energía, oferta, win/lose)
   → emite GameEvent(s) en el bus
   → GameSceneController.handleEvent()   ← ÚNICO traductor evento→efecto visual
   → vistas / scene.launch('ResultScene') / modales
```

Prioridad de outcomes dentro de `OpenCardUseCase.execute` (cascada de `if/return`,
cada orden es un bugfix documentado):
**pérdida > celebración de carta máxima > victoria > oferta del banquero > swap mitad de partida > swap final.**

Meta-progresión (independiente de la partida):
`ShopScene/MainMenu/UIScene → ProgressionManager → ProgressionEvent → UIScene/ShopScene`.

---

## 4. Los dos buses de eventos

Implementación: `src/shared/utils/EventEmitter.ts` (`SimpleEventEmitter<T>`,
deliberadamente NO es `Phaser.Events.EventEmitter` — debe vivir sin Phaser).

| Bus | Creado en | Tipos | Emisores | Suscriptores |
|---|---|---|---|---|
| `GameEvent` | `GameScene` (por partida) | `domain/events/GameEvents.ts` (17 variantes) | los 7 use-cases | `GameSceneController`, celebración top-value (`GameScene`), `GameResultTracker`, `OnboardingFlow` |
| `ProgressionEvent` | `ProgressionManager` (singleton) | `domain/events/ProgressionEvents.ts` (3 variantes) | `ProgressionManager` | `UIScene` (`CoinsChanged`), `ShopScene` (`CoinsChanged`, `DeckCollectionChanged`) |

Reglas:
- `onEvent()` / `subscribe()` devuelven la función de unsubscribe → **siempre** suscribirse
  en `create()` y desuscribirse en `SHUTDOWN`/`DESTROY`.
- Un evento nuevo requiere: tipo en la unión + emisor + consumidor + spec.
- Variantes **muertas** (decloradas, nunca usadas): `SecretCardChosen`, `UpgradePurchased`.

---

## 5. Puertos (`src/domain/ports/`)

| Puerto | Implementación | Fake de test |
|---|---|---|
| `ICrazyGamesService` | `infrastructure/services/CrazyGamesService.ts` | `FakeCrazyGamesService` |
| `IProgressionService` | `infrastructure/persistence/ProgressionManager.ts` | — (usa el fake de repo) |
| `IProgressionRepository` | `LocalStorageProgressionRepository` | `FakeProgressionRepository` |
| `IRecordsRepository` | `LocalStorageRecordsRepository` | `FakeRecordsRepository` |
| `IDailyChallengeRepository` | `LocalStorageDailyChallengeRepository` | `FakeDailyChallengeRepository` |
| `IOnboardingRepository` | `LocalStorageOnboardingRepository` | `FakeOnboardingRepository` |
| `IRandomProvider` | `CryptoRandomProvider` | `DeterministicRandomProvider` |
| `IAudioService` | `infrastructure/audio/AudioService` | **no existe** |

Estrategia inyectada fuera de `ports/`: `EnergyDrainRule` (definida en `GameSession.ts`,
impl `DefaultEnergyDrainRule` en el mismo archivo; los specs definen doubles inline).

Contrato clave: **`ICrazyGamesService` retorna `AdResult`, nunca lanza excepciones** — y
**`rewardedAdStatus()`** (motivo `'available' | 'sdk_unavailable' | 'adblock' |
'cooldown_no_fill' | 'cooldown_retryable'`) es la fuente de la política de reembolso al
consumir (2 grupos, ADR-006); `isRewardedAdAvailable()` queda como azúcar.
Los fallos de anuncio son flujo normal (`user_cancelled | sdk_unavailable | ad_unavailable | error`).

---

## 6. Modelo de dominio

- **`GameSession`** (raíz de agregado): `deckManager` + `stateMachine` + `energy` +
  `cardsOpenedCount` + `hasSwappedSecret` + `currentOffer` + `sessionUpgrades`.
  Único punto de mutación por acción.
- **`GameStateMachine`**: `idle | playing | awaiting_offer_response | won | lost | deal_accepted`.
  Cada transición tiene guard y **lanza** si es ilegal. `start()`/`idle` nunca se usan en producción.
- **`DeckManager`**: 12 cartas de tablero + 1 secreta. `swapSecretCard` intercambia
  valores/roles **preservando IDs**.
- **VO inmutables**: `Card`, `EnergyLevel`, `DeckCollection` (cada operación devuelve instancia nueva).
- **`SessionUpgrades`**: flags de sesión (no se persisten): tanque 0|1|2, double, triple,
  revive, escudo, negociador. Expone `getState()/isOwned()/canPurchase()` — **la única
  fuente del estado visible**: la UI (`ShopScene.upgradeStatusFor`) y
  `PurchaseSessionUpgradeUseCase` delegan en vez de reimplementar reglas.
- **Dinero**: `number` crudo (no existe `Money` — ver ADR-002).

### Invariantes numéricos (no cambiar sin test que falle primero)

| Invariante | Valor | Dónde |
|---|---|---|
| Energía inicial | 50% | `GameSession` + `GameSessionFactory` |
| Drenaje por valor | tabla fija `EnergyDeltaTable` (25000→−40% … 1→+30%) | `domain/value-objects/EnergyDeltaTable.ts` |
| Cadencia del banquero | cada 3 cartas abiertas | `Banker.shouldMakeOffer` |
| Tope de la oferta | **nunca** supera el promedio puro del tablero | `OfferCalculator.ts` (`Math.min`) |
| Descuento de riesgo | ×0.85 | `OfferCalculator.ts` |
| Bonus Negociador | +15% (0.15) sobre la oferta, tope incluido | `GameSession.openCard` |
| Penalidad por abandono/derrota | −5000 (puede dejar saldo negativo) | `LOSS_PENALTY_AMOUNT` en `domain/value-objects/GamePenalties.ts` (fuente única) |
| Bono periódico | 12 h cooldown + 24 h ventana, 6 cartas `[500…5000]` | `domain/value-objects/PeriodicBonus.ts` |
| Tank de energía | techo ×1.25 (nivel 1) / ×1.5 (nivel 2) | `GameSession.applyEnergyTankUpgrade` **y** `PurchaseSessionUpgradeUseCase` (dos lugares, deben sincronizarse) |
| Costos de tienda | los define `SessionUpgradeCatalog.ts` | tests usan `costOf(id)`, no hardcodean |
| Zonas de energía | crítico ≤20 · baja 21..50 · sana ≥51 | `getEnergyZone()` en `domain/value-objects/EnergyLevel.ts` |
| Carta alta | ≥1000 (`HIGH_CASE_VALUE_MIN`, un valor real del mazo) | `isHighCaseValue()` en `domain/value-objects/CaseValues.ts` |
| Mejoras con rewarded ad | `requiresRewardedAd: true` en double_reward, triple_reward, revive | `SessionUpgradeCatalog.ts` solo **declara** la necesidad; deciden los 2 use-cases de aplicación sobre el puerto `ICrazyGamesService`: `ListAvailableUpgradesUseCase` (qué muestra la tienda) y `PurchaseSessionUpgradeUseCase` (rechazo `ads_unavailable` **sin cobrar** si la fila quedó visible y los ads se cortaron) — la escena solo lista y traduce el motivo a i18n |

---

## 7. Presentación

- **Escenas** (9, registradas en `main.ts:81`):
  `Boot → Preload → MainMenu → HowToPlay / DeckSelection → GameScene + UIScene → Shop / Result`.
  Las escenas **no se importan entre sí**; se comunican por Scene Manager (payloads tipados
  en `*.types.ts`), por `game.registry` o por eventos.
- **`GameSceneController`**: único traductor `GameEvent` → efectos visuales.
  `handleEvent()` es un switch de ~250 líneas / 14 casos — el mayor punto de colisión del repo.
- **Componentes "tontos"**: emiten eventos y no deciden. Las **escenas** no son tan tontas
  (deuda conocida: `ShopScene`, `UIScene`, `MainMenuScene` — ver `PLAYBOOK.md`).
- **Registry como blackboard** (claves string, contrato runtime):

  | Clave | Quién la escribe | Quién la lee |
  |---|---|---|
  | `'services'` | `main.ts` | `GameServices.getServices()` (falla fuerte si falta) |
  | `'activeSessionBridge'` | `GameScene` | `ShopScene` |
  | `'gameMode:pending'` | `MainMenuScene` | `GameScene` (consume-una-vez) |
  | `'gameAbandonGuard:*'` | `GameSceneController`/`UIScene` | `main.ts` (`beforeunload`) |
  | `'lastGameSummary'` | `GameScene` | `ResultScene` (lee y borra) |
  | `'resultScene:doubleBtn'/'tripleBtn'` | `ResultScene` | `ResultScene` (estado local en registry global) |

- **i18n**: 145 claves × {en, es} en `shared/i18n/LanguageData.ts`.
  Texto estático → componente `LocalizedText` (se auto-suscribe y se auto-destruye).
  Texto dinámico → `languageManager.getText('CLAVE', {param})` en cada render.
  Singleton `languageManager` es el **único** `export default` del proyecto.
  El idioma activo es conocimiento de presentación: **el dominio jamás ramifica por idioma.**
- **Audio**: `AudioService` se ancla a `Phaser.Game` (no a una Scene) para sobrevivir al
  ciclo de vida de escenas; fades por `requestAnimationFrame` (no por tweens de escena).

---

## 8. Persistencia

| Key de localStorage | Repo | Forma | Versionado |
|---|---|---|---|
| `speculation_game_progression_v1` | `LocalStorageProgressionRepository` | JSON `schemaVersion: 4` | sí — `migrateIfNeeded()` (v3→v4 backfill; otro valor → default) |
| `speculation_game_records_v1` | `LocalStorageRecordsRepository` | JSON sin versión | sanitiza campo a campo |
| `speculation_game_daily_v1` | `LocalStorageDailyChallengeRepository` | JSON sin versión | sanitiza |
| `speculation_game_onboarding_v1` | `LocalStorageOnboardingRepository` | JSON sin versión | sanitiza |
| `speculation_game_language` | `LanguageManager` | string plano | — |

Política única: **lectura fallida → default; escritura fallida → warn y el estado sigue
vivo en memoria.** El juego nunca rompe por storage bloqueado (iframe/cookies 3rd party).

`ProgressionManager` agrega sobre el repo: eventos `CoinsChanged`/`DeckCollectionChanged`,
penalidades que pueden dejar saldo negativo, ciclo del bono periódico y colección de mazos.
**No maneja energía** (la energía es de sesión).

---

## 9. Patrones en uso

Ports & Adapters (DIP) · Aggregate Root · Value Objects inmutables · State (máquina con
guards) · Strategy (`EnergyDrainRule`) · Factory (`GameSessionFactory`, `Card.create`) ·
Observer (2 buses) · Decorator/Proxy (`PenaltyFreeProgression`) · Repository ·
Facade (`ProgressionManager`) · Registry + Null Object + `Record` exhaustivo
(`DeckCelebrationEffectRegistry` — el compilador obliga a registrar todo mazo nuevo) ·
Bridge (`ActiveSessionBridge`) · Result types (uniones discriminadas para fallos esperados).

---

## 10. Comandos verificados

```bash
npm run dev          # vite dev server
npm run build        # tsc --noEmit && vite build
npm run typecheck    # tsc --noEmit  (incluye los 38 *.spec.ts)
npm run lint         # eslint src   (config mínima en eslint.config.mjs)
npm test             # jest — suite completa (~30 s)
npx jest <ruta>      # test selectivo — USAR SIEMPRE durante un cambio
npm run test:coverage
```
