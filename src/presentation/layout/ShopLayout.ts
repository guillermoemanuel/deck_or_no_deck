import { getTouchHitSize, MIN_PHYSICAL_TOUCH_PX } from '../../shared/utils/CompactScreen';

/**
 * Geometría de la Tienda resuelta de forma PURA (sin Phaser) a partir del
 * piso de fuente compacto.
 *
 * Motivo: el juego se diseña en 1280×720 y en pantallas chicas el piso
 * global de `CompactScreen.getMinDesignFontPx` sube toda fuente por debajo
 * de ~12 px físicos (19 px de diseño a 800×450). Los anchos FIJOS de
 * ShopScene quedan entonces rotos: el botón de mazo de 120 px no entra a
 * 13 px subidos a 19, y las descripciones con wrap 280 pasan a más líneas
 * y se solapan con la fila siguiente. Acá se resuelve UNA sola geometría
 * (columnas, fuentes ya post-piso, botones medidos y scroll) para que
 * ShopScene la consuma en modo escritorio idéntico al actual o en modo
 * compacto de UNA columna con scroll.
 *
 * Fuente única de números: las constantes de escritorio de abajo están
 * congeladas desde ShopScene.ts — si cambian ahí, cambian acá (y el spec
 * las hace fallar).
 */

export type ShopTabMode = 'desktop' | 'compact';

export interface ShopLayoutInput {
  /** Piso de fuente en px de diseño (0 = sin piso, escritorio). */
  readonly fontFloor: number;
  /** px de diseño por px CSS (`game.scale.displayScale.x`). */
  readonly displayScale: number;
  /** Medidor de ancho de texto inyectado (la escena pasa el de Phaser). */
  readonly measure: (text: string, fontPx: number) => number;
}

/** Especificación de un texto de fila; `fontSize` YA viene post-piso. */
export interface ShopTextSpec {
  readonly fontSize: number;
  readonly bold: boolean;
  /** Ancho de wordWrap; 0 = sin wrap. */
  readonly wrapWidth: number;
  /** Máximo de líneas dibujadas; 0 = sin límite. */
  readonly maxLines: number;
}

export interface ShopButtonSpec {
  /** Tamaño de fuente del label; ya viene post-piso en modo compacto. */
  readonly fontPx: number;
  readonly height: number;
  /** Ancho del botón para una etiqueta concreta (medida real en compacto). */
  widthFor(label: string): number;
}

/** Offset horizontal (± centro del panel) de una columna de TEXTO. */
export interface ShopTextColumn {
  readonly textX: number;
}

export interface ShopThumbSpec {
  readonly width: number;
  readonly height: number;
}

