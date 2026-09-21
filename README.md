# Speculation Game — Arquitectura Técnica

Juego arcade táctico de especulación (inspirado en "Deal or No Deal") construido con **TypeScript + Phaser 3**, optimizado para **CrazyGames**. Este documento describe la arquitectura, las capas del sistema y el flujo completo de eventos de una partida.

---

## 1. Principios Arquitectónicos

El proyecto sigue **Clean Architecture** con separación estricta en tres capas:

```
┌─────────────────────────────────────────────────────┐
│  presentation/   (Phaser 3 — escenas, componentes)   │
│         ↓ depende de                                 │
│  application/    (use-cases, orquestación, DTOs)     │
│         ↓ depende de                                 │
│  domain/         (lógica pura, sin dependencias)      │
└─────────────────────────────────────────────────────┘
         ↑
infrastructure/   (localStorage, CrazyGames SDK — implementa
                    los ports/interfaces definidos en domain/)
```

**Regla de dependencias:** las flechas de importación solo apuntan hacia adentro. `domain/` nunca importa nada de `application/`, `infrastructure/` ni `presentation/`. `infrastructure/` implementa interfaces (*ports*) definidas en `domain/`, pero el dominio jamás conoce las implementaciones concretas (Dependency Inversion).

| Capa | Responsabilidad | Ejemplos |
|---|---|---|
| `domain/` | Reglas de negocio puras, sin efectos secundarios | `GameSession`, `Banker`, `OfferCalculator`, `EnergyLevel` |
| `application/` | Orquesta el dominio en respuesta a acciones del jugador | `OpenCardUseCase`, `ResolveDealUseCase`, `MultiplyRewardUseCase` |
| `infrastructure/` | Implementaciones concretas de los *ports* del dominio | `CrazyGamesService`, `LocalStorageProgressionRepository`, `ProgressionManager` |
| `presentation/` | Phaser 3: escenas, componentes visuales, input | `GameScene`, `CardView`, `EnergyBarView`, `GameSceneController` |

---

## 2. Estructura de Directorios

```
src/
├── domain/
│   ├── entities/          GameSession, Card, EnergyBar
│   ├── services/          Banker, OfferCalculator
│   ├── value-objects/     Money, EnergyLevel, Upgrade
│   ├── events/             GameEvents, ProgressionEvents
│   ├── ports/               ICrazyGamesService, IProgressionRepository, IRandomProvider
│   └── errors/
├── application/
│   ├── use-cases/          OpenCardUseCase, ResolveDealUseCase, SwapSecretCardUseCase,
│   │                        ReviveWithAdUseCase, MultiplyRewardUseCase
│   ├── dto/                 GameStateDTO
│   └── factories/           GameSessionFactory
├── infrastructure/
│   ├── services/            CrazyGamesService, CryptoRandomProvider
│   ├── persistence/         LocalStorageProgressionRepository, ProgressionManager
│   └── config/
├── presentation/
│   ├── scenes/               BootScene, PreloadScene, GameScene, UIScene, ShopScene, ResultScene
│   ├── components/           CardView, EnergyBarView, BankerOfferPanel, SwapEventModal
│   ├── controllers/          GameSceneController
│   └── GameServices.ts       Contenedor de dependencias inyectado vía game.registry
├── shared/
│   ├── types/
│   └── utils/                EventEmitter (SimpleEventEmitter<T>)
└── main.ts                    Composition Root
```

---

## 3. Mecánicas del Juego

| Mecánica | Descripción | Clase responsable |
|---|---|---|
| **El Mazo** | 13 cartas: 12 en tablero + 1 secreta reservada al inicio | `GameSession`, `Card` |
| **Barra de Energía** | Arranca en 50%. Cada valor de carta tiene un impacto fijo (tabla, no fórmula relativa): 25000/-40%, 10000/-30%, 5000/-20%, 1000/-10%, 750/-5%, 500 y 250 neutros, 100/+5%, 50/+10%, 25/+5%, 10/+20%, 5/+25%, 1/+30%. En 0% → derrota | `EnergyLevel`, `DefaultEnergyDrainRule`, `EnergyDeltaTable` |
| **El Banquero** | Ofrece cada 3 cartas abiertas, según promedio de cartas restantes + estimación de la secreta | `Banker`, `OfferCalculator` |
| **Evento de mitad de juego** | Al abrir la 6ª carta: opción de intercambiar la carta secreta | `GameSession.swapSecretCard()` |
| **Meta-progresión** | Ganancias → monedas persistentes → mejoras permanentes | `ProgressionManager`, `LocalStorageProgressionRepository` |
| **Monetización** | Revivir / duplicar / triplicar premio vía Rewarded Ads | `ReviveWithAdUseCase`, `MultiplyRewardUseCase`, `CrazyGamesService` |

### Mejoras de tienda (catálogo actual)

| Mejora | Efecto | Modificador de dominio |
|---|---|---|
| Blindaje de Energía | -15% de drenaje por nivel (máx. 3) | `energyDrainMultiplier` |
| Negociador Maestro | +5% en la oferta del banquero por nivel (máx. 3), nunca supera el promedio puro | `offerBonusPercentage` (capeado en `OfferCalculator`) |
| Tanque de Reserva | +10 de energía inicial por nivel (máx. 2) | `startingEnergyBonus` |

