# Arquitectura — Deck or No Deck (speculation-game)

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

1. **`src/main.ts`** (global, una vez): repositorios LocalStorage,
   `ProgressionManager`, `CryptoRandomProvider`, `AudioService`, `GameOutcomeRecorder`,
   `ListAvailableUpgradesUseCase` (necesita solo el puerto de ads → se instancia global).
   Todo se guarda en `game.registry.set('services', services)`.
   También: init del SDK, locale detectado, `beforeunload` (gameplayStop + anti-cheat),
   manejo de fullscreen/orientación, mute durante anuncios y **mute de la plataforma**
   (`resolveMuteAudioOverride(window.location.search)` → `setPlatformMuted()`, o si no
   hay override `onMuteAudioChange(→ setPlatformMuted)` — el override gana y se saltea
   la suscripción; ADR-011).

   **Selección del adapter de ads por env (ADR-007)** — `resolveAdsMode(import.meta.env.VITE_ADS)`
   (`infrastructure/config/resolveAdsMode.ts`, estricto: solo los literales exactos, el resto →
   default `crazygames` + warn) decide uno de **3 modos**:

   | `VITE_ADS` | Adapter | Arranque |
   |---|---|---|
   | `crazygames` (default, sin env o inválido) | `CrazyGamesService` | carga **dinámica** del SDK (`loadCrazyGamesSdk()` inyecta el `<script>` — ya **no** vive en `index.html`) → `init()` → locale |
   | `portal` | `OwnRewardedAdService` + **presenter inyectado** (`presentAdOverlay` de `presentation/`, patrón inverso igual que GameServices/ADR-003) | síncrono: `init()` (no-op) → locale (`navigator.language`) |
   | `none` | `CrazyGamesService` **sin script** → `sdk_unavailable` permanente → filas de ads ocultas | síncrono |

   El tipo común es `type AdService = ICrazyGamesService & { init(): Promise<void> | void }`;
   el gate de carga del script (`mayLoadCrazyGamesSdk`, `===` plegable por el bundler) es un
   **espejo deliberado** de `resolveAdsMode()`: en un build `portal`/`none` la URL
   `sdk.crazygames.com` no aparece en el bundle. Orden de boot en modo `crazygames`:
   `script → init → juego` (el resto del archivo corre en paralelo mientras carga).

   **Botón de pantalla completo propio (ADR-008)** —
   `resolveFullscreenEnabled(import.meta.env.VITE_FULLSCREEN, adsMode)`
   (`infrastructure/config/resolveFullscreenEnabled.ts`) produce el booleano que
   `main.ts` inyecta en el bag como `GameServices.fullscreenEnabled`; las 4 escenas con
   `SoundFullscreenControls` lo pasan como 3.er argumento (**presentation no lee env
   directo**). Es la **pareja invariante de `VITE_ADS`**, escrita por la misma tool
   `/ads-adapter` en `.env`: `crazygames` → `false` (la plataforma prohíbe los botones
   fullscreen propios, CG-PUB-002 — el modo manda, aunque el env diga `'true'`),
   `portal`/`none` → `true`; sin env o con basura → `false` (default seguro).
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
| `ICrazyGamesService` | **2 adapters** (ADR-007, elegidos por `VITE_ADS` en `main.ts`): `infrastructure/services/CrazyGamesService.ts` (SDK de CrazyGames) e `infrastructure/services/OwnRewardedAdService.ts` (anuncio propio: overlay countdown 3 s, cancelación honesta `user_cancelled`, watchdog 15 s) — el cooldown de 60 s de ambos vive en `infrastructure/services/RewardCooldownTracker.ts` (fuente única) | `FakeCrazyGamesService` |
| `IProgressionService` | `infrastructure/persistence/ProgressionManager.ts` | — (usa el fake de repo) |
| `IProgressionRepository` | `LocalStorageProgressionRepository` | `FakeProgressionRepository` |
| `IRecordsRepository` | `LocalStorageRecordsRepository` | `FakeRecordsRepository` |
| `IDailyChallengeRepository` | `LocalStorageDailyChallengeRepository` | `FakeDailyChallengeRepository` |
| `IOnboardingRepository` | `LocalStorageOnboardingRepository` | `FakeOnboardingRepository` |
| `IRandomProvider` | `CryptoRandomProvider` | `DeterministicRandomProvider` |
| `IAudioService` | `infrastructure/audio/AudioService` | **no existe** |

