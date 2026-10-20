// Fase 7g-3 (teclado PC): flechas ←/→ + ENTER en PeriodicBonusModal.
//
// Especificación RED-first (escrita ANTES de la implementación): el modal ya
// tenía moveFocus/activateFocusedCard pero NADIE los llamaba de verdad — el
// ruteo de flechas/Enter vivía DENTRO de handleBonusKey (el handler de Z),
// que solo se dispara al apretar Z, así que `event.key === 'ArrowLeft'` era
// código muerto; ENTER estaba bindeado a activateExitModalButton, que
// temprano-retorna sin exitModal. Además highlightFocusedCard aplicaba
// `setAlpha(0.35)` crudo mientras el hover del ratón tween-eaba a 0.7/100 ms
// (efectos divergentes que se pisaban) y el foco inicial era invisible.
// Este spec fija el contrato nuevo:
//   - foco inicial VISIBLE en índice 0 con el MISMO tween que el hover
//     (alpha 0.7, duration 100, sin ease — dueño único del glow),
//   - ←/→ sin wrap (0..5, 6 cartas),
//   - ENTER pre-entrega = MISMO camino que el pointerup de la carta,
//   - ENTER post-entrega = MISMO camino que el botón "Cerrar"
//     (requestClose() → callbacks.onClose),
//   - guard `resolved` congela moveFocus tras la entrega (ENTER es el que
//     cierra; ESC ya cerraba),
//   - al salir el puntero de una carta se re-asserta el foco de teclado
//     (el glow de la carta enfocada vuelve; las demás quedan en 0).
//
// Entorno `node` (sin jsdom): mock mínimo de 'phaser' al estilo de
// SwapEventModal.spec — PeriodicBonusModal extiende GameObjects.Container y
// LocalizedText extiende GameObjects.Text. La escena falsa cubre lo que el
// ctor REAL del modal toca: cameras.main, add.rectangle/graphics/image/text/
// container/zone/existing, tweens.add, time.delayedCall y sound.play. Los
// tweens NO corren solos: `completePendingTweens` drena la cola a mano (por
// lotes, porque los callbacks anidan — el flip recién ahí revela), y
// `completeDelayedCalls` dispara el reveal de 420 ms que construye
// showResult() (texto de resultado + botón "Cerrar").
//
// Audio: activateFocusedCard() juega 'sfx-bonus-claim' envuelto en try/catch
// (mejor esfuerzo), y la fake scene SÍ expone sound.play para poder asertar
// que el camino de teclado no truena.
jest.mock('phaser', () => {
  class Container {
    scene: unknown;
    x: number;
    y: number;
    scale: number;
    alpha: number;
    constructor(scene: unknown, x: number, y: number) {
      this.scene = scene;
      this.x = x;
      this.y = y;
      this.scale = 1;
      this.alpha = 1;
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

import { PeriodicBonusModal, PeriodicBonusModalCallbacks } from './PeriodicBonusModal';

type ModalSceneArg = ConstructorParameters<typeof PeriodicBonusModal>[0];

/**
 * 6 cartas (los índices reales van de 0 a 5). Valores de 3 dígitos a
 * propósito: el contrato que fija este spec es que el importe elegido viaja
 * como NÚMERO (CardSlot.value) — no re-parseando el texto formateado de la
 * carta. El caso de locale (separador de miles por punto) se cubre aparte,
 * en el describe "BUGFIX locale", con el formateo mockeado para no depender
 * del locale de la máquina.
 */
const TEST_VALUES = [100, 200, 300, 400, 500, 600];

interface FakeRectangle {
  setInteractive: jest.Mock;
  setStrokeStyle: jest.Mock;
}

interface FakeGraphics {
  fillStyle: jest.Mock;
  fillRoundedRect: jest.Mock;
  lineStyle: jest.Mock;
  strokeRoundedRect: jest.Mock;
  setAlpha: jest.Mock;
}

/** Texto falso (scene.add.text): valueText del slot y texto de resultado. */
interface FakeText {
  text: string;
  setOrigin: jest.Mock;
  setVisible: jest.Mock;
  setAlpha: jest.Mock;
}

/** Contenedor falso (scene.add.container): target de tween + add(). */
interface FakeContainer {
  add: jest.Mock;
  scale: number;
  alpha: number;
  setScale: jest.Mock;
  setAlpha: jest.Mock;
}

/** Imagen falsa (scene.add.image): back/front de la carta. */
interface FakeImage {
  setDisplaySize: jest.Mock;
  setVisible: jest.Mock;
}

/**
 * Zona interactiva: `handlers` registra lo que el modal suscribe con on()
 * para disparar los pointers a mano (pointerup = click del ratón).
 */
interface FakeZone {
  handlers: Record<string, () => void>;
  setOrigin: jest.Mock;
  setInteractive: jest.Mock;
  disableInteractive: jest.Mock;
  on: jest.Mock;
}

interface FakeTweenConfig {
  targets?: unknown;
  duration?: number;
  ease?: string;
  alpha?: number | { from: number; to: number };
  scale?: number | { from: number; to: number };
  scaleX?: number | { from: number; to: number };
  yoyo?: boolean;
  repeat?: number;
  onComplete?: () => void;
  onUpdate?: () => void;
}

/** `scene.time.delayedCall` falso: el reveal de 420 ms de handleCardPicked. */
interface FakeDelayedCall {
  delay: number;
  run: () => void;
  ran: boolean;
  destroyed: boolean;
  destroy: () => void;
}

interface FakeScene {
  cameras: { main: { centerX: number; centerY: number; width: number; height: number } };
  add: {
    rectangle: jest.Mock;
    graphics: jest.Mock;
    image: jest.Mock;
    text: jest.Mock;
    container: jest.Mock;
    zone: jest.Mock;
    existing: jest.Mock;
  };
  tweens: { add: jest.Mock };
  time: { delayedCall: jest.Mock };
  sound: { play: jest.Mock };
  /** Callbacks pedidos a scene.tweens.add y todavía no completados. */
  pendingTweens: FakeTweenConfig[];
  /** TODOS los tweens creados (no se vacía) — para asertar targets de glow. */
  allTweens: FakeTweenConfig[];
  /** delayedCall pedidos (el reveal de 420 ms, drenado a mano). */
  delayedCalls: FakeDelayedCall[];
  /** Zonas creadas en orden: la iésima es la de la carta i. */
  zones: FakeZone[];
  /** Graphics creadas en orden: 0..5 = glow de cada carta. */
  graphics: FakeGraphics[];
  /** Containers creados en orden: 0..5 = contenedor de cada carta. */
  containers: FakeContainer[];
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
    setAlpha: jest.fn((): FakeGraphics => graphics)
  };
  return graphics;
}

function createFakeText(text: string): FakeText {
  const fake: FakeText = {
    text,
    setOrigin: jest.fn((): FakeText => fake),
    setVisible: jest.fn((): FakeText => fake),
    setAlpha: jest.fn((): FakeText => fake)
  };
  return fake;
}

function createFakeImage(): FakeImage {
  const image: FakeImage = {
    setDisplaySize: jest.fn((): FakeImage => image),
    setVisible: jest.fn((): FakeImage => image)
  };
  return image;
}

function createFakeContainer(): FakeContainer {
  const container: FakeContainer = {
    add: jest.fn(),
    scale: 1,
    alpha: 1,
    setScale: jest.fn((scale: number): FakeContainer => {
      container.scale = scale;
      return container;
    }),
    setAlpha: jest.fn((alpha: number): FakeContainer => {
      container.alpha = alpha;
      return container;
    })
  };
  return container;
}

function createFakeZone(): FakeZone {
  const zone: FakeZone = {
    handlers: {},
    setOrigin: jest.fn((): FakeZone => zone),
    setInteractive: jest.fn((): FakeZone => zone),
    disableInteractive: jest.fn((): FakeZone => zone),
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
  const delayedCalls: FakeDelayedCall[] = [];
  const zones: FakeZone[] = [];
  const graphics: FakeGraphics[] = [];
  const containers: FakeContainer[] = [];

  return {
    cameras: { main: { centerX: 640, centerY: 360, width: 1280, height: 720 } },
    add: {
      rectangle: jest.fn((): FakeRectangle => createFakeRectangle()),
      graphics: jest.fn((): FakeGraphics => {
        const gfx = createFakeGraphics();
        graphics.push(gfx);
        return gfx;
      }),
      image: jest.fn((): FakeImage => createFakeImage()),
      text: jest.fn((_x: number, _y: number, text: string): FakeText => createFakeText(text)),
      container: jest.fn((): FakeContainer => {
        const container = createFakeContainer();
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
      // se puedan asertar los tweens ANTES de que corra su onComplete.
      add: jest.fn((config: FakeTweenConfig): { stop: jest.Mock } => {
        pendingTweens.push(config);
        allTweens.push(config);
        return { stop: jest.fn() };
      })
    },
    time: {
      delayedCall: jest.fn((delay: number, run: () => void): FakeDelayedCall => {
        const entry: FakeDelayedCall = {
          delay,
          run,
          ran: false,
          destroyed: false,
          destroy: jest.fn((): void => {
            entry.destroyed = true;
          })
        };
        delayedCalls.push(entry);
        return entry;
      })
    },
    sound: { play: jest.fn() },
    pendingTweens,
    allTweens,
    delayedCalls,
    zones,
    graphics,
    containers
  };
}

/**
 * Avanza la cola de tweens hasta vaciarla, por lotes: los callbacks pueden
 * PEDIR tweens nuevos (el flip crea los suyos en onComplete) y esos entran
 * en el lote siguiente.
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

/**
 * Dispara los `delayedCall` que nadie canceló — es el reloj de 420 ms de
 * handleCardPicked, es decir: showResult() (texto de resultado + botón
 * "Cerrar"). Un timer cancelado por requestClose() no corre.
 */
function completeDelayedCalls(scene: FakeScene): void {
  let batches = 0;
  while (scene.delayedCalls.some((call) => !call.destroyed && !call.ran)) {
    if (++batches > 20) {
      throw new Error('completeDelayedCalls: la cola de delayedCalls no se vacía');
    }
    for (const call of scene.delayedCalls) {
      if (call.destroyed || call.ran) continue;
      call.ran = true;
      call.run();
    }
  }
}

/** Tweens creados cuyo target (o target[i]) es `target`. */
function tweensTargeting(scene: FakeScene, target: unknown): FakeTweenConfig[] {
  return scene.allTweens.filter((config) => {
    const current = config.targets;
    if (Array.isArray(current)) return current.includes(target);
    return current === target;
  });
}

/** Índice en allTweens del primer tween posterior a la marca `from`. */
function tweensFrom(scene: FakeScene, from: number): FakeTweenConfig[] {
  return scene.allTweens.slice(from);
}

interface ModalFixture {
  modal: PeriodicBonusModal;
  scene: FakeScene;
  onCardChosen: jest.Mock;
  onClose: jest.Mock;
}

/** Crea un PeriodicBonusModal REAL sobre la escena falsa (fixture independiente). */
function createModal(values: readonly number[] = TEST_VALUES): ModalFixture {
  const scene = createFakeScene();
  const onCardChosen = jest.fn();
  const onClose = jest.fn();
  const callbacks: PeriodicBonusModalCallbacks = { onCardChosen, onClose };
  const modal = new PeriodicBonusModal(scene as unknown as ModalSceneArg, values, callbacks);
  return { modal, scene, onCardChosen, onClose };
}

describe('PeriodicBonusModal', () => {
  describe('foco inicial visible (Fase 7g-3)', () => {
    it('arranca con el índice 0 enfocado', () => {
      const { modal } = createModal();

      expect(modal.getFocusedCardIndex()).toBe(0);
    });

    it('enciende el glow de la carta 0 con el MISMO tween que el hover (alpha 0.7 / 100 ms) y apaga los demás por tween', () => {
      const { modal, scene } = createModal();

      // Dueño único del glow: el foco encendido es un tween idéntico al
      // pointerover (alpha 0.7, duration 100), nunca un setAlpha crudo.
      const focusTween = tweensTargeting(scene, scene.graphics[0]).find((config) => config.alpha === 0.7);
      expect(focusTween).toBeDefined();
      expect(focusTween?.duration).toBe(100);
      expect(scene.graphics[0].setAlpha).not.toHaveBeenCalledWith(0.7);

      // Las otras 5 cartas se apagan por el MISMO camino (tween a 0).
      for (let index = 1; index < TEST_VALUES.length; index++) {
        const offTween = tweensTargeting(scene, scene.graphics[index]).find((config) => config.alpha === 0);
        expect(offTween).toBeDefined();
        expect(tweensTargeting(scene, scene.graphics[index]).some((config) => config.alpha === 0.7)).toBe(false);
      }

      // Sanity: el ctor construye exactamente 6 slots (graphics y
      // containers 0..5, una entrada por carta).
      expect(scene.graphics).toHaveLength(TEST_VALUES.length);
      expect(scene.containers).toHaveLength(TEST_VALUES.length);
      expect(scene.zones).toHaveLength(TEST_VALUES.length);
      expect(modal.getFocusedCardIndex()).toBe(0);
    });
  });

  describe("flechas — moveFocus (sin wrap)", () => {
    it("moveFocus('right') → 1 y moveFocus('left') → 0", () => {
      const { modal } = createModal();

      modal.moveFocus('right');
      expect(modal.getFocusedCardIndex()).toBe(1);

      modal.moveFocus('left');
      expect(modal.getFocusedCardIndex()).toBe(0);
    });

    it('bordes sin wrap: left desde 0 se queda en 0; right desde 5 (última) se queda en 5', () => {
      const { modal } = createModal();

      modal.moveFocus('left');
      expect(modal.getFocusedCardIndex()).toBe(0);

      for (let step = 0; step < TEST_VALUES.length; step++) {
        modal.moveFocus('right');
      }
      expect(modal.getFocusedCardIndex()).toBe(TEST_VALUES.length - 1);
      expect(modal.getFocusedCardIndex()).toBe(5);
    });

    it('el cambio de foco tween-ea el glow nuevo a 0.7 y el anterior a 0 (nada de setAlpha crudo)', () => {
      const { modal, scene } = createModal();

      const before = scene.allTweens.length;
      modal.moveFocus('right');
      const newTweens = tweensFrom(scene, before);

      const lit = newTweens.find((config) => config.alpha === 0.7);
      expect(lit?.targets).toBe(scene.graphics[1]);

      const dimmed = newTweens.find((config) => config.alpha === 0);
      expect(dimmed?.targets).toBe(scene.graphics[0]);

      // El glow jamás se enciende vía setAlpha: solo existe el setAlpha(0)
      // de construcción del slot (una llamada por slot).
      expect(scene.graphics[1].setAlpha).toHaveBeenCalledTimes(1);
      expect(scene.graphics[1].setAlpha).not.toHaveBeenCalledWith(0.7);
    });
  });

  describe('ENTER pre-entrega — handleEnterPressed elige la carta enfocada', () => {
    it('con foco inicial acredita la carta 0 por el MISMO camino que su click (pointerup)', () => {
      const keyboard = createModal();
      keyboard.modal.handleEnterPressed();
      completePendingTweens(keyboard.scene);

      const mouse = createModal();
      mouse.scene.zones[0].handlers.pointerup();
      completePendingTweens(mouse.scene);

      expect(keyboard.onCardChosen.mock.calls).toEqual(mouse.onCardChosen.mock.calls);
      expect(keyboard.onCardChosen).toHaveBeenCalledTimes(1);
      expect(keyboard.onCardChosen).toHaveBeenCalledWith(TEST_VALUES[0]);
      expect(keyboard.onClose).not.toHaveBeenCalled();
    });

    it("tras moveFocus('right') acredita la carta 1 (no la 0) y reproduce el sfx sin tronar", () => {
      const { modal, scene, onCardChosen, onClose } = createModal();

      modal.moveFocus('right');
      modal.handleEnterPressed();
      completePendingTweens(scene);

      expect(onCardChosen).toHaveBeenCalledTimes(1);
      expect(onCardChosen).toHaveBeenCalledWith(TEST_VALUES[1]);
      expect(onClose).not.toHaveBeenCalled();
      expect(scene.sound.play).toHaveBeenCalledWith('sfx-bonus-claim');
    });

    it('segundo ENTER durante la animación de reveal no re-elige (guard resolved)', () => {
      const { modal, scene, onCardChosen } = createModal();

      modal.handleEnterPressed();
      modal.handleEnterPressed();
      completePendingTweens(scene);

      expect(onCardChosen).toHaveBeenCalledTimes(1);
    });
  });

  describe('ENTER post-entrega — cierra por el MISMO camino que "Cerrar"', () => {
    it('tras showResult(), handleEnterPressed() llama a callbacks.onClose exactamente 1 vez', () => {
      const { modal, scene, onCardChosen, onClose } = createModal();

      modal.activateFocusedCard();
      completePendingTweens(scene);
      // El reloj de 420 ms corre → showResult() crea el botón "Cerrar".
      completeDelayedCalls(scene);
      expect(onClose).not.toHaveBeenCalled(); // abrir el resultado no cierra

      modal.handleEnterPressed();

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onCardChosen).toHaveBeenCalledTimes(1); // no re-elige
    });

    it('ENTER dentro de la ventana de animación también cierra y cancela el reveal pendiente', () => {
      const { modal, scene, onClose } = createModal();

      modal.activateFocusedCard();
      expect(scene.delayedCalls).toHaveLength(1);

      modal.handleEnterPressed();

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(scene.delayedCalls[0].destroy).toHaveBeenCalled();
    });
  });

  describe("guard resolved tras la entrega (flechas inertes)", () => {
    it("moveFocus('left') no mueve el índice después de resolver", () => {
      const { modal, scene } = createModal();

      modal.activateFocusedCard();
      completePendingTweens(scene);

      modal.moveFocus('left');
      expect(modal.getFocusedCardIndex()).toBe(0);
    });

    it("el índice elegido queda congelado (moveFocus desde la carta 1 elegida no vuelve a 0)", () => {
      const { modal, scene } = createModal();

      modal.moveFocus('right');
      modal.activateFocusedCard();
      completePendingTweens(scene);

      modal.moveFocus('left');
      expect(modal.getFocusedCardIndex()).toBe(1);
    });
  });

  describe('pointerout re-asserta el foco de teclado (conflicto hover vs foco)', () => {
    it('al salir del puntero de una carta NO enfocada su glow queda en 0 (sin re-encender)', () => {
      const { modal, scene } = createModal();

      const before = scene.allTweens.length;
      scene.zones[1].handlers.pointerout();
      const newTweens = tweensFrom(scene, before);

      expect(newTweens.find((config) => config.targets === scene.graphics[1])?.alpha).toBe(0);
      expect(newTweens.some((config) => config.alpha === 0.7)).toBe(false);
      expect(modal.getFocusedCardIndex()).toBe(0);
    });

    it('al salir del puntero de la carta SÍ enfocada su glow vuelve al estado de foco (0.7)', () => {
      const { modal, scene } = createModal();

      const before = scene.allTweens.length;
      scene.zones[0].handlers.pointerout();
      const newTweens = tweensFrom(scene, before);

      const off = newTweens.find((config) => config.targets === scene.graphics[0] && config.alpha === 0);
      const reassert = newTweens.find((config) => config.targets === scene.graphics[0] && config.alpha === 0.7);
      expect(off).toBeDefined();
      expect(reassert).toBeDefined();
      expect(reassert?.duration).toBe(100);
      expect(modal.getFocusedCardIndex()).toBe(0);
    });
  });

  // BUGFIX (Fase 7c — parseo del texto formateado): activateFocusedCard()
  // re-parseaba valueText ("+$5.000" en locale es-*) con parseInt y, como
  // solo removía '$' y comas, el punto de miles hacía parseInt("5.000")
  // devolver 5 — el teclado acreditaba 5 en vez de 5000 (el ratón, que
  // pasaba el número directo, estaba bien). El fix guarda el valor numérico
  // original en CardSlot.value. Este test fuerza el formato es-* con un spy
  // sobre Number.prototype.toLocaleString para ser INDEPENDIENTE del locale
  // de la máquina que corre el suite.
  describe('BUGFIX locale — el importe elegido viaja como número', () => {
    let toLocaleStringSpy: jest.SpyInstance | null = null;

    afterEach(() => {
      toLocaleStringSpy?.mockRestore();
      toLocaleStringSpy = null;
    });

    it("con toLocaleString formateando '5.000' (separador por punto), ENTER acredita 5000 y no 5", () => {
      toLocaleStringSpy = jest.spyOn(Number.prototype, 'toLocaleString').mockReturnValue('5.000');

      // 3 cartas: la del medio (índice 1) es la de 4 dígitos.
      const { modal, scene, onCardChosen, onClose } = createModal([100, 5000, 300]);

      modal.moveFocus('right');
      modal.handleEnterPressed();
      completePendingTweens(scene);

      expect(onCardChosen).toHaveBeenCalledTimes(1);
      expect(onCardChosen).toHaveBeenCalledWith(5000);
      expect(onClose).not.toHaveBeenCalled();
    });
  });
});