export interface ShopTabLayout {
  readonly mode: ShopTabMode;
  readonly columns: readonly ShopTextColumn[];
  /** Filas por columna en escritorio; en compacto no aplica (ver cellPositionFor). */
  readonly rowsPerColumn: number;
  /** Offset vertical CRUDO de la primera fila (constante de escritorio). */
  readonly firstRowOffsetY: number;
  /** Paso vertical uniforme entre filas (alto de fila + aire en compacto). */
  readonly rowSpacing: number;
  /**
   * Y del caption de la pestaña (± centro del panel); `null` = SIN caption
   * — en compacto el hueco entre la tira de pestañas (con zona táctil
   * agrandada) y el área de scroll no admite una línea extra con fuentes
   * post-piso, y el label de la pestaña activa ya nombra la sección.
   */
  readonly captionY: number | null;
  /**
   * Aire vertical entre bloques de texto apilados en una celda (solo el
   * apilado compacto lo usa; en escritorio cada bloque tiene offset fijo).
   */
  readonly blockGap: number;
  /**
   * Bloque horizontal reservado al texto dentro de la celda (solo compacto;
   * en escritorio cada columna pinta en `textX` con su wrap y este campo es
   * null). El ancho se calcula contra el botón MÁS ancho posible del clamp
   * para que NINGUNA etiqueta lo invada.
   */
  readonly textBlock: { readonly x: number; readonly width: number } | null;
  /** Miniatura de la celda (solo pestaña Mazos; null en Mejoras). */
  readonly thumb: ShopThumbSpec | null;
  readonly name: ShopTextSpec;
  readonly description: ShopTextSpec | null;
  readonly status: ShopTextSpec;
  /**
   * Offsets verticales respecto del origen de fila en escritorio. En
   * compacto son null: la escena apila nombre→descripción→estado en flujo
   * (con linesFor/lineHeightFor) dentro de la celda centrada en rowOffsetY.
   */
  readonly nameOffsetY: number | null;
  readonly descriptionOffsetY: number | null;
  readonly statusOffsetY: number | null;
  readonly buttonOffsetY: number | null;
  /** Geometría de la acción de compra (ancho por etiqueta, fuente post-piso). */
  readonly button: ShopButtonSpec;
  /**
   * Líneas REALES que ocupa `text` al envolver en `spec` — misma función
   * que el root, copiada por tab para que el spec/escena consuman desde
   * la pestaña sin saltar al layout completo.
   */
  linesFor(text: string, spec: ShopTextSpec): number;
  /** Columna y fila (dentro de la columna) de la entrada `index`. */
  cellPositionFor(index: number): { readonly column: number; readonly row: number };
  /**
   * Offset horizontal (± centro del panel) del bloque de TEXTO de una
   * columna: en escritorio es `textX` (más el hueco de la miniatura en
   * Mazos, +54 = 46 + 8); en compacto ignora la columna y devuelve el
   * inicio del bloque reservado (textBlock.x).
   */
  textXFor(column: number): number;
  /**
   * Offset vertical (± centro del panel) de la fila. En escritorio es el y
   * del nombre — YA con el +30 que ShopScene suma al dibujar—; en compacto
   * es el centro de la celda.
   */
  rowOffsetY(row: number): number;
  /**
   * Centro horizontal del botón para una etiqueta. En escritorio ignora la
   * etiqueta (ancho fijo por columna); en compacto lo alinea al borde
   * derecho del contenido.
   */
  buttonXFor(label: string, column: number): number;
  /** Altura total del contenido de `rowCount` filas (base del scroll). */
  contentHeightFor(rowCount: number): number;
  /** Offset máximo de scroll para `rowCount` filas (0 si todo entra). */
  maxScrollFor(rowCount: number): number;
}

/** Cuerpo de un tab sin la función de medición (se propaga desde el root). */
export type ShopTabBody = Omit<ShopTabLayout, 'linesFor'>;

export interface ShopLayout {
  readonly mode: ShopTabMode;
  readonly panel: { readonly width: number; readonly height: number };
  /** Borde horizontal del área útil, relativo al centro del panel. */
  readonly content: { readonly left: number; readonly right: number; readonly width: number };
  /** Área de scroll (offsets ± centro); el consumidor la clipa según offset. */
  readonly scroll: { readonly top: number; readonly height: number };
  /**
   * Tira de pestañas Mejoras/Mazos. `height` es la ZONA TÁCTIL (≥44
   * físicos en compacto); `visualHeight` es el alto del chrome DIBUJADO,
   * que se congela en el valor de escritorio (34) en ambos modos — si el
   * chrome creciera junto a la zona táctil, en compacto la tira invadiría
   * el título del modal (MINOR de code-review).
   */
  readonly tabButton: { readonly width: number; readonly height: number; readonly visualHeight: number };
  /**
   * Círculo de cierre ✕. `radius` es la ZONA TÁCTIL; `visualRadius` el
   * radio dibujado, congelado en escritorio (16) en ambos modos — si el
   * círculo creciera con la táctil, en compacto taparía el borde superior
   * del panel y rozaría el título.
   */
  readonly closeButton: { readonly radius: number; readonly visualRadius: number };
  readonly upgrades: ShopTabLayout;
  readonly decks: ShopTabLayout;
  /** Líneas REALES que ocupa `text` al envolver en `spec` (medidas). */
  linesFor(text: string, spec: ShopTextSpec): number;
  /** Alto de línea de diseño: round(font * 1.45), el que usa ShopScene. */
  lineHeightFor(fontPx: number): number;
}

// ---------------------------------------------------------------------------
// Constantes congeladas desde ShopScene.ts (MODO ESCRITORIO — no mover sin
// actualizar la escena y este spec).
// ---------------------------------------------------------------------------

