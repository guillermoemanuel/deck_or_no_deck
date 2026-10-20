# ADR-018: Controles de teclado PC — foco por geometría, callbacks directos y guards anti-modal

**Estado:** Aceptada · **Registrada:** 2026-10-13 · **Extendida:** 2026-10-19
(Fase 7g, ver al final) · **Unidad:** controles de teclado PC
(5 commits: `b7093a3` núcleo puro · `b721163` menú · `d90d8a6` partida · `f42b926`
tienda · `c150b87` tutoriales/resultado/banquero)

## Contexto

El juego corre en web desktop (1280×720 fijo, coordenadas de diseño) y hasta ahora
**solo se jugaba con el ratón**: flechas de scroll de página, tabulación nativa y
pointer. Tres restricciones condicionaron todo el diseño:

- **Phaser emite `keydown` en TODA escena RUNNING.** El teclado no "pertenecce" a una
  escena: con varias escenas vivas (partida + `UIScene`, modal sobre escena, overlay
  de ad) un handler suelto se dispara desde la escena equivocada. El riesgo no era
  escribir el teclado, era escribirlo **sin saber quién está arriba**.
- **Las escenas de `presentation/` no tienen test** (decisión mantenida): el wiring
  solo podía verificarlo el smoke manual, así que la lógica con valor testeable
  (`nextFocusIndex`, `bindKeys`) tenía que vivir **fuera** de la escena.
- **Phaser no tiene navegación por foco**: no hay "widget enfocado", solo objetos
  interactivos con pointer. Reutilizar el hover existente era el único camino sin
  rediseñar la UI de 8+ escenas.

## Decisión

- **(a) Núcleo puro en `src/presentation/input/`** — sin Phaser ni DOM:
  - `KeyboardNavigation.ts`: **`nextFocusIndex(items, currentIndex, direction)`**
    elige el candidato **habilitado** del lado correcto del eje primario con **menor
    distancia euclídea** (`Math.hypot`), no el de menor índice — así "abajo" desde la
    esquina superior derecha de una grilla cae en la celda de abajo; **empate → menor
    índice**; fuera de rango (nada enfocado `-1`, índice residual tras re-render) →
    `firstEnabledIndex`; sin candidatos → índice actual; lista vacía → `-1`. El item
    ACTUAL puede estar deshabilitado: solo se filtran los candidatos.
  - `KeyBindings.ts`: **`bindKeys(target, bindings)`** registra cada handler como
    `'keydown-<KEY>'` con **la MISMA referencia** (sin wrapper — la igualdad
    referencial on/off es contrato, AGENTS §5) y devuelve `unsubscribe()` idempotente
    con los pares exactos; target nullish → noop seguro. El handler recibe el evento
    de Phaser (`(...args: never[])`) para poder leer `event.repeat`.
  - Spec propio: `KeyboardNavigation.spec.ts` (20 tests, rojo→verde en la Fase 1).
- **(b) El foco REUTILIZA el highlight del hover** (no hay segundo estilo visual):
  `CardView.setKeyboardFocus()` con **dueño único** del highlight
  (`pointerHovered || keyboardFocused` — si cada dueño apagara lo suyo, el hover y el
  foco se pisaban); en los botones de escena, closures compartidas entre ratón y
  teclado (`ResultScene`, `BankerOfferPanel`, tienda). Mismo tween, misma escala.
- **(c) Los handlers invocan los MISMOS callbacks/emits que el ratón — nunca un
  pointer sintético.** `pointerup` fabricado a mano **revienta** con `pointer`
  undefined en el `dragGuard` de `ShopScene` (`wasDragging`), y además duplicaría el
  camino de negocio. ENTER en una carta emite `'card-clicked'`; en la tienda llama
  `attemptPurchase*` directo; en `ResultScene` invoca la closure `onClick`; en el
  banquero, `keyboardAcceptOffer`/`keyboardRejectOffer` → el MISMO emit que el click.
- **(d) Sonido SOLO al activar**, vía `UiSfx.playUiClick` (punto único, ADR-015):
  mover el foco con las flechas es silencioso; el foco no es un hover más.
- **(e) Hints invisibles:** cero claves i18n nuevas en las 5 fases (decisión del
  usuario) — no hay texto en pantalla que explique las teclas.
- **(f) Guards de teclado, en este orden:**
  1. **`isForeground()` / `hasActiveOverlayScene()`** con
     `this.scene.manager.getScenes(true)` — el `ScenePlugin` del repo **no tiene**
     `getScenes`, hay que ir por el manager; chequeo **explícito** de
     `AdOverlayScene`/`AdBlockerScene` donde aplique (ex- blocker `isForeground` de la
     Fase 2, RECHAZADO en review).
  2. Guard **anti-modal propio** (diálogo/panel abierto → teclas inertes) y
     guard **anti-overlay** (escena encima → la de abajo no responde).
  3. **`event.repeat`**: mantener una flecha no repite acciones (mantener S 1 s no
     flashea).
  4. **Orden**: el guard de overlay va **primero**; en `GameScene`, ENTER = TRATO se
     intercepta **antes** del guard `locked` (decisión de producto: la oferta es
     prioritaria).