---

## 4. Flujo de Eventos End-to-End

Todo el juego se comunica mediante dos buses de eventos independientes, implementados con `SimpleEventEmitter<T>` (sin dependencias de Phaser):

- **`GameEvent`** — eventos de una partida en curso (emitidos por los use-cases hacia `GameSceneController`).
- **`ProgressionEvent`** — eventos de meta-progresión (emitidos por `ProgressionManager` hacia `UIScene`/`ShopScene`).

### 4.1 Diagrama de flujo — partida completa

```
Jugador click en carta
        │
        ▼
CardView emite 'card-clicked'
        │
        ▼
GameSceneController → OpenCardUseCase.execute(cardId)
        │
        ▼
GameSession.openCard(cardId)
        │
        ├── drena/protege energía (EnergyLevel)
        │
        ├── ¿energía == 0?
        │        │
        │        ▼
        │   emite 'EnergyDepleted' + 'GameLost'
        │        │
        │        ▼
        │   GameSceneController → scene.launch('ResultScene', { outcome: 'lost', onRevive })
        │        │
        │        ▼
        │   Jugador click "Revivir (Ad)"
        │        │
        │        ▼
        │   ReviveWithAdUseCase.execute() → CrazyGamesService.showRewardedAd()
        │        │
        │        ├── éxito → GameSession.reviveWithFullEnergy() → emite 'GameRevived'
        │        │              → ResultScene se cierra, tablero se desbloquea
        │        │
        │        └── falla → ResultScene muestra mensaje de error, partida sigue perdida
        │
        ├── ¿cartas abiertas % 3 == 0?
        │        │
        │        ▼
        │   Banker.makeOffer() → emite 'BankerOfferMade'
        │        │
        │        ▼
        │   GameSceneController muestra BankerOfferPanel, bloquea cartas
        │        │
        │        ├── click "DEAL" → ResolveDealUseCase.acceptDeal()
        │        │        │
        │        │        ├── ProgressionManager.awardGameplayCoins(amount)
        │        │        │        └── emite ProgressionEvent 'CoinsChanged' → UIScene actualiza saldo
        │        │        │
        │        │        └── emite GameEvent 'DealAccepted' + 'GameWon'
        │        │                 │
        │        │                 ▼
        │        │        GameSceneController → scene.launch('ResultScene', { outcome: 'won', amount })
        │        │                 │
        │        │                 ▼
        │        │        Jugador click "Duplicar/Triplicar (Ad)"
        │        │                 │
        │        │                 ▼
        │        │        MultiplyRewardUseCase.execute(multiplier)
        │        │                 │
        │        │                 ├── éxito → ProgressionManager.awardGameplayCoins(bonus)
        │        │                 │              → 'CoinsChanged' → UIScene actualiza saldo
        │        │                 │
        │        │                 └── falla → ResultScene muestra mensaje de error
        │        │
        │        └── click "NO DEAL" → ResolveDealUseCase.rejectDeal()
        │                 └── emite 'DealRejected' → panel se cierra, tablero se desbloquea
        │
        └── ¿cartas abiertas == 6?
                 │
                 ▼
            emite 'MidgameSwapAvailable'
                 │
                 ▼
            GameSceneController muestra SwapEventModal
                 │
                 ├── jugador elige carta cerrada → SwapSecretCardUseCase.execute(cardId)
                 │        └── emite 'SecretCardSwapped'
                 │
                 └── jugador declina → modal se cierra, partida continúa
```

### 4.2 Flujo de meta-progresión (independiente de la partida)

```
Jugador abre ShopScene
        │
        ▼
ProgressionManager.getShopCatalog() → renderiza filas con costo/nivel actual
        │
        ▼
Jugador click "Comprar"
        │
        ▼
ProgressionManager.purchaseUpgrade(upgradeId)
        │
        ├── fondos insuficientes → PurchaseResult { success: false } → feedback visual de error
        │
        └── éxito → repository.purchaseUpgradeLevel()
                 │
                 ├── emite ProgressionEvent 'UpgradePurchased' → ShopScene.refreshRow() (quirúrgico, sin recrear la escena)
                 └── emite ProgressionEvent 'CoinsChanged' → UIScene actualiza saldo al instante
```

Las mejoras compradas se traducen en modificadores concretos solo al iniciar una nueva partida, vía `ProgressionManager.getActiveGameplayModifiers()` → consumido por `GameSessionFactory.createGameSession()`.

---

## 5. Puntos de Extensión (Ports)

| Interfaz | Ubicación | Implementación actual | Propósito |
|---|---|---|---|
| `ICrazyGamesService` | `domain/ports/` | `CrazyGamesService` | Aísla `window.CrazyGames.SDK`; permite migrar de plataforma sin tocar el dominio |
| `IProgressionRepository` | `domain/ports/` | `LocalStorageProgressionRepository` | Aísla `localStorage`; permite migrar a backend con cuentas sin tocar reglas de negocio |
| `IRandomProvider` | `domain/ports/` | `CryptoRandomProvider` *(pendiente)* | Abstrae la generación de valores del mazo para permitir tests deterministas |

