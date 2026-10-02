import { resolveAdsMode, type AdsMode } from './resolveAdsMode';

/**
 * ADR-007 (decisión 3): `VITE_ADS` decide el adapter de anuncios en build
 * time. Estos tests fijan la fuente única de esa resolución — sobre todo el
 * DEFAULT: cualquier env ausente o corrupta tiene que caer en
 * 'crazygames' (comportamiento actual intacto), nunca en otro adapter.
 */
describe('resolveAdsMode', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it('sin env (undefined) devuelve el default crazygames', () => {
    expect(resolveAdsMode(undefined)).toBe('crazygames');
    expect(warn).not.toHaveBeenCalled();
  });

  it('env vacía o solo espacios devuelve el default SIN avisar (caso normal de dev)', () => {
    expect(resolveAdsMode('')).toBe('crazygames');
    expect(resolveAdsMode('   ')).toBe('crazygames');
    expect(warn).not.toHaveBeenCalled();
  });

  it.each<[string, AdsMode]>([
    ['crazygames', 'crazygames'],
    ['portal', 'portal'],
    ['none', 'none']
  ])('el valor válido "%s" se respeta tal cual', (raw, expected) => {
    expect(resolveAdsMode(raw)).toBe(expected);
    expect(warn).not.toHaveBeenCalled();
  });

  it('tolera espacios alrededor de un valor válido', () => {
    expect(resolveAdsMode('  portal  ')).toBe('portal');
    expect(warn).not.toHaveBeenCalled();
  });

  it('cualquier basura cae al default crazygames y avisa una vez por valor', () => {
    expect(resolveAdsMode('CRAZYGAMES')).toBe('crazygames');
    expect(resolveAdsMode('true')).toBe('crazygames');
    expect(resolveAdsMode('crazy-games')).toBe('crazygames');
    expect(warn).toHaveBeenCalledTimes(3);
    // El aviso tiene que mencionar la env cruda: es lo que el deployeur
    // necesita ver en consola para encontrar el typo.
    expect(warn.mock.calls[0][0]).toContain('VITE_ADS');
    expect(warn.mock.calls[0][0]).toContain('CRAZYGAMES');
  });
});