const PANEL_WIDTH = 940;
const PANEL_HEIGHT = 600;
const BUTTON_HEIGHT = 34;
const TAB_BUTTON_WIDTH = 160;
/** ✕ de escritorio: círculo r=16 (zona 32) — congelado, no confundir con BUTTON_HEIGHT. */
const DESKTOP_CLOSE_RADIUS = 16;
/** ShopScene dibuja la fila en `cy + FIRST_ROW_OFFSET_Y + 30 + row * SPACING`. */
const DESKTOP_ROW_RENDER_LAG = 30;
const DESKTOP_TEXT_FONT = 15;

const DESKTOP_UPGRADES_COLUMNS = [
  { textX: -450, buttonX: -90 },
  { textX: 20, buttonX: 380 }
] as const;
const DESKTOP_UPGRADES_ROWS_PER_COLUMN = 4;
const DESKTOP_UPGRADES_ROW_SPACING = 118;
const DESKTOP_UPGRADES_FIRST_ROW_OFFSET_Y = -190;
const DESKTOP_UPGRADES_BUTTON_WIDTH = 150;
const DESKTOP_UPGRADES_BUTTON_FONT = 15;
const DESKTOP_UPGRADES_NAME_FONT = 17;
const DESKTOP_UPGRADES_DESC_WRAP = 280;
const DESKTOP_UPGRADES_DESC_MAX_LINES = 3;
const DESKTOP_UPGRADES_DESC_OFFSET_Y = 18;
const DESKTOP_UPGRADES_STATUS_OFFSET_Y = 78;
const DESKTOP_UPGRADES_BUTTON_OFFSET_Y = 18;
/** Y del caption de la pestaña Mejoras (SHOP_UPGRADES_CAPTION, relativo al centro). */
const DESKTOP_UPGRADES_CAPTION_OFFSET_Y = -200;

const DESKTOP_DECKS_COLUMNS = [
  { textX: -444, buttonX: -218 },
  { textX: -144, buttonX: 82 },
  { textX: 156, buttonX: 382 }
] as const;
/** Filas de la grilla de Mazos: 11 entradas repartidas en 4 filas × 3 columnas (3+3+3+2). */
const DESKTOP_DECKS_ROWS_PER_COLUMN = 4;
const DESKTOP_DECKS_ROW_SPACING = 90;
const DESKTOP_DECKS_FIRST_ROW_OFFSET_Y = -170;
const DESKTOP_DECKS_BUTTON_WIDTH = 120;
const DESKTOP_DECKS_BUTTON_FONT = 13;
const DESKTOP_DECKS_NAME_FONT = 14;
const DESKTOP_DECKS_NAME_WRAP = 104;
const DESKTOP_DECKS_NAME_MAX_LINES = 2;
const DESKTOP_DECKS_NAME_OFFSET_Y = -14;
const DESKTOP_DECKS_STATUS_OFFSET_Y = 8;
/** Y del caption de la pestaña Mazos (SHOP_DECKS_CAPTION, relativo al centro). */
const DESKTOP_DECKS_CAPTION_OFFSET_Y = -199;

const THUMB_WIDTH = 46;
const THUMB_HEIGHT = 64;

// ---------------------------------------------------------------------------
// Constantes del MODO COMPACTO (1 columna + scroll).
// ---------------------------------------------------------------------------

/** Ancho del contenido compacto: panel 940 con 30 px de margen a cada lado. */
const COMPACT_CONTENT_WIDTH = 880;
/** Arranque del área de scroll, debajo del caption de pestaña. */
const COMPACT_SCROLL_TOP = -168;
const COMPACT_SCROLL_HEIGHT = 420;
/** Aire entre el borde superior del área y la primera celda. */
const COMPACT_CELL_TOP_GAP = 5;
/** Aire vertical entre celdas consecutivas (rowSpacing = rowHeight + esto). */
const COMPACT_ROW_GAP = 10;
/** Aire vertical entre bloques de texto de una misma celda. */
const COMPACT_BLOCK_GAP = 2;
/**
 * Aire horizontal entre bloques de la celda (miniatura/texto/botón) y
 * entre la miniatura de Mazos y su texto — el mismo 8 px que en escritorio
 * (textX + 54 = 46 de miniatura + 8, ver textXFor).
 */