---

## 6. Decisiones de Diseño Notables

- **Value Objects inmutables** (`Card`, `EnergyLevel`): cada cambio de estado genera una nueva instancia, evitando mutación compartida entre `GameSession` y la UI.
- **`EnergyDrainRule` como estrategia inyectada**: permite que la mejora "Blindaje de Energía" module el drenaje sin tocar `GameSession`.
- **Cap matemático en `OfferCalculator`**: la oferta del banquero, incluso con "Negociador Maestro" al máximo, nunca supera el promedio puro del tablero — preserva la tensión DEAL/NO DEAL.
- **`ICrazyGamesService` retorna `AdResult` en vez de lanzar excepciones**: los fallos de anuncio son parte normal del flujo, no errores excepcionales.
- **Dos buses de eventos separados** (`GameEvent` / `ProgressionEvent`): una partida y la meta-progresión son conceptualmente independientes; mezclar ambos buses acoplaría innecesariamente `ShopScene` al ciclo de vida de `GameScene`.
- **`ResolveDealUseCase` y `MultiplyRewardUseCase` dependen de `ProgressionManager` (infraestructura), no de `IProgressionRepository` puro**: decisión pragmática documentada — `ProgressionManager` ya es la fachada pensada para ser consumida ampliamente; forzar el puerto crudo solo trasladaría lógica fuera de donde vive naturalmente.
- **Componentes visuales "tontos"** (`CardView`, `EnergyBarView`, etc.): solo emiten eventos DOM-style, nunca deciden lógica de negocio. Toda orquestación vive en `GameSceneController`.
- **Suscripción reactiva en vez de polling**: `UIScene` y `ShopScene` se suscriben a `ProgressionManager.onEvent()` — sin `setInterval`/`time.addEvent` sondeando estado.

---

## 7. Pendientes Conocidos

- [x] Implementación concreta de `CryptoRandomProvider`.
- [x] Tests unitarios completos de `OfferCalculator` y `GameSession`.
- [x] Tests de integración de los use-cases de `application/` (`OpenCardUseCase`, `ResolveDealUseCase`, `SwapSecretCardUseCase`, `ReviveWithAdUseCase`, `MultiplyRewardUseCase`) y de `ProgressionManager`.
- [x] Condición de carrera en `MultiplyRewardUseCase` (doble click / llamadas concurrentes a `execute()`) — corregida con un flag `isProcessing` seteado sincrónicamente antes del primer `await`. Ver el comentario en la clase y los tests `MultiplyRewardUseCase.spec.ts`.
- [x] Assets placeholder generados para que el juego renderice localmente sin arte final (`public/assets/`) — ver sección 9.
- [ ] Sistema de guardado de partida en curso (actualmente solo persiste meta-progresión, no el estado de una partida interrumpida).
- [ ] Escena de menú principal / splash previa a `GameScene`.
- [ ] Reemplazar los assets placeholder por arte y audio final antes de publicar en CrazyGames.

---

## 8. Cómo Extender el Juego

**Agregar una nueva mejora de tienda:** solo requiere un nuevo objeto en `UPGRADE_CATALOG` (`domain/value-objects/Upgrade.ts`) y, si introduce un `effectType` nuevo, un caso adicional en `ProgressionManager.getActiveGameplayModifiers()`. No requiere tocar `presentation/`.

**Agregar un nuevo tipo de evento de mitad de partida:** extender el union `GameEvent`, emitirlo desde `GameSession`/el use-case correspondiente, y agregar el `case` en `GameSceneController.handleEvent()`.

**Cambiar de plataforma de anuncios (ej. Poki en vez de CrazyGames):** reemplazar únicamente `infrastructure/services/CrazyGamesService.ts` por una nueva clase que implemente `ICrazyGamesService`. Cero cambios en `domain/` o `application/`.

---

## 9. Assets Placeholder

El repositorio incluye assets **placeholder** generados programáticamente (no arte final) en `public/assets/`, únicamente para que el juego renderice y sea jugable localmente sin depender de arte externo:

| Archivo | Uso | Dimensiones |
|---|---|---|
| `assets/ui/loading-bg.png` | Fondo de `BootScene`/`PreloadScene` | 1280×720 |
| `assets/ui/loading-bar.png` | Relleno de la barra de carga | 300×20 |
| `assets/cards/card-back.png` | Reverso de las cartas del tablero | 120×168 |
| `assets/cards/card-front.png` | Frente de las cartas (el valor se dibuja aparte con `Phaser.Text`) | 120×168 |
| `assets/ui/energy-bar-bg.png` | Marco de `EnergyBarView` | 300×30 |
| `assets/ui/energy-bar-fill.png` | Relleno de `EnergyBarView` — **blanco puro**, a propósito: `EnergyBarView.setPercentage()` le aplica `setTint()` en runtime, y `setTint` multiplica el color base, así que un blanco puro es el único valor que reproduce el color de tinte exacto (verde/amarillo/rojo) | 292×22 |
| `assets/ui/banker-portrait.png` | Retrato en `BankerOfferPanel` | 160×160 |
| `assets/audio/card-open.mp3` | SFX al abrir una carta | ~0.18s, tono sintético |
| `assets/audio/offer.mp3` | SFX al aparecer la oferta del banquero | ~0.5s, tono sintético |

