/**
 * Utilidades puras (sin Phaser) para adaptar la UI a pantallas chicas.
 *
 * El juego se diseña en 1280×720 y Phaser lo escala con FIT. En un teléfono
 * en horizontal (~390 px de alto) el factor real es ~0.54: un texto de 17 px
 * de diseño se ve de ~9 px físicos y un botón de 48 px, de ~26 px. Todas las
 * funciones de acá reciben `displayScale` = px de DISEÑO por px CSS
 * (`game.scale.displayScale.x` en Phaser): 1 en un monitor a 720p, ~1.85 en
 * un teléfono de 390 px de alto.
 */

/** Tamaño mínimo de texto legible, medido en px CSS reales de pantalla. */
export const MIN_PHYSICAL_FONT_PX = 12;
/** Tope del piso en px de diseño: más que esto rompería layouts de ancho fijo. */
export const MAX_DESIGN_FONT_FLOOR_PX = 24;
/** Tamaño táctil recomendado (px CSS reales). */
export const MIN_PHYSICAL_TOUCH_PX = 44;
/** Tope del área táctil en px de diseño: por encima se solaparía con botones vecinos. */
export const MAX_DESIGN_TOUCH_PX = 64;

function isShrunk(displayScale: number): boolean {
  return Number.isFinite(displayScale) && displayScale > 1;
}

/**
 * Piso de tamaño de fuente (px de diseño) para que el texto llegue a
 * `MIN_PHYSICAL_FONT_PX` en pantalla. Devuelve 0 (= sin piso) cuando el
 * juego no se está reduciendo, así el escritorio queda idéntico.
 */
export function getMinDesignFontPx(displayScale: number): number {
  if (!isShrunk(displayScale)) {
    return 0;
  }
  return Math.min(MAX_DESIGN_FONT_FLOOR_PX, Math.round(MIN_PHYSICAL_FONT_PX * displayScale));
}

/**
 * Sube `fontSize` al piso si es menor. Solo toca valores en `px` (o números);
 * cualquier otra unidad se devuelve tal cual. Conserva el tipo recibido.
 */
export function applyFontFloor<T extends string | number>(fontSize: T, floorPx: number): T | string | number {
  if (floorPx <= 0) {
    return fontSize;
  }
  if (typeof fontSize === 'number') {
    return fontSize < floorPx ? floorPx : fontSize;
  }
  const match = /^\s*(\d+(?:\.\d+)?)px\s*$/.exec(fontSize);
  if (!match) {
    return fontSize;
  }
  return Number(match[1]) < floorPx ? `${floorPx}px` : fontSize;
}

/**
 * Lado del área táctil (px de diseño): nunca menor a `baseSize`, y crece
 * hasta `MIN_PHYSICAL_TOUCH_PX` reales sin pasar de `MAX_DESIGN_TOUCH_PX`.
 */
export function getTouchHitSize(baseSize: number, displayScale: number): number {
  if (!isShrunk(displayScale)) {
    return baseSize;
  }
  const wanted = Math.min(MAX_DESIGN_TOUCH_PX, Math.round(MIN_PHYSICAL_TOUCH_PX * displayScale));
  return Math.max(baseSize, wanted);
}
