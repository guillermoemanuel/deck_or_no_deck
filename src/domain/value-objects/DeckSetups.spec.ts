import fs from 'fs';
import path from 'path';
import { DECK_SETUPS, DECK_SETUP_IDS } from './DeckSetups';

/**
 * Especificación de consistencia del catálogo de mazos: la música de
 * gameplay declarada en `musicGameplay` debe corresponder a un archivo
 * REAL en public/assets/audio/music/. Un rename suelto de mp3 o un mazo
 * nuevo sin su pista rompe acá (gate) en vez de degradarse en silencio
 * a un console.warn de AudioService + partida muda.
 */
describe('DeckSetups — música de gameplay por mazo', () => {
  const musicDir = path.resolve(__dirname, '../../../public/assets/audio/music');

  it('cada mazo declara musicGameplay con un nombre de archivo no vacío', () => {
    for (const id of DECK_SETUP_IDS) {
      expect(DECK_SETUPS[id].musicGameplay).toBeTruthy();
    }
  });

  it('el archivo de audio de cada mazo existe en public/assets/audio/music/', () => {
    for (const id of DECK_SETUP_IDS) {
      const file = `${DECK_SETUPS[id].musicGameplay}.ogg`;
      expect({
        deck: id,
        exists: fs.existsSync(path.join(musicDir, file))
      }).toEqual({ deck: id, exists: true });
    }
  });
});