const CELL_GAP = 8;
/** Piso del alto de celda para que una sola línea no quede apretada. */
const COMPACT_MIN_ROW_HEIGHT = 64;
const COMPACT_LINE_HEIGHT_FACTOR = 1.45;
const COMPACT_DESC_MAX_LINES = 3;
/** Presupuesto de líneas del nombre (el spec lo corta con maxLines). */
const COMPACT_UPGRADES_NAME_MAX_LINES = 1;
const COMPACT_DECKS_NAME_MAX_LINES = 2;
const COMPACT_BUTTON_PADDING = 28;
const COMPACT_BUTTON_MIN_WIDTH = 150;
const COMPACT_BUTTON_MAX_WIDTH = 300;
const COMPACT_MIN_TOUCH_PX = 34;

type Measure = (text: string, fontPx: number) => number;
interface ScrollArea {
  readonly top: number;
  readonly height: number;
}

// ---------------------------------------------------------------------------
// Resolución
// ---------------------------------------------------------------------------

export function resolveShopLayout(input: ShopLayoutInput): ShopLayout {
  const mode: ShopTabMode = input.fontFloor > 0 ? 'compact' : 'desktop';
  const scroll: ScrollArea = { top: COMPACT_SCROLL_TOP, height: COMPACT_SCROLL_HEIGHT };
  const content =
    mode === 'desktop'
      ? { left: -PANEL_WIDTH / 2, right: PANEL_WIDTH / 2, width: PANEL_WIDTH }
      : { left: -COMPACT_CONTENT_WIDTH / 2, right: COMPACT_CONTENT_WIDTH / 2, width: COMPACT_CONTENT_WIDTH };

  // Misma función de medición en cada tab (el spec/escena la consumen por
  // pestaña) — una sola fuente, propagada por spread a los dos tabs.
  const linesFor = makeLinesFor(input.measure);

  // Tira de pestañas y ✕: en escritorio congelados (34 / r=16); en compacto
  // heredan la zona táctil ≥44 físicos igual que los botones de fila.
  const tabHeight = mode === 'desktop' ? BUTTON_HEIGHT : compactButtonHeight(input.displayScale);
  const closeRadius = mode === 'desktop' ? DESKTOP_CLOSE_RADIUS : Math.ceil(tabHeight / 2);

  return {
    mode,
    panel: { width: PANEL_WIDTH, height: PANEL_HEIGHT },
    content,
    scroll,
    tabButton: { width: TAB_BUTTON_WIDTH, height: tabHeight, visualHeight: BUTTON_HEIGHT },
    closeButton: { radius: closeRadius, visualRadius: DESKTOP_CLOSE_RADIUS },
    upgrades:
      mode === 'desktop'
        ? { ...desktopUpgradesTab(), linesFor }
        : { ...compactUpgradesTab(input, content, scroll), linesFor },
    decks:
      mode === 'desktop'
        ? { ...desktopDecksTab(), linesFor }
        : { ...compactDecksTab(input, content, scroll), linesFor },
    linesFor,
    lineHeightFor: fontPx => Math.round(fontPx * COMPACT_LINE_HEIGHT_FACTOR)
  };
}

/**
 * Offset de scroll acotado a 0..maxScroll. Segura con maxScroll <= 0 (no
 * hay scroll ⇒ 0) y con valores no finitos (⇒ 0): la usa el componente de
 * scroll tras cada rueda/drag.
 */
export function clampScrollOffset(offset: number, maxScroll: number): number {
  const max = Number.isFinite(maxScroll) && maxScroll > 0 ? maxScroll : 0;
  if (!Number.isFinite(offset)) {
    return 0;
  }
  return Math.min(Math.max(offset, 0), max);
}

