# ADR-006: Reembolso por fallo ambiental al consumir una mejora de ads

**Estado:** Aceptada · **Registrada:** 2026-10-01 · **Alcance ampliado:** 2026-10-01

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

## Decisión
- Al consumir, si `ICrazyGamesService.isRewardedAdAvailable()` es **false**:
  `awardGameplayCoins(costOf(id))` **exactamente una vez** y resultado `'refunded'`
  (motivo nuevo en las uniones `MultiplyRewardResult` y `ReviveResult`).
  **Ampliación de alcance, 2026-10-01:** el pre-chequeo pasó de `!isAvailable()` a
  **`!isRewardedAdAvailable()`**, que cubre **SDK entero ausente + adblock detectado +
  ventana de cooldown de 60 s** tras un rewarded fallido — todos los caminos en los que
  el dinero quedaba trabado comprando algo que nunca se podía usar
  (`isRewardedAdAvailable() = isAvailable() && !adblockDetected &&
  now >= rewardedBlockedUntil`, en `CrazyGamesService.ts`).
- **Invariante reembolso XOR efecto:** el flag `refunded` de la instancia del use-case
  bloquea todo reclamo posterior (`'refunded'` sin efecto). Nunca reembolso *y además*
  efecto — sería explotable (cobrar devuelta y reclamar igual cuando vuelva el anuncio).
- **`ad_failed` no reembolsa** (el intento se hizo y falló: cancelación del jugador o
  fill muerto): es fallo del anuncio, no del entorno; el reintento queda libre.
  **Matiz del cooldown (2026-10-01):** los 60 s los pone **cualquier** rewarded fallido,
  **incluida la cancelación del jugador** (`CrazyGamesService.settle()` →
  `rewardedBlockedUntil = now + 60000`), así que un **segundo click dentro de la ventana
  reembolsa y cierra el reclamo** — el pre-chequeo no distingue quién armó el cooldown;
  reintentar de verdad exige esperar los 60 s. `requestAd` **no** consulta el cooldown
  (solo `isAvailable()` + `adInProgress`): la ventana la protege el pre-chequeo del
  use-case al consumir.
- **Resuelto el 2026-10-01 (antes: "Pendiente — decisión de producto del usuario"):**
  ese bloque advertía que el reembolso cubría **solo** `isAvailable()` false y que, con
  el SDK presente pero `isRewardedAdAvailable()` false (cooldown o fill muerto, p. ej.
  adblock sobre el fill), el consumo caía en `ad_failed` → **sin** reembolso, reintento
  infinito y, si los ads no volvían, el dinero trabado; cubrirlo dispararía el reembolso
  también con esa condición. Quedó **cubierto por la ampliación (a) de arriba**: predicado
  nuevo, sub-caso cerrado en `docs/testing.md` §5 límite 2 y specs de transición
  `ad_failed → cooldown → refunded` en ambos use-cases.
- **`awardGameplayCoins` es el único camino de acreditación** de monedas (JSDoc del
  puerto `IProgressionService` ampliado a reembolsos); el monto sale de
  **`costOf(id)`**, helper único recién agregado al `SessionUpgradeCatalog` (los precios
  nunca se hardcodean, AGENTS.md §4).
- Sin puerto de progresión inyectado (`ReviveWithAdUseCase` lo recibe opcional) se
  devuelve el motivo **real** `'sdk_unavailable'` — no se miente con un `'refunded'` que
  no llegó a acreditarse. (Con el chequeo ampliado ese motivo también cubre
  adblock/cooldown: es el único caso sin reembolso disponible en la unión.)
- UI (`ResultScene`): clave i18n **`RESULT_AD_REFUNDED`** (en/es) y botones apagados al
  recibir `'refunded'` (helper `disableActionButton`, alpha 0.4 sin interactividad) — un
  botón apagado no puede prometer un efecto ya agotado.

## Consecuencias
- **Cubierto:** SDK ausente, adblock detectado o cooldown de 60 s al consumir → el
  dinero vuelve una sola vez y el intento queda cerrado (specs:
  `MultiplyRewardUseCase.spec.ts` **13** tests, `ReviveWithAdUseCase.spec.ts` **16**
  tests; smoke navegador pendiente — ítems 9-11 de `docs/testing.md`).
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
