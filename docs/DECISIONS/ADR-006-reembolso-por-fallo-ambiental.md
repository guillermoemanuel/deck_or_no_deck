# ADR-006: Reembolso por fallo ambiental al consumir una mejora de ads

**Estado:** Aceptada · **Registrada:** 2026-10-01 · **Alcance ampliado:** 2026-10-01 ·
**Enmendada:** 2026-10-01 (motivo en el puerto + **2 políticas** de reembolso)

## Contexto
TOCTOU compra→consumo (límite aceptado el 2026-09-30, `docs/testing.md` §5): el guard de
la Tienda chequea `isRewardedAdAvailable()` al *comprar*, pero Duplicar/Triplicar/Revivir
se *consumen* mucho después (pantalla de resultado / al perder). Si entre medias
desaparece el SDK de CrazyGames (Basic Launch sin ads, script del SDK que nunca cargó),
el jugador pagaba y no recibía nada: el dinero se descuenta y el efecto nunca se entrega,
violando el contrato "el dinero nunca se descuenta sin que el efecto se aplique".

Primera decisión (2026-10-01): el usuario eligió entre 3 opciones — **(a)** conceder el
efecto sin anuncio, **(b)** reembolsar, **(c)** solo documentar. → **(b) reembolsar.**

El alcance inicial (`!isAvailable()`, solo SDK ausente) dejó afuera dos caminos con el
mismo síntoma: **adblock detectado** y la **ventana de cooldown de 60 s** tras un
rewarded fallido → `ad_failed` sin reembolso, reintento infinito, dinero trabado.
Segunda decisión (2026-10-01): el usuario eligió entre **(a)** reembolsar ante **todo
fallo** ambiental, **(b)** **distinguir el motivo** del fallo, **(c)** **mantener solo
SDK ausente** → **(a) ampliar.**

Tercera decisión (2026-10-01, enmienda del mismo día): la ampliación (a) metió **toda**
la ventana de cooldown en el reembolso, pero **el cooldown de 60 s lo pone cualquier
rewarded fallido, incluida la cancelación del jugador** (`CrazyGamesService.settle()`):
cancelar el anuncio de Revivir y hacer un segundo click reembolsaba y cerraba el reclamo
→ el jugador pagaba y **perdía para siempre la chance de revivir** (forfeit autoinfligido).
El usuario eligió entre **(a)** mantener el reembolso ante todo fallo y **(b)**
**distinguir el motivo** del fallo con 2 políticas → **(b).**

## Decisión
- **Enmienda 2026-10-01 — el motivo vive en el puerto.** Al consumir, la política se
  decide con **`ICrazyGamesService.rewardedAdStatus()`**
  (`RewardedAdStatus = 'available' | 'sdk_unavailable' | 'adblock' | 'cooldown_no_fill' |
  'cooldown_retryable'`), **no** con el predicado booleano: `isRewardedAdAvailable()`
  queda como azúcar (`=== 'available'`) y no distingue motivos. **Dos grupos:**
  - **`sdk_unavailable` | `adblock` | `cooldown_no_fill` → reembolso único.**
    `awardGameplayCoins(costOf(id))` **exactamente una vez** y resultado `'refunded'`
    (motivo en las uniones `MultiplyRewardResult` y `ReviveResult`). Cubre SDK entero
    ausente (Basic Launch sin ads / script que nunca cargó), **adblock detectado** y la
    **ventana de cooldown armada por un fallo sin fill** — estados en los que reintentar
    no promete nada y el dinero quedaría trabado comprando algo que no se puede usar.
  - **`cooldown_retryable` → motivo nuevo `'ads_cooldown'`, SIN reembolso.** El cooldown
    viene de cualquier fallo que no sea sin-fill (ahí cae la **cancelación del jugador**;
    en producción `adError` sin fill → `'ad_unavailable'` y todo lo demás → `'error'`).
    No se acredita nada, **no se setea `refunded`** (el XOR del punto siguiente queda
    intacto) y **no se pide el anuncio**: la UI muestra la clave nueva
    **`RESULT_AD_COOLDOWN`** y **no apaga los botones** — a los 60 s el mismo reclamo
    reintenta de verdad.
- **Invariante reembolso XOR efecto:** el flag `refunded` de la instancia del use-case
  bloquea todo reclamo posterior (`'refunded'` sin efecto). Nunca reembolso *y además*
  efecto — sería explotable (cobrar devuelta y reclamar igual cuando vuelva el anuncio).
  El motivo `'ads_cooldown'` **nunca** toca `refunded`.