/**
 * Offset que deja VISIBLE la fila centrada en `rowY` con semialtura
 * `halfHeight`, partiendo del offset actual (scroll-into-view del foco de
 * teclado — Fase 4). Aditivo: NO toca la geometría congelada.
 *
 * Motivo: `ScrollableList.syncInputToWindow` deja `setVisible(false)` a lo
 * que queda FUERA de la ventana de scroll — sin esto, navegar filas con ↑↓
 * podía enfocar una fila INVISIBLE (el foco no puede quedar oculto).
 *
 * Contrato: si la fila ya cabe (borde exacto contra el borde de la ventana
 * = visible, comparación estricta igual que el clip) devuelve el offset
 * actual SIN tocarlo; si no cabe, se mueve lo mínimo (el borde que
 * recortaba queda a ras del borde de la ventana) y el resultado se acota
 * al MISMO rango de toda la tienda delegando en `clampScrollOffset`
 * (fuente única, seguro con maxScroll <= 0 y valores no finitos).
 */
export function scrollOffsetToReveal(
  offset: number,
  rowY: number,
  halfHeight: number,
  scroll: ScrollArea,
  maxScroll: number
): number {
  const windowTop = scroll.top + offset;
  const windowBottom = scroll.top + scroll.height + offset;
  const rowTop = rowY - halfHeight;
  const rowBottom = rowY + halfHeight;

  if (rowTop >= windowTop && rowBottom <= windowBottom) {
    return offset;
  }

  const target =
    rowTop < windowTop ? rowTop - scroll.top : rowBottom - scroll.top - scroll.height;
  return clampScrollOffset(target, maxScroll);
}

function makeLinesFor(measure: Measure) {
  return (text: string, spec: ShopTextSpec): number => {
    if (spec.wrapWidth <= 0) {
      return 1;
    }
    const measured = Math.ceil(measure(text, spec.fontSize) / spec.wrapWidth);
    const capped = spec.maxLines > 0 ? Math.min(measured, spec.maxLines) : measured;
    return Math.max(1, capped);
  };
}

// ---------------------------------------------------------------------------
// Modo escritorio: geometría EXACTA de ShopScene de hoy (sin scroll).
// ---------------------------------------------------------------------------

function desktopUpgradesTab(): ShopTabBody {
  return {
    mode: 'desktop',
    columns: DESKTOP_UPGRADES_COLUMNS.map(column => ({ textX: column.textX })),
    rowsPerColumn: DESKTOP_UPGRADES_ROWS_PER_COLUMN,
    firstRowOffsetY: DESKTOP_UPGRADES_FIRST_ROW_OFFSET_Y,
    rowSpacing: DESKTOP_UPGRADES_ROW_SPACING,
    captionY: DESKTOP_UPGRADES_CAPTION_OFFSET_Y,
    // En escritorio cada bloque tiene offset fijo (nameOffsetY/descriptionOffsetY/
    // statusOffsetY): blockGap no se usa para apilar.
    blockGap: 0,
    textBlock: null,
    thumb: null,
    name: { fontSize: DESKTOP_UPGRADES_NAME_FONT, bold: true, wrapWidth: 0, maxLines: 0 },
    description: {
      fontSize: DESKTOP_TEXT_FONT,
      bold: false,
      wrapWidth: DESKTOP_UPGRADES_DESC_WRAP,
      maxLines: DESKTOP_UPGRADES_DESC_MAX_LINES
    },
    status: { fontSize: DESKTOP_TEXT_FONT, bold: false, wrapWidth: 0, maxLines: 0 },
    nameOffsetY: 0,
    descriptionOffsetY: DESKTOP_UPGRADES_DESC_OFFSET_Y,
    statusOffsetY: DESKTOP_UPGRADES_STATUS_OFFSET_Y,
    buttonOffsetY: DESKTOP_UPGRADES_BUTTON_OFFSET_Y,
    button: {
      fontPx: DESKTOP_UPGRADES_BUTTON_FONT,
      height: BUTTON_HEIGHT,
      widthFor: () => DESKTOP_UPGRADES_BUTTON_WIDTH
    },
    cellPositionFor: index => ({
      column: Math.floor(index / DESKTOP_UPGRADES_ROWS_PER_COLUMN),
      row: index % DESKTOP_UPGRADES_ROWS_PER_COLUMN
    }),
    // Mejoras: nombre/descripción/estado todos en textX (sin miniatura).
    textXFor: column => DESKTOP_UPGRADES_COLUMNS[column].textX,
    rowOffsetY: row =>
      DESKTOP_UPGRADES_FIRST_ROW_OFFSET_Y + DESKTOP_ROW_RENDER_LAG + row * DESKTOP_UPGRADES_ROW_SPACING,
    buttonXFor: (_label, column) => DESKTOP_UPGRADES_COLUMNS[column].buttonX,
    contentHeightFor: rowCount => rowCount * DESKTOP_UPGRADES_ROW_SPACING,
    maxScrollFor: () => 0
  };
}