**Antes de publicar en CrazyGames, reemplazar estos 9 archivos por arte y audio final**, manteniendo los mismos nombres de archivo y keys de carga (`card-back`, `card-front`, `energy-bar-bg`, `energy-bar-fill`, `banker-portrait`, `sfx-card-open`, `sfx-offer`, `loading-bg`, `loading-bar`) para no tener que tocar `BootScene.ts`/`PreloadScene.ts`. Si el nuevo arte cambia de dimensiones, revisar `BOARD_LAYOUT` en `GameScene.ts` (espaciado del tablero) y el `maxWidth` implícito en `EnergyBarView` (se calcula del ancho real de `energy-bar-fill`).

---

## 10. Correcciones — Sesión de Mantenimiento (swap, memoria de valores, numeración)

Esta sesión partió de una versión ya avanzada por el equipo (con `DeckManager`, `GameStateMachine`, selección de Carta Secreta integrada en `GameScene`, partículas AAA, etc.) y cerró tres pendientes puntuales.

### 10.1 Bug: la carta intercambiada quedaba "cerrada" para siempre

**Síntoma reportado:** al usar el evento de mitad de juego (intercambiar la Carta Secreta), la carta del tablero que se eligió para el intercambio quedaba visualmente cerrada e inutilizable — un click posterior no hacía nada, y el jugador no podía completar la partida.

**Causa raíz:** `DeckManager.swapSecretCard()` ya calculaba correctamente el nuevo estado de dominio (la carta descartada queda **revelada** ocupando el slot de tablero elegido; la nueva carta secreta conserva el id del pedestal y permanece oculta) — el dominio estaba bien. El bug estaba en `GameSceneController`: el handler de `'SecretCardSwapped'` solo actualizaba la vista del **pedestal**, nunca la `CardView` del **slot de tablero** afectado. Esa carta seguía mostrando el reverso indefinidamente, mientras que en el dominio ya estaba marcada `isOpen: true` — por lo que un click posterior disparaba `Card.open()` sobre una carta ya abierta, lanzando una excepción no manejada (`Card X is already open`) que dejaba ese click "muerto" en la práctica.

Un segundo bug relacionado, en `CardView.applyState()`: usaba `setInteractive(undefined)` para intentar deshabilitar el click al revelar una carta, pero en Phaser eso **no deshabilita la interactividad** (solo reaplica la configuración existente) — hacía falta `disableInteractive()`. Esto agravaba el problema en general, no solo en el swap.

**Fix aplicado:**
- `GameSceneController` (`case 'SecretCardSwapped'`): ahora también busca la `CardView` del slot de tablero (`cardViews.get(event.oldSecretCard.id)`), la revela con `applyState({ isOpen: true, value })` y la bloquea con `setLocked(true)` — igual que cualquier carta abierta normalmente.
- `CardView.applyState()`: corregido para usar `disableInteractive()`/`setInteractive({...})` explícitamente según el estado, en vez del `setInteractive(undefined)` que no tenía efecto real.
- `bindCardClicks()`: guardia adicional — si por cualquier motivo llega un click sobre una carta ya revelada durante la selección de intercambio, se ignora en vez de propagar la excepción (defensa en profundidad).
- Se actualizaron `DeckManager.spec.ts` y `GameSession.spec.ts`: sus tests de swap describían el contrato **viejo** (la carta descartada quedaba "cerrada" en el tablero) — es decir, documentaban exactamente el bug reportado como si fuera el comportamiento esperado. Se reescribieron para verificar el contrato correcto (carta descartada revelada y bloqueada, nueva secreta oculta bajo el id original del pedestal).

### 10.2 Ayuda de memoria: valores posibles en juego

Nuevo componente `presentation/components/PayoutBoardView.ts`: panel lateral que lista los 13 montos posibles (`CASE_VALUES`) en orden descendente y tacha/atenúa cada uno a medida que se revela — ya sea al abrir una carta (`CardOpened`), al descartarse una carta en el intercambio de mitad de juego (`SecretCardSwapped`), o al revelarse la Carta Secreta final (`LastCardRevealed`). Es un componente puramente visual (sin lógica de negocio): `GameSceneController` le indica qué valor marcar en cada uno de esos tres puntos del flujo.

Se instancia en `GameScene.onSecretCardChosen()`, en la columna izquierda de la pantalla (libre de superposición con el tablero y con la barra de energía).

### 10.3 Numeración de posición en el reverso de las cartas

