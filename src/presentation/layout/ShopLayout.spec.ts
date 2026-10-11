import { clampScrollOffset, resolveShopLayout } from './ShopLayout';

/**
 * Medidor fake inyectado: ancho lineal (0.55 px por px de fuente por
 * carácter). Determinista y suficiente para decidir líneas de wrap y el
 * ancho del botón en tests.
 */
const fakeMeasure = (text: string, fontPx: number): number => text.length * fontPx * 0.55;

/** Etiqueta más larga posible del catálogo (chessmaster, price 30000). */
const LONGEST_BUY_LABEL = 'Comprar $30.000';

const desktop = resolveShopLayout({ fontFloor: 0, displayScale: 1, measure: fakeMeasure });
const compact19 = resolveShopLayout({ fontFloor: 19, displayScale: 1.6, measure: fakeMeasure });

describe('resolveShopLayout — escritorio (fontFloor = 0)', () => {
  it('congela la geometría ACTUAL de ShopScene: panel, grillas y offsets', () => {
    expect(desktop.mode).toBe('desktop');
    expect(desktop.panel).toEqual({ width: 940, height: 600 });
    // En escritorio el contenido llena el panel completo (±470).
    expect(desktop.content).toEqual({ left: -470, right: 470, width: 940 });

    // Mejoras: COLUMN_OFFSETS textX -450/20, buttonX -90/380, 4 filas por
    // columna, ROW_SPACING_Y 118, FIRST_ROW_OFFSET_Y -190.
    expect(desktop.upgrades.columns.map(column => column.textX)).toEqual([-450, 20]);
    expect(desktop.upgrades.buttonXFor(LONGEST_BUY_LABEL, 0)).toBe(-90);
    expect(desktop.upgrades.buttonXFor(LONGEST_BUY_LABEL, 1)).toBe(380);
    expect(desktop.upgrades.rowsPerColumn).toBe(4);
    expect(desktop.upgrades.rowSpacing).toBe(118);
    expect(desktop.upgrades.firstRowOffsetY).toBe(-190);
    // rowOffsetY ya incluye el +30 que ShopScene suma al dibujar.
    expect(desktop.upgrades.rowOffsetY(0)).toBe(-160);
    expect(desktop.upgrades.rowOffsetY(1)).toBe(-42);

    // Mazos: 3 columnas con pitch 300 (textX -444/-144/156, buttonX
    // -218/82/382), ROW_SPACING_Y 90, FIRST_ROW_OFFSET_Y -170.
    expect(desktop.decks.columns.map(column => column.textX)).toEqual([-444, -144, 156]);
    expect(desktop.decks.buttonXFor(LONGEST_BUY_LABEL, 0)).toBe(-218);
    expect(desktop.decks.buttonXFor(LONGEST_BUY_LABEL, 1)).toBe(82);
    expect(desktop.decks.buttonXFor(LONGEST_BUY_LABEL, 2)).toBe(382);
    expect(desktop.decks.rowsPerColumn).toBe(3);
    expect(desktop.decks.rowSpacing).toBe(90);
    expect(desktop.decks.firstRowOffsetY).toBe(-170);
    expect(desktop.decks.rowOffsetY(0)).toBe(-140);
    expect(desktop.decks.rowOffsetY(1)).toBe(-50);
  });

  it('congela los textos y offsets verticales de cada fila', () => {
    // Mejoras: nombre 17 bold, desc 15 wrap 280 máx 3 líneas, estado 15 en
    // y+78 (nombre y+0, descripción y+18, botón y+18).
    expect(desktop.upgrades.name).toEqual({ fontSize: 17, bold: true, wrapWidth: 0, maxLines: 0 });
    expect(desktop.upgrades.description).toEqual({ fontSize: 15, bold: false, wrapWidth: 280, maxLines: 3 });
    expect(desktop.upgrades.status).toEqual({ fontSize: 15, bold: false, wrapWidth: 0, maxLines: 0 });
    expect(desktop.upgrades.nameOffsetY).toBe(0);
    expect(desktop.upgrades.descriptionOffsetY).toBe(18);
    expect(desktop.upgrades.statusOffsetY).toBe(78);
    expect(desktop.upgrades.buttonOffsetY).toBe(18);
    expect(desktop.upgrades.thumb).toBeNull();

    // Mazos: nombre 14 bold wrap 104 máx 2 líneas (en y-14), precio 15
    // (en y+8), botón en y+0, miniatura 46×64.
    expect(desktop.decks.name).toEqual({ fontSize: 14, bold: true, wrapWidth: 104, maxLines: 2 });
    expect(desktop.decks.description).toBeNull();
    expect(desktop.decks.status).toEqual({ fontSize: 15, bold: false, wrapWidth: 0, maxLines: 0 });
    expect(desktop.decks.nameOffsetY).toBe(-14);
    expect(desktop.decks.statusOffsetY).toBe(8);
    expect(desktop.decks.buttonOffsetY).toBe(0);
    expect(desktop.decks.thumb).toEqual({ width: 46, height: 64 });
  });

  it('congela los botones fijos (150×34 font 15 en Mejoras, 120×34 font 13 en Mazos)', () => {
    // En escritorio el ancho es CONSTANTE: no se mide la etiqueta.
    expect(desktop.upgrades.button.widthFor(LONGEST_BUY_LABEL)).toBe(150);
    expect(desktop.upgrades.button.fontPx).toBe(15);
    expect(desktop.upgrades.button.height).toBe(34);
    expect(desktop.decks.button.widthFor(LONGEST_BUY_LABEL)).toBe(120);
    expect(desktop.decks.button.fontPx).toBe(13);
    expect(desktop.decks.button.height).toBe(34);
  });

  it('no genera scroll ni bloque de texto reservado', () => {
    expect(desktop.upgrades.maxScrollFor(8)).toBe(0);
    expect(desktop.decks.maxScrollFor(11)).toBe(0);
    expect(desktop.upgrades.contentHeightFor(8)).toBe(8 * desktop.upgrades.rowSpacing);
    expect(desktop.upgrades.textBlock).toBeNull();
    expect(desktop.decks.textBlock).toBeNull();
  });

  it('reparte el índice de entrada en columna/fila como la escena hoy', () => {
    expect(desktop.decks.cellPositionFor(0)).toEqual({ column: 0, row: 0 });
    expect(desktop.decks.cellPositionFor(3)).toEqual({ column: 1, row: 0 });
    expect(desktop.decks.cellPositionFor(4)).toEqual({ column: 1, row: 1 });
    expect(desktop.decks.cellPositionFor(10)).toEqual({ column: 3, row: 1 });
  });
});