- **(g) `addCapture`/`removeCapture` simétricos por escena** (alta en `create`,
  baja en `SHUTDOWN`): solo donde el scroll de la página molesta — `MainMenuScene`
  (UP/DOWN), `GameScene` (4 flechas), `HowToPlayScene` (LEFT/RIGHT/SPACE),
  `DeckSelectionScene` (LEFT/RIGHT). `ShopScene`/`UIScene`/`ResultScene` decidieron
  **no** capturar (ya hay capturas de otra escena arriba).
- **(h) El banquero comparte UNA guarda de salida** (`exitStarted`) entre ratón y
  teclado: un segundo intento durante el tween de 150 ms no emite dos veces — esto
  además arregló el doble-click del **ratón** (bug preexistente).
- **(i) Acciones one-shot con liberación GARANTIZADA**: en `ResultScene`,
  `kbActionTaken` se libera con `Promise.resolve().finally()` (no por render), porque
  multiply/revive **no** navegan y dejaban ENTER muerto (BLOCKER de la Fase 5).

## Consecuencias

- **Buena: mismo camino de negocio que el ratón, 0 duplicación de lógica.** Un bug de
  juego no puede existir "solo en teclado": teclado y ratón terminan en el mismo
  callback/use-case/emit. Las escenas "tontas" no acumularon lógica de negocio nueva
  (la orquestación sigue en `GameSceneController`).
- **Buena: la parte testeable vive en `presentation/input/`** (46 tests en specs
  nuevos: 20 + 13 + 7 + 6) — lo que no se testea (el wiring) queda para el smoke
  (`testing.md` §5, ítems 16-26).
- **Mala: `isForeground`/`hasActiveOverlayScene` está duplicado en 5 escenas**
  (`MainMenuScene`, `ShopScene`, `ResultScene` / `UIScene`, `GameScene`) — misma
  semántica, patrón idéntico con `getScenes(true)`. Registro vivo en
  `PLAYBOOK.md` §1: extraer a `src/presentation/input/` **si aparece una 6.ª**.
- **Mala: `removeCapture` es global a nivel juego y no tiene refcount** (NIT
  documentado en el código): dos escenas capturando la misma tecla en paralelo se
  pisan — por eso las capturas son pocas y simétricas.
- **Mala: `ConfirmDialog` genérico sigue sin navegación de teclado** (solo ESC lo
  cierra): los diálogos montados sobre `UIScene` sí tienen ↑↓+ENTER, pero no se
  extrajo el patrón al componente.
- **Mala: el hover del ratón apaga temporalmente el glow del foco de teclado** (comparten
  tween) — cosmético, cubierto por el smoke.

## No decidido / pendiente

- **ConfirmDialog con ↑↓+ENTER** (candidato a "Fase 7"): decidió dejarse fuera para
  no alargar la Fase 3; el modal de salida de `UIScene` ya funciona como referencia.
- **Hints de teclas en pantalla**: **decisión del usuario** — se prefirieron hints
  invisibles (0 claves i18n nuevas). Si se quieren, serían claves nuevas EN+ES y
  debería revisarse dónde se muestran sin ensuciar el layout de 8 escenas.
- **ESC en partida sin panel = no-op** (decisión consciente, no bug): no se inventa
  una salida a menú con ESC.

---

## Fase 7g — modales con foco visible (extensión 2026-10-19)

Las fases 7a-7e (cierre en `LOG.md` 2026-10-19: banner `f8ef3f5` · grilla `8a65e51`
· bono `adc889b` · swap `2fbe67d`+`50c007d` · `ConfirmDialog` `631eaef`) llevaron
teclado a los 4 modales que faltaban; la revisión posterior — **Fase 7g** — encontró
teclas muertas y foco invisible, y **unificó la semántica**. Esta sección **cierra**
dos puntos de más arriba: la consecuencia *"ConfirmDialog genérico sigue sin
navegación de teclado"* y el pendiente *"ConfirmDialog con ↑↓+ENTER"*.

### Semántica unificada de flechas

- **←/→ = posicionamiento absoluto sobre pares** (izquierda = primer botón,
  derecha = segundo; **sin wrap**: en el borde no hacen nada).
- **↑/↓ = alternancia** en los diálogos de 2 botones (eje ambiguo — mismo
  precedente que el modal de salida de `UIScene`).
- **Bono (6 cartas): solo ←/→**, recorrido sin wrap entre índice 0 y 5; ↑/↓ no
  tienen acción.
- El foco **reutiliza el highlight del hover** (decisión (b): ningún estilo nuevo);
  en el bono además con **el mismo tween** que `pointerover/pointerout`.

### Focos iniciales — siempre la acción segura

| Modal | Foco al abrir | Por qué |
|---|---|---|
| Oferta del banquero | **NO TRATO** (índice 1) | ENTER sin mover rechaza |
| Midgame Swap | **Mantener** (índice 0) | ENTER sin mover no cambia nada |
| Bono Diario | **carta izquierda** (índice 0) | visible desde la apertura |
| ConfirmDialog | **Cancelar** (índice 0) | ENTER sin mover cancela |

