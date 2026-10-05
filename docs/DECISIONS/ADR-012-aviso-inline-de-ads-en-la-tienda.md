# ADR-012: Aviso INLINE de ads ocultos en la tienda (política `adsNotice()` en aplicación)

**Estado:** Aceptada · **Registrada:** 2026-10-04 · **Unidad:** B4 (Sprint B de la
auditoría de publicación 2026-10-04)

## Contexto

Hallazgo **CG-MON-006** (P2) de la auditoría de publicación 2026-10-04:
`ListAvailableUpgradesUseCase.execute()` oculta Duplicar/Triplicar/Revivir cuando
`isRewardedAdAvailable()` es `false`, y la tienda **mostraba 5 filas sin ningún aviso**
de por qué faltaban esas 3 — el jugador no tenía forma de saber que existen ni de qué le
sirve arreglarlo. Requisito de CrazyGames: manejar el adblock *gracefully*; la auditoría
exigió un aviso **inline, NO un popup**.

La clave vieja **`SHOP_UPGRADE_ADS_UNAVAILABLE`** no servía: solo aparecía como mensaje
**temporal de fila** (`showTemporaryRowMessage`) en el path de **compra** — es decir,
sobre una fila que se veía. Las filas ocultas nunca pasaban por ahí, así que para ellas
no había ningún canal de aviso.

## Decisión

- **(a) Aviso inline, no popup** — manda la auditoría: un banner dentro de la pestaña
  Mejoras, no un modal que haya que descartar.
- **(b) La política "¿corresponde el aviso?" vive en
  `ListAvailableUpgradesUseCase.adsNotice(): 'adblock' | 'ads_disabled' | null`** y cubre
  **solo motivos PERMANENTES** de la sesión (relee `rewardedAdStatus()` en cada llamada,
  igual que `execute()`: la lista se re-evalúa por render):
  - `'adblock'` / `'ads_disabled'` → **corresponde**: las 3 filas siguen ocultas hasta que
    el jugador desactive su adblocker o la plataforma salga de Basic Launch (algo que no
    cambia solo).
  - `'cooldown_retryable'` / `'cooldown_no_fill'` → **NO**: es transitorio (60 s) — el
    aviso parpadearía y la fila reaparece sola.
  - `'sdk_unavailable'` → **NO**: es ambiguo (modo `none`/dev, SDK sin cargar o CDN
    caído) — avisaría "desactivá tu adblocker" donde no lo hay (falso positivo en dev).
- **(c) Lógica en `application/`, la escena SOLO dibuja** — misma recomendación de la
  auditoría que ya se aplicó al filtro: `ShopScene` llama `adsNotice()` y pinta el texto;
  no decide nada. El porqué de cada exclusión está en el JSDoc del método (es la
  especificación).
- **(d) Layout de UNA línea a `height / 2 - 176`, copy corto y SIN `wordWrap`** — el
  hueco entre el caption (`SHOP_UPGRADES_CAPTION`, `-200`, origin 0.5, 15 px) y la
  primera fila (`-160`, origin 0,0) es de ~32 px: entra una línea con margen, dos la
  pisarían (por eso el copy es corto y deliberadamente sin wrap — comment en la escena).
  Color ámbar `#ffd166` (paleta existente del repo). Mapeo: `adblock` →
  `SHOP_ADS_HIDDEN_ADBLOCK`, `ads_disabled` → `SHOP_ADS_HIDDEN_DISABLED` — **claves
  nuevas EN+ES** en `LanguageData.ts`, junto a `SHOP_UPGRADE_ADS_UNAVAILABLE` (que queda
  intacta para el path de compra).

## Consecuencias

- **El jugador ve el aviso cuando corresponde**: filas ocultas por adblock o por Basic
  Launch quedan explicadas en línea; **sin parpadeo** en cooldowns y **sin falsos
  positivos** en modo dev (`sdk_unavailable` no avisa).
- **La decisión es testeable en aplicación** (lógica pura, sin Phaser) y la escena suma
  cero lógica de negocio — solo traducir el motivo a i18n y dibujar.
- El aviso se re-evalúa en cada render de la pestaña: si el jugador desactiva su
  adblocker, al reabrir la tienda desaparece el aviso **y** reaparecen las 3 filas (misma
  fuente `rewardedAdStatus()` para ambos).
- i18n: **148 → 150 claves** × en/es (`LanguageData.spec` valida la paridad EN/ES
  automáticamente).
- **Specs red→verde:** `ListAvailableUpgradesUseCase.spec.ts` gana
  `describe('adsNotice() — aviso inline de la tienda (CG-MON-006)')` con **5 tests**
  (adblock → `'adblock'`; ads_disabled → `'ads_disabled'`; available → `null`; ambos
  cooldowns → `null`; sdk_unavailable → `null`) — rojo por método inexistente (la suite
  ni compilaba); el spec pasa de 5 a **10 tests**. Suite: **48 suites / 546 tests**
  (base B3: 48/541); sin archivos nuevos.
- **Pendiente (no cubierto por unit tests):** smoke visual de la tienda dentro del smoke
  general del Sprint B — modo `crazygames` con extensión de adblock activa debe verse el
  aviso ámbar de UNA línea bajo el caption; `ads_disabled` solo puede simularse en Basic
  Launch.