- **`ad_failed` no reembolsa** (el intento se hizo y falló: cancelación del jugador o
  fill muerto): es fallo del anuncio, no del entorno; el reintento queda libre.
  **Matiz del cooldown, enmendado 2026-10-01:** los 60 s los pone **cualquier** rewarded
  fallido, **incluida la cancelación del jugador** (`CrazyGamesService.settle()` →
  `rewardedBlockedUntil = now + 60000`), y la ventana **puede ser autoinfligida**. La
  cláusula anterior decía que "un segundo click dentro de la ventana reembolsa y cierra
  el reclamo": eso convertía la cancelación en un forfeit no querido. Hoy decide el
  **motivo** del cooldown — `cooldown_retryable` → `'ads_cooldown'` sin reembolso;
  `cooldown_no_fill` → reembolso único (el caso sin-fill sigue cubierto). `requestAd`
  **no** consulta el cooldown (solo `isAvailable()` + `adInProgress`): la ventana la
  protege el pre-chequeo del use-case al consumir.
- **Resuelto el 2026-10-01 (antes: "Pendiente — decisión de producto del usuario"):**
  ese bloque advertía que el reembolso cubría **solo** `isAvailable()` false y que, con
  el SDK presente pero `isRewardedAdAvailable()` false (cooldown o fill muerto, p. ej.
  adblock sobre el fill), el consumo caía en `ad_failed` → **sin** reembolso, reintento
  infinito y, si los ads no volvían, el dinero trabado; cubrirlo dispararía el reembolso
  también con esa condición. Quedó **cubierto por el grupo de reembolso de
  `rewardedAdStatus()`**: `cooldown_no_fill` reembolsa el caso sin-fill **sin** reabrir el
  hueco para `cooldown_retryable`. Sub-caso cerrado en `docs/testing.md` §5 límite 2; las
  specs de transición `ad_failed → cooldown → refunded` **ya no existen** — fueron
  reemplazadas por las specs de la política nueva (títulos en `docs/testing.md` §5).
- **`awardGameplayCoins` es el único camino de acreditación** de monedas (JSDoc del
  puerto `IProgressionService` ampliado a reembolsos); el monto sale de
  **`costOf(id)`**, helper único recién agregado al `SessionUpgradeCatalog` (los precios
  nunca se hardcodean, AGENTS.md §4).
- Sin puerto de progresión inyectado (`ReviveWithAdUseCase` lo recibe opcional) se
  devuelve el motivo **real** `'sdk_unavailable'` — no se miente con un `'refunded'` que
  no llegó a acreditarse. En la política 2 ese motivo real sirve para cualquier causa del
  grupo (SDK/adblock/cooldown sin-fill); `'ads_cooldown'` pertenece a la otra política y
  tampoco necesita el puerto.
- UI (`ResultScene`): clave i18n **`RESULT_AD_REFUNDED`** (en/es) y botones apagados al
  recibir `'refunded'` (helper `disableActionButton`, alpha 0.4 sin interactividad) — un
  botón apagado no puede prometer un efecto ya agotado. **Enmienda 2026-10-01:**
  `'ads_cooldown'` muestra la clave nueva **`RESULT_AD_COOLDOWN`** (en/es) y queda
  **fuera** de `disableActionButton`: los botones siguen vivos porque a los 60 s el
  reintento es real.

## Consecuencias
- **Cubierto con las 2 políticas:** `sdk_unavailable` / `adblock` / `cooldown_no_fill` →
  el dinero vuelve una sola vez y el intento queda cerrado (`'refunded'`);
  `cooldown_retryable` → `'ads_cooldown'` sin reembolso, sin tocar `refunded`, con los
  botones activos y reintento real a los 60 s. Specs: `CrazyGamesService.spec.ts` **14**
  tests (6 de `rewardedAdStatus()`), `MultiplyRewardUseCase.spec.ts` **16**,
  `ReviveWithAdUseCase.spec.ts` **19** — **+12** en total (6 infra + 6 aplicación);
  smoke navegador pendiente — ítems 9-11 de `docs/testing.md`.
- **Precondición del multiply:** `MultiplyRewardUseCase` no recibe la `GameSession`, así
  que no puede verificar que el jugador POSEE la mejora y reembolsa `costOf(...)` a
  ciegas. Hoy es inalcanzable — los flags salen de la sesión viva
  (`GameSceneController.buildUpgradeFlagsForResultScene`), el catálogo prohíbe
  double+triple (`conflictsWith`) y `SessionUpgrades` no persiste entre partidas. El
  hueco, si algún día la verificación de tenencia se debilita, vive en presentación.
- **Vida del flag `refunded`:** ligada a la instancia del use-case, que `ResultScene`
  recrea en cada `create()`. Hoy no hay segundo reembolso posible porque el modal `won`
  es terminal ("Jugar de nuevo"/"Salir" arrancan sesión nueva con use-case propio);
  relanzar la escena con `outcome: 'won'` dentro de la MISMA partida re-habilitaría un
  segundo reembolso (caveat documentado en la escena).
- Rama `wantsDouble && wantsTriple` en `ResultScene.buildWonActions` queda como red de
  seguridad (inalcanzable con el catálogo actual) — ver `docs/PLAYBOOK.md` §3.
