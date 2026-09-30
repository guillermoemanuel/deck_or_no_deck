# ADR-004: La elección manual de idioma se persiste siempre

**Estado:** Aceptada · **Registrada:** 2026-09-30 (commit `fa036a3`)

## Contexto
`LanguageManager.applyDetectedLocale()` solo aplica el locale del SDK cuando **no hay**
idioma persistido en `localStorage` (así CrazyGames pide usar el locale del sistema, pero
una elección explícita del jugador siempre gana).

`setLanguage()` hacía *early return* sin persistir cuando el código coincidía con el
idioma activo. Como el default es `'en'`, elegir "English" a propósito **no dejaba rastro**:
en la próxima carga la detección veía "nadie eligió nada" y aplicaba `es-AR` del SDK
**por encima de la decisión del jugador**. Lo capturaba el test
`applyDetectedLocale › does NOT override a language the player already picked manually`.

## Decisión
`setLanguage()` persiste **siempre** (vía el nuevo helper privado `persistLanguage()`),
incluso cuando el código coincide con el activo; **no** emite `onLanguageChanged` en ese
caso porque el texto en pantalla no cambió.

## Consecuencias
- La elección explícita sobrevive a recargas y a la detección del SDK.
- Se mantiene el contrato: *detección nunca pisa una elección guardada*.
- La escritura sigue siendo tolerante a storage bloqueado (solo warn).