describe('resolveShopLayout — compacto (fontFloor = 19, displayScale = 1.6)', () => {
  it('resuelve UNA columna y contenido de 880px centrado dentro del panel ±470', () => {
    expect(compact19.mode).toBe('compact');
    expect(compact19.upgrades.mode).toBe('compact');
    expect(compact19.decks.mode).toBe('compact');
    expect(compact19.content).toEqual({ left: -440, right: 440, width: 880 });

    // 1 columna en ambas pestañas, con el MISMO textX (-440).
    expect(compact19.upgrades.columns).toHaveLength(1);
    expect(compact19.decks.columns).toHaveLength(1);
    expect(compact19.upgrades.columns[0].textX).toBe(-440);
    expect(compact19.decks.columns[0].textX).toBe(-440);

    // Área de scroll bajo el caption: fija en diseño (el Commit 2 la clipa).
    expect(compact19.scroll.top).toBe(-168);
    expect(compact19.scroll.height).toBe(420);
  });

  it('mantiene cada rectángulo de celda dentro de ±470 horizontales', () => {
    [compact19.upgrades, compact19.decks].forEach(tab => {
      const width = tab.button.widthFor(LONGEST_BUY_LABEL);
      const buttonX = tab.buttonXFor(LONGEST_BUY_LABEL, 0);
      expect(buttonX - width / 2).toBeGreaterThanOrEqual(-470);
      expect(buttonX + width / 2).toBeLessThanOrEqual(470);

      expect(tab.textBlock).not.toBeNull();
      const block = tab.textBlock!;
      expect(block.x).toBeGreaterThanOrEqual(-470);
      expect(block.x + block.width).toBeLessThanOrEqual(470);
      // La miniatura (solo Mazos) arranca en textX: también debe entrar.
      expect(tab.columns[0].textX).toBeGreaterThanOrEqual(-470);
    });
  });

  it('ensancha el botón midiendo la etiqueta (y respeta el tope de 300)', () => {
    [compact19.upgrades, compact19.decks].forEach(tab => {
      const expected = fakeMeasure(LONGEST_BUY_LABEL, tab.button.fontPx);
      expect(tab.button.widthFor(LONGEST_BUY_LABEL)).toBeGreaterThanOrEqual(expected + 24);
      expect(tab.button.widthFor(LONGEST_BUY_LABEL)).toBeLessThanOrEqual(300);
    });
    // Etiqueta corta: no baja del mínimo de 150.
    expect(compact19.decks.button.widthFor('Adquirido')).toBe(150);
  });

  it('la zona táctil del botón llega a 44 px FÍSICOS reales', () => {
    expect(compact19.upgrades.button.height * (1 / 1.6)).toBeGreaterThanOrEqual(44);
    expect(compact19.decks.button.height * (1 / 1.6)).toBeGreaterThanOrEqual(44);
    expect(compact19.upgrades.button.height).toBeGreaterThanOrEqual(34);
  });

  it('sube nombre, estado y botón al piso de fuente efectivo', () => {
    expect(compact19.upgrades.name.fontSize).toBeGreaterThanOrEqual(19);
    expect(compact19.decks.name.fontSize).toBeGreaterThanOrEqual(19);
    expect(compact19.upgrades.status.fontSize).toBeGreaterThanOrEqual(19);
    expect(compact19.decks.status.fontSize).toBeGreaterThanOrEqual(19);
    expect(compact19.upgrades.button.fontPx).toBeGreaterThanOrEqual(19);
    expect(compact19.decks.button.fontPx).toBeGreaterThanOrEqual(19);
  });

  it('genera scroll cuando las filas no entran en el área visible', () => {
    // 11 mazos en UNA columna y 8 mejoras en UNA columna no caben en 420px.
    expect(compact19.decks.maxScrollFor(11)).toBeGreaterThan(0);
    expect(compact19.upgrades.maxScrollFor(8)).toBeGreaterThan(0);
    expect(compact19.decks.contentHeightFor(11)).toBe(11 * compact19.decks.rowSpacing);
    expect(compact19.upgrades.contentHeightFor(8)).toBe(8 * compact19.upgrades.rowSpacing);
    // Filas que sí caben: sin scroll.
    expect(compact19.decks.maxScrollFor(2)).toBe(0);
  });

  it('no solapa el bloque de texto con el botón (reserva el botón más ancho)', () => {
    [compact19.upgrades, compact19.decks].forEach(tab => {
      const block = tab.textBlock!;
      const textRight = block.x + block.width;
      const buttonLeft = tab.buttonXFor(LONGEST_BUY_LABEL, 0) - tab.button.widthFor(LONGEST_BUY_LABEL) / 2;
      expect(textRight).toBeLessThanOrEqual(buttonLeft);
    });
  });

  it('las celdas son apilables: paso uniforme y primera fila dentro del área', () => {
    [compact19.upgrades, compact19.decks].forEach(tab => {
      // rowHeight mínimo 64 + 10 de aire entre filas.
      expect(tab.rowSpacing).toBeGreaterThan(64);
      const firstCellCenter = tab.rowOffsetY(0);
      const halfRow = (tab.rowSpacing - 10) / 2;
      expect(firstCellCenter - halfRow).toBeGreaterThanOrEqual(compact19.scroll.top);
      expect(firstCellCenter + halfRow).toBeLessThanOrEqual(compact19.scroll.top + compact19.scroll.height);
      // El paso entre filas es uniforme.
      expect(tab.rowOffsetY(1) - tab.rowOffsetY(0)).toBe(tab.rowSpacing);
    });
  });

  it('apila todas las entradas en columna 0', () => {
    expect(compact19.decks.cellPositionFor(4)).toEqual({ column: 0, row: 4 });
    expect(compact19.upgrades.cellPositionFor(7)).toEqual({ column: 0, row: 7 });
  });

  it('calcula líneas reales con el measure inyectado (desc máx 3, nombre máx 2)', () => {
    const longDescription =
      'Mitiga a la mitad el drenaje de energía de las cartas negativas durante toda la partida';
    expect(compact19.upgrades.linesFor(longDescription, compact19.upgrades.description!)).toBeLessThanOrEqual(3);
    expect(compact19.upgrades.linesFor('Corto', compact19.upgrades.description!)).toBe(1);
    expect(compact19.decks.linesFor('Tarot of Marseilles', compact19.decks.name)).toBeLessThanOrEqual(2);
    // lineHeight = round(font * 1.45)
    expect(compact19.lineHeightFor(19)).toBe(28);
  });
});

