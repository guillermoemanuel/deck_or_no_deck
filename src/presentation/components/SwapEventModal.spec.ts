// Fase 7g-2 (teclado PC): flechas + ENTER + ESC en SwapEventModal.
//
// Especificación RED-first (escrita ANTES de la implementación): el modal ya
// tenía moveFocus/activateFocusedButton pero NADIE los llamaba (GameScene
// hacía return temprano con isSwapModalOpen) y highlightFocusedButton apagaba
// CON `as any` a TODOS los children de ambos botones (bg, texto e ícono
// incluidos — el botón desaparecía). Este spec fija el contrato nuevo:
//   - foco inicial visible en índice 0 (Mantener — la opción segura),
//   - semántica de flechas igual que BankerOfferPanel (absoluto en ←/→,
//     alternancia en ↑/↓, sin wrap),
//   - ENTER = MISMA cadena que el botón enfocado, con sonido (playUiClick),
//   - ESC = declinar SIN sonido (cancelar no confirma — ADR-015,
//     precedente UIScene.handleEscapeKey),
//   - guard `exitStarted` ÚNICO para las dos salidas: GameSceneController
//     tiene `.once` POR evento, así que un doble ENTER (o Enter+ESC) durante
//     el tween de salida de 150 ms emitiría 'swap-declined' Y
//     'swap-accepted-choose-card' y dispararía las DOS ramas — mismo bug que
//     ya cubre la cabecera L1-14 de BankerOfferPanel.spec.
//
// Entorno `node` (sin jsdom): mock mínimo de 'phaser' al estilo de
// BankerOfferPanel.spec — SwapEventModal extiende GameObjects.Container
// (hereda su `emit`, acá un jest.fn por instancia) y LocalizedText extiende
// GameObjects.Text. La escena falsa cubre lo que el ctor REAL del modal toca:
// cameras.main, add.rectangle/graphics/container/zone/existing y tweens.add.
// Los tweens NO corren solos: `completePendingTweens` descarga la cola a
// mano (por lotes, porque los callbacks anidan — el onComplete del tween de
// salida recién ahí emite), que es lo que permite simular "durante el tween
// de salida" y observar el emit.
//
// Sin audio en el fixture: el ctor acepta `audio?` opcional y
// `playUiClick(undefined)` es no-op por diseño (UiSfx.ts: `if (!audio) return`),
// así que ENTER no necesita fake de audio para no tronar.
jest.mock('phaser', () => {
  class Container {
    scene: unknown;
    x: number;
    y: number;
    scale: number;
    alpha: number;
    // Emit observable por instancia: el modal emite 'swap-declined' /
    // 'swap-accepted-choose-card' vía this.emit(...) del Container que hereda.
    emit: jest.Mock;
    constructor(scene: unknown, x: number, y: number) {
      this.scene = scene;
      this.x = x;
      this.y = y;
      this.scale = 1;
      this.alpha = 1;
      this.emit = jest.fn();
    }
    add(_children?: unknown): void {}
    setScale(scale: number): this {
      this.scale = scale;
      return this;
    }
    setAlpha(alpha: number): this {
      this.alpha = alpha;
      return this;
    }
  }

  class Text {
    text: string;
    constructor(_scene: unknown, _x: number, _y: number, text: string, _style?: unknown) {
      this.text = text;
    }
    once(): void {}
    setText(text: string): this {
      this.text = text;
      return this;
    }
    setOrigin(_origin?: number): this {
      return this;
    }
  }

  return {
    GameObjects: {
      Container,
      Text,
      Events: { DESTROY: 'destroy' }
    }
  };
});

import { SwapEventModal } from './SwapEventModal';

type ModalSceneArg = ConstructorParameters<typeof SwapEventModal>[0];

interface FakeRectangle {
  setInteractive: jest.Mock;
  setStrokeStyle: jest.Mock;
}

interface FakeGraphics {
  fillStyle: jest.Mock;
  fillRoundedRect: jest.Mock;
  lineStyle: jest.Mock;
  strokeRoundedRect: jest.Mock;
  fillCircle: jest.Mock;
  setAlpha: jest.Mock;
}

/** Contenedor falso de botón (scene.add.container): solo target de tween y add(). */
interface FakeButtonContainer {
  add: jest.Mock;
  scale: number;
  alpha: number;
}

