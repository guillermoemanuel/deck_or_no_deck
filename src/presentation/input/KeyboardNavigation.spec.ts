import { bindKeys, KeyboardTargetLike } from './KeyBindings';
import { FocusDirection, FocusItem, firstEnabledIndex, nextFocusIndex } from './KeyboardNavigation';

/**
 * Fase 1 de controles de teclado — núcleo puro de la navegación por foco para
 * escenas en PC (1280×720 fijo, coordenadas de diseño). Sin Phaser ni DOM: el
 * wiring por escena viene en fases posteriores.
 *
 * Escrito rojo-primero (docs/testing.md §4 — un cambio de comportamiento
 * empieza por un test que falla): el spec se escribió ANTES que los módulos
 * `KeyboardNavigation.ts` y `KeyBindings.ts`, que en ese momento no existían.
 */

/** Item de foco mínimo: centro en coordenadas de diseño + estado activable. */
function item(x: number, y: number, enabled = true): FocusItem {
  return { x, y, enabled };
}

/**
 * Grilla regular row-major (índice = fila * cols + columna) con pitch
 * configurable por eje, todos los items habilitados.
 */
function grid(cols: number, rows: number, colPitch = 100, rowPitch = 100): FocusItem[] {
  const items: FocusItem[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      items.push(item(col * colPitch, row * rowPitch));
    }
  }
  return items;
}

/** Copia de los items con los índices dados deshabilitados (inmutable). */
function withDisabled(items: readonly FocusItem[], ...indices: number[]): FocusItem[] {
  return items.map((current, index) => (indices.includes(index) ? { ...current, enabled: false } : current));
}

describe('nextFocusIndex', () => {
  it('in a regular 3x2 grid moves right/down and keeps the index at the left/top border', () => {
    const items = grid(3, 2);

    expect(nextFocusIndex(items, 0, 'right')).toBe(1);
    expect(nextFocusIndex(items, 0, 'down')).toBe(3);
    expect(nextFocusIndex(items, 0, 'left')).toBe(0);
    expect(nextFocusIndex(items, 3, 'up')).toBe(0);
  });

  it('skips a disabled neighbour: right from 0 lands on 2 when 1 is disabled', () => {
    const items = withDisabled(grid(3, 1), 1);

    expect(nextFocusIndex(items, 0, 'right')).toBe(2);
  });

  it('excludes a disabled candidate even when it is the euclidean-nearest one', () => {
    // idx1 está más cerca (diagonal corta) que idx2, pero está disabled.
    const items = [item(0, 0), item(100, 100, false), item(200, 0)];

    expect(nextFocusIndex(items, 0, 'right')).toBe(2);
  });

  it('from the top-right corner of a 4x3 grid, down picks the cell directly below', () => {
    const items = grid(4, 3);
    const direction: FocusDirection = 'down';

    // Los candidatos de la fila de abajo (4..7) y de la dos más abajo (8..11)
    // están todos estrictamente más abajo: gana el de menor distancia
    // euclídea, el directamente debajo (7), no el de menor índice (4).
    expect(nextFocusIndex(items, 3, direction)).toBe(7);
  });

  it('returns the first enabled index when nothing is focused, or -1 when every item is disabled', () => {
    const items = withDisabled(grid(3, 2), 0, 1);
    expect(nextFocusIndex(items, -1, 'right')).toBe(2);

    const allDisabled = withDisabled(grid(3, 2), 0, 1, 2, 3, 4, 5);
    expect(nextFocusIndex(allDisabled, -1, 'right')).toBe(-1);
  });

  it('keeps the current index when there is no candidate to the right (last column)', () => {
    const items = grid(3, 2);

    expect(nextFocusIndex(items, 2, 'right')).toBe(2);
    expect(nextFocusIndex(items, 5, 'right')).toBe(5);
  });

  it('moves away from a disabled current item: right from 1 lands on 2', () => {
    const items = withDisabled(grid(3, 2), 1);

    expect(nextFocusIndex(items, 1, 'right')).toBe(2);
  });

  it('returns -1 for an empty item list whatever the current index', () => {
    expect(nextFocusIndex([], -1, 'right')).toBe(-1);
    expect(nextFocusIndex([], 0, 'down')).toBe(-1);
  });

  it('falls back to the first enabled index for any out-of-range current index', () => {
    // Contrato de la JSDoc (review): no solo -1, también un índice residual
    // tras un re-render que achicó la lista (p. ej. pestaña con menos filas).
    const items = grid(3, 1);

    expect(nextFocusIndex(items, 99, 'right')).toBe(0);

    const allDisabled = withDisabled(grid(3, 1), 0, 1, 2);
    expect(nextFocusIndex(allDisabled, 99, 'right')).toBe(-1);
  });

  it('keeps the current index when every candidate on the requested side is disabled', () => {
    // Lado pedido con candidatos pero todos deshabilitados (común en la
    // tienda con mazos bloqueados): no hay alternativa habilitada → no mover.
    const items = withDisabled(grid(3, 1), 1, 2);

    expect(nextFocusIndex(items, 0, 'right')).toBe(0);
  });

  it('breaks a euclidean tie with the lower index', () => {
    // Simétrico a propósito: 0 y 2 están a la misma distancia de 1 (fila de
    // abajo, a izquierda y a derecha).
    const items = [item(0, 100), item(100, 0), item(200, 100)];

    expect(nextFocusIndex(items, 1, 'down')).toBe(0);
  });

  it('picks the euclidean-nearest candidate even when its index is higher', () => {
    // Un orden por índice elegiría 1 (distancia 400); la regla es la
    // distancia euclídea: 2 está a ~111.8.
    const items = [item(0, 0), item(400, 0), item(100, 50)];

    expect(nextFocusIndex(items, 0, 'right')).toBe(2);
  });
});