`CardView` acepta ahora un `displayNumber` opcional en su constructor, mostrado como `#N` en el reverso de la carta (reemplaza el "?" genérico). Como las 12 `CardView` del tablero y la del pedestal son literalmente los mismos objetos creados durante la fase de selección inicial (solo se animan a una nueva posición), el número asignado en ese momento (`index + 1`, 1 a 13) se mantiene estable durante toda la partida — cada carta conserva su identificador de principio a fin, incluida la del pedestal tras un intercambio.

El número se oculta automáticamente al revelarse la carta (`reveal()`) y vuelve a mostrarse si la carta se resetea boca abajo (`resetAsFaceDown()`, usado en el pedestal tras un intercambio).

---

## 11. Refactor — Nivel de Energía (la barra nunca llegaba a 0)

**Síntoma reportado:** la barra de energía prácticamente nunca bajaba, y el jugador nunca perdía por agotamiento.

**Causa raíz:** `DefaultEnergyDrainRule` calculaba el drenaje con una fórmula normalizada contra el valor máximo del tablero (`cardValue / maxBoardValue`), aplicando una rama "de daño" solo cuando ese cociente superaba 0.5. Con los 13 valores reales del mazo (`CASE_VALUES`, máximo 25000), **solo el propio 25000 caía en la rama de daño** — los otros 12 valores, incluidos 10000 y 5000, caían en la rama "protectora" y en la práctica *sumaban* energía en vez de restarla. Además, `EnergyLevel.drain()` solo acotaba el piso (0) pero no el techo (100): una racha de cartas bajas podía inflar la energía muy por encima de 100 de forma invisible, haciendo aún más difícil perder más adelante.

**Refactor aplicado** (tabla exacta pedida, sin fórmulas relativas):

| Valor | Impacto | Valor | Impacto |
|---|---|---|---|
| 25000 | -40% | 25 | +5% |
| 10000 | -30% | 10 | +20% |
| 5000 | -20% | 5 | +25% |
| 1000 | -10% | 1 | +30% |
| 750 | -5% | | |
| 500 / 250 | 0% (neutro) | 100 | +5% |
| | | 50 | +10% |

- **`domain/value-objects/EnergyDeltaTable.ts`** (nuevo): tabla fija `valor → delta`, con verificación de integridad en tiempo de carga (falla si `CASE_VALUES` y la tabla alguna vez se desincronizan).
- **`EnergyLevel.ts`**: el punto de partida (`full()`) pasa de 100 a **50**; `drain()` ahora acota simétricamente `[0, 100]` (antes solo acotaba el piso).
- **`DefaultEnergyDrainRule`** (en `GameSession.ts`): ya no depende de `maxBoardValue` — consulta la tabla directamente. El `drainMultiplier` de "Blindaje de Energía" ahora se aplica **únicamente** a los deltas que drenan (positivos), nunca a los que protegen — la mejora reduce el daño sin diluir el beneficio de una buena racha.
- **`GameSessionFactory.ts`**: ya no calcula `Math.max(...values)` para la regla de drenaje (quedó obsoleto).
- Se corrigieron dos lugares en presentación que asumían el viejo baseline de 100 a fuego: el valor visual inicial de `EnergyBarView` en `GameScene.ts`, y el evento `GameRevived` (ahora carga el `energyPercentage` real post-revive en vez de que el controller fuerce `100`).

**Por qué ahora tienen sentido los bonus de tienda:** con un baseline de 50 (en vez de un 100 ya casi tope), "Tanque de Reserva" (+10/+20 de energía inicial) y "Blindaje de Energía" (-15%/-30%/-45% de drenaje) dejan de ser cosméticos — determinan directamente cuántas cartas altas seguidas se pueden sobrevivir.

Cobertura de tests actualizada: `EnergyLevel.spec.ts` y `DefaultEnergyDrainRule.spec.ts` reescritos para el nuevo contrato; `GameSession.spec.ts` con una suite nueva (`energy drains realistically with DefaultEnergyDrainRule`) que reproduce el escenario exacto del bug con la regla real, no un doble de test.

---

## 12. Refactor Mayor — Upgrades de Partida Única, Cambio Final y Modal de Salida

Pivote arquitectónico: el sistema de mejoras persistentes (`energy_shield`, `master_negotiator`, `reserve_tank`, guardadas en `localStorage` vía `IProgressionRepository`) queda **retirado por completo**. Reemplazado por un catálogo de mejoras de **partida única** (8, tras la incorporación de "Escudo de Carta Negativa" y "Negociador" — ver sección 13): se compran y aplican de inmediato sobre la `GameSession` en curso, y se pierden al terminar esa partida — se hayan usado o no. Solo el **saldo de monedas** sigue siendo persistente.

### 12.1 Dónde vive cada cosa ahora

