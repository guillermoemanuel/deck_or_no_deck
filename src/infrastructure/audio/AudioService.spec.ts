// Phaser real toca `window` en su import — mismo mock mínimo que
// AdOverlayScene.spec (entorno de tests `node`, sin jsdom). Estos tests
// solo ejercitan el estado de mute (this.sound.mute) y la guard de
// play(), así que alcanza con Math.Clamp por si se tocara un volumen.
jest.mock('phaser', () => ({
  Math: {
    Clamp: (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
  }
}));

import { AudioService } from './AudioService';
import type Phaser from 'phaser';

/**
 * CG-MON-002 (auditoría de publicación 2026-10-04): `muteAudio` del SDK
 * de CrazyGames — 0 matches en src/ antes de este sprint. La doc oficial
 * (sdk/game, Game Settings) es tajante: "This setting should take
 * priority over your in-game audio settings … be sure this doesn't
 * enable the audio back if it is disabled in the SDK settings". O sea:
 * la plataforma impone silencio desde una capa SEPARADA del toggle del
 * jugador (efectivo = toggle || plataforma) — el botón del HUD no puede
 * re-encender lo que la plataforma silenció, y al liberar la plataforma
 * manda de vuelta el pref del jugador.
 *
 * `exists` permite simular una key ausente del cache (warnMissing) sin
 * tocar el resto del fake; los tests originales usan el default `true`.
 */
function fakeGame(exists = true): {
  audio: AudioService;
  game: Phaser.Game;
  sound: { mute: boolean };
  soundPlay: jest.Mock;
} {
  const soundPlay = jest.fn();
  const sound = {
    mute: false,
    play: soundPlay,
    stopAll: jest.fn(),
    add: jest.fn(),
    game: { cache: { audio: { exists: () => exists } } }
  };
  const game = { sound } as unknown as Phaser.Game;
  return { audio: new AudioService(game), game, sound, soundPlay };
}

describe('AudioService — muteAudio de la plataforma (CG-MON-002)', () => {
  it('setPlatformMuted silencia sin tocar el toggle del jugador y la liberación devuelve el control al jugador', () => {
    const { audio, sound } = fakeGame();

    audio.setPlatformMuted(true);
    expect(audio.isMuted()).toBe(true);
    expect(sound.mute).toBe(true);

    // El pref del jugador era "sonando": al liberar la plataforma, suena.
    audio.setPlatformMuted(false);
    expect(audio.isMuted()).toBe(false);
    expect(sound.mute).toBe(false);
  });

  it('el toggle del jugador NO re-encender el audio mientras la plataforma silencia', () => {
    const { audio, sound } = fakeGame();

    audio.setPlatformMuted(true);
    // El jugador oye silencio y hace click ("que suene"): sigue sonando
    // silencio — la plataforma tiene prioridad sobre el toggle.
    expect(audio.toggleMuted()).toBe(true);
    expect(audio.isMuted()).toBe(true);
    expect(sound.mute).toBe(true);

    // Pero su intención queda registrada: al liberar la plataforma, suena.
    audio.setPlatformMuted(false);
    expect(audio.isMuted()).toBe(false);
  });

  it('liberada la plataforma manda el pref del jugador (no la plataforma)', () => {
    const { audio, sound } = fakeGame();

    audio.setMuted(true); // el jugador silenció con su botón
    audio.setPlatformMuted(true);
    audio.setPlatformMuted(false);

    expect(audio.isMuted()).toBe(true); // sigue silenciado: lo pidió el jugador
    expect(sound.mute).toBe(true);
  });

  it('play() no arranca efectos con la plataforma en silencio', () => {
    const { audio, soundPlay } = fakeGame();

    audio.setPlatformMuted(true);
    audio.play('card_flip');

    expect(soundPlay).not.toHaveBeenCalled();
  });

  it('regresión: el toggle in-game sigue funcionando igual sin plataforma', () => {
    const { audio, sound } = fakeGame();

    expect(audio.isMuted()).toBe(false);
    expect(audio.toggleMuted()).toBe(true);
    expect(sound.mute).toBe(true);
    expect(audio.toggleMuted()).toBe(false);
    expect(sound.mute).toBe(false);
  });
});

/**
 * BUGFIX (bug_sfx_volumen_ignorado) y BUGFIX (bug_sfx_apilado):
 * play() usaba SOLO el volumen global del jugador e ignoraba el `volume`
 * declarado por cada efecto en AUDIO_MANIFEST.sfx; además dos
 * reproducciones de la misma clave dentro de la ventana de 40 ms apilaban
 * instancias encima (doble click = sonido duplicado/golpeado).
 */
describe('AudioService — volumen de manifiesto y anti-apilado', () => {
  it('aplica el volumen del manifiesto por encima del volumen global', () => {
    const { audio, soundPlay } = fakeGame();

    // sfxVolume global (0.7) × volumen declarado de sfx-card-open (0.6);
    // la expresión se escribe igual que en la implementación para que el
    // float coincida bit a bit.
    audio.play('sfx-card-open');

    expect(soundPlay).toHaveBeenCalledWith('sfx-card-open', {
      volume: 0.7 * 0.6,
      loop: false
    });
  });

  it('un volumen pasado por el caller multiplica el del manifiesto (no lo reemplaza en cero)', () => {
    const { audio, soundPlay } = fakeGame();

    audio.play('sfx-card-open', { volume: 1 });

    expect(soundPlay).toHaveBeenCalledWith('sfx-card-open', {
      volume: 1 * 0.6,
      loop: false
    });
  });

  it('descarta la misma clave dentro de la ventana de 40 ms; claves distintas y la exenta siguen pasando', () => {
    const { game, soundPlay } = fakeGame();
    let t = 0;
    const audio = new AudioService(game, () => t);

    audio.play('sfx-click'); // t=0 → llega
    expect(soundPlay).toHaveBeenCalledTimes(1);

    // sfx-coins-count está exenta: el contador de monedas debe poder
    // apilar aunque los clicks lleguen en el mismo instante.
    audio.play('sfx-coins-count');
    audio.play('sfx-coins-count');
    expect(soundPlay).toHaveBeenCalledTimes(3);

    t = 20;
    audio.play('sfx-click'); // misma clave, 20 ms < 40 → NO llega
    expect(soundPlay).toHaveBeenCalledTimes(3);

    t = 40;
    audio.play('sfx-click'); // 40 ms ya no es < 40 → llega
    expect(soundPlay).toHaveBeenCalledTimes(4);

    audio.play('sfx-deal'); // clave distinta, nunca se bloquea entre sí
    expect(soundPlay).toHaveBeenCalledTimes(5);
  });

  it('una clave ausente del cache avisa UNA sola vez con la ruta real de assets', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { audio, soundPlay } = fakeGame(false);

    audio.play('sfx-que-no-existe');
    audio.play('sfx-que-no-existe');

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toContain('public/assets/audio/sfx/');
    expect(soundPlay).not.toHaveBeenCalled();

    // playMusic comparte warnMissing: una música faltante debe señalar
    // la carpeta de música, no la de sfx.
    audio.play('music_gameplay');
    expect(warnSpy).toHaveBeenCalledTimes(2);
    expect(String(warnSpy.mock.calls[1][0])).toContain('public/assets/audio/music/');

    warnSpy.mockRestore();
  });
});
