// El componente toca `Phaser.Scale.Events` en runtime y el entorno del
// proyecto es `node` (sin jsdom) — mock mínimo al estilo
// DeckCelebrationEffect.spec: solo los eventos que usa.
jest.mock('phaser', () => ({
  Scale: {
    Events: {
      RESIZE: 'resize',
      ENTER_FULLSCREEN: 'enterfullscreen',
      LEAVE_FULLSCREEN: 'leavefullscreen'
    }
  }
}));

// HudIconButton arma GameObjects de Phaser (no testeables en node): la
// reemplazamos por un stub que REGISTRA sus instancias — es lo que
// permite contar cuántos botones creó el componente.
jest.mock('./HudIconButton', () => {
  class HudIconButton {
    static instances: unknown[] = [];
    // Guarda los args del ctor: el 5to (índice 4) es el callback onClick —
    // necesario para verificar que el botón delega en toggleMuted().
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ctorArgs: any[];
    constructor(...args: unknown[]) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      this.ctorArgs = args as any[];
      HudIconButton.instances.push(this);
    }
    setPosition(): void {}
    getTotalWidth(): number {
      return 60;
    }
    setIconTexture(): void {}
    setLabel(): void {}
    destroy(): void {}
  }
  return { HudIconButton };
});

import { SoundFullscreenControls } from './SoundFullscreenControls';

type Params = ConstructorParameters<typeof SoundFullscreenControls>;
type FakeScene = Params[0];
type FakeAudio = Params[1];

/**
 * CG-PUB-002 (auditoría de publicación 2026-10-04): CrazyGames PROHÍBE
 * los botones de pantalla completa propios ("Custom in-game fullscreen
 * buttons are prohibited"). El contrato nuevo: **el default es `false`**
 * (build sin flag nunca incumple) y cada escena decide con el flag
 * `services.fullscreenEnabled` que resuelve `main.ts` desde
 * `VITE_FULLSCREEN` (ADR-008).
 *
 * El test 1 es el rojo del bug: el código real tenía `= true` mientras
 * el JSDoc de la clase juraba lo contrario, así que las 4 escenas
 * heredaban el botón prohibido.
 */
describe('SoundFullscreenControls', () => {
  // Del mock de arriba: misma clase, instancias compartidas entre tests.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const HudIconButtonMock = jest.requireMock('./HudIconButton').HudIconButton as any;

  function fakeScene(fullscreenAvailable: boolean): FakeScene {
    return {
      scale: {
        fullscreen: { available: fullscreenAvailable },
        isFullscreen: false,
        gameSize: { width: 800, height: 600 },
        on: jest.fn(),
        off: jest.fn()
      }
    } as unknown as FakeScene;
  }

  const audioService = {
    isMuted: () => false,
    toggleMuted: () => undefined
  } as unknown as FakeAudio;

  beforeEach(() => {
    HudIconButtonMock.instances.length = 0;
  });

  it('por defecto (sin el 3er argumento) NO crea el botón de pantalla completa — solo Sonido', () => {
    const controls = new SoundFullscreenControls(fakeScene(true), audioService);

    // 1 sola instancia = mute. Con el default viejo (= true) eran 2:
    // el botón prohibido heredado por las 4 escenas (bug CG-PUB-002).
    expect(HudIconButtonMock.instances).toHaveLength(1);
    controls.destroy();
  });

  it('con showFullscreenButton=true y fullscreen disponible crea ambos botones', () => {
    const controls = new SoundFullscreenControls(fakeScene(true), audioService, true);

    expect(HudIconButtonMock.instances).toHaveLength(2);
    controls.destroy();
  });

  it('con showFullscreenButton=true pero sin fullscreen disponible (iOS/iframe) no crea el botón muerto', () => {
    const controls = new SoundFullscreenControls(fakeScene(false), audioService, true);

    expect(HudIconButtonMock.instances).toHaveLength(1);
    controls.destroy();
  });

  it('con showFullscreenButton=false explícito tampoco lo crea', () => {
    const controls = new SoundFullscreenControls(fakeScene(true), audioService, false);

    expect(HudIconButtonMock.instances).toHaveLength(1);
    controls.destroy();
  });

  // Teclado PC (Fase 2): la tecla S del menú principal alterna el mute sin
  // pasar por el botón — el método público delega en el MISMO camino que el
  // callback del HudIconButton (toggleMuted del servicio + refresh del botón).
  it('toggleMuted() alterna el audio y refresca el botón de sonido', () => {
    let muted = false;
    const toggleMuted = jest.fn(() => {
      muted = !muted;
    });
    const controls = new SoundFullscreenControls(
      fakeScene(true),
      { isMuted: () => muted, toggleMuted } as unknown as FakeAudio
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const muteButton: any = HudIconButtonMock.instances[0];
    const setIconTexture = jest.spyOn(muteButton, 'setIconTexture');
    const setLabel = jest.spyOn(muteButton, 'setLabel');

    controls.toggleMuted();

    expect(toggleMuted).toHaveBeenCalledTimes(1);
    // El refresh del botón = ícono + etiqueta según el nuevo estado:
    // son 'hud-soundoff' y 'HUD_SOUND_OFF' porque acabamos de silenciar.
    expect(setIconTexture).toHaveBeenCalledWith('hud-soundoff');
    expect(setLabel).toHaveBeenCalledTimes(1);
    controls.destroy();
  });

  // Regresión del refactoring (review NIT): si el callback del HudIconButton
  // volviera a ser un inline que NO delega en toggleMuted(), este test falla.
  it('el callback del botón de sonido delega en toggleMuted()', () => {
    let muted = false;
    const toggleMuted = jest.fn(() => {
      muted = !muted;
    });
    const controls = new SoundFullscreenControls(
      fakeScene(true),
      { isMuted: () => muted, toggleMuted } as unknown as FakeAudio
    );
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const muteButton: any = HudIconButtonMock.instances[0];
    const buttonOnClick = muteButton.ctorArgs[4] as () => void;

    buttonOnClick();

    expect(toggleMuted).toHaveBeenCalledTimes(1);
    controls.destroy();
  });
});
