# ADR-007: Anuncio propio (countdown) para portales externos + selección de adapter por `VITE_ADS`

**Estado:** Aceptada · **Registrada:** 2026-10-01 · **Pre-implementation:** 2026-10-01 ·
**Enmienda:** 2026-10-02 (Consecuencias — decisiones conscientes de la revisión del diff) ·
2026-10-04 (`AdOverlayScene` se registra en el boot — ver enmienda al pie)

## Contexto
El juego hoy está atado a CrazyGames: `ICrazyGamesService` tiene un único adapter
(`CrazyGamesService`) que depende de `window.CrazyGames`. En cualquier otro portal (sin
su script) → `sdk_unavailable` → `ListAvailableUpgradesUseCase` **oculta**
Duplicar/Triplicar/Revivir, el guard de compra rechaza y el consumo reembolsa (ADR-006):
**las tres mecánicas quedan muertas** fuera de CrazyGames. Son mecánicas centrales del
juego, así que el usuario (decisión del 2026-10-01) eligió mantenerlas funcionando en
portales externos.

Además, la auditoría previa marcó **R5**: en el adapter actual `user_cancelled` es un
motivo "muerto" (no se emite honestamente porque el SDK ajeno lo absorbe), y el
`index.html` cargaba el SDK de CrazyGames de forma fija en línea 29 para **todos** los
builds (estado previo a este ADR — hoy esa carga es dinámica desde `main.ts`, ver Decisión).

El usuario eligió, todas el 2026-10-01, entre mantener el statu quo, detectar el hosting
automáticamente, o configurar el adapter por env → **configurar por env** con anuncio
propio como adapter alternativo.

## Decisión
- **Anuncio propio = overlay con countdown de 3 s** (constante tunable). Sin contenido de
  video por ahora: si entra video después, cambia solo el overlay. El overlay es
  **cancelable** (botón cerrar): cancelar emite `user_cancelled` → cooldown
  **retryable** → `RESULT_AD_COOLDOWN` con botones vivos (el camino de ADR-006 enmendado).
  En modo propio, `user_cancelled` deja de ser motivo muerto (R5 de la auditoría) — se
  emite honestamente.
- **Midgame también overlay corto** (mismo countdown de 3 s).
- **Selección de adapter por env de Vite** `VITE_ADS` = `crazygames` (default,
  comportamiento actual intacto) | `portal` (adapter propio) | `none` (CrazyGamesService
  sin script → `sdk_unavailable` → filas ocultas — o sea, la degradación actual queda como
  modo explícito, gratis). El tag del SDK de CrazyGames en `index.html:29` pasa a
  **carga dinámica** en `main.ts`, solo en modo `crazygames` (un build `portal` no debe
  pedir el archivo).
- **El puerto `ICrazyGamesService` NO se renombra** en esta unidad (churn: imports/fakes/
  specs en muchas capas). Queda anotado en `docs/PLAYBOOK.md` como deuda de naming con
  mitigación (JSDoc).
- **Política de reembolso ADR-006 INTACTA**: el adapter propio implementa el mismo
  puerto y `rewardedAdStatus()`; toda la lógica aguas abajo (filtro de tienda, guard,
  2 políticas, UI) no cambia ni se toca.
- **Presenter inyectado**: el overlay es UI (presentation) y el adapter vive en
  infrastructure (que NO puede importar presentation). `main.ts` (composition root)
  inyecta la función presenter que provee presentation — mismo patrón que ya existe con
  GameServices (ADR-003).
- **Cooldown extraído a `RewardCooldownTracker`** (infrastructure): la semántica de 60 s
  + `lastRewardedFailure` pasa a un helper compartido para que ambos adapters (CrazyGames
  y propio) tengan la MISMA política sin duplicar (`docs/PLAYBOOK.md` §1).

## Consecuencias
- Las mecánicas de Duplicar/Triplicar/Revivir funcionan en cualquier hosting sin SDK de
  terceros.
- Un único build se configura por env; sin auto-detección (más predecible, hay que
  publicar por env).
- El adapter propio no detecta adblock (su status nunca es `'adblock'`) — aceptado: sin
  ad network no hay qué bloquear.
- Telemetría (`reportGameplay*`) y happy-time son no-op en modo portal; `getUserLocale()`
  cae a `navigator.language`.