function desktopDecksTab(): ShopTabBody {
  return {
    mode: 'desktop',
    columns: DESKTOP_DECKS_COLUMNS.map(column => ({ textX: column.textX })),
    rowsPerColumn: DESKTOP_DECKS_ROWS_PER_COLUMN,
    firstRowOffsetY: DESKTOP_DECKS_FIRST_ROW_OFFSET_Y,
    rowSpacing: DESKTOP_DECKS_ROW_SPACING,
    captionY: DESKTOP_DECKS_CAPTION_OFFSET_Y,
    // En escritorio cada bloque tiene offset fijo (nameOffsetY/statusOffsetY):
    // blockGap no se usa para apilar.
    blockGap: 0,
    textBlock: null,
    thumb: { width: THUMB_WIDTH, height: THUMB_HEIGHT },
    name: {
      fontSize: DESKTOP_DECKS_NAME_FONT,
      bold: true,
      wrapWidth: DESKTOP_DECKS_NAME_WRAP,
      maxLines: DESKTOP_DECKS_NAME_MAX_LINES
    },
    description: null,
    status: { fontSize: DESKTOP_TEXT_FONT, bold: false, wrapWidth: 0, maxLines: 0 },
    nameOffsetY: DESKTOP_DECKS_NAME_OFFSET_Y,
    descriptionOffsetY: null,
    statusOffsetY: DESKTOP_DECKS_STATUS_OFFSET_Y,
    buttonOffsetY: 0,
    button: {
      fontPx: DESKTOP_DECKS_BUTTON_FONT,
      height: BUTTON_HEIGHT,
      widthFor: () => DESKTOP_DECKS_BUTTON_WIDTH
    },
    // Mazos: la posición se lee por ÍNDICE dentro de la FILA (no por
    // columna como en Mejoras): las 3 primeras filas se llenan de a 3 y
    // las 11 entradas terminan en 4 filas (3+3+3+2). Por eso el módulo es
    // por CANTIDAD DE COLUMNAS y no por filas-por-columna.
    cellPositionFor: index => ({
      column: index % DESKTOP_DECKS_COLUMNS.length,
      row: Math.floor(index / DESKTOP_DECKS_COLUMNS.length)
    }),
    // Mazos: nombre/estado arrancan a la derecha de la miniatura (textX + 54
    // = miniatura 46 + aire 8, ver renderDeckRow actual).
    textXFor: column => DESKTOP_DECKS_COLUMNS[column].textX + THUMB_WIDTH + CELL_GAP,
    rowOffsetY: row => DESKTOP_DECKS_FIRST_ROW_OFFSET_Y + DESKTOP_ROW_RENDER_LAG + row * DESKTOP_DECKS_ROW_SPACING,
    buttonXFor: (_label, column) => DESKTOP_DECKS_COLUMNS[column].buttonX,
    contentHeightFor: rowCount => rowCount * DESKTOP_DECKS_ROW_SPACING,
    maxScrollFor: () => 0
  };
}

// ---------------------------------------------------------------------------
// Modo compacto: 1 columna, fuentes post-piso, botón medido y scroll.
// ---------------------------------------------------------------------------

/**
 * Alto de la zona táctil del botón (px de diseño).
 *
 * Se reutiliza `getTouchHitSize`, pero su tope MAX_DESIGN_TOUCH_PX (64)
 * existe para no pisar botones VECINOS — y en una grilla de UNA columna no
 * los hay. Con ese tope, un teléfono muy reducido quedaría en 40 px
 * físicos (64 / 1.6), por debajo del mínimo de 44; por eso se queda con el
 * MAYOR entre el helper y el mínimo físico real redondeado hacia arriba.
 */
