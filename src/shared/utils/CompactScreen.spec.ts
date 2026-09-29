import {
  applyFontFloor,
  getMinDesignFontPx,
  getTouchHitSize,
  MAX_DESIGN_FONT_FLOOR_PX,
  MAX_DESIGN_TOUCH_PX
} from './CompactScreen';

describe('getMinDesignFontPx', () => {
  it('no impone piso cuando el juego no se reduce (escritorio a 720p o más)', () => {
    expect(getMinDesignFontPx(1)).toBe(0);
    expect(getMinDesignFontPx(0.75)).toBe(0);
  });

  it('impone piso proporcional al factor de reducción', () => {
    expect(getMinDesignFontPx(1.5)).toBe(18);
    expect(getMinDesignFontPx(1.85)).toBe(22);
  });

  it('acota el piso para no romper layouts en pantallas diminutas', () => {
    expect(getMinDesignFontPx(4)).toBe(MAX_DESIGN_FONT_FLOOR_PX);
  });

  it('ignora valores inválidos', () => {
    expect(getMinDesignFontPx(NaN)).toBe(0);
    expect(getMinDesignFontPx(Infinity)).toBe(0);
  });
});

describe('applyFontFloor', () => {
  it('sube fuentes en px por debajo del piso y respeta las mayores', () => {
    expect(applyFontFloor('15px', 22)).toBe('22px');
    expect(applyFontFloor('22px', 22)).toBe('22px');
    expect(applyFontFloor('40px', 22)).toBe('40px');
    expect(applyFontFloor('16.5px', 22)).toBe('22px');
  });

  it('acepta números y conserva el tipo', () => {
    expect(applyFontFloor(15, 22)).toBe(22);
    expect(applyFontFloor(30, 22)).toBe(30);
  });

  it('no toca otras unidades ni valores raros', () => {
    expect(applyFontFloor('1.2em', 22)).toBe('1.2em');
    expect(applyFontFloor('bold 15px', 22)).toBe('bold 15px');
  });

  it('con piso 0 devuelve el valor original', () => {
    expect(applyFontFloor('15px', 0)).toBe('15px');
  });
});

describe('getTouchHitSize', () => {
  it('no cambia nada cuando el juego no se reduce', () => {
    expect(getTouchHitSize(48, 1)).toBe(48);
  });

  it('agranda el área táctil hasta el tamaño físico recomendado', () => {
    // 44 px físicos × 1.3 = 57 px de diseño (bajo el tope).
    expect(getTouchHitSize(48, 1.3)).toBe(57);
  });

  it('nunca supera el tope ni achica el botón base', () => {
    expect(getTouchHitSize(48, 3)).toBe(MAX_DESIGN_TOUCH_PX);
    expect(getTouchHitSize(80, 3)).toBe(80);
  });
});