- El ADR-006 queda referenciado, no modificado.

### Enmienda 2026-10-02 — decisiones conscientes de la revisión (estado: sigue *Aceptada*)

- **Ventana de carga en modo `crazygames` (aceptado — telemetría, no ads).** El SDK ya
  carga **dinámicamente** (`loadCrazyGamesSdk()` en `main.ts`), así que hay una ventana
  entre el arranque del juego y el `load` del script: `reportGameplayStart()` se descarta
  si el jugador llega a la partida antes de que el SDK esté listo (el reporte no espera).
  Es solo telemetría de gameplay para CrazyGames — no toca ads (`showRewardedAd()` /
  `init()` sí esperan la Promise de carga) — y el caso de error del script (red caída,
  dominio bloqueado) ya degrada a `sdk_unavailable` sin frenar el arranque.
- **Watchdog de 15 s en `OwnRewardedAdService`** (espejo de los timeouts de
  `CrazyGamesService`): un presenter colgado → resultado `'error'` **retryable** (sin
  reembolso, reintento dentro de la ventana de 60 s) y el resultado **tardío** del
  presenter se descarta (guard de asentado — el primer resultado gana). El timer se
  limpia siempre en el `finally`. Cubierto por specs de watchdog en
  `OwnRewardedAdService.spec.ts`.
- **`resolveAdsMode` es estricto:** solo acepta los 3 literales **exactos**; cualquier
  desviación (incluidos espacios, mayúsculas, typos) → default `'crazygames'` +
  `console.warn` con el valor crudo. El motivo es equivaler **por construcción** al
  espejo plegable del gate de script de `main.ts`
  (`VITE_ADS !== 'portal' && !== 'none'`, un `===` exacto que el bundler sí pliega): si
  una función tolerara espacios, los dos predicados divergirían y un build `portal` mal
  escrito pediría el SDK igual. `undefined`/vacío → default **sin** warn (dev local).

### Enmienda 2026-10-04 — AdOverlayScene se registra EN EL BOOT (estado: sigue *Aceptada*)

- **Decisión original (revertida):** `AdOverlayScene` **no** estaba en `config.scene`;
  la registraba en runtime `presentAdOverlay()` con `scene.add()` + `scene.start()` en
  cada reclamo (al ser la última en registrarse quedaba "arriba de todo" en el stack de
  escenas).
- **Bug reproducido (modo `VITE_ADS=portal`):** el **primer** reclamo de Duplicar de la
  sesión fallaba — consola `RESULT_AD_LOADING` → `RESULT_AD_FAILED` →
  `RESULT_AD_COOLDOWN`, con warning `Scene key not found: AdOverlayScene`. La promise
  del presenter quedaba colgada → **watchdog de 15 s** de `OwnRewardedAdService` →
  resultado `'error'` → **cooldown 60 s**. "Después funciona bien" porque
  `processQueue()` **sí** registraba la escena dormida (`autoStart: false`) al frame
  siguiente.
- **Causa raíz (Phaser 3.90.0, probada contra `node_modules/phaser/src/scene/SceneManager.js`):**
  `SceneManager.add()` **se defiere a `_pending`** cuando `isProcessing` es `true` (no
  registra la escena todavía), mientras `SceneManager.start()` **no** se defiere:
  consulta `getScene` de forma síncrona → warning → no arranca nada. La pareja
  `add()` + `start()` en el mismo tick es una carrera contra la cola del SceneManager;
  el frame siguiente la resolvía (por eso solo fallaba el primer ad).
- **Decisión nueva:** `AdOverlayScene` entra en el `config.scene` de `main.ts` **al
  final** de la lista — misma posición que le daba el registro en runtime (última = se
  dibuja arriba de todo), arranca dormida y solo se activa con `game.scene.start()`.
  `presentAdOverlay()` ya **no** llama a `scene.add()`: solo pide el `start`; y si la
  escena faltara del Scene Manager → `console.error` +
  `Promise.resolve({ completed: false })` (**degradación en 0 s**, nunca cuelga hasta
  el watchdog). Cubierto por `AdOverlayScene.spec.ts` (3 tests, mock de `'phaser'` en
  node): arranque con data sin `add` en runtime · degradación 0 s (test red→verde: el
  cuelgue reproducía `Received: "sin resolver"`) · destrucción del juego antes de
  resolver.
