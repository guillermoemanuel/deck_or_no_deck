# ADR-017: Tienda adaptativa por piso de fuentes (ShopLayout + ScrollableList)

**Estado:** Aceptada · **Registrada:** 2026-10-11 · **Unidad:** tienda móvil: modo
compacto con scroll (2 commits: `6bd9b24` ShopLayout + spec · `788870f` ScrollableList +
integración en `ShopScene`)

## Contexto

La tienda (`ShopScene`, la escena más grande del proyecto y **sin test**) dibujaba con
constantes de escritorio: panel 940×600, Mejoras en 2 columnas, Mazos en 3 columnas
(pitch 300) y botones de 150/120×34. En un iframe de portal o en un móvil con
`displayScale` alto (`getMinDesignFontPx` de `shared/utils/CompactScreen` sube el piso
de fuentes a 17-19 px) la grilla no entra: las filas se pisan, los botones quedan por
debajo del panel y no hay scroll que lo salve. Tres problemas de fondo:

- **La geometría vivía pintada a mano en la escena** (offsets, pitches, tamaños), donde
  nada está testeado: cualquier ajuste era a pulso y regresivo.
- **Un breakpoint de resolución habría sido la solución obvia pero frágil**: la
  variable real que rompe el layout es el **piso de fuentes** (densidad de pantalla ×
  tamaño), no el ancho en píxeles — 800×450 con escala 1 y con escala 2 no necesitan
  la misma compensación.
- **No existía un componente de scroll**: Phaser no da scroll de contenedor; cada escena
  que lo necesite reescribiría drag/rueda/máscara por su cuenta (copia número N+1).

## Decisión

- **(a) La geometría se resuelve por el piso de fuentes, no por breakpoints.**
  `ShopLayout.resolveShopLayout(input)` recibe `fontFloor` (el valor de
  `getMinDesignFontPx(displayScale)`) y devuelve toda la geometría: panel, columnas,
  offsets, fuentes, botones, scroll. **Dos modos**: `fontFloor === 0` → desktop; si no →
  compacto. No hay estado intermedio ni tercera variante.
- **(b) `presentation/layout/ShopLayout.ts` es la fuente única de la geometría de la
  tienda** (587 L, helper **puro sin Phaser**, con `measure` inyectado para medir textos
  post-piso). El modo **desktop congela las constantes históricas al centavo** (panel
  940×600, Mejoras 2 col/4 filas, Mazos 3 col pitch 300, botones 150/120×34, sin
  scroll) — su spec (`ShopLayout.spec.ts`, 23 tests) es el guardián: si alguien mueve una
  constante de escritorio, el test falla. El modo **compacto** = 1 columna, contenido
  880 px centrado, botón con **ancho por etiqueta** (clamp 150-300) y zona táctil
  **≥44 px físicos**, `maxScroll` por nº de filas + `clampScrollOffset(offset)`.
- **(c) Chrome visual congelado vs zona táctil que crece.** `tabButton.visualHeight = 34`
  y `closeButton.visualRadius = 16` son **idénticos en ambos modos** (el jugador ve la
  misma tienda); lo que crece en compacto es solo la **zona táctil** (hit area), que
  alcanza 44 px físicos reales.
- **(d) `presentation/components/ScrollableList.ts` es el componente compartido de scroll
  vertical** (292 L): drag con umbral **8 px** exportado como `DRAG_THRESHOLD_PX`
  (fuente única), rueda **topOnly** (la rueda sobre un botón NO scrollea), touch,
  máscara de geometría, clip de input de hijos fuera de la ventana y flag `wasDragging`
  **anti-click-fantasma** (arrastrar sobre "Comprar" no compra ni suena; pestañas y ✕
  tienen el mismo guard). En compacto `ShopScene` dibuja **ambos tabs** dentro de un
  `ScrollableList`; `scale.on('resize')` (patrón de `UIScene`, desuscripto en SHUTDOWN)
  re-resuelve el layout, re-pinta la pestaña y re-tamaña las zonas táctiles del chrome si
  cambió el modo.
- **(e) `UiSfx.bindUiClick(target, audio?, shouldPlay?)`** gana un guard **opcional**
  `shouldPlay` retro-compatible (los 11 call sites existentes quedan intactos): es lo que
  permite que un drag que termina sobre un botón no suene click.
- **(f) Límite aceptado, no rediseñado:** con `displayScale` ≥ ~2.9 la tira de pestañas
  invade la ventana de scroll/título en modo compacto. Decisión: **no** rediseñar el
  chrome por ese caso (raro y costoso); queda registrado en `PLAYBOOK.md` §3.

## Consecuencias

- **Prohibido hardcodear geometría de tienda en `ShopScene`**: offsets, pitches y
  tamaños salen de `resolveShopLayout`; cambiar el layout = cambiar `ShopLayout.ts` +
  su spec (el modo desktop está congelado a propósito). La escena quedó en 996 → **1.310 L**
  pero la geometría ya no es suya.
- **`ScrollableList` es el primer candidato a reusar** en cualquier lista que quepa mal
  en móvil (p. ej. `BankerOfferPanel`): no escribir drag/scroll a mano en otra escena
  (regla en `PLAYBOOK.md` §1).
- **26 tests nuevos → 715** (`ShopLayout.spec` 23 + 3 en `UiSfx.spec` por `shouldPlay`);
  **64 archivos `*.spec.ts`**. `ScrollableList` quedó **sin spec propio**: su lógica
  testeada (geometría, scroll máximo, clamps) vive en `ShopLayout.spec`; el comportamiento
  de puntero se cubre con el **smoke visual** (`docs/testing.md` §5, ítem 14).
- **Pendiente de usuario: smoke visual** — desktop 1280×720 idéntico a antes (sin
  scroll); 800×450 con 1 columna y scroll; arrastrar sobre "Comprar" no compra; resize
  repinta; táctiles ≥44 físicos.
- **Dos decisiones de interacción explícitas** para que no se "mejoren" por error: la
  rueda es **topOnly** (drag/touch son los caminos principales en móvil) y el umbral de
  arrastre es **8 px en `DRAG_THRESHOLD_PX`** (no re-declararlo en otra escena).