- **`domain/entities/SessionUpgrades.ts`** (nuevo): estado de las mejoras de ESTA partida — en memoria, dueño es `GameSession`, nunca se serializa. Al descartarse la sesión (nueva partida), desaparece solo — no hace falta lógica de "expiración".
- **`domain/value-objects/SessionUpgradeCatalog.ts`** (nuevo, reemplaza a `Upgrade.ts`): precios de los 6 upgrades. El costo de `triple_reward` se deriva matemáticamente (`DOUBLE_REWARD_COST * 2`) en vez de hardcodearse aparte, para que la restricción "el doble de Duplicar" no pueda desincronizarse.
- **`domain/value-objects/EnergyLevel.ts`**: el techo de la barra (antes fijo en 100) ahora es parametrizable por instancia. `withNewCeiling()` implementa el Tanque de Energía: sube el techo y otorga la diferencia como energía inmediata (si no, agrandar el techo sin tocar el valor actual haría *bajar* el porcentaje mostrado — un "nerf" al comprar una mejora).
- **`domain/entities/GameSession.ts`**: nuevos métodos `applyEnergyTankUpgrade()`, `canSwapFinalSecretCard()` / `swapFinalSecretCard()` (reutiliza `DeckManager.swapSecretCard` — mismo mecanismo que el intercambio de mitad de juego, pero termina la partida). Bug encontrado y corregido en el camino: `reviveWithFullEnergy()` reseteaba el techo a 100, borrando un Tanque de Energía ya comprado antes de perder.
- **`application/use-cases/PurchaseSessionUpgradeUseCase.ts`** (nuevo): cobra del acumulado persistente y aplica el efecto sobre la sesión — nunca cobra sin aplicar el efecto.
- **`application/use-cases/SwapFinalSecretCardUseCase.ts`** (nuevo): orquesta el Cambio Final, premia el valor de la nueva carta y dispara `GameWon`.
- **`application/use-cases/OpenCardUseCase.ts`**: aplica la penalización de -5000 al perder (`IProgressionService.applyLossPenalty`), y emite `FinalCardSwapAvailable` cuando queda 1 sola carta cerrada y el jugador tiene el upgrade.
- **`infrastructure/persistence/ProgressionManager.ts` / `LocalStorageProgressionRepository.ts`**: se retiran todos los métodos de catálogo persistente; se agregan `spendCoins`, `applyLossPenalty` (permite saldo negativo, a diferencia de `spendCoins`) y `resetAllProgress` (botón "Salir"). Se sube la versión de esquema del save (un save viejo con `upgrades` se descarta limpiamente).
- **`presentation/ActiveSessionBridge.ts`** (nuevo): dado que `ShopScene` es una escena distinta lanzada en paralelo, necesita leer/mutar la `GameSession` activa sin acoplarse a `GameScene`. Se apoya en `game.registry`, igual que `GameServices` — es la única pieza de presentación que conoce a la vez a `GameSession` y a Phaser.
- **`presentation/scenes/ShopScene.ts`**: reescrita para leer el estado de la sesión activa (vía el bridge) en vez del catálogo persistente.
- **`presentation/scenes/ResultScene.ts`**: los botones "Duplicar x2"/"Triplicar x3"/"Revivir" ahora son condicionales a los upgrades comprados en la sesión (pueden coexistir Duplicar y Triplicar). Nuevo botón "Salir": resetea el acumulado, limpia `localStorage` por completo y redirige a `MainMenuScene`.
- **`presentation/scenes/MainMenuScene.ts`** (nuevo): pantalla de inicio — no existía (quedaba anotada como pendiente desde hace varias sesiones). `PreloadScene` ahora arranca acá en vez de ir directo a `GameScene`.
- **`presentation/components/EnergyBarView.ts`**: `setCapacityMultiplier()` — el Tanque de Energía ensancha físicamente la barra (marco, resplandor y ancho máximo del relleno), no solo la muestra "más llena".

### 12.2 Cobertura de tests nueva/actualizada

`SessionUpgrades.spec.ts`, ampliaciones en `GameSession.spec.ts` (Tanque de Energía y Cambio Final) y `EnergyLevel.spec.ts` (`withNewCeiling`), `PurchaseSessionUpgradeUseCase.spec.ts`, `SwapFinalSecretCardUseCase.spec.ts`, ampliaciones en `OpenCardUseCase.spec.ts` (penalización y `FinalCardSwapAvailable`), y reescritura completa de `ProgressionManager.spec.ts` para la nueva API (incluye saldo negativo y reseteo).

---

## 13. Feature — Mazos de Cartas Coleccionables (Temáticos)

Sistema de mazos temáticos comprables con monedas persistentes, independiente de los upgrades de partida única (sección 12) — un mazo comprado nunca se pierde.

### 13.1 Dónde vive cada cosa

