# AGENTS.md — Contrato operativo

> **Para agentes y humanos.** Documento corto y verificado: si algo de acá contradice al
> código, manda el código y corregí este archivo en el mismo commit.
> Arquitectura detallada → `docs/ARCHITECTURE.md` · qué leer antes de crear algo →
> `docs/PLAYBOOK.md` · tests → `docs/testing.md` · decisiones → `docs/DECISIONS/`.

## 0. Antes de tocar nada

1. `docs/LOG.md` — últimas entradas: qué ya se hizo, qué está pendiente.
2. `docs/PLAYBOOK.md` — duplicaciones, código muerto y contratos frágiles **ya conocidos**.
3. `docs/ARCHITECTURE.md` — solo si el cambio cruza capas o toca eventos/puertos.
4. `docs/DECISIONS/` — si hay un ADR sobre lo que vas a tocar (no lo deshagas sin leerlo).

No reexplorar lo que ya está documentado: ahorrá contexto y tokens.

## 1. Comandos (todos verificados)

```bash
npm run dev                                   # vite dev server
npm run build                                 # tsc --noEmit && vite build
npx jest <ruta>                               # test selectivo — usar SIEMPRE durante el cambio
npm test                                      # suite completa (~30 s)
npm run typecheck                             # tsc --noEmit (incluye los 42 *.spec.ts)
npm run lint                                  # eslint src (config mínima: eslint.config.mjs)
npm run test:coverage
```
No existe `vitest`. El runner es **Jest** (`*.spec.ts` junto al archivo).

## 2. Regla de dependencias (dura — verificar con grep)

Las flechas de importación solo apuntan hacia adentro:

- `domain/` → **nunca** importa `application/`, `infrastructure/`, `presentation/` ni Phaser.
- `application/` → solo `domain/` y `shared/` en producción (`infrastructure/` **solo en specs**, para fakes).
- `infrastructure/` → implementa los *ports* de `domain/` (DIP). Phaser solo en `AudioService`.
- `presentation/` → puede importar `domain/`, `application/`, `shared/`.
  **Excepción única conocida:** `presentation/GameServices.ts` importa `ProgressionManager` (ADR-003).
- Ninguna capa importa `presentation/`.

Verificación: `grep -rn "from '\.\./" src/domain` → vacío.

## 3. Archivos de alto riesgo (leer antes de modificar)

| Archivo | Por qué |
|---|---|
| `presentation/controllers/GameSceneController.ts` | switch `handleEvent()` ~250 líneas / 14 casos; timers mágicos; único traductor evento→UI |
| `presentation/scenes/GameScene.ts` | composition root de la partida (37 imports) |
| `presentation/scenes/ShopScene.ts` | escena de 771 L sin test; la lista visible la decide la aplicación (`listAvailableUpgrades`); compra de mazos sin use-case |
| `domain/entities/GameSession.ts` | raíz del agregado + `EnergyDrainRule` |
| `main.ts` | composition root global + **selección del adapter de ads por `VITE_ADS`** (ADR-007: `crazygames`\|`portal`\|`none`, carga dinámica del SDK) + anti-cheat de `beforeunload` |
| `shared/i18n/LanguageData.ts` | 148 claves; agregá siempre `en` **y** `es` |

Detalle por archivo (LOC, specs, peligrosidad): `docs/MAP.md`.

## 4. Invariantes numéricos (no cambiar sin un test que falle primero)

- Energía inicial 50 %; drenaje según tabla fija `EnergyDeltaTable` (nunca fórmula relativa).
- Oferta del banquero: cada 3 cartas; **nunca supera el promedio puro** del tablero; ×0.85 de riesgo; bonus Negociador +15 % con ese tope.
- Penalidad de derrota/abandono: −5000, **puede dejar saldo negativo** — fuente única
  `LOSS_PENALTY_AMOUNT` en `domain/value-objects/GamePenalties.ts` (no re-hardcodear 5000).
