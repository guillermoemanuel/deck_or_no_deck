import { SFX } from '../../shared/audio/AudioData';
import { IAudioService } from '../../domain/ports/IAudioService';
import { bindUiClick, ClickPointerLike, ClickTarget, playUiClick } from './UiSfx';

describe('bindUiClick', () => {
  function createTarget(): { target: ClickTarget; on: jest.Mock; fire: (pointer?: ClickPointerLike) => void } {
    const handlers: Record<string, (pointer?: ClickPointerLike) => void> = {};
    const on = jest.fn((event: 'pointerup', callback: (pointer?: ClickPointerLike) => void) => {
      handlers[event] = callback;
      return undefined;
    });
    const target: ClickTarget = { on };
    return { target, on, fire: (pointer?: ClickPointerLike) => handlers['pointerup']?.(pointer) };
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

  // --- guard shouldPlay (click fantasma de scroll en la Tienda compacta) ---

  it('guard que decide false → no reproduce SFX.CLICK', () => {
    const { target, fire } = createTarget();
    const { audio, play } = createAudio();
    const shouldPlay = jest.fn((pointer: ClickPointerLike) => pointer.downY === pointer.y);

    bindUiClick(target, audio, shouldPlay);

    fire({ downY: 0, y: 200 });
    expect(shouldPlay).toHaveBeenCalledTimes(1);
    expect(play).not.toHaveBeenCalled();
  });

  it('guard que decide true → reproduce SFX.CLICK', () => {
    const { target, fire } = createTarget();
    const { audio, play } = createAudio();
    const shouldPlay = jest.fn((pointer: ClickPointerLike) => pointer.downY === pointer.y);

    bindUiClick(target, audio, shouldPlay);

    fire({ downY: 100, y: 100 });
    expect(shouldPlay).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith(SFX.CLICK);
  });

  it('handler invocado SIN pointer → el guard se salta y reproduce (click clásico)', () => {
    const { target, fire } = createTarget();
    const { audio, play } = createAudio();
    const shouldPlay = jest.fn(() => false);

    bindUiClick(target, audio, shouldPlay);

    fire();
    expect(shouldPlay).not.toHaveBeenCalled();
    expect(play).toHaveBeenCalledTimes(1);
  });
});

// Teclado PC (Fase 2): ENTER/N/M/S del menú principal necesitan el MISMO
// sonido de click que el pointerup, pero SIN pointer — por eso la
// reproducción se expone como función independiente (punto único ADR-015).
describe('playUiClick', () => {
  it('reproduce SFX.CLICK una vez', () => {
    const play = jest.fn();
    const audio = { play } as unknown as IAudioService;

    playUiClick(audio);

    expect(play).toHaveBeenCalledTimes(1);
    expect(play).toHaveBeenCalledWith(SFX.CLICK);
  });

  it('sin audio (null/undefined) → no-op sin lanzar', () => {
    // El JSDoc documenta el parámetro como opcional/null-safe: la tecla
    // S puede correr con un services.audioService aún no resuelto.
    expect(() => playUiClick(null)).not.toThrow();
    expect(() => playUiClick(undefined)).not.toThrow();
  });

  it('si play lanza excepción, no propaga', () => {
    const audio = {
      play: () => {
        throw new Error('boom');
      }
    } as unknown as IAudioService;

    expect(() => playUiClick(audio)).not.toThrow();
  });
});
