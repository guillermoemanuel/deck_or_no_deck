# ADR-009: `ads_disabled` — dos adErrors de CrazyGames son estados PERMANENTES

**Estado:** Aceptada · **Registrada:** 2026-10-04 · **Unidad:** A3 (tras la auditoría de
publicación 2026-10-04)

## Contexto

Hallazgo **CG-PUB-003** de la auditoría de publicación a CrazyGames del 2026-10-04: en
**Basic Launch** el SDK de CrazyGames reporta cada rewarded con
`adError {code: 'adsDisabledBasicLaunch'}` (los anuncios recompensados están
deshabilitados para el juego). El repo no mapeaba ese código **ni**
`{code: 'adblock'}`, así que ambos caían en el `reason: 'error'` genérico → resultado
`ad_failed` y cooldown `cooldown_retryable` — es decir, **POLÍTICA 1 de ADR-006 (sin
reembolso)** para un fallo que nunca se iba a curar.

Consecuencia directa: en la Tienda el jugador **pagaba monedas** por
Duplicar/Triplicar/Revivir y, al consumir, cada 60 s perdía más intentos en un botón que
**nunca funciona** — incumplimiento del criterio de rechazo QA de la plataforma
(*"no rewarded buttons without effect"*). Y el dinero quedaba trabado: `ad_failed` no
reembolsa por diseño (ADR-006), presuponiendo que el fallo era transitorio.

Agravante: la **única** vía del adblock era `hasAdblock()`, un chequeo que corre **en el
init** — antes de que exista/actúe la extensión — así que puede no detectarlo; el propio
SDK ya avisa del bloqueo por `adError {code: 'adblock'}` y ese aviso se descartaba.

ADR-006 ya tenía la política correcta (reembolso XOR efecto, leído con
`rewardedAdStatus()`), pero el **motivo real no llegaba al puerto**: la clasificación
genérica lo tapaba. El problema no era la política, era la información que la alimentaba.

## Decisión

- **Dos códigos de `adError` son ESTADOS PERMANENTES de la sesión**, no fallos
  transitorios:
  - `adsDisabledBasicLaunch` → **`'ads_disabled'`**, miembro **nuevo** de la unión
    `RewardedAdStatus` en el puerto `src/domain/ports/ICrazyGamesService.ts`
    (`'available' | 'sdk_unavailable' | 'adblock' | 'ads_disabled' | 'cooldown_no_fill' |
    'cooldown_retryable'`), documentado en su JSDoc y en el de `rewardedAdStatus()`:
    los permanentes son **`sdk_unavailable`, `adblock`, `ads_disabled`**; el cooldown de
    60 s **siempre** vence.
  - `adblock` → enciende el flag `adblockDetected` (el mismo que ya existía, pero ahora
    seteado también **desde el `adError` del SDK**, no solo por `hasAdblock()`).
- **En `CrazyGamesService` (infra):** campo privado `adsDisabled`;
  helper `errorCodeOf(error)` que lee `code` o `reason` (tolerancia heredada —
  `isUnfilled()` ahora lo usa); y `notePermanentError(error)` llamado desde el handler de
  `adError` **ANTES de `settle()`** (`adsDisabledBasicLaunch` → `adsDisabled = true`;
  `adblock` → `adblockDetected = true`), para que el cooldown que arma `settle()` no tape
  el estado nuevo.
- **`rewardedAdStatus()` ordena lo permanente primero:** `sdk_unavailable` → `adblock` →
  **`ads_disabled`** → cooldown → `available`. Mismo criterio que ADR-006 ya aplicaba a
  `sdk_unavailable`/`adblock`: **lo permanente manda sobre el cooldown de 60 s** (un
  `ads_disabled` no "se cura" esperando).
