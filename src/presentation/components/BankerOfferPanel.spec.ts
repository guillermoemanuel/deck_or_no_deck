// Fase 5 (teclado PC): regresión del guard `exitStarted` de BankerOfferPanel.
//
// BUGFIX (guard exitStarted): onDealAccepted/onDealRejected comparten UNA
// guarda de salida única — sin ella, un segundo intento durante el tween de
// salida de 150 ms (doble ENTER, doble click sobre DEAL, o click en DEAL y
// NO DEAL alternados mientras el panel sigue interactivo) creaba un segundo
// tween de salida y emitía 'deal-accepted' Y 'deal-rejected' en la misma
// partida; GameSceneController tiene `.once` para ambos eventos (L365/368),
// así que las DOS ramas se disparaban a la vez.
//
// Spec de regresión GREEN-first (el fix ya está implementado): los tests de
// acá quedan en rojo si alguien saca el flag de cualquiera de los dos
// handlers, porque el emit va en el onComplete del tween de salida y cada
// tween de salida extra produce un emit extra.
//
// Entorno `node` (sin jsdom): mock mínimo de 'phaser' al estilo de
// CardView.spec — BankerOfferPanel extiende GameObjects.Container (hereda su
// `emit`, acá un jest.fn por instancia) y LocalizedText extiende
// GameObjects.Text. La escena falsa cubre lo que el ctor REAL del panel
// toca: cameras.main, add.rectangle/image/graphics/text/container/zone/
// existing y tweens.add. Los tweens NO corren solos: `completePendingTweens`
// descarga la cola a mano (por lotes, porque los callbacks anidan — el
// onComplete del botón recién ahí pide el tween de salida), que es lo que
// permite simular "durante el tween de salida" y observar el emit.
jest.mock('phaser', () => {
  class Container {
    scene: unknown;
    x: number;
    y: number;
    scale: number;
    alpha: number;
    // Emit observable por instancia: el panel emite 'deal-accepted' /
    // 'deal-rejected' vía this.emit(...) del Container que hereda.
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

import { BankerOfferPanel } from './BankerOfferPanel';
import { BankerOffer } from '../../domain/services/Banker';

type PanelSceneArg = ConstructorParameters<typeof BankerOfferPanel>[0];

interface FakeRectangle {
  setInteractive: jest.Mock;
  setStrokeStyle: jest.Mock;
}

interface FakeImage {
  setScale: jest.Mock;
}

interface FakeGraphics {
  fillStyle: jest.Mock;
  fillRoundedRect: jest.Mock;
  lineStyle: jest.Mock;
  strokeRoundedRect: jest.Mock;
  setAlpha: jest.Mock;
}

interface FakeText {
  setOrigin: jest.Mock;
  setText: jest.Mock;
}

/** Contenedor falso de botón (scene.add.container): solo target de tween y add(). */
interface FakeButtonContainer {
  add: jest.Mock;
  scale: number;
  alpha: number;
}

/** Zona interactiva: `handlers` registra lo que el panel suscribe con on() para disparar los pointers a mano. */
interface FakeZone {
  handlers: Record<string, () => void>;
  setOrigin: jest.Mock;
  setInteractive: jest.Mock;
  on: jest.Mock;
}

interface FakeTweenConfig {
  duration?: number;
  onComplete?: () => void;
  onUpdate?: () => void;
}

interface FakeScene {
  cameras: { main: { centerX: number; centerY: number; width: number; height: number } };
  add: {
    rectangle: jest.Mock;
    image: jest.Mock;
    graphics: jest.Mock;
    text: jest.Mock;
    container: jest.Mock;
    zone: jest.Mock;
    existing: jest.Mock;
  };
  tweens: { add: jest.Mock };
  /** Callbacks pedidos a scene.tweens.add y todavía no completados. */
  pendingTweens: FakeTweenConfig[];
  /** Zonas creadas en orden: la primera es la del botón DEAL (el ctor lo crea primero). */
  zones: FakeZone[];
}

function createFakeRectangle(): FakeRectangle {
  const rect: FakeRectangle = {
    setInteractive: jest.fn((): FakeRectangle => rect),
    setStrokeStyle: jest.fn((): FakeRectangle => rect)
  };
  return rect;
}

function createFakeImage(): FakeImage {
  const image: FakeImage = {
    setScale: jest.fn((): FakeImage => image)
  };
  return image;
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

function createFakeText(): FakeText {
  const text: FakeText = {
    setOrigin: jest.fn((): FakeText => text),
    setText: jest.fn((): FakeText => text)
  };
  return text;
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
  const zones: FakeZone[] = [];

  return {
    cameras: { main: { centerX: 640, centerY: 360, width: 1280, height: 720 } },
    add: {
      rectangle: jest.fn((): FakeRectangle => createFakeRectangle()),
      image: jest.fn((): FakeImage => createFakeImage()),
      graphics: jest.fn((): FakeGraphics => createFakeGraphics()),
      text: jest.fn((): FakeText => createFakeText()),
      container: jest.fn((): FakeButtonContainer => ({ add: jest.fn(), scale: 1, alpha: 1 })),
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
        return { stop: jest.fn() };
      })
    },
    pendingTweens,
    zones
  };
}

/**
 * Avanza el tiempo fake hasta vaciar la cola de tweens, por lotes: los
 * callbacks pueden PEDIR tweens nuevos (el onComplete del botón llama a
 * onDealAccepted, que recién ahí crea el tween de salida; el del contador
 * dispara el pulso), y esos entran en el lote siguiente.
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

// Oferta de fijura: no es un precio de catálogo (aguja de costOf), es el
// monto que el panel anima — valor neutro, sin invariantes numéricos de por medio.
const OFFER: BankerOffer = { amount: 750, roundNumber: 1, timestamp: 1_700_000_000_000 };

interface PanelFixture {
  panel: BankerOfferPanel;
  scene: FakeScene;
}

/** Crea un BankerOfferPanel REAL sobre la escena falsa (cada fixture es independiente). */
function createPanel(): PanelFixture {
  const scene = createFakeScene();
  const panel = new BankerOfferPanel(scene as unknown as PanelSceneArg, OFFER);
  return { panel, scene };
}

/** Spy del emit del Container mockeado: es por donde salen deal-accepted/deal-rejected. */
function emitSpy(panel: BankerOfferPanel): jest.Mock {
  return panel.emit as unknown as jest.Mock;
}

/** Zona del botón DEAL: el ctor crea DEAL (-110) antes que NO DEAL (+110). */
function dealZone(scene: FakeScene): FakeZone {
  const zone = scene.zones[0];
  if (!zone) {
    throw new Error('BankerOfferPanel no creó la zona del botón DEAL');
  }
  return zone;
}

describe('BankerOfferPanel', () => {
  describe('teclado (ENTER/ESC) — guard exitStarted', () => {
    it('acceptFromKeyboard() called twice during the exit tween emits deal-accepted exactly once', () => {
      const { panel, scene } = createPanel();
      const emit = emitSpy(panel);

      // Doble ENTER antes de que termine el tween de salida de 150 ms.
      panel.acceptFromKeyboard();
      panel.acceptFromKeyboard();
      completePendingTweens(scene);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('deal-accepted');
      expect(emit).not.toHaveBeenCalledWith('deal-rejected');
    });

    it('rejectFromKeyboard() called twice during the exit tween emits deal-rejected exactly once', () => {
      const { panel, scene } = createPanel();
      const emit = emitSpy(panel);

      // Doble ESC antes de que termine el tween de salida.
      panel.rejectFromKeyboard();
      panel.rejectFromKeyboard();
      completePendingTweens(scene);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('deal-rejected');
      expect(emit).not.toHaveBeenCalledWith('deal-accepted');
    });

    it('rejectFromKeyboard() after acceptFromKeyboard() is a no-op (only deal-accepted is emitted)', () => {
      const { panel, scene } = createPanel();
      const emit = emitSpy(panel);

      panel.acceptFromKeyboard();
      panel.rejectFromKeyboard();
      completePendingTweens(scene);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('deal-accepted');
      expect(emit).not.toHaveBeenCalledWith('deal-rejected');
    });

    it('acceptFromKeyboard() after rejectFromKeyboard() is a no-op (only deal-rejected is emitted)', () => {
      const { panel, scene } = createPanel();
      const emit = emitSpy(panel);

      panel.rejectFromKeyboard();
      panel.acceptFromKeyboard();
      completePendingTweens(scene);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('deal-rejected');
      expect(emit).not.toHaveBeenCalledWith('deal-accepted');
    });
  });

  describe('ratón — comparte el mismo guard exitStarted', () => {
    // Este es el bug original que el fix corrige: durante los 150 ms del
    // tween de salida el panel sigue interactivo, así que un doble click
    // sobre DEAL llegaba dos veces a onDealAccepted y emitía dos veces.
    it('BUGFIX exitStarted: a double mouse click on DEAL during the exit tween emits deal-accepted exactly once', () => {
      const { panel, scene } = createPanel();
      const emit = emitSpy(panel);

      const zone = dealZone(scene);
      zone.handlers.pointerup();
      zone.handlers.pointerup();
      completePendingTweens(scene);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('deal-accepted');
      expect(emit).not.toHaveBeenCalledWith('deal-rejected');
    });

    // Camino mixto teclado→ratón: la salida iniciada por ENTER también
    // bloquea un click de ratón posterior (el flag es único, no uno por input).
    it('BUGFIX exitStarted: a mouse click on DEAL after acceptFromKeyboard() does not emit a second deal-accepted', () => {
      const { panel, scene } = createPanel();
      const emit = emitSpy(panel);

      panel.acceptFromKeyboard();
      dealZone(scene).handlers.pointerup();
      completePendingTweens(scene);

      expect(emit).toHaveBeenCalledTimes(1);
      expect(emit).toHaveBeenCalledWith('deal-accepted');
    });
  });
});
