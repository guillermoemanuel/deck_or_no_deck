# ADR-007: Anuncio propio (countdown) para portales externos + selección de adapter por `VITE_ADS`

**Estado:** Aceptada · **Registrada:** 2026-10-01 · **Pre-implementation:** 2026-10-01

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
`index.html` carga el SDK de CrazyGames de forma fija en línea 29 para **todos** los
builds.

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
