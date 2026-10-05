import { resolveMuteAudioOverride } from './resolveMuteAudioOverride';

/**
 * CG-MON-002 (auditoría de publicación 2026-10-04): override local de
 * `muteAudio` por URL. La doc de CrazyGames (sdk/game, Game Settings)
 * documenta `?muteAudio=true` como forma de FORZAR el setting en local —
 * acá el parámetro gana sobre el valor del SDK y sirve además en los
 * modos sin adapter de plataforma (portal/none), donde no hay SDK que
 * lea la URL.
 */
describe('resolveMuteAudioOverride', () => {
  it('sin el parámetro devuelve null (manda el setting del SDK)', () => {
    expect(resolveMuteAudioOverride('')).toBeNull();
    expect(resolveMuteAudioOverride('?foo=bar')).toBeNull();
    expect(resolveMuteAudioOverride('?mute=1')).toBeNull();
  });

  it('muteAudio=true fuerza silencio', () => {
    expect(resolveMuteAudioOverride('?muteAudio=true')).toBe(true);
  });

  it('muteAudio=false fuerza sonido (útil para negar el mute de la plataforma en local)', () => {
    expect(resolveMuteAudioOverride('?muteAudio=false')).toBe(false);
  });

  it('valores no válidos se ignoran con warning y vuelven a mandar el SDK', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(resolveMuteAudioOverride('?muteAudio=si')).toBeNull();
    expect(resolveMuteAudioOverride('?muteAudio=TRUE')).toBeNull();
    expect(resolveMuteAudioOverride('?muteAudio=')).toBeNull();
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
  });
});
