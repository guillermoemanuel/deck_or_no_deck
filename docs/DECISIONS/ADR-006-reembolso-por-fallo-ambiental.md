# ADR-006: Reembolso por fallo ambiental al consumir una mejora de ads

**Estado:** Aceptada · **Registrada:** 2026-10-01

## Contexto
TOCTOU compra→consumo (límite aceptado el 2026-09-30, `docs/testing.md` §5): el guard de
la Tienda chequea `isRewardedAdAvailable()` al *comprar*, pero Duplicar/Triplicar/Revivir
se *consumen* mucho después (pantalla de resultado / al perder). Si entre medias
desaparece el SDK de CrazyGames (Basic Launch sin ads, script del SDK que nunca cargó),
el jugador pagaba y no recibía nada: el dinero se descuenta y el efecto nunca se entrega,
violando el contrato "el dinero nunca se descuenta sin que el efecto se aplique".

El usuario eligió entre 3 opciones: **(a)** conceder el efecto sin anuncio,
**(b)** reembolsar, **(c)** solo documentar. → **(b) reembolsar.**

## Decisión
- Al consumir, si `ICrazyGamesService.isAvailable()` es **false** (SDK entero ausente):
  `awardGameplayCoins(costOf(id))` **exactamente una vez** y resultado `'refunded'`
  (motivo nuevo en las uniones `MultiplyRewardResult` y `ReviveResult`).
- **Invariante reembolso XOR efecto:** el flag `refunded` de la instancia del use-case
  bloquea todo reclamo posterior (`'refunded'` sin efecto). Nunca reembolso *y además*
  efecto — sería explotable (cobrar devuelta y reclamar igual cuando vuelva el anuncio).
- **`ad_failed` no reembolsa** (cancelación del jugador o fill muerto): es fallo del
  anuncio, no del entorno; el reintento queda libre.
- **`awardGameplayCoins` es el único camino de acreditación** de monedas (JSDoc del
  puerto `IProgressionService` ampliado a reembolsos); el monto sale de
  **`costOf(id)`**, helper único recién agregado al `SessionUpgradeCatalog` (los precios
  nunca se hardcodean, AGENTS.md §4).
- Sin puerto de progresión inyectado (`ReviveWithAdUseCase` lo recibe opcional) se
  devuelve el motivo **real** `'sdk_unavailable'` — no se miente con un `'refunded'` que
  no llegó a acreditarse.
- UI (`ResultScene`): clave i18n **`RESULT_AD_REFUNDED`** (en/es) y botones apagados al
  recibir `'refunded'` (helper `disableActionButton`, alpha 0.4 sin interactividad) — un
  botón apagado no puede prometer un efecto ya agotado.

## Consecuencias
- **Cubierto:** SDK entero ausente al consumir → el dinero vuelve una sola vez y el
  intento queda cerrado (specs: `MultiplyRewardUseCase.spec.ts` 10 tests,
  `ReviveWithAdUseCase.spec.ts` 13 tests; smoke navegador pendiente — ítems 9-11 de
  `docs/testing.md`).
- **Pendiente (decisión de producto del usuario):** el reembolso cubre **solo**
  `isAvailable()` false. Si el SDK está pero `isRewardedAdAvailable()` es `false`
  (cooldown o fill muerto, p. ej. adblock sobre el fill), el consumo cae en `ad_failed` →
  **sin** reembolso, reintento infinito y, si los ads no vuelven, el dinero queda trabado.
  Cubrirlo dispararía el reembolso también con esa condición (sub-caso documentado en
  `docs/testing.md` §5, límite 2).
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