function compactButtonHeight(displayScale: number): number {
  return Math.max(
    COMPACT_MIN_TOUCH_PX,
    getTouchHitSize(MIN_PHYSICAL_TOUCH_PX, displayScale),
    Math.ceil(MIN_PHYSICAL_TOUCH_PX * displayScale)
  );
}

/** Ancho del botón: la etiqueta SE MIDE (el label trae el precio dinámico). */
function compactButtonWidthFor(measure: Measure, buttonFont: number, label: string): number {
  const wanted = Math.round(measure(label, buttonFont) + COMPACT_BUTTON_PADDING);
  return Math.min(COMPACT_BUTTON_MAX_WIDTH, Math.max(COMPACT_BUTTON_MIN_WIDTH, wanted));
}

/**
 * Borde derecho del bloque de texto: deja libre el botón MÁS ancho posible
 * (tope del clamp) + aire, así ninguna etiqueta invade el texto.
 */
function compactTextRight(contentRight: number): number {
  return contentRight - COMPACT_BUTTON_MAX_WIDTH - CELL_GAP;
}

/** Filas compactas con scroll: paso uniforme y primera celda dentro del área. */
function compactScrollGeometry(
  scroll: ScrollArea,
  rowHeight: number
): { rowSpacing: number; firstRowOffsetY: number; maxScrollFor(rowCount: number): number } {
  const rowSpacing = rowHeight + COMPACT_ROW_GAP;
  return {
    rowSpacing,
    firstRowOffsetY: scroll.top + COMPACT_CELL_TOP_GAP + rowHeight / 2,
    maxScrollFor: rowCount => Math.max(0, rowCount * rowSpacing - scroll.height)
  };
}

function compactUpgradesTab(input: ShopLayoutInput, content: { left: number; right: number }, scroll: ScrollArea): ShopTabBody {
  const floor = input.fontFloor;
  const nameFont = Math.max(DESKTOP_UPGRADES_NAME_FONT, floor);
  const descFont = Math.max(DESKTOP_TEXT_FONT, floor);
  const statusFont = Math.max(DESKTOP_TEXT_FONT, floor);
  const buttonFont = Math.max(DESKTOP_UPGRADES_BUTTON_FONT, floor);

  const textX = content.left;
  const textBlock = { x: textX, width: compactTextRight(content.right) - textX };
  const buttonHeight = compactButtonHeight(input.displayScale);

  // Presupuesto de PEOR CASO (nombre 1 línea + descripción en su máximo de
  // 3 + estado): con eso se calcula el paso uniforme. Es la garantía de que
  // una fila real —con menos líneas— nunca invade a la siguiente.
  const nameLH = Math.round(nameFont * COMPACT_LINE_HEIGHT_FACTOR);
  const descLH = Math.round(descFont * COMPACT_LINE_HEIGHT_FACTOR);
  const statusLH = Math.round(statusFont * COMPACT_LINE_HEIGHT_FACTOR);
  const rowHeight = Math.max(
    COMPACT_MIN_ROW_HEIGHT,
    COMPACT_UPGRADES_NAME_MAX_LINES * nameLH + COMPACT_BLOCK_GAP + COMPACT_DESC_MAX_LINES * descLH + COMPACT_BLOCK_GAP + statusLH
  );
  const scrollGeometry = compactScrollGeometry(scroll, rowHeight);

  return {
    mode: 'compact',
    columns: [{ textX }],
    rowsPerColumn: 1,
    firstRowOffsetY: scrollGeometry.firstRowOffsetY,
    rowSpacing: scrollGeometry.rowSpacing,
    // Sin caption en compacto: el hueco tira-de-pestañas → área de scroll
    // no admite una línea extra con fuentes post-piso, y el label "Mejoras"
    // de la pestaña activa ya nombra la sección.
    captionY: null,
    blockGap: COMPACT_BLOCK_GAP,
    textBlock,
    thumb: null,
    name: { fontSize: nameFont, bold: true, wrapWidth: 0, maxLines: COMPACT_UPGRADES_NAME_MAX_LINES },
    description: { fontSize: descFont, bold: false, wrapWidth: textBlock.width, maxLines: COMPACT_DESC_MAX_LINES },
    status: { fontSize: statusFont, bold: false, wrapWidth: 0, maxLines: 0 },
    nameOffsetY: null,
    descriptionOffsetY: null,
    statusOffsetY: null,
    buttonOffsetY: 0,
    button: {
      fontPx: buttonFont,
      height: buttonHeight,
      widthFor: (label: string) => compactButtonWidthFor(input.measure, buttonFont, label)
    },
    cellPositionFor: index => ({ column: 0, row: index }),
    textXFor: () => textBlock.x,
    rowOffsetY: row => scrollGeometry.firstRowOffsetY + row * scrollGeometry.rowSpacing,
    buttonXFor: (label: string, _column: number) =>
      content.right - compactButtonWidthFor(input.measure, buttonFont, label) / 2,
    contentHeightFor: rowCount => rowCount * scrollGeometry.rowSpacing,
    maxScrollFor: scrollGeometry.maxScrollFor
  };
}