/** Zona interactiva: `handlers` registra lo que el modal suscribe con on() para disparar los pointers a mano. */
interface FakeZone {
  handlers: Record<string, () => void>;
  setOrigin: jest.Mock;
  setInteractive: jest.Mock;
  on: jest.Mock;
}

interface FakeTweenConfig {
  targets?: unknown;
  duration?: number;
  ease?: string;
  alpha?: number | { from: number; to: number };
  scale?: number | { from: number; to: number };
  yoyo?: boolean;
  repeat?: number;
  onComplete?: () => void;
  onUpdate?: () => void;
}

interface FakeScene {
  cameras: { main: { centerX: number; centerY: number; width: number; height: number } };
  add: {
    rectangle: jest.Mock;
    graphics: jest.Mock;
    container: jest.Mock;
    zone: jest.Mock;
    existing: jest.Mock;
  };
  tweens: { add: jest.Mock };
  /** Callbacks pedidos a scene.tweens.add y todavía no completados. */
  pendingTweens: FakeTweenConfig[];
  /** TODOS los tweens creados (no se vacía) — para asertar targets de resaltado. */
  allTweens: FakeTweenConfig[];
  /** Zonas creadas en orden: la primera es la de "Mantener" (el ctor la crea primero). */
  zones: FakeZone[];
  /** Graphics creados en orden — ver comentario de índices en el test de resaltado. */
  graphics: FakeGraphics[];
  /** Containers creados en orden: [0] = "Mantener", [1] = "Cambiar". */
  containers: FakeButtonContainer[];
}

function createFakeRectangle(): FakeRectangle {
  const rect: FakeRectangle = {
    setInteractive: jest.fn((): FakeRectangle => rect),
    setStrokeStyle: jest.fn((): FakeRectangle => rect)
  };
  return rect;
}

function createFakeGraphics(): FakeGraphics {
  const graphics: FakeGraphics = {
    fillStyle: jest.fn((): FakeGraphics => graphics),
    fillRoundedRect: jest.fn((): FakeGraphics => graphics),
    lineStyle: jest.fn((): FakeGraphics => graphics),
    strokeRoundedRect: jest.fn((): FakeGraphics => graphics),
    fillCircle: jest.fn((): FakeGraphics => graphics),
    setAlpha: jest.fn((): FakeGraphics => graphics)
  };
  return graphics;
}

function createFakeZone(): FakeZone {
  const zone: FakeZone = {
    handlers: {},
    setOrigin: jest.fn((): FakeZone => zone),
    setInteractive: jest.fn((): FakeZone => zone),
    on: jest.fn((event: string, handler: () => void): FakeZone => {
      zone.handlers[event] = handler;
      return zone;
    })
  };
  return zone;
}

function createFakeScene(): FakeScene {
  const pendingTweens: FakeTweenConfig[] = [];
  const allTweens: FakeTweenConfig[] = [];
  const zones: FakeZone[] = [];
  const graphics: FakeGraphics[] = [];
  const containers: FakeButtonContainer[] = [];

  return {
    cameras: { main: { centerX: 640, centerY: 360, width: 1280, height: 720 } },
    add: {
      rectangle: jest.fn((): FakeRectangle => createFakeRectangle()),
      graphics: jest.fn((): FakeGraphics => {
        const gfx = createFakeGraphics();
        graphics.push(gfx);
        return gfx;
      }),
      container: jest.fn((): FakeButtonContainer => {
        const container: FakeButtonContainer = { add: jest.fn(), scale: 1, alpha: 1 };
        containers.push(container);
        return container;
      }),
      zone: jest.fn((): FakeZone => {
        const zone = createFakeZone();
        zones.push(zone);
        return zone;
      }),
      existing: jest.fn()
    },
    tweens: {
      // No autocompleta: la cola se drena con completePendingTweens para que
      // los dos intentos del guard ocurran ANTES de que corra el onComplete.
      add: jest.fn((config: FakeTweenConfig): { stop: jest.Mock } => {
        pendingTweens.push(config);
        allTweens.push(config);
        return { stop: jest.fn() };
      })
    },
    pendingTweens,
    allTweens,
    zones,
    graphics,
    containers
  };
}

/**
 * Avanza el tiempo fake hasta vaciar la cola de tweens, por lotes: los
 * callbacks pueden PEDIR tweens nuevos (el pointerup del botón recién ahí
 * crea el tween de salida), y esos entran en el lote siguiente.
 */
