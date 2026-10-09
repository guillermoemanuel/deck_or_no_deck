import { SFX } from '../../shared/audio/AudioData';
import { IAudioService } from '../../domain/ports/IAudioService';
import { bindUiClick, ClickTarget } from './UiSfx';

describe('bindUiClick', () => {
  function createTarget(): { target: ClickTarget; on: jest.Mock; fire: () => void } {
    const handlers: Record<string, () => void> = {};
    const on = jest.fn((event: 'pointerup', callback: () => void) => {
      handlers[event] = callback;
      return undefined;
    });
    const target: ClickTarget = { on };
    return { target, on, fire: () => handlers['pointerup']?.() };
  }

  function createAudio(playImpl?: () => void): { audio: IAudioService; play: jest.Mock } {
    const play = jest.fn(playImpl);
    return { audio: { play } as unknown as IAudioService, play };
  }

  it('con audio registra el handler bajo pointerup y play recibe SFX.CLICK', () => {
    const { target, on, fire } = createTarget();
    const { audio, play } = createAudio();

    bindUiClick(target, audio);

    expect(on).toHaveBeenCalledTimes(1);
    expect(on.mock.calls[0][0]).toBe('pointerup');
    fire();
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith(SFX.CLICK);
  });

  it('invocarlo dos veces → dos calls (el anti-apilado es de AudioService)', () => {
    const { target, fire } = createTarget();
    const { audio, play } = createAudio();

    bindUiClick(target, audio);
    fire();
    fire();

    expect(play).toHaveBeenCalledTimes(2);
  });

  it('sin audio → on jamás se llama', () => {
    const { target, on } = createTarget();

    bindUiClick(target, undefined);

    expect(on).not.toHaveBeenCalled();
  });

  it('si play lanza excepción, invocar el handler no propaga', () => {
    const { target, fire } = createTarget();
    const { audio } = createAudio(() => {
      throw new Error('boom');
    });

    bindUiClick(target, audio);

    expect(() => fire()).not.toThrow();
  });
});
