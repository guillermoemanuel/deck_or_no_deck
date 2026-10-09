import fs from 'fs';
import path from 'path';
import { AUDIO_MANIFEST, SFX } from './AudioData';

/**
 * Guardián del manifiesto de audio (COMMIT 1 del plan de audio):
 * la paridad entre los símbolos `SFX` (los que usa presentation), las
 * entradas de `AUDIO_MANIFEST.sfx` (los que precarga PreloadScene y de los
 * que AudioService lee los volúmenes) y los archivos REALES en
 * public/assets/audio/sfx/. Un rename de mp3 o una key agregada a medias
 * rompe acá (gate) en vez de degradarse en silencio a un console.warn de
 * AudioService + efecto mudo.
 */
describe('AudioData — manifiesto de audio', () => {
  const sfxDir = path.join(__dirname, '../../../public/assets/audio/sfx');
  const manifestSfxKeys = AUDIO_MANIFEST.sfx.map(item => item.key);
  const sfxSymbols = Object.values(SFX);

  it('toda clave canónica de SFX existe en AUDIO_MANIFEST.sfx', () => {
    for (const key of sfxSymbols) {
      expect({
        key,
        inManifest: manifestSfxKeys.includes(key)
      }).toEqual({ key, inManifest: true });
    }
  });

  it('toda key de AUDIO_MANIFEST.sfx tiene su símbolo en SFX (paridad inversa: 23 = 23)', () => {
    expect(sfxSymbols).toHaveLength(23);
    expect(manifestSfxKeys).toHaveLength(23);

    for (const key of manifestSfxKeys) {
      expect({
        key,
        hasSymbol: sfxSymbols.includes(key as (typeof sfxSymbols)[number])
      }).toEqual({ key, hasSymbol: true });
    }
  });

  it('sin claves duplicadas en sfx (ni en music)', () => {
    expect(new Set(manifestSfxKeys).size).toBe(manifestSfxKeys.length);

    const musicKeys = AUDIO_MANIFEST.music.map(item => item.key);
    expect(new Set(musicKeys).size).toBe(musicKeys.length);
  });

  it('cada file de sfx existe físicamente en public/assets/audio/sfx/', () => {
    for (const item of AUDIO_MANIFEST.sfx) {
      expect({
        key: item.key,
        file: item.file,
        exists: fs.existsSync(path.join(sfxDir, item.file))
      }).toEqual({ key: item.key, file: item.file, exists: true });
    }
  });
});