function completePendingTweens(scene: FakeScene): void {
  let batches = 0;
  while (scene.pendingTweens.length > 0) {
    if (++batches > 50) {
      throw new Error('completePendingTweens: la cola de tweens no se vacía (¿tween que se re-agrega solo?)');
    }
    const batch = scene.pendingTweens.splice(0, scene.pendingTweens.length);
    for (const tween of batch) {
      tween.onUpdate?.();
      tween.onComplete?.();
    }
  }
}

/** Targets (aplanados) de los tweens creados desde el índice `from` en adelante. */
function tweenTargetsFrom(scene: FakeScene, from = 0): unknown[] {
  const targets: unknown[] = [];
  for (const config of scene.allTweens.slice(from)) {
    const current = config.targets;
    if (Array.isArray(current)) {
      targets.push(...current);
    } else if (current !== undefined) {
      targets.push(current);
    }
  }
  return targets;
}

interface ModalFixture {
  modal: SwapEventModal;
  scene: FakeScene;
}

/** Crea un SwapEventModal REAL sobre la escena falsa (cada fixture es independiente). */
function createModal(): ModalFixture {
  const scene = createFakeScene();
  const modal = new SwapEventModal(scene as unknown as ModalSceneArg);
  return { modal, scene };
}

/** Spy del emit del Container mockeado: es por donde salen swap-declined / swap-accepted-choose-card. */
function emitSpy(modal: SwapEventModal): jest.Mock {
  return modal.emit as unknown as jest.Mock;
}

