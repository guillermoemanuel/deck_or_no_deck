// Phaser real toca `window` en su import — mismo mock mínimo que
// AdOverlayScene.spec (entorno de tests `node`, sin jsdom): solo la
// clase base de la escena.
jest.mock('phaser', () => ({
  Scene: class {}
}));

import { AD_BLOCKER_KEY, createAdBlockerListener } from './AdBlockerScene';
import type Phaser from 'phaser';

/**
 * CG-MON-001 (auditoría de publicación 2026-10-04): en modo `crazygames`
 * NADA bloqueaba la UI durante el ciclo del ad — `ResultScene` dejaba
 * "Jugar de nuevo"/"Ir al Menú" vivos, la navegación corría con el ad en
 * vuelo (el guard `adInProgress` rechazaba el 2.º request pero
 * `onComplete()` navegaba igual) y detrás seguían GameScene/UIScene.
 * Requisito oficial: "Block the UI until either an adFinished or adError
 * event occurs" (docs.crazygames.com/requirements/ads/).
 *
 * Este listener es el cable que `main.ts` conecta al ciclo de vida del
 * adapter (fuera de modo `portal`: ahí AdOverlayScene ya ES el
 * bloqueador del overlay propio — ADR-010): 'requesting'/'started'
 * levantan la escena bloqueadora y 'ended' la baja, garantizando el par
 * con el contrato de fases del puerto.
 */
describe('createAdBlockerListener', () => {
  function fakeGame(): { game: Phaser.Game; start: jest.Mock; stop: jest.Mock } {
    const start = jest.fn();
    const stop = jest.fn();
    const game = { scene: { start, stop } } as unknown as Phaser.Game;
    return { game, start, stop };
  }

  it('levanta el bloqueador en "requesting" y lo baja en "ended" (ciclo sin start: sin fill)', () => {
    const { game, start, stop } = fakeGame();
    const listener = createAdBlockerListener(game);

    listener('requesting', 'rewarded');
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith(AD_BLOCKER_KEY);
    expect(stop).not.toHaveBeenCalled();

    listener('ended', 'rewarded');
    expect(stop).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledWith(AD_BLOCKER_KEY);
  });

  it('no levanta dos veces: "requesting" seguido de "started" es UN solo start', () => {
    const { game, start, stop } = fakeGame();
    const listener = createAdBlockerListener(game);

    listener('requesting', 'midgame');
    listener('started', 'midgame');
    listener('ended', 'midgame');

    expect(start).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('sin fase "requesting" (adapter que arranca directo en "started") también levanta y baja', () => {
    const { game, start, stop } = fakeGame();
    const listener = createAdBlockerListener(game);

    listener('started', 'rewarded');
    expect(start).toHaveBeenCalledTimes(1);

    listener('ended', 'rewarded');
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('"ended" aislado no toca la escena (no había ciclo abierto que apagar)', () => {
    const { game, start, stop } = fakeGame();
    const listener = createAdBlockerListener(game);

    listener('ended', 'rewarded');

    expect(start).not.toHaveBeenCalled();
    expect(stop).not.toHaveBeenCalled();
  });

  it('dos ciclos completos levantan y bajan una vez cada uno (el flag se reinicia)', () => {
    const { game, start, stop } = fakeGame();
    const listener = createAdBlockerListener(game);

    listener('requesting', 'rewarded');
    listener('started', 'rewarded');
    listener('ended', 'rewarded');
    listener('requesting', 'midgame');
    listener('started', 'midgame');
    listener('ended', 'midgame');

    expect(start).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledTimes(2);
  });
});