- Tanque de energía: techo ×1.25 / ×1.5 — calculado en `GameSession.applyEnergyTankUpgrade` **y** en `PurchaseSessionUpgradeUseCase`: si cambia uno, cambia el otro.
- Costos de tienda: los define `SessionUpgradeCatalog.ts`; los tests usan `costOf(id)`, **nunca precios hardcodeados**.
- Bono periódico: 12 h cooldown + 24 h ventana; cartas `[500…5000]` (ADR-005).
- Reembolso XOR efecto (ADR-006): la política al consumir Duplicar/Triplicar/Revivir se
  lee con **`rewardedAdStatus()`** (el motivo), **no** con el predicado booleano:
  `cooldown_retryable` → motivo **`'ads_cooldown'` SIN reembolsar**, sin setear
  `refunded` y sin pedir el anuncio (UI: `RESULT_AD_COOLDOWN`, botones **encendidos** —
  reintento real a los 60 s; ese cooldown puede ser autoinfligido por la cancelación del
  jugador); `sdk_unavailable`/`adblock`/`cooldown_no_fill` → reembolso único `costOf(id)`
  con resultado `'refunded'` que bloquea todo reclamo posterior. `ad_failed` **no**
  reembolsa y sigue reintentable.

## 5. Eventos

Dos buses (`SimpleEventEmitter`, no Phaser): `GameEvent` (use-cases → controlador/UI) y
`ProgressionEvent` (`ProgressionManager` → `UIScene`/`ShopScene`). Un evento nuevo
requiere: tipo en la unión + emisor + consumidor + spec. Suscripciones siempre se
desusan en `SHUTDOWN`/`DESTROY`. Sin polling ni `setInterval` para la UI.

Orden de outcomes en `OpenCardUseCase.execute` es contrato:
pérdida > celebración > victoria > oferta > swap (ver `PLAYBOOK.md` §2).

## 6. Convenciones

- **Vistas tontas**: los componentes solo emiten eventos; la orquestación vive en
  `GameSceneController`. *Ojo:* las **escenas** aún acumulan lógica de negocio — no sumes más.
- **i18n obligatoria**: ningún string visible hardcodeado; `languageManager.getText('CLAVE')`
  o componente `LocalizedText`. El dominio jamás ramifica por idioma.
- **`ICrazyGamesService` retorna `AdResult`, nunca lanza**: fallo de anuncio es flujo normal.
- Comentarios en **español** narrando la causa raíz, con marca `BUGFIX (ticket)`.
  **No** agregar TODO/FIXME/HACK: la deuda va en `docs/PLAYBOOK.md` o en un ADR.
- Exports nombrados (excepción única: `languageManager`, default export).
- `tsconfig` es `strict` con `noUnusedLocals/Parameters` y `noImplicitReturns`:
  los `switch` sobre uniones son exhaustivos; no les agregues un `default` que oculte casos.
- Texturas: limpiar la clave con `removeTextureIfExists()` antes de reemplazar.
- Antes de crear un componente/tabla/helper nuevo: **buscá si ya existe** (`PLAYBOOK.md` §1).

## 7. Definición de terminado

Nada se da por final sin los 4 gates en verde, en este orden:

1. `npx jest <specs afectados>` — iterar acá.
2. Si el cambio toca `domain/` o `application/`: **agregar/actualizar spec**
   (comportamiento nuevo → primero el test rojo).
3. `npm run typecheck` · `npm run lint`
4. `npm test` — suite completa.

Y cerrar la tarea:
- Entrada nueva en `docs/LOG.md` (qué se tocó, cómo se verificó, qué queda pendiente).
- Si hubo una decisión de diseño: ADR en `docs/DECISIONS/`.
- Si cambió la arquitectura: actualizar `docs/ARCHITECTURE.md` / `docs/MAP.md`.
- Commit atómico: un cambio = un commit con mensaje que diga *qué* y *por qué*.