describe('SwapEventModal', () => {
  describe('foco inicial (Fase 7g-2)', () => {
    it('arranca con el índice 0 enfocado (Mantener — la acción segura)', () => {
      const { modal } = createModal();

      expect(modal.getFocusedButtonIndex()).toBe(0);
    });
  });

  describe("flechas — moveFocus (absoluto en ←/→, alterna en ↑/↓)", () => {
    it("moveFocus('right') → 1 (Cambiar) y moveFocus('left') → 0 (Mantener)", () => {
      const { modal } = createModal();

      modal.moveFocus('right');
      expect(modal.getFocusedButtonIndex()).toBe(1);

      modal.moveFocus('left');
      expect(modal.getFocusedButtonIndex()).toBe(0);
    });

    it('bordes sin wrap: right desde 1 se queda en 1; left desde 0 se queda en 0', () => {
      const { modal } = createModal();

      modal.moveFocus('left');
      expect(modal.getFocusedButtonIndex()).toBe(0);

      modal.moveFocus('right');
      expect(modal.getFocusedButtonIndex()).toBe(1);

      modal.moveFocus('right');
      expect(modal.getFocusedButtonIndex()).toBe(1);
    });

    it("moveFocus('up') desde 0 → 1 y moveFocus('down') desde 1 → 0 (eje ambiguo alterna)", () => {
      const { modal } = createModal();

      modal.moveFocus('up');
      expect(modal.getFocusedButtonIndex()).toBe(1);

      modal.moveFocus('down');
      expect(modal.getFocusedButtonIndex()).toBe(0);
    });
  });

  describe('ENTER — activateFocusedButton', () => {
    it('con foco inicial emite exactamente 1 swap-declined y ningún swap-accepted-choose-card', () => {
      const { modal, scene } = createModal();
      const emit = emitSpy(modal);

      modal.activateFocusedButton();
      completePendingTweens(scene);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('swap-declined');
      expect(emit).not.toHaveBeenCalledWith('swap-accepted-choose-card');
    });

    it("tras moveFocus('right') emite exactamente 1 swap-accepted-choose-card", () => {
      const { modal, scene } = createModal();
      const emit = emitSpy(modal);

      modal.moveFocus('right');
      modal.activateFocusedButton();
      completePendingTweens(scene);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('swap-accepted-choose-card');
      expect(emit).not.toHaveBeenCalledWith('swap-declined');
    });

    it('doble ENTER durante la salida emite solo 1 evento (guard exitStarted)', () => {
      const { modal, scene } = createModal();
      const emit = emitSpy(modal);

      // Doble ENTER antes de que termine el tween de salida de 150 ms: sin el
      // guard, las DOS ramas del controller ('swap-declined' Y
      // 'swap-accepted-choose-card') se dispararían en la misma partida.
      modal.activateFocusedButton();
      modal.activateFocusedButton();
      completePendingTweens(scene);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('swap-declined');
      expect(emit).not.toHaveBeenCalledWith('swap-accepted-choose-card');
    });
  });

  describe('ESC — declineFromKeyboard (silencioso)', () => {
    it('dos llamadas emiten exactamente 1 swap-declined (misma cadena que el botón Mantener)', () => {
      const { modal, scene } = createModal();
      const emit = emitSpy(modal);

      modal.declineFromKeyboard();
      modal.declineFromKeyboard();
      completePendingTweens(scene);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('swap-declined');
      expect(emit).not.toHaveBeenCalledWith('swap-accepted-choose-card');
    });

    it('es no-op tras una activación ya en salida (solo swap-accepted-choose-card)', () => {
      const { modal, scene } = createModal();
      const emit = emitSpy(modal);

      modal.moveFocus('right');
      modal.activateFocusedButton();
      modal.declineFromKeyboard();
      completePendingTweens(scene);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('swap-accepted-choose-card');
      expect(emit).not.toHaveBeenCalledWith('swap-declined');
    });

    it("moveFocus es no-op tras declineFromKeyboard() (el índice queda congelado)", () => {
      const { modal } = createModal();

      modal.moveFocus('right'); // → 1 (Cambiar)
      modal.declineFromKeyboard(); // arranca la salida con foco en 1
      modal.moveFocus('left'); // guard: no debe reposicionar durante la salida

      expect(modal.getFocusedButtonIndex()).toBe(1);
    });
  });

  describe('ratón — comparte el mismo guard exitStarted', () => {
    // Mismo bug original que cubre BankerOfferPanel.spec: durante los 150 ms
    // del tween de salida el modal sigue interactivo, así que un doble click
    // (o click en "Mantener" y luego en "Cambiar") llegaba dos veces a los
    // handlers y emitía 'swap-declined' Y 'swap-accepted-choose-card'.
    it('BUGFIX exitStarted: un doble click en "Mantener" durante la salida emite swap-declined una sola vez', () => {
      const { modal, scene } = createModal();
      const emit = emitSpy(modal);

      // Zona de "Mantener": el ctor crea este botón primero (zones[0]).
      const keepZone = scene.zones[0];
      keepZone.handlers.pointerup();
      keepZone.handlers.pointerup();
      completePendingTweens(scene);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('swap-declined');
      expect(emit).not.toHaveBeenCalledWith('swap-accepted-choose-card');
    });
  });

  describe('resaltado — solo halo + scale del container (bug del highlight viejo)', () => {
    // Orden REAL de scene.add.graphics() en el ctor: por botón se crean
    // hoverGlow, bg, iconGlow y cardIcon — "Mantener" (se crea primero)
    // ocupa 0..3 y "Cambiar" 4..7.
    const KEEP_HALO = 0;
    const KEEP_BG = 1;
    const SWAP_HALO = 4;
    const SWAP_BG = 5;

    it('enciende el halo del botón enfocado sin tocar jamás su bg (ni el de los demás)', () => {
      const { modal, scene } = createModal();

      // Foco inicial: el halo de "Mantener" es target del tween de encendido…
      expect(tweenTargetsFrom(scene)).toContain(scene.graphics[KEEP_HALO]);
      // …y el fondo NUNCA: el highlight viejo hacía setAlpha(0) a todos los
      // children del container (bg, texto e ícono incluidos) vía `as any`.
      expect(tweenTargetsFrom(scene)).not.toContain(scene.graphics[KEEP_BG]);
      expect(scene.graphics[KEEP_BG].setAlpha).not.toHaveBeenCalledWith(0);
      expect(scene.graphics[SWAP_BG].setAlpha).not.toHaveBeenCalledWith(0);

      const before = scene.allTweens.length;
      modal.moveFocus('right');
      const newTargets = tweenTargetsFrom(scene, before);

      // El cambio de foco toca SOLO el halo y el container del botón nuevo…
      expect(newTargets).toContain(scene.graphics[SWAP_HALO]);
      expect(newTargets).toContain(scene.containers[1]);
      // …nunca el bg del botón que se enfoca.
      expect(newTargets).not.toContain(scene.graphics[SWAP_BG]);
      expect(scene.graphics[SWAP_BG].setAlpha).not.toHaveBeenCalledWith(0);
    });
  });
});