- **`domain/value-objects/DeckSetups.ts`** (nuevo): `IDeckConfig` + `DECK_SETUPS` (6 mazos: `basic` gratis, los otros 5 a $20.000). Incluye placeholders comentados para `bgmKey`/`sfxFlipKey`/`accentColor` — el día que se implementen, se agregan como campos opcionales sin romper los mazos ya definidos. Verificación de integridad en tiempo de carga (cada key coincide con su propio `id`).
- **`domain/entities/DeckCollection.ts`** (nuevo): value object inmutable — qué mazos posee el jugador y cuál tiene seleccionado, con las reglas de negocio ("no se puede recomprar", "no se puede seleccionar lo que no se posee", "básico siempre poseído"). No sabe nada de `localStorage`.
- **`IProgressionRepository`/`LocalStorageProgressionRepository`**: se sube el esquema a v3 para persistir `ownedDeckIds`/`selectedDeckId` junto a las monedas. Un save de un esquema anterior se descarta limpiamente (no había forma segura de migrar un esquema sin el concepto de mazos).
- **`ProgressionManager`**: `purchaseDeck()` (cobra y desbloquea, nunca cobra sin desbloquear) y `selectDeck()`, reconstruyendo un `DeckCollection` desde el repositorio en cada operación.
- **`presentation/scenes/DeckSelectionScene.ts`** (nueva): precarga dinámicamente (según la colección real del jugador, nunca hardcodeado) miniaturas de grilla + vista previa en alta calidad (`assets/ui/show-cards/`) + fondo temático (`assets/ui/background/`). Selección con fade-out/fade-in y bounce (`Back.easeOut`); "Aceptar" persiste la elección y relanza `PreloadScene`.
- **`presentation/scenes/PreloadScene.ts`**: ya no carga un mazo fijo — resuelve `card-back`/`card-front`/`backdrop` desde `DECK_SETUPS[selectedDeckId]`. **Bug real encontrado en el camino**: Phaser no sobreescribe una textura si la key ya existe en el `TextureManager` (persiste a nivel de `Game`, no de escena) — sin un `removeTextureIfExists()` explícito antes de recargar, cambiar de mazo nunca se habría reflejado visualmente después de la primera partida. `PreloadScene` ahora acepta datos de init (`{ nextScene: 'MainMenuScene' | 'GameScene' }`) para saber a dónde ir tras precargar, según si viene del arranque normal o de una reselección de mazo.
- **`MainMenuScene`**: el botón "JUGAR" bifurca — con un solo mazo (el básico) va directo a `GameScene`; con más de uno, pasa obligatoriamente por `DeckSelectionScene`. Se agregó también acceso directo a la Tienda desde el menú (comprar un mazo no requiere partida activa).
- **`ShopScene`**: rediseñada con dos pestañas — "Mejoras" (el contenido de partida única de la sección 12, sin cambios de lógica) y "Mazos" (nueva, catálogo persistente). Sin partida activa, arranca directo en "Mazos" para no mostrar un tab vacío.

### 13.2 Decisión de diseño: ¿por qué la selección no vive en `ShopScene`?

La Tienda ("Mazos") solo permite **comprar**. La **selección** de cuál usar vive exclusivamente en `DeckSelectionScene`, que es la experiencia rica pedida (vista previa grande, fondo dinámico, efectos). Evita duplicar UI de selección en dos lugares y mantiene una única fuente de verdad para "qué estoy viendo en este momento".

### 13.3 Cobertura de tests nueva

`DeckCollection.spec.ts` (reglas de negocio completas) y ampliación de `ProgressionManager.spec.ts` (compra, selección, fallback a básico, reseteo). `DeckSelectionScene`/`ShopScene`/`PreloadScene` no tienen tests unitarios, consistente con el resto de la capa de presentación en este proyecto (no se testea Phaser directamente).

---

## 14. Feature — Escena de Tutorial (`HowToPlayScene`) y Sistema de i18n

### 14.1 `HowToPlayScene.ts`
Tutorial interactivo de 5 pasos accesible desde `MainMenuScene` ("❓ Cómo Jugar"). Solo importa `phaser` — cero dependencias de `domain/`/`application/`, cumpliendo el desacople explícito pedido (el idioma/tutorial nunca debe ramificar lógica de negocio real). Todas las ilustraciones se dibujan con `Graphics` (sin imágenes externas): carta secreta + tablero, barra de energía con segmentos de peligro/protección, banquero con botones DEAL/NO DEAL, intercambio de mitad de juego con flechas curvas, y cofre de tienda. Navegación con fade + slide lateral vía tweens; "Anterior" oculto en el paso 1, "Siguiente" se convierte en "¡Comenzar!" en el paso 5.

### 14.2 Sistema de Internacionalización (`shared/i18n/`)

