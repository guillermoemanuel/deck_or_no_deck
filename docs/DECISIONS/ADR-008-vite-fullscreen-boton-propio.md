# ADR-008: Botón de pantalla completa propio sujeto al modo de ads (`VITE_FULLSCREEN`)

**Estado:** Aceptada · **Registrada:** 2026-10-04 · **Unidad:** A1 (tras la auditoría de
publicación 2026-10-04)

## Contexto

Hallazgo **CG-PUB-002** (P0) de la auditoría de publicación a CrazyGames del
2026-10-04: la plataforma **prohíbe los botones de pantalla completa propios del juego**
(*"Custom in-game fullscreen buttons are prohibited"*) — el fullscreen de la página en
CrazyGames lo maneja el portal y un botón propio duplica/confunde ese control.

El repo incumplía eso sin saberlo: `SoundFullscreenControls.ts:85` tenía
`showFullscreenButton = true` como **default del constructor**, mientras el JSDoc de la
clase juraba `false`. Ese drift vive desde `c9680f4` (2026-09-28): la afirmación del
JSDoc se escribió primero y el código nunca la cumplió. Como ninguna de las 4 escenas
que usan el componente pasaba el 3.er argumento, **todas heredaban el botón prohibido**
— `MainMenuScene:197`, `HowToPlayScene:599`, `DeckSelectionScene:167`, `UIScene:130` —
incluido el build default (`VITE_ADS=crazygames`, el que se publica).

O sea: no era una decisión registrada contra la que chocaba la auditoría, era **código
sin decisión** (un default tío) que contradecía su propia documentación. El usuario
definió el diseño: pareja de env al estilo del adapter de ads, es decir — no parchear
el default del componente, sino **hacer que el botón sea un flag de build con la misma
mecánica ya probada de `VITE_ADS`** (ADR-007).

## Decisión

- **Env `VITE_FULLSCREEN` como pareja invariante de `VITE_ADS`.** La escribe la misma
  tool `/ads-adapter` en `.env`, nunca a mano: `VITE_ADS=crazygames` →
  `VITE_FULLSCREEN=false`; `VITE_ADS=portal|none` → `true`. Un modo de ads siempre viaja
  con su fullscreen coherente; el reporte de la tool (MODO/BUILD/BUNDLE) ahora muestra
  ambas envs.
- **Default seguro `false`** — coherente con el default `'crazygames'` de `VITE_ADS`
  (ADR-007): un build manual sin `.env` (la situación más común de "alguien lo buildió
  a mano") cae en el modo que **prohíbe** el botón, así que sin env nunca se puede
  incumplir la regla de la plataforma.
- **`resolveFullscreenEnabled(raw, adsMode)`** en `src/infrastructure/config/`
  (al lado de `resolveAdsMode`, misma filosofía de rigidez):
  - **precedencia del modo sobre el env**: en `adsMode === 'crazygames'` **siempre**
    devuelve `false`; si el env dice `'true'` se **ignora** + `console.warn` (la
    prohibición de la plataforma manda sobre cualquier configuración local);
  - en `portal`/`none` acepta solo los literales **exactos** `'true'` / `'false'`;
    cualquier variante (espacios, mayúsculas, typos) → `false` + `console.warn` con el
    valor crudo;
  - `undefined` o vacío → `false` **sin** warn (dev sin el par de envs, mismo contrato
    que `resolveAdsMode`).
- **El flag se distribuye por el bag `GameServices.fullscreenEnabled`** (campo nuevo):
  `main.ts` (composition root) lo resuelve y lo inyecta; **presentation no lee
  `import.meta.env` directo** (regla de capas intacta). Las 4 escenas pasan
  `services.fullscreenEnabled` como 3.er argumento de `SoundFullscreenControls`.
- **El componente queda honesto**: default del constructor ahora **`false`** y el JSDoc
  corregido — borra la afirmación falsa y documenta ADR-008. Cero chance de regresión
  silenciosa: el default por sí solo ya no muestra el botón.
- **`vite-env.d.ts`** tipa `readonly VITE_FULLSCREEN?: 'true' | 'false'` (solo tipos,
  sin lógica — la validación vive en `resolveFullscreenEnabled.ts`, igual que
  `VITE_ADS` → `resolveAdsMode.ts`).
- **`.env.example`** documenta el bloque comentado con el mapping; **spec red→verde**:
  `resolveFullscreenEnabled.spec.ts` (5 tests) + `SoundFullscreenControls.spec.ts`
  (4 tests — el rojo reproducía el bug: `Expected 1, Received 2`).

## Consecuencias

- **El botón de fullscreen propio solo existe en builds propias** (`portal`/`none`). En
  cualquier build de CrazyGames no aparece, ni aunque el `.env` esté desincronizado.
- **`console.warn` es la única señal** de que `.env` y modo quedaron desincronizados
  (no rompe el build ni el arranque — mismo contrato de warn de `resolveAdsMode`).
- **Los 4 call sites pasan el flag explícitamente** (`MainMenuScene`, `HowToPlayScene`,
  `DeckSelectionScene`, `UIScene`): una 5.ª escena que agregue
  `SoundFullscreenControls` tiene que decidir su 3.er argumento, y el default del
  constructor la protege (`false`).
- **En `portal`/`none` sin env tampoco hay botón**: el modo no lo fuerza, hace falta el
  `'true'` literal — la tool `/ads-adapter` lo escribe, un build a mano debe acordarse.
- La regla de CrazyGames queda **testeada como invariante** (5 tests del resolver: el
  modo manda sobre el env, el env sucio cae a `false` con warn), no solo documentada en
  un JSDoc.
- El ADR-007 queda referenciado, no modificado (comparte la mecánica de env + tool
  `/ads-adapter`, pero es una decisión propia: qué muestra el HUD, no qué adapter de ads
  corre).