describe('firstEnabledIndex', () => {
  it('returns the first enabled index, skipping the disabled ones', () => {
    const items = withDisabled(grid(3, 1), 0);

    expect(firstEnabledIndex(items)).toBe(1);
  });

  it('returns -1 when the list is empty or every item is disabled', () => {
    expect(firstEnabledIndex([])).toBe(-1);
    expect(firstEnabledIndex(withDisabled(grid(3, 1), 0, 1, 2))).toBe(-1);
  });
});

describe('bindKeys', () => {
  /**
   * Doble estructural de teclado: guarda los handlers por evento y permite
   * dispararlos a mano; `off` solo baja el par si la referencia coincide
   * (mismo contrato que el emitter real).
   */
  function createKeyboardTarget(): {
    target: KeyboardTargetLike;
    on: jest.Mock;
    off: jest.Mock;
    fire: (event: string) => void;
  } {
    const handlers: Record<string, (...args: never[]) => void> = {};
    const on = jest.fn((event: string, callback: (...args: never[]) => void) => {
      handlers[event] = callback;
      return undefined;
    });
    const off = jest.fn((event: string, callback: (...args: never[]) => void) => {
      if (handlers[event] === callback) delete handlers[event];
      return undefined;
    });
    const target: KeyboardTargetLike = { on, off };
    const fire = (event: string): void => {
      handlers[event]?.();
    };
    return { target, on, off, fire };
  }

  it('registers SPACE and Z as keydown-<KEY> with the same handler references', () => {
    const { target, on } = createKeyboardTarget();
    const space = jest.fn();
    const z = jest.fn();

    bindKeys(target, { SPACE: space, Z: z });

    expect(on).toHaveBeenCalledTimes(2);
    expect(on.mock.calls[0][0]).toBe('keydown-SPACE');
    expect(on.mock.calls[0][1]).toBe(space);
    expect(on.mock.calls[1][0]).toBe('keydown-Z');
    expect(on.mock.calls[1][1]).toBe(z);
  });

  it('unsubscribe calls off for every key with the same (event, handler) pair', () => {
    const { target, off } = createKeyboardTarget();
    const space = jest.fn();
    const z = jest.fn();
    const unsubscribe = bindKeys(target, { SPACE: space, Z: z });

    unsubscribe();

    expect(off).toHaveBeenCalledTimes(2);
    expect(off.mock.calls[0][0]).toBe('keydown-SPACE');
    expect(off.mock.calls[0][1]).toBe(space);
    expect(off.mock.calls[1][0]).toBe('keydown-Z');
    expect(off.mock.calls[1][1]).toBe(z);
  });

  it('after unsubscribe the handlers are detached: later keydown events do not reach them', () => {
    const { target, fire } = createKeyboardTarget();
    const space = jest.fn();
    const z = jest.fn();
    const unsubscribe = bindKeys(target, { SPACE: space, Z: z });

    fire('keydown-SPACE');
    unsubscribe();
    fire('keydown-SPACE');
    fire('keydown-Z');

    expect(space).toHaveBeenCalledTimes(1);
    expect(z).toHaveBeenCalledTimes(0);
  });

  it('calling unsubscribe twice does not throw', () => {
    const { target } = createKeyboardTarget();
    const unsubscribe = bindKeys(target, { SPACE: jest.fn() });

    unsubscribe();

    expect(() => unsubscribe()).not.toThrow();
  });

  it('with a nullish target nothing is registered and unsubscribe is a safe noop', () => {
    const handler = jest.fn();

    const fromNull = bindKeys(null, { SPACE: handler });
    const fromUndefined = bindKeys(undefined, { SPACE: handler });

    expect(typeof fromNull).toBe('function');
    expect(typeof fromUndefined).toBe('function');
    expect(() => {
      fromNull();
      fromUndefined();
      fromNull();
    }).not.toThrow();
  });

  it('fires the registered callback directly: the stored reference IS the handler', () => {
    const { target, on, fire } = createKeyboardTarget();
    const space = jest.fn();

    bindKeys(target, { SPACE: space });
    fire('keydown-SPACE');

    expect(on.mock.calls[0][1]).toBe(space);
    expect(space).toHaveBeenCalledTimes(1);
  });
});
