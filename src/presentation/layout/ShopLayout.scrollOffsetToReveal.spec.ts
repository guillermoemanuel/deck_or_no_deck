import { clampScrollOffset, resolveShopLayout, scrollOffsetToReveal } from './ShopLayout';

/**
 * Fase 4 (teclado PC): scroll-into-view del foco en el modo compacto de la
 * tienda. RED-FIRST: `scrollOffsetToReveal` todavía NO existe en
 * ShopLayout.ts — este spec debe fallar en rojo ("has no exported member
 * 'scrollOffsetToReveal'") hasta que la función se agregue DESPUÉS de
 * clampScrollOffset, delegando en ella (aditivo: no toca la geometría
 * congelada por ShopLayout.spec.ts).
 *
 * Motivo del comportamiento: al navegar filas con flechas,
 * `syncInputToWindow` deja invisible (setVisible(false)) la fila enfocada
 * si queda fuera de la ventana de scroll — el foco no puede quedar oculto.
 *
 * Estilo y geometría: igual que ShopLayout.spec.ts (medidor fake; área de
 * scroll real congelada {top: -168, height: 420}).
 */

/** Medidor fake idéntico al del spec hermano (ancho lineal determinista). */
const fakeMeasure = (text: string, fontPx: number): number => text.length * fontPx * 0.55;

const compact19 = resolveShopLayout({ fontFloor: 19, displayScale: 1.6, measure: fakeMeasure });
/** Área de scroll congelada del modo compacto: { top: -168, height: 420 }. */
const scroll = compact19.scroll;

describe('scrollOffsetToReveal — scroll-into-view del foco (Fase 4 teclado PC)', () => {
  it('returns the current offset unchanged when the row is already visible', () => {
    // offset 60 → ventana [-108, 312]; fila centrada en 40 con semialtura
    // 50 → [-10, 90] DENTRO: devuelve el offset actual idéntico (sin tocar).
    expect(scrollOffsetToReveal(60, 40, 50, scroll, 800)).toBe(60);
  });

  it('lowers the offset when the row is above the window', () => {
    // offset 100 → ventana [-68, 352]; fila en -100 ± 20 topa con -120 < -68.
    // target = rowY - halfHeight - scroll.top = -100 - 20 - (-168) = 48.
    const offset = scrollOffsetToReveal(100, -100, 20, scroll, 800);
    expect(offset).toBe(48);
    expect(offset).toBeLessThan(100);
    // Con el offset nuevo la fila queda DENTRO (borde superior a ras del
    // borde superior de la ventana: el movimiento es el mínimo posible).
    expect(-100 - 20).toBe(scroll.top + offset);
  });

  it('raises the offset when the row is below the window', () => {
    // offset 0 → ventana [-168, 252]; fila en 400 ± 30 bottoma con 430 > 252.
    // target = rowY + halfHeight - scroll.top - scroll.height
    //        = 400 + 30 + 168 - 420 = 178.
    const offset = scrollOffsetToReveal(0, 400, 30, scroll, 800);
    expect(offset).toBe(178);
    expect(offset).toBeGreaterThan(0);
    expect(400 + 30).toBe(scroll.top + scroll.height + offset);
  });

  it('clamps the result to 0 when the row above would scroll past the top', () => {
    // offset 200 → ventana.top 32; fila en -150 ± 50 topa con -200.
    // target = -150 - 50 - (-168) = -32 → clampScrollOffset(-32, 500) = 0.
    const offset = scrollOffsetToReveal(200, -150, 50, scroll, 500);
    expect(offset).toBe(0);
    // Delegación en el clamp REAL de ShopLayout.ts (fuente única del rango).
    expect(offset).toBe(clampScrollOffset(-32, 500));
  });

  it('clamps the result to maxScroll when the row below would scroll past the bottom', () => {
    // target = 2000 + 100 + 168 - 420 = 1848, pero maxScroll acota a 300.
    const maxScroll = 300;
    const offset = scrollOffsetToReveal(0, 2000, 100, scroll, maxScroll);
    expect(offset).toBe(maxScroll);
    // Delegación en el clamp REAL de ShopLayout.ts.
    expect(offset).toBe(clampScrollOffset(1848, maxScroll));
  });

  it('treats a row whose edge touches the window edge exactly as visible', () => {
    // offset 50 → ventana [-118, 302]; fila en -50 ± 68 → borde superior
    // -118 EXACTO contra el borde de la ventana: ya cabe (la comparación es
    // estricta), así que NO cambia el offset.
    expect(scrollOffsetToReveal(50, -50, 68, scroll, 500)).toBe(50);
  });

  it('brings compact row 8 into the window from offset 0 (real layout)', () => {
    const tab = compact19.upgrades;
    const rowY = tab.rowOffsetY(7); // 8ª fila (índice 7) en coordenadas de contenido
    const halfRow = (tab.rowSpacing - 10) / 2;
    const maxScroll = tab.maxScrollFor(8);

    // Con offset 0 la fila queda FUERA por abajo: ese es hoy el foco
    // invisible que syncInputToWindow oculta con setVisible(false).
    expect(rowY + halfRow).toBeGreaterThan(scroll.top + scroll.height);

    const offset = scrollOffsetToReveal(0, rowY, halfRow, scroll, maxScroll);

    expect(offset).toBeGreaterThan(0);
    expect(offset).toBeLessThanOrEqual(maxScroll);
    // Visible: la fila COMPLETA cae dentro de la ventana con el offset nuevo.
    expect(rowY - halfRow).toBeGreaterThanOrEqual(scroll.top + offset);
    expect(rowY + halfRow).toBeLessThanOrEqual(scroll.top + scroll.height + offset);
    // Mínimo suficiente (sin tocar el clamp: maxScroll alcanza): el borde
    // inferior queda a ras del borde inferior de la ventana.
    expect(rowY + halfRow).toBe(scroll.top + scroll.height + offset);
  });
});
