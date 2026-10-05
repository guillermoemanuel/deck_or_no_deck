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
 */
function fakeGame(): {
  audio: AudioService;
  sound: { mute: boolean };
  soundPlay: jest.Mock;
} {
  const soundPlay = jest.fn();
  const sound = {
    mute: false,
    play: soundPlay,
    stopAll: jest.fn(),
    add: jest.fn(),
    game: { cache: { audio: { exists: () => true } } }
  };
  const game = { sound } as unknown as Phaser.Game;
  return { audio: new AudioService(game), sound, soundPlay };
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