function compactDecksTab(input: ShopLayoutInput, content: { left: number; right: number }, scroll: ScrollArea): ShopTabBody {
  const floor = input.fontFloor;
  const nameFont = Math.max(DESKTOP_DECKS_NAME_FONT, floor);
  const statusFont = Math.max(DESKTOP_TEXT_FONT, floor);
  const buttonFont = Math.max(DESKTOP_DECKS_BUTTON_FONT, floor);

  const textX = content.left;
  const textBlockStart = textX + THUMB_WIDTH + CELL_GAP;
  const textBlock = { x: textBlockStart, width: compactTextRight(content.right) - textBlockStart };
  const buttonHeight = compactButtonHeight(input.displayScale);

  // PEOR CASO: nombre en su máximo de 2 líneas + estado, sin bajar del
  // alto de la miniatura (64 px) — ver comentario en compactUpgradesTab.
  const nameLH = Math.round(nameFont * COMPACT_LINE_HEIGHT_FACTOR);
  const statusLH = Math.round(statusFont * COMPACT_LINE_HEIGHT_FACTOR);
  const rowHeight = Math.max(
    COMPACT_MIN_ROW_HEIGHT,
    THUMB_HEIGHT,
    COMPACT_DECKS_NAME_MAX_LINES * nameLH + COMPACT_BLOCK_GAP + statusLH
  );
  const scrollGeometry = compactScrollGeometry(scroll, rowHeight);

  return {
    mode: 'compact',
    columns: [{ textX }],
    rowsPerColumn: 1,
    firstRowOffsetY: scrollGeometry.firstRowOffsetY,
    rowSpacing: scrollGeometry.rowSpacing,
    // Sin caption en compacto — ver comentario en compactUpgradesTab.
    captionY: null,
    blockGap: COMPACT_BLOCK_GAP,
    textBlock,
    thumb: { width: THUMB_WIDTH, height: THUMB_HEIGHT },
    name: { fontSize: nameFont, bold: true, wrapWidth: textBlock.width, maxLines: COMPACT_DECKS_NAME_MAX_LINES },
    description: null,
    status: { fontSize: statusFont, bold: false, wrapWidth: 0, maxLines: 0 },
    nameOffsetY: null,
    descriptionOffsetY: null,
    statusOffsetY: null,
    buttonOffsetY: 0,
    button: {
      fontPx: buttonFont,
      height: buttonHeight,
      widthFor: (label: string) => compactButtonWidthFor(input.measure, buttonFont, label)
    },
    cellPositionFor: index => ({ column: 0, row: index }),
    // Mazos compactos: la miniatura ocupa textX y el texto arranca en el
    // bloque reservado (textBlock.x = textX + miniatura + aire).
    textXFor: () => textBlock.x,
    rowOffsetY: row => scrollGeometry.firstRowOffsetY + row * scrollGeometry.rowSpacing,
    buttonXFor: (label: string, _column: number) =>
      content.right - compactButtonWidthFor(input.measure, buttonFont, label) / 2,
    contentHeightFor: rowCount => rowCount * scrollGeometry.rowSpacing,
    maxScrollFor: scrollGeometry.maxScrollFor
  };
}