Nota: **`AudioService.setPlatformMuted()` NO está en el puerto `IAudioService`** — es
método concreto de la implementación, consumido solo por `main.ts` (composition root);
si application/presentación lo necesitan algún día, hay que decidir primero si sube al
puerto (ADR-011).

Estrategia inyectada fuera de `ports/`: `EnergyDrainRule` (definida en `GameSession.ts`,
impl `DefaultEnergyDrainRule` en el mismo archivo; los specs definen doubles inline).

Contrato clave: **`ICrazyGamesService` retorna `AdResult`, nunca lanza excepciones** — y
**`rewardedAdStatus()`** (motivo `'available' | 'sdk_unavailable' | 'adblock' |
'ads_disabled' | 'cooldown_no_fill' | 'cooldown_retryable'`) es la fuente de la política de
reembolso al consumir (2 grupos, ADR-006); `isRewardedAdAvailable()` queda como azúcar.
**Orden del status: lo permanente manda sobre el cooldown de 60 s**
(`sdk_unavailable` → `adblock` → `ads_disabled` → cooldown → `available`). ADR-009:
`ads_disabled` nace del adError `{code: 'adsDisabledBasicLaunch'}` de **Basic Launch** y
`adblock` también puede encenderse desde el adError `{code: 'adblock'}` (ya no solo con
`hasAdblock()` en el init) — `CrazyGamesService.notePermanentError()` lo cachea **antes de
`settle()`**; los use-cases re-leen el motivo tras un rewarded fallido y aplican la
política 2 **en ese mismo intento**.
Los fallos de anuncio son flujo normal (`user_cancelled | sdk_unavailable | ad_unavailable | error`).
El adapter propio (`VITE_ADS=portal`) solo produce `available | cooldown_*` en su status —
nunca `adblock`, `ads_disabled` ni `sdk_unavailable` (sin ad network no hay qué bloquear);
su cancelación por ✕
sí emite `user_cancelled` honesto (motivo "muerto" resuelto, R5 de la auditoría previa).

**Ciclo de vida del ad (ADR-010, CG-MON-001):** `onAdLifecycle()` emite
**`AdLifecyclePhase` = `'requesting' | 'started' | 'ended'`** — `'requesting'` al abrir
el `requestAd` (señal de **bloquear la UI** antes de que el ad se vea), `'started'` en
`adStarted` (recién ahí se silencia el audio), `'ended'` en `adFinished`/`adError`.
**Garantía de par (contrato del puerto):** todo ciclo abierto con `'requesting'` cierra
con EXACTAMENTE un `'ended'`, aunque no haya habido `'started'` (sin fill, timeout de
15 s o excepción del SDK también cierran). Consumidores: el audio (`main.ts`) y
**`AdBlockerScene` vía `createAdBlockerListener()`** — este último **solo si
`adsMode !== 'portal'`**, porque en portal el bloqueador es `AdOverlayScene`.