describe('resolveShopLayout — compacto con piso chico (fontFloor = 7)', () => {
  const small = resolveShopLayout({ fontFloor: 7, displayScale: 1.3, measure: fakeMeasure });

  it('sigue siendo compacto pero con fuentes menores que con piso 19', () => {
    expect(small.mode).toBe('compact');
    expect(small.upgrades.name.fontSize).toBeLessThan(compact19.upgrades.name.fontSize);
    expect(small.decks.name.fontSize).toBeLessThan(compact19.decks.name.fontSize);
    expect(small.upgrades.button.fontPx).toBeLessThan(compact19.upgrades.button.fontPx);
    // Nunca por debajo del piso pedido.
    expect(small.upgrades.name.fontSize).toBeGreaterThanOrEqual(7);
    expect(small.decks.status.fontSize).toBeGreaterThanOrEqual(7);
  });

  it('con el piso chico el contenido es más alto pero sigue scrolleando', () => {
    expect(small.upgrades.rowSpacing).toBeLessThan(compact19.upgrades.rowSpacing);
    expect(small.decks.maxScrollFor(11)).toBeGreaterThan(0);
  });
});

describe('clampScrollOffset', () => {
  it('acota a 0..maxScroll', () => {
    expect(clampScrollOffset(-10, 500)).toBe(0);
    expect(clampScrollOffset(0, 500)).toBe(0);
    expect(clampScrollOffset(250, 500)).toBe(250);
    expect(clampScrollOffset(999, 500)).toBe(500);
  });

  it('devuelve 0 cuando no hay scroll (maxScroll <= 0)', () => {
    expect(clampScrollOffset(120, 0)).toBe(0);
    expect(clampScrollOffset(120, -30)).toBe(0);
    expect(clampScrollOffset(-5, 0)).toBe(0);
  });
});
