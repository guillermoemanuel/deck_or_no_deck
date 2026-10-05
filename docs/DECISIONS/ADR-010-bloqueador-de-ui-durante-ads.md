# ADR-010: Bloqueador de UI durante todo el ciclo del ad (`'requesting'` + `AdBlockerScene`)

**Estado:** Aceptada · **Registrada:** 2026-10-04 · **Unidad:** B1 (Sprint B de la
auditoría de publicación 2026-10-04)

## Contexto

Hallazgo **CG-MON-001** (P1) de la auditoría de publicación 2026-10-04: en modo
`crazygames` **nada bloqueaba la UI durante el ciclo del ad**
(`request → adStarted → adFinished/adError`):

- `ResultScene` dejaba **"Jugar de nuevo" / "Ir al Menú" vivos** mientras el anuncio
  estaba en vuelo;
- la navegación corría igual: el guard `adInProgress` rechazaba el 2.º `requestAd`,
  pero `onComplete()` navegaba **igual en el `finally`** → reiniciaba `GameScene` a
  mitad de anuncio;
- detrás seguían activas `GameScene`/`UIScene`.

Requisito oficial de la plataforma: *"Block the UI until either an adFinished or adError
event occurs"* (https://docs.crazygames.com/requirements/ads/).

En modo **portal NO ocurría**: `AdOverlayScene` ya es el bloqueador (backdrop interactivo
+ pausa de `GameScene`, ADR-007) — el hueco era exclusivo del SDK externo.

Brecha de información en el puerto: `AdLifecyclePhase` era `'started' | 'ended'`, es
decir **no existía la señal "van a pedir un ad"**. Esa ventana `request → started` es
justo la que se clica (el juego sigue visible y vivo), y además *pedir* el ad no es
*empezarlo*: puede terminar sin fill, por eso silenciar/bloquear solo por `adStarted`
llegaba tarde.

## Decisión

- **Puerto `src/domain/ports/ICrazyGamesService.ts`:** `AdLifecyclePhase` pasa a
  **`'requesting' | 'started' | 'ended'`**, con su JSDoc como especificación:
  - `'requesting'` = señal de **bloquear la UI ANTES de que el ad se vea** (ventana
    request→started);
  - `'started'` = adStarted, recién ahí corresponde silenciar el juego;
  - `'ended'` = adFinished o adError/timeout.
  **Garantía de par documentada en el puerto:** todo ciclo abierto con `'requesting'`
  cierra con **EXACTAMENTE un `'ended'`**, aunque nunca haya habido `'started'` (sin
  fill o timeout de arranque también cierran) — sin eso el bloqueador quedaría clavado.
- **`CrazyGamesService.requestAd` (infra):** emite `'requesting'` al abrir el Promise
  (después del guard `adInProgress`, para no emitir un ciclo que se rechaza);
  `closeLifecycle()` cierra el ciclo; `settle()` emite `'ended'` **si el ciclo sigue
  abierto** → cubre sin-fill, timeout de arranque de 15 s y excepción del SDK. Un
  `'ended'` **tardío** de un ad que arranca después del timeout sigue funcionando: el
  ciclo visual late `started → ended` (simétrico para audio).
- **Nueva escena `src/presentation/scenes/AdBlockerScene.ts`**, registrada en el
  `config.scene` de `main.ts` **al FINAL de la lista** (lección ADR-007 enmienda: se
  registra en **boot**, nunca `scene.add()` en runtime — carrera con la cola de Phaser):
  - backdrop de pantalla completa **interactivo sin handler** (mecanismo ya probado de
    `AdOverlayScene`: Phaser no despacha el click a las escenas debajo) + **spinner**
    (arco con tween de Phaser; **sin texto → sin claves i18n**);
  - **pausa `GameScene`** mientras dura el ad con **flag local** (no "presta" una pausa
    que tomó otra escena), reanuda en `SHUTDOWN` — mismo patrón que `AdOverlayScene`;
  - **`createAdBlockerListener(game)`**: `'requesting'`/`'started'` →
    `game.scene.start(AD_BLOCKER_KEY)` **una sola vez por ciclo** (flag `active`);
    `'ended'` → `stop` **solo si estaba activo** (nunca `stop` de una escena que no
    corre). API correcta: **`game.scene.start`** — `game.scene.launch` **NO existe** en
    `SceneManager` de Phaser (es de `ScenePlugin`); en top-level el API es `start`,
    igual que `presentAdOverlay`.
- **`main.ts`:** registra `AdBlockerScene` y conecta
  `crazyGamesService.onAdLifecycle(createAdBlockerListener(game))` **solo si
  `adsMode !== 'portal'`** — en portal **manda `AdOverlayScene`** y tener los dos
  apilaría fondo y spinner sobre el countdown. (El comentario de `type AdService` pasó
  de "5 usos" a "6 usos" del servicio en el archivo.)

## Consecuencias

- **Toda la UI queda bloqueada desde `requesting` hasta `adFinished`/`adError`** —
  el requisito de la plataforma se cumple en la ventana que antes estaba abierta
  (clic en "Jugar de nuevo" durante el rewarded ya no navega).
- **Audio y bloqueador comparten el MISMO ciclo** (`onAdLifecycle` / la unión
  `AdLifecyclePhase`): una sola fuente de verdad para cuándo silenciar y cuándo
  tapar; el orden de fases es contrato de puerto, no de UI.
- **Adapters sin fase de request (`OwnRewardedAdService`, modo portal) siguen
  cubiertos:** el listener acepta cualquier fase de apertura (`'started'` también
  levanta el bloqueador), y en portal además no se cablea — ahí bloquea
  `AdOverlayScene`.
- **La garantía de par es la que evita el bloqueador clavado:** sin fill, timeout de
  15 s y excepción del SDK cierran con `'ended'` aunque no haya habido `'started'`.
- **Riesgo asumido:** romper la garantía de par en `CrazyGamesService` deja la UI
  tapada sin recuperación visible → la cubre el spec (aserción de par en el timeout
  de 15 s y en el sin-fill) — cualquier adapter nuevo debe replicarla.
- **Registración en boot obligatoria:** agregar la escena en runtime reproduce el bug
  `Scene key not found` del ADR-007.
- **Specs red→verde:** `CrazyGamesService.spec.ts` — 4 aserciones de phases
  actualizadas al contrato nuevo (rojo: secuencias viejas `[]` / `['started','ended']`
  vs nuevas `['requesting']`, `['requesting','ended']`, `['requesting','started','ended']`,
  `['requesting','ended','started','ended']`), un test renombrado y otro con aserción
  **nueva de par** en el timeout de 15 s (conteo de tests de esa spec sin cambios: 16);
  **nuevo `AdBlockerScene.spec.ts`** (5 tests del listener: ciclo sin start, sin doble
  start, adapter que arranca en `started`, `ended` aislado, dos ciclos) — rojo por
  módulo inexistente. Suite: **46 suites / 527 tests**.
- **Pendiente (no cubierto por unit tests):** smoke manual en modo `crazygames` con el
  QA Tool de CrazyGames — clic en "Jugar de nuevo" durante el rewarded no navega hasta
  `adFinished`/`adError`; en consola nunca aparece un 2.º `requestAd`; regresión modo
  portal: overlay de countdown intacto (último smoke de ese modo: 2026-10-01).
