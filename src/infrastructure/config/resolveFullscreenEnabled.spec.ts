import { resolveFullscreenEnabled } from './resolveFullscreenEnabled';

/**
 * ADR-008: `VITE_FULLSCREEN` decide si el build muestra el botón de
 * pantalla completa propio (pareja de `VITE_ADS`, la escribe la misma
 * tool `/ads-adapter`). Estos tests fijan las dos garantías:
 *
 * 1. DEFAULT SEGURO — sin env (o con basura) el botón NO se muestra:
 *    `VITE_ADS` default = `'crazygames'` y esa plataforma PROHÍBE los
 *    botones fullscreen propios; un build manual sin la tool nunca debe
 *    poder incumplir (fue el P0 CG-PUB-002 de la auditoría de
 *    publicación).
 * 2. EL MODO MANDA — en `'crazygames'` el env no puede forzar el botón:
 *    si dice `'true'` se ignora con warn (señal de .env desincronizado).
 */
describe('resolveFullscreenEnabled', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('sin env devuelve false (default seguro) SIN avisar, en cualquier modo', () => {
    expect(resolveFullscreenEnabled(undefined, 'crazygames')).toBe(false);
    expect(resolveFullscreenEnabled(undefined, 'portal')).toBe(false);
    expect(resolveFullscreenEnabled(undefined, 'none')).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('env vacía o solo espacios devuelve false SIN avisar (dev sin el par de envs)', () => {
    expect(resolveFullscreenEnabled('', 'portal')).toBe(false);
    expect(resolveFullscreenEnabled('   ', 'none')).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('en portal/none el literal exacto "true" habilita el botón y "false" lo apaga, sin avisar', () => {
    expect(resolveFullscreenEnabled('true', 'portal')).toBe(true);
    expect(resolveFullscreenEnabled('true', 'none')).toBe(true);
    expect(resolveFullscreenEnabled('false', 'portal')).toBe(false);
    expect(resolveFullscreenEnabled('false', 'none')).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('en crazygames el botón SIEMPRE queda apagado: la prohibición de la plataforma manda sobre el env', () => {
    expect(resolveFullscreenEnabled('false', 'crazygames')).toBe(false);
    expect(resolveFullscreenEnabled(undefined, 'crazygames')).toBe(false);
    expect(warn).not.toHaveBeenCalled();

    // ...y si el env lo contradice se ignora CON warn: es la única señal
    // de que `.env` y modo quedaron desincronizados (CG-PUB-002).
    expect(resolveFullscreenEnabled('true', 'crazygames')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('VITE_FULLSCREEN');
    expect(warn.mock.calls[0][0]).toContain('crazygames');
  });

  it('basura dentro o alrededor del literal: false + warn con el valor crudo (espejo de resolveAdsMode)', () => {
    expect(resolveFullscreenEnabled(' true ', 'portal')).toBe(false);
    expect(resolveFullscreenEnabled('TRUE', 'portal')).toBe(false);
    expect(resolveFullscreenEnabled('si', 'none')).toBe(false);
    expect(warn).toHaveBeenCalledTimes(3);
    // El aviso tiene que mencionar la env CRUDA: es lo que el deployeur
    // necesita ver en consola para encontrar el typo.
    expect(warn.mock.calls[0][0]).toContain('VITE_FULLSCREEN');
    expect(warn.mock.calls[0][0]).toContain(' true ');
  });
});