- **`LanguageData.ts`**: diccionario puro `{ en: {...}, es: {...} }` con claves semánticas (`MENU_PLAY_BUTTON`, `BANKER_OFFER_AMOUNT`, etc.), organizado por sección del juego. `SUPPORTED_LANGUAGES` se **deriva** de `Object.keys(TRANSLATIONS)` — agregar un idioma nuevo es agregar un bloque de datos, sin tocar ningún otro archivo. `TranslationKey` se deriva del diccionario de `DEFAULT_LANGUAGE`, dando autocompletado y error de compilación si se pide una clave que no existe.
- **`LanguageManager.ts`**: singleton de módulo (`export default languageManager`) — la instancia se crea una única vez al importar el archivo y es compartida por todo el proyecto, sobreviviendo a `scene.start()`/`scene.restart()` de Phaser sin ningún wiring adicional (a diferencia de `GameSession`, que sí se destruye entre partidas). `getText(key, params?)` interpola `{placeholders}` y hace fallback en cascada: idioma activo → `DEFAULT_LANGUAGE` → la clave misma (nunca crashea, nunca deja un hueco visual). `setLanguage()` persiste en `localStorage` y emite un evento (reutilizando `SimpleEventEmitter`, el mismo emisor ya usado por `ProgressionManager`) para que una escena ya construida pueda refrescar sus textos en caliente.
- **Ejemplo de integración real**: `MainMenuScene.ts` ya usa `languageManager.getText(...)` para su título, contador de monedas y los 3 botones — no quedó como snippet aislado, es código funcionando en el proyecto.
- **Migración pendiente**: el resto de las escenas (`ShopScene`, `ResultScene`, `BankerOfferPanel`, `DeckSelectionScene`, `HowToPlayScene`, etc.) todavía tienen sus textos hardcodeados en español. `LanguageData.ts` ya incluye las claves necesarias para varias de ellas (`SHOP_*`, `RESULT_*`, `TUTORIAL_*`, `BANKER_*`) — migrarlas es reemplazar cada string literal por `languageManager.getText(CLAVE)`, sin más cambios estructurales.

Tests: `LanguageData.spec.ts` (integridad — mismas claves en todos los idiomas, mismos `{placeholders}` interpolables) y `LanguageManager.spec.ts` (fallback en cascada, persistencia, eventos, con un polyfill local de `localStorage` ya que la suite corre en `testEnvironment: 'node'`).

---

## 15. Feature — Selector de Idioma en Vivo + Migración de Escenas

Sobre el sistema de i18n de la sección 14: se agregó el selector visual y se migraron las escenas indicadas.

### 15.1 `LocalizedText` (nuevo componente reutilizable)
`presentation/components/LocalizedText.ts` — un `Phaser.GameObjects.Text` que se suscribe A SÍ MISMO a `languageManager.onLanguageChanged()` al crearse y se desuscribe A SÍ MISMO en su propio evento `destroy` (incluida la destrucción en cascada que Phaser hace al detener una escena). Reemplaza el patrón `this.add.text(x, y, 'texto', style)` por `new LocalizedText(this, x, y, 'CLAVE', style)` sin que la escena tenga que escribir ningún wiring de suscripción/limpieza propio. Soporta `setParams()`/`setTranslationKey()` para actualizar interpolaciones o cambiar de clave en caliente.

### 15.2 `MainMenuScene` — selector ES | EN
Único lugar del juego con el toggle de idioma (esquina superior derecha). Al pulsarlo, llama a `languageManager.setLanguage(code)` — la escena **nunca** llama a `.setText()` directamente: título, contador de monedas y los 3 botones son todos `LocalizedText`, así que se actualizan solos. Lo único que la escena sí gestiona por su cuenta es el *resaltado visual* de qué botón de idioma está activo (color de fondo/borde), vía una única suscripción propia que se limpia en `SHUTDOWN`.

### 15.3 `ShopScene` — ejemplo de escena secundaria con actualización en vivo
Se eligió como el ejemplo pedido porque **realmente lo necesita**: se abre con `scene.launch()` **sobre** `MainMenuScene`, que sigue activa detrás — incluido su selector de idioma, que queda fuera del área del modal. Si el jugador cambia de idioma con la Tienda abierta, el texto estático (título, pestañas, leyendas) se actualiza solo vía `LocalizedText`; el texto dinámico de cada fila (que combina una clave i18n con el estado real de compra) se refresca con una única suscripción propia de la escena (`refreshAllRows()`), same patrón que `ProgressionManager.onEvent`.

### 15.4 `HowToPlayScene` — migración completa
Las 5 diapositivas ahora usan `titleKey`/`bodyKey` en vez de texto literal. No usa `LocalizedText`: como todo su contenido se destruye y reconstruye por completo en cada cambio de paso (`removeAll(true)`), y el selector de idioma nunca coexiste con esta escena, alcanza con leer `languageManager.getText()` en el momento de crear cada texto — se documenta esta decisión en el propio archivo para que no parezca una omisión.

### 15.5 Deuda técnica señalada explícitamente
El **nombre y la descripción** de cada upgrade/mazo (`SESSION_UPGRADE_CATALOG`, `DECK_SETUPS`) siguen en español fijo, definidos en `domain/value-objects/`. Migrarlos requiere convertir esos campos a `TranslationKey` — un cambio que toca el dominio, no solo presentación, y por eso se dejó fuera de esta iteración con un comentario explícito en `ShopScene.renderUpgradeRow()`/`renderDeckRow()` en vez de hacerlo a medias o silenciarlo.

Se agregaron 8 claves nuevas a `LanguageData.ts` (`SHOP_UPGRADES_CAPTION`, `SHOP_DECKS_CAPTION`, `SHOP_UPGRADE_*`, `ENERGY_PROTECT_LABEL`, `ENERGY_DRAIN_LABEL`, `TUTORIAL_MIDGAME_PERCENT_LABEL`, `TUTORIAL_SHOP_UPGRADES_LABEL`) — `LanguageData.spec.ts` sigue en verde: mismas 57 claves en ambos idiomas, mismos `{placeholders}`.
