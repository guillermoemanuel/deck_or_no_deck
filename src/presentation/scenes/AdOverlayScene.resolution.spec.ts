import { createAdOverlayResolution } from './AdOverlayScene.resolution';

/**
 * Specs de la lógica de resolución del presenter del anuncio propio
 * (ADR-007). Está extraída a un módulo sin Phaser a propósito: las escenas
 * no se unit-testean en este repo (docs/testing.md §5), pero la promesa
 * que recibe el adapter tiene dos invariantes caras — resolución única y
 * promise nunca colgada — y ambas viven en esta pieza pura.
 */
describe('createAdOverlayResolution (presenter del anuncio propio)', () => {
  it('resuelve con el PRIMER resultado y reporta que esa llamada fue la que resolvió', async () => {
    const resolution = createAdOverlayResolution();

    expect(resolution.resolveOnce({ completed: true })).toBe(true);
    await expect(resolution.promise).resolves.toEqual({ completed: true });
  });

  it('acepta completed:false como primer resultado (cancelación por ✕ o shutdown externo)', async () => {
    const resolution = createAdOverlayResolution();

    expect(resolution.resolveOnce({ completed: false })).toBe(true);
    await expect(resolution.promise).resolves.toEqual({ completed: false });
  });

  it('descarta toda llamada posterior: el SHUTDOWN normal de la escena NO pisa a completed:true', async () => {
    const resolution = createAdOverlayResolution();

    expect(resolution.resolveOnce({ completed: true })).toBe(true);
    // Así se comporta el failSafe de la escena al apagarse tras completarse.
    expect(resolution.resolveOnce({ completed: false })).toBe(false);
    expect(resolution.resolveOnce({ completed: true })).toBe(false);

    await expect(resolution.promise).resolves.toEqual({ completed: true });
  });

  it('invoca onResolved exactamente una vez — el listener de seguridad del juego queda desuscrito al primer resultado', () => {
    const onResolved = jest.fn();
    const resolution = createAdOverlayResolution(onResolved);

    resolution.resolveOnce({ completed: false });
    resolution.resolveOnce({ completed: true });
    resolution.resolveOnce({ completed: false });

    expect(onResolved).toHaveBeenCalledTimes(1);
  });
});