**Setting de audio de la plataforma (ADR-011, CG-MON-002):** `onMuteAudioChange(listener)`
→ `() => void` notifica `game.settings.muteAudio` del SDK: el valor **INICIAL** (aunque
la suscripción sea anterior o posterior a `init()` — `muteAudioKnown` resuelve la
carrera) y cada cambio. **Los adapters sin plataforma nunca notifican**
(`OwnRewardedAdService` es un stub; sin SDK tampoco). Contrato de consumidor: aplicarlo
como capa **con prioridad** sobre el toggle in-game — la doc oficial dice
*"This setting should take priority over your in-game audio settings"*; en `main.ts` el
override `?muteAudio=true|false` (`resolveMuteAudioOverride`) gana y se saltea la
suscripción.

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
| Penalidad por abandono/derrota | −1000 (puede dejar saldo negativo) | `LOSS_PENALTY_AMOUNT` en `domain/value-objects/GamePenalties.ts` (fuente única) |
| Bono periódico | 12 h cooldown + 24 h ventana, 6 cartas `[500…5000]` | `domain/value-objects/PeriodicBonus.ts` |
| Tank de energía | techo ×1.25 (nivel 1) / ×1.5 (nivel 2) | `GameSession.applyEnergyTankUpgrade` **y** `PurchaseSessionUpgradeUseCase` (dos lugares, deben sincronizarse) |
| Costos de tienda | los define `SessionUpgradeCatalog.ts` | tests usan `costOf(id)`, no hardcodean |
| Zonas de energía | crítico ≤20 · baja 21..50 · sana ≥51 | `getEnergyZone()` en `domain/value-objects/EnergyLevel.ts` |
| Carta alta | ≥1000 (`HIGH_CASE_VALUE_MIN`, un valor real del mazo) | `isHighCaseValue()` en `domain/value-objects/CaseValues.ts` |
| Mejoras con rewarded ad | `requiresRewardedAd: true` en double_reward, triple_reward, revive | `SessionUpgradeCatalog.ts` solo **declara** la necesidad; deciden los 2 use-cases de aplicación sobre el puerto `ICrazyGamesService`: `ListAvailableUpgradesUseCase` (qué muestra la tienda y, desde ADR-012, **`adsNotice()`** → `'adblock' \| 'ads_disabled' \| null`: si la tienda debe avisar **inline** por qué faltan filas — solo motivos permanentes; cooldowns y `sdk_unavailable` no avisan) y `PurchaseSessionUpgradeUseCase` (rechazo `ads_unavailable` **sin cobrar** si la fila quedó visible y los ads se cortaron) — la escena solo lista, traduce el motivo a i18n y dibuja |

---

## 7. Presentación

- **Escenas** (11 en la lista de `main.ts:206`; las últimas dos son `AdOverlayScene` y
  `AdBlockerScene`, registradas en el boot y **dormidas hasta su primer `start()`** —
  ADR-007 enmienda 2026-10-04 y ADR-010, que reemplazan el registro en runtime):
  `Boot → Preload → MainMenu → HowToPlay / DeckSelection → GameScene + UIScene → Shop / Result`
  (+ `AdOverlayScene`, activada solo en modo `VITE_ADS=portal`;
  + `AdBlockerScene`, cableada solo **fuera** de `portal` — bloquea la UI del ciclo del
  ad del SDK, ADR-010).
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

- **i18n**: 150 claves × {en, es} en `shared/i18n/LanguageData.ts`.
  Texto estático → componente `LocalizedText` (se auto-suscribe y se auto-destruye).
  Texto dinámico → `languageManager.getText('CLAVE', {param})` en cada render.
  Singleton `languageManager` es el **único** `export default` del proyecto.
  El idioma activo es conocimiento de presentación: **el dominio jamás ramifica por idioma.**
- **Audio**: `AudioService` se ancla a `Phaser.Game` (no a una Scene) para sobrevivir al
  ciclo de vida de escenas; fades por `requestAnimationFrame` (no por tweens de escena).
  **Estado audible (ADR-011):** dos capas — el pref del jugador (`muted`) y el silencio
  de la plataforma (`platformMuted`, desde `main.ts` vía `onMuteAudioChange` o el
  override `?muteAudio=`); la fuente única es `applyMute()` → `sound.mute = muted ||
  platformMuted` y `isMuted()` devuelve el **efectivo**, así que el toggle del HUD no
  puede re-encender lo que la plataforma silenció (su click queda como pref "que suene"
  para cuando se libere). El guard de `play()` y el botón del HUD leen el efectivo.
  Borde aceptado: el mute de anuncios de `main.ts` captura `isMuted()` (efectivo) y
  restaura con `setMuted()` (pref) — ver ADR-011.

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
npm run typecheck    # tsc --noEmit  (incluye los 48 *.spec.ts)
npm run lint         # eslint src   (config mínima en eslint.config.mjs)
npm test             # jest — suite completa (~30 s)
npx jest <ruta>      # test selectivo — USAR SIEMPRE durante un cambio
npm run test:coverage
```
