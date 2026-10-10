jest.mock('phaser', () => ({
  Scene: class {},
  GameObjects: {
    Container: class {},
    Graphics: class {},
    Rectangle: class {},
    Circle: class {}
  },
  BlendModes: {
    ADD: 1
  }
}));

import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { ChessCardScatterEffect } from './ChessCardScatterEffect';
import { DeckCelebrationEffect } from './DeckCelebrationEffect';

/**
 * Objeto falso que imita lo mínimo de un GameObject de Phaser que usa el
 * efecto. Los métodos encadenables devuelven `this`, igual que Phaser.
 */
interface FakeObject {
  kind: string;
  x: number;
  y: number;
  alpha: number;
  scaleX: number;
  scaleY: number;
  angle: number;
  destroyed: boolean;
  children: FakeObject[];
  [key: string]: unknown;
}

interface TweenConfig {
  targets: FakeObject | FakeObject[];
  duration?: number;
  delay?: number;
  onComplete?: () => void;
  [key: string]: unknown;
}

interface Timer {
  at: number;
  order: number;
  run: () => void;
}

/**
 * Escena falsa con reloj simulado: `runAll()` ejecuta temporizadores y
 * tweens en orden cronológico, aplica los valores finales de cada tween y
 * dispara sus `onComplete`. Así se puede verificar la línea de tiempo
 * completa del efecto sin Phaser real.
 */
function createFakeScene(width = 1280, height = 720, cardPosition?: { x: number; y: number }) {
  const timers: Timer[] = [];
  const created: FakeObject[] = [];
  const containers: FakeObject[] = [];
  const tweenConfigs: TweenConfig[] = [];
  const shakes: number[] = [];
  let now = 0;
  let order = 0;

  const makeObject = (kind: string, x = 0, y = 0): FakeObject => {
    const obj = {
      kind,
      x,
      y,
      alpha: 1,
      scaleX: 1,
      scaleY: 1,
      angle: 0,
      destroyed: false,
      children: [] as FakeObject[]
    } as FakeObject;

    const self = obj as unknown as Record<string, unknown>;
    const chain = (fn: (...args: number[]) => void) => (...args: number[]) => {
      fn(...args);
      return obj;
    };
    self.setAlpha = chain((a) => {
      obj.alpha = a;
    });
    self.setPosition = chain((px, py) => {
      obj.x = px;
      obj.y = py;
    });
    self.setScale = chain((s) => {
      obj.scaleX = s;
      obj.scaleY = s;
    });
    self.setBlendMode = chain(() => undefined);
    ['fillStyle', 'lineStyle', 'fillRect', 'strokeRect', 'fillRoundedRect', 'strokeRoundedRect', 'fillCircle', 'strokeCircle', 'fillTriangle', 'strokeEllipse'].forEach(
      (name) => {
        self[name] = chain(() => undefined);
      }
    );
    self.add = (child: FakeObject | FakeObject[]) => {
      (Array.isArray(child) ? child : [child]).forEach((c) => obj.children.push(c));
      return obj;
    };
    self.destroy = () => {
      obj.destroyed = true;
      obj.children.forEach((c) => (c.destroyed = true));
    };

    created.push(obj);
    return obj;
  };

  const scene = {
    cameras: { main: { width, height, shake: (duration: number) => shakes.push(duration) } },
    add: {
      container: () => {
        const c = makeObject('container');
        containers.push(c);
        return c;
      },
      rectangle: (x: number, y: number) => makeObject('rectangle', x, y),
      circle: (x: number, y: number) => makeObject('circle', x, y),
      graphics: () => makeObject('graphics')
    },
    tweens: {
      add: (config: TweenConfig) => {
        tweenConfigs.push(config);
        const targets = Array.isArray(config.targets) ? config.targets : [config.targets];
        timers.push({
          at: now + (config.delay ?? 0) + (config.duration ?? 0),
          order: order++,
          run: () => {
            // Aplica los valores finales numéricos del tween a sus objetivos
            targets.forEach((t) => {
              ['x', 'y', 'alpha', 'angle', 'scaleX', 'scaleY'].forEach((prop) => {
                const value = config[prop];
                if (typeof value === 'number') (t as FakeObject)[prop] = value;
              });
              if (typeof config.scale === 'number') {
                t.scaleX = config.scale;
                t.scaleY = config.scale;
              }
            });
            config.onComplete?.();
          }
        });
      }
    },
    time: {
      delayedCall: (ms: number, run: () => void) => {
        timers.push({ at: now + ms, order: order++, run });
      }
    },
    ...(cardPosition ? { getCardScreenPosition: () => cardPosition } : {})
  };

  const runAll = (): number => {
    let guard = 0;
    while (timers.length > 0 && guard++ < 10000) {
      timers.sort((a, b) => a.at - b.at || a.order - b.order);
      const next = timers.shift() as Timer;
      now = next.at;
      next.run();
    }
    return now;
  };

  return { scene: scene as unknown as Phaser.Scene, created, containers, tweenConfigs, shakes, runAll };
}

describe('ChessCardScatterEffect', () => {
  const card = Card.create('card_7', 25000, false);

  it('implements the DeckCelebrationEffect strategy contract', () => {
    const effect: DeckCelebrationEffect = new ChessCardScatterEffect();
    expect(typeof effect.play).toBe('function');
  });

  it('creates a single root container and does not throw', () => {
    const fake = createFakeScene();
    new ChessCardScatterEffect().play(fake.scene, card);
    expect(fake.containers.length).toBe(1);
  });

  it('shakes the camera on impact', () => {
    const fake = createFakeScene();
    new ChessCardScatterEffect().play(fake.scene, card);
    fake.runAll();
    expect(fake.shakes.length).toBeGreaterThan(0);
  });

  it('destroys everything it created and finishes within 4 seconds (self-cleanup)', () => {
    const fake = createFakeScene();
    new ChessCardScatterEffect().play(fake.scene, card);
    const end = fake.runAll();

    expect(end).toBeLessThan(4000);
    expect(fake.containers[0].destroyed).toBe(true);
    const leaked = fake.created.filter((o) => !o.destroyed);
    expect(leaked.length).toBe(0);
  });

  it('keeps every animated card inside the visible screen', () => {
    for (let run = 0; run < 40; run++) {
      const fake = createFakeScene(1280, 720);
      new ChessCardScatterEffect().play(fake.scene, card);
      fake.runAll();

      fake.tweenConfigs.forEach((config) => {
        if (typeof config.x === 'number') {
          expect(config.x).toBeGreaterThan(-1);
          expect(config.x).toBeLessThan(1281);
        }
        if (typeof config.y === 'number') {
          expect(config.y).toBeGreaterThan(-1);
          expect(config.y).toBeLessThan(721);
        }
      });
    }
  });

  it('spawns the localized burst on the position of the 25,000 card', () => {
    const fake = createFakeScene(1280, 720, { x: 300, y: 400 });
    new ChessCardScatterEffect().play(fake.scene, card);
    fake.runAll();
    const onTarget = fake.created.filter((o) => o.kind === 'circle' && o.x === 300 && o.y === 400);
    expect(onTarget.length).toBe(1);
  });

  it('falls back to the screen center when the scene cannot locate the card', () => {
    const fake = createFakeScene(1280, 720);
    new ChessCardScatterEffect().play(fake.scene, card);
    fake.runAll();
    const onCenter = fake.created.filter((o) => o.kind === 'circle' && o.x === 640 && o.y === 360);
    expect(onCenter.length).toBe(1);
  });
});