### ENTER y ESC

- **ENTER activa el botón/carta focado en los 4**, siempre por el mismo camino de
  negocio que el ratón (decisión (c)). Caso particular del bono:
  `handleEnterPressed()` **elige** la carta si no hay premio y **cierra**
  (`requestClose`, mismo camino que "Cerrar") una vez entregado — ENTER y ESC
  quedan intercambiables tras el reveal, y las flechas se vuelven inertes
  (guard `resolved`).
- **ESC conserva sus atajos preexistentes:** oferta = **NO TRATO** · swap =
  declinar/cerrar **silencioso** (nuevo) · bono = **cerrar** (preexistente desde la
  Fase 3) · diálogo = **cancelar**.
- **Sonido por paridad con el ratón (ADR-015):**
  - **Swap:** ENTER suena `playUiClick` **igual que su click**; ESC declina **sin**
    sonido (cancelar no confirma, precedente `UIScene.handleEscapeKey`).
  - **Oferta:** ENTER/ESC **silenciosos** — esos botones **no** tienen
    `bindUiClick` (el sfx propio del modal es `SFX.OFFER`/`SFX.BANKER_ANNOYED`).
  - **Bono:** el teclado **sí** suena `SFX.BONUS_CLAIM` al elegir la carta —
    **decisión de la Fase 7c**, registrada tal cual en `PeriodicBonusModal`
    (el ratón, que no suena al clickear una carta, quedó como estaba; el efecto
    es el mismo que el del banner del menú).
  - **Diálogo:** el click del ratón **sí** suena (`bindUiClick` en el hit de cada
    botón) y la activación por teclado (ENTER/ESC) **no** reproduce sonido.

### Guards

- **`exitStarted` único compartido por ratón + teclado** en `BankerOfferPanel`
  (Fase 5, decisión (h)) **y ahora también en `SwapEventModal`**: durante el tween
  de salida de 150 ms un segundo intento (doble ENTER, ENTER+ESC, doble click) no
  emite dos veces — sin este guard, `GameSceneController` (`.once` por evento)
  dispararía **las dos ramas** del swap (`swap-declined` **y**
  `swap-accepted-choose-card`) en la misma partida.
- `moveFocus` queda inerte una vez decidido: tras `exitStarted` (oferta y swap) y
  tras `resolved` (bono).

### BUGFIXes registrados en la revisión

- **(a) Claves de Phaser en MAYÚSCULAS (KeyMap):** la Fase 7e bindeaba
  `keydown-Left`/`keydown-Right`/`keydown-Enter` en minúscula; el `KeyMap` de
  Phaser emite `keydown-LEFT`/… y **una clave equivocada es un listener que nunca
  dispara** (solo ESC, que estaba en mayúscula, funcionaba). Hoy los 4 modales
  registran `LEFT/RIGHT/UP/DOWN/ENTER/ESC` en mayúscula, con handlers de
  **referencia nombrada** para desengancharlos: `destroy()` antes solo soltaba
  ESC y **cada apertura acumulaba listeners muertos** (fuga, AGENTS §5). La misma
  revisión encontró **foco invisible** (el índice cambiaba sin resaltado en
  `ConfirmDialog`), en el swap un `highlightFocusedButton` que apagaba `as any` a
  **todos** los children del botón (fondo, texto e ícono: el botón desaparecía) y
  en el bono un foco con `setAlpha` crudo que peleaba con el hover — los tres con
  **dueño único del resaltado**.
- **(b) El importe del bono viaja como NÚMERO:** `activateFocusedCard` toma
  `CardSlot.value`; **nunca** se parsea el texto formateado — con locale es-*
  `parseInt("5.000")` devolvía **5** y acreditaba 5 en vez de 5.000 (el ratón,
  que pasaba el número, estaba bien; el texto es solo presentación i18n).

### Mapa de teclas de los 4 modales

| Modal | ←/→ | ↑/↓ | ENTER | ESC |
|---|---|---|---|---|
| Oferta del banquero | DEAL ↔ NO DEAL (abs., sin wrap) | alterna | activa enfocado (silencioso) | NO TRATO (silencioso) |
| Midgame Swap | Mantener ↔ Cambiar (abs., sin wrap) | alterna | activa enfocado (`playUiClick`) | declinar / cerrar silencioso |
| Bono Diario | recorrido de 6 cartas (sin wrap) | — | elige la carta enfocada / cierra tras el premio (`SFX.BONUS_CLAIM`) | cerrar |
| ConfirmDialog | Cancelar ↔ Confirmar (abs., sin wrap) | alterna | activa enfocado (silencioso) | cancelar |

Verificación: specs RED-first de `BankerOfferPanel`/`SwapEventModal`/
`PeriodicBonusModal`/`ConfirmDialog` + smoke `testing.md` §5, **ítems 27-31**
(PENDIENTES).