- **Los use-cases re-evalúan el motivo tras un fallo y aplican la política 2 en el MISMO
  intento** (`ReviveWithAdUseCase` y `MultiplyRewardUseCase`):
  - el bloque de POLÍTICA 2 se extrajo al método privado `policyTwoRefund(...)` (reembolso
    único `costOf(id)`, resultado `'refunded'`);
  - el switch pre-consumo suma **`case 'ads_disabled'`** junto a
    `sdk_unavailable`/`adblock`/`cooldown_no_fill` → reembolso sin pedir el anuncio;
  - **clave:** después de un `showRewardedAd()` **fallido** se vuelve a leer
    `rewardedAdStatus()`; si el `adError` dejó el estado permanente
    (`'ads_disabled'`/`'adblock'`) → `policyTwoRefund()` **ahí**, en vez de caer en
    `'ad_failed'` sin reembolso. Si el estado NO se volvió permanente (cancelación del
    jugador, fill muerto), `ad_failed` sigue sin reembolsar y reintentable — ADR-006 sin
    cambios.
  - **El invariante reembolso XOR efecto queda intacto:** un solo camino de reembolso por
    intento; `refunded` sigue bloqueando todo reclamo posterior.
- **`ListAvailableUpgradesUseCase` y el guard de `PurchaseSessionUpgradeUseCase` no
  cambiaron:** `isRewardedAdAvailable()` es azúcar de `rewardedAdStatus() === 'available'`
  y vuelve a `false` solo → las 3 filas de rewarded quedan ocultas/filtradas sin código
  extra.
- **Fake de testing:** `FakeCrazyGamesService.setRewardedStatusAfterNextAd(status)` —
  simula el SDK real: si el próximo rewarded falla, el estado pasa a ser permanente **en
  vuelo** (durante el `await` del use-case).

## Consecuencias

- **Basic Launch oculta las filas de ads desde el primer fallo** (y el reclamo ya pagado
  se reembolsa en ese mismo intento): se cumple *"no rewarded buttons without effect"* —
  el botón no solo deja de prometer, además devuelve lo cobrado.
- **`hasAdblock()` deja de ser la única vía del adblock**: el `adError {code: 'adblock'}`
  del SDK también enciende `adblockDetected`. El chequeo de init sigue existiendo (cubre
  el caso en que el SDK ni siquiera reporta), pero ya no es requisito para que la política
  2 se active.
- **El fake expone `setRewardedStatusAfterNextAd`**, de modo que la transición
  "falla en vuelo → estado permanente" es testeable sin tocar el SDK real.
- **El adapter propio (`VITE_ADS=portal`) nunca produce `ads_disabled`** (ni `adblock`):
  esos estados solo nacen del SDK de CrazyGames — `OwnRewardedAdService` sigue limitado a
  `available | cooldown_*`.
- El JSDoc del puerto **es la especificación** de la política (mismo contrato que ADR-006):
  quién agrupa los permanentes, quién reembolsa y quién espera 60 s vive ahí, no en la UI.
- **Specs red→verde (9 tests):** `CrazyGamesService.spec.ts` **+2** (el rojo era
  `Expected: "ads_disabled"/"adblock", Received: "cooldown_retryable"`; además verifica
  que el estado **no** vuelve con el cooldown a los 60 s) · `ReviveWithAdUseCase.spec.ts`
  **+3** · `MultiplyRewardUseCase.spec.ts` **+3** (pre-consumo `ads_disabled` →
  `refunded` con 0 llamadas al anuncio; `it.each(['ads_disabled','adblock'])` post-fallo →
  **primer** intento ya `refunded` con 1 llamada) ·
  `ListAvailableUpgradesUseCase.spec.ts` **+1** (`setRewardedStatus('ads_disabled')` → 5
  filas, sin double/triple/revive). Suite: **45 suites / 522 tests**.
- **ADR-006 no se modifica:** este ADR amplía el *grupo* de permanentes que ADR-006 ya
  definía, no su invariante. Si algún día se agrega otro `adError` permanente del SDK, el
  patrón a repetir es `notePermanentError()` + `case` en el switch + re-evaluación
  post-fallo.
