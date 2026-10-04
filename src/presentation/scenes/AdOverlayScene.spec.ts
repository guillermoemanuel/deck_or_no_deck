// Phaser real toca `window` en su import (device/OS.js) y el entorno de este
// proyecto es `node` (sin jsdom instalado) — mismo mock mínimo que usa
// DeckCelebrationEffect.spec: solo lo que estos módulos referencian al
// cargar (clase base de la escena y de LocalizedText) o al correr
// presentAdOverlay (constantes de eventos).
jest.mock('phaser', () => ({
  Scene: class {},
  GameObjects: {
    Text: class {},
    Events: { DESTROY: 'destroy' }
  },
  Scenes: {
    Events: { SHUTDOWN: 'shutdown', DESTROY: 'destroy' }
  },
  Core: {
    Events: { DESTROY: 'destroy' }
  }
}));

import { AD_OVERLAY_KEY, presentAdOverlay } from './AdOverlayScene';

/**
 * Especificación de `presentAdOverlay` — la carrera add/start con la cola
 * de Phaser (ADR-007, enmienda 2026-10-04).
 *
 * Causa raíz (reproducida en vivo): `SceneManager.add()` de Phaser 3.90 se
 * DEFIERE a `_pending` cuando `isProcessing` es true — no registra la
 * escena todavía —, pero `SceneManager.start()` NO se defiere: consulta
 * `getScene` sincrónico, imprime `Scene key not found: AdOverlayScene` y
 * no arranca nada. La promise del presenter quedaba colgada hasta el
 * watchdog de 15 s del adapter → `error` → cooldown de 60 s en el PRIMER
 * ad de la sesión; al frame siguiente `processQueue()` sí registraba la
 * escena (dormida), por eso "después funciona bien".
 *
 * Contrato nuevo: la escena se registra EN EL BOOT (`config.scene` de
 * `main.ts`, última de la lista) y este presenter SOLO pide el start — si
 * la escena faltara (regresión), degrada en 0 s con `{ completed: false }`
 * en vez de colgar.
 */

type FakeGame = {
  game: Parameters<typeof presentAdOverlay>[0];
  start: jest.Mock;
  add: jest.Mock;
  getScene: jest.Mock;
  once: jest.Mock;
};

function fakeGame(registered: boolean): FakeGame {
  const start = jest.fn();
  const add = jest.fn();
  const getScene = jest.fn(() => (registered ? ({} as object) : null));
  const once = jest.fn();
  const off = jest.fn();
  const game = {
    scene: { getScene, add, start },
    events: { once, off }
  } as unknown as Parameters<typeof presentAdOverlay>[0];
  return { game, start, add, getScene, once };
}

describe('presentAdOverlay', () => {
  let consoleError: jest.SpyInstance;

  beforeEach(() => {
    consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('con la escena registrada arranca con data (sin add en runtime) y resuelve con el resultado del overlay', async () => {
    const { game, start, add } = fakeGame(true);

    const promise = presentAdOverlay(game, 'midgame');

    // Ya registrada en boot: el add en runtime es el camino de la carrera — no existe.
    expect(add).not.toHaveBeenCalled();
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(
      AD_OVERLAY_KEY,
      expect.objectContaining({ type: 'midgame', onDone: expect.any(Function) })
    );

    // El onDone que el presenter le pasó a la escena cierra el ciclo.
    const sceneData = start.mock.calls[0][1] as { onDone: (r: { completed: boolean }) => void };
    sceneData.onDone({ completed: true });
    await expect(promise).resolves.toEqual({ completed: true });
  });

  it('sin la escena registrada degrada en 0 s con { completed: false } — nunca llama a add ni se cuelga hasta el watchdog', async () => {
    const { game, start, add } = fakeGame(false);

    // Race contra un sentinel: con el código viejo la promise quedaba
    // pendiente (add diferido + start fallido) y ganaba el timeout.
    const result = await Promise.race([
      presentAdOverlay(game, 'rewarded'),
      new Promise<'sin resolver'>(resolve => setTimeout(() => resolve('sin resolver'), 100))
    ]);

    expect(result).toEqual({ completed: false });
    // add() es el diferido de Phaser que originó la carrera — prohibido en runtime.
    expect(add).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
    // La degradación tiene que quedar trazada en consola (config rota).
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it('si el juego se destruye antes de que el overlay resuelva, la promise resuelve { completed: false }', async () => {
    const { game, once } = fakeGame(true);

    const promise = presentAdOverlay(game, 'rewarded');

    const destroyCall = once.mock.calls.find(
      call => call[0] === 'destroy' || String(call[0]).toLowerCase().includes('destroy')
    );
    expect(destroyCall).toBeDefined();
    (destroyCall![1] as () => void)();

    await expect(promise).resolves.toEqual({ completed: false });
  });
});
