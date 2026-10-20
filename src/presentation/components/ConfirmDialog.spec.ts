// Fase 7g-4 (teclado PC): flechas + ENTER + ESC en ConfirmDialog.
//
// Especificación RED-first (escrita ANTES de la implementación). La Fase 7e
// (commit 631eaef) agregó moveFocus/activateFocusedButton con bindings en
// build(), pero con TRES bugs:
//   1. Claves de tecla en MINÚSCULAS ('keydown-Left'/'keydown-Right'/
//      'keydown-Enter'): el KeyMap de Phaser emite las teclas en MAYÚSCULA
//      ('keydown-LEFT'/'keydown-RIGHT'/'keydown-ENTER') — una clave
//      equivocada es un listener que NUNCA dispara, y por eso flechas y
//      Enter no hacían nada en el diálogo (solo ESC, que estaba en
//      mayúscula, funcionaba).
//   2. Foco invisible: focusedButtonIndex cambiaba sin resaltado visual.
//   3. Fuga de listeners (AGENTS §5): destroy() solo desenganchaba ESC; los
//      handlers de flechas/ENTER eran closures anónimos imposibles de
//      desenganchar, así que CADA apertura del diálogo acumulaba 5
//      listeners muertos en el keyboard plugin.
//
// Este spec fija el contrato nuevo:
//   - claves en MAYÚSCULAS (LEFT/RIGHT/UP/DOWN/ENTER/ESC),
//   - semántica de flechas igual que BankerOfferPanel/SwapEventModal
//     (absoluto en ←/→, alternancia en ↑/↓, sin wrap),
//   - foco inicial VISIBLE en índice 0 (Cancelar — la opción segura),
//   - ENTER = MISMA cadena que el botón enfocado; ESC sigue cancelando,
//   - ENTER suena el click de UI (`playUiClick`, ADR-015: paridad con el
//     click del ratón) y ESC cancela SILENCIOSO (cancelar no confirma),
//   - destroy() desengancha exactamente los pares (tipo, referencia) que
//     registró build() — regresión de fuga.
//
// Entorno `node` (sin jsdom): mock mínimo de 'phaser' al estilo de
// SwapEventModal.spec — LocalizedText extiende GameObjects.Text. La escena
// falsa cubre lo que el ctor REAL del diálogo toca: cameras.main,
// add.rectangle/graphics/container/zone/existing, tweens.add y
// input.keyboard (on/off como jest.fn para asertar registro/desregistro).
// Sin audio en el fixture: `audio?` es opcional y, con UiSfx mockeado,
// bindUiClick/playUiClick registran la LLAMADA del diálogo sin efectos.
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

// Mock del módulo de audio del componente (ADR-015): el diálogo delega el
// click genérico de UI en UiSfx — `bindUiClick` en la construcción de cada
// botón (ratón) y `playUiClick` en activateFocusedButton (ENTER). Los tests
// asertan ESOS mocks. `bindUiClick` solo registra handlers de pointerup:
// el mock no afecta el flujo de los tests de ratón preexistentes (la
// construcción de la zona es del diálogo, no del módulo de audio).
jest.mock('../audio/UiSfx', () => ({
  bindUiClick: jest.fn(),
  playUiClick: jest.fn()
}));

import { bindUiClick, playUiClick } from '../audio/UiSfx';
import { ConfirmDialog } from './ConfirmDialog';

type DialogSceneArg = ConstructorParameters<typeof ConfirmDialog>[0];

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

/** Contenedor falso: el del diálogo es containers[2] (los botones van antes). */
interface FakeButtonContainer {
  add: jest.Mock;
  setDepth: jest.Mock;
  setScale: jest.Mock;
  setAlpha: jest.Mock;
  setPosition: jest.Mock;
  destroy: jest.Mock;
  scale: number;
  alpha: number;
}

/** Zona interactiva: `handlers` registra lo que el diálogo suscribe con on() para disparar los pointers a mano. */
interface FakeZone {
  handlers: Record<string, () => void>;
  setOrigin: jest.Mock;
  setInteractive: jest.Mock;
  on: jest.Mock;
}

interface FakeTweenConfig {
  targets?: unknown;
  alpha?: number | { from: number; to: number };
  scale?: number | { from: number; to: number };
  duration?: number;
  ease?: string;
  x?: number;
  y?: number;
  onComplete?: () => void;
}

/** Teclado falso: on/off registran sus llamadas para asertar pares (tipo, referencia). */
interface FakeKeyboard {
  on: jest.Mock;
  off: jest.Mock;
}

interface FakeScene {
  cameras: { main: { width: number; height: number } };
  add: {
    rectangle: jest.Mock;
    graphics: jest.Mock;
    container: jest.Mock;
    zone: jest.Mock;
    existing: jest.Mock;
  };
  tweens: { add: jest.Mock };
  input: { keyboard: FakeKeyboard };
  /** Callbacks pedidos a scene.tweens.add y todavía no completados. */
  pendingTweens: FakeTweenConfig[];
  /** TODOS los tweens creados (no se vacía) — para asertar el resaltado de foco. */
  allTweens: FakeTweenConfig[];
  /** Graphics creados en orden: 0 = glow Cancelar, 1 = bg Cancelar, 2 = glow Confirmar, 3 = bg Confirmar. */
  graphics: FakeGraphics[];
  /** Containers creados en orden: [0] botón Cancelar, [1] botón Confirmar, [2] el diálogo. */
  containers: FakeButtonContainer[];
  /** Zonas creadas en orden: [0] Cancelar, [1] Confirmar. */
  zones: FakeZone[];
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

function createFakeContainer(): FakeButtonContainer {
  const container: FakeButtonContainer = {
    add: jest.fn(),
    setDepth: jest.fn((): FakeButtonContainer => container),
    setScale: jest.fn((): FakeButtonContainer => container),
    setAlpha: jest.fn((): FakeButtonContainer => container),
    setPosition: jest.fn((): FakeButtonContainer => container),
    destroy: jest.fn(),
    scale: 1,
    alpha: 1
  };
  return container;
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
  const graphics: FakeGraphics[] = [];
  const containers: FakeButtonContainer[] = [];
  const zones: FakeZone[] = [];

  return {
    cameras: { main: { width: 1280, height: 720 } },
    add: {
      rectangle: jest.fn((): FakeRectangle => createFakeRectangle()),
      graphics: jest.fn((): FakeGraphics => {
        const gfx = createFakeGraphics();
        graphics.push(gfx);
        return gfx;
      }),
      container: jest.fn((): FakeButtonContainer => {
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
      add: jest.fn((config: FakeTweenConfig): { stop: jest.Mock } => {
        pendingTweens.push(config);
        allTweens.push(config);
        return { stop: jest.fn() };
      })
    },
    input: {
      keyboard: {
        on: jest.fn(),
        off: jest.fn()
      }
    },
    pendingTweens,
    allTweens,
    graphics,
    containers,
    zones
  };
}

/** ¿Existe un tween creado con `targets === target` y `alpha` numérico igual a `alpha`? */
function hasTweenTo(scene: FakeScene, target: unknown, alpha: number): boolean {
  return scene.allTweens.some((config) => config.targets === target && config.alpha === alpha);
}

/** Handler registrado en el keyboard fake para una tecla exacta (p. ej. 'keydown-ESC'). */
function keyboardHandler(scene: FakeScene, type: string): () => void {
  const calls = scene.input.keyboard.on.mock.calls as Array<[string, () => void]>;
  const call = calls.find(([eventType]) => eventType === type);
  if (!call) {
    throw new Error(`ConfirmDialog no registró handler para ${type}`);
  }
  return call[1];
}

/** Claves (solo tipo) registradas en el keyboard fake, en orden de registro. */
function registeredKeyTypes(scene: FakeScene): string[] {
  return (scene.input.keyboard.on.mock.calls as Array<[string, () => void]>).map(([type]) => type);
}

interface DialogFixture {
  dialog: ConfirmDialog;
  scene: FakeScene;
  onConfirm: jest.Mock;
  onCancel: jest.Mock;
}

/** Crea un ConfirmDialog REAL sobre la escena falsa (cada fixture es independiente). */
function createDialog(): DialogFixture {
  const scene = createFakeScene();
  const onConfirm = jest.fn();
  const onCancel = jest.fn();
  const dialog = new ConfirmDialog(scene as unknown as DialogSceneArg, {
    // Mismas claves reales que usa MainMenuScene para "Nueva partida".
    titleKey: 'NEW_GAME_CONFIRM_TITLE',
    bodyKey: 'NEW_GAME_CONFIRM_BODY',
    bodyParams: { coins: '500' },
    cancelKey: 'NEW_GAME_CONFIRM_CANCEL',
    confirmKey: 'NEW_GAME_CONFIRM_ACCEPT',
    confirmColor: 0xff4d6d,
    onConfirm,
    onCancel
  });
  return { dialog, scene, onConfirm, onCancel };
}

describe('ConfirmDialog', () => {
  beforeEach(() => {
    // Los mocks de UiSfx son del MÓDULO (compartidos entre tests del archivo):
    // se limpian para que cada aserción cuente solo las llamadas de SU test
    // (mockClear preserva la implementación del mock).
    jest.clearAllMocks();
  });

  describe('foco inicial (Fase 7g-4)', () => {
    it('arranca con el índice 0 enfocado (Cancelar — la opción segura) y su glow encendido', () => {
      const { dialog, scene } = createDialog();

      expect(dialog.getFocusedButtonIndex()).toBe(0);

      // Resaltado VISIBLE desde la construcción: el glow del botón Cancelar
      // es el PRIMER graphics creado (título y cuerpo son LocalizedText, no
      // Graphics) y el tween de encendido inicial lo tiene como target con
      // alpha 1 — mismo efecto que el hover del ratón (dueño único).
      expect(hasTweenTo(scene, scene.graphics[0], 1)).toBe(true);
      // Y el glow de Confirmar NUNCA se enciende con el foco inicial.
      expect(hasTweenTo(scene, scene.graphics[2], 1)).toBe(false);
    });
  });

  describe("flechas — moveFocus (absoluto en ←/→, alterna en ↑/↓)", () => {
    it("moveFocus('right') → 1 (Confirmar) y moveFocus('left') → 0 (Cancelar)", () => {
      const { dialog } = createDialog();

      dialog.moveFocus('right');
      expect(dialog.getFocusedButtonIndex()).toBe(1);

      dialog.moveFocus('left');
      expect(dialog.getFocusedButtonIndex()).toBe(0);
    });

    it('bordes sin wrap: right desde 1 se queda en 1; left desde 0 se queda en 0', () => {
      const { dialog } = createDialog();

      dialog.moveFocus('left');
      expect(dialog.getFocusedButtonIndex()).toBe(0);

      dialog.moveFocus('right');
      expect(dialog.getFocusedButtonIndex()).toBe(1);

      dialog.moveFocus('right');
      expect(dialog.getFocusedButtonIndex()).toBe(1);

      dialog.moveFocus('left');
      expect(dialog.getFocusedButtonIndex()).toBe(0);

      dialog.moveFocus('left');
      expect(dialog.getFocusedButtonIndex()).toBe(0);
    });

    it("moveFocus('up')/'down' alternan entre los dos botones (eje ambiguo)", () => {
      const { dialog } = createDialog();

      // Foco inicial 0 → up → 1.
      dialog.moveFocus('up');
      expect(dialog.getFocusedButtonIndex()).toBe(1);

      // 1 → down → 0 (alterna, sin wrap).
      dialog.moveFocus('down');
      expect(dialog.getFocusedButtonIndex()).toBe(0);
    });

    it('el cambio de foco enciende el glow del botón nuevo y apaga el anterior (mismo efecto que el hover)', () => {
      const { dialog, scene } = createDialog();

      dialog.moveFocus('right');

      // Enciende el glow de Confirmar…
      expect(hasTweenTo(scene, scene.graphics[2], 1)).toBe(true);
      // …y apaga el de Cancelar (los graphics 1 y 3 son los bg: NUNCA son target).
      expect(hasTweenTo(scene, scene.graphics[0], 0)).toBe(true);
      expect(hasTweenTo(scene, scene.graphics[1], 1)).toBe(false);
      expect(hasTweenTo(scene, scene.graphics[3], 1)).toBe(false);
      expect(scene.graphics[1].setAlpha).not.toHaveBeenCalledWith(0);
      expect(scene.graphics[3].setAlpha).not.toHaveBeenCalledWith(0);
    });
  });

  describe('ENTER — activateFocusedButton', () => {
    it('con foco inicial invoca onCancel 1 vez y onConfirm 0 veces (Cancelar)', () => {
      const { dialog, onConfirm, onCancel } = createDialog();

      dialog.activateFocusedButton();

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("tras moveFocus('right') invoca onConfirm 1 vez y onCancel 0 veces", () => {
      const { dialog, onConfirm, onCancel } = createDialog();

      dialog.moveFocus('right');
      dialog.activateFocusedButton();

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('doble activateFocusedButton() con foco en Cancelar invoca onCancel UNA sola vez (guard del container)', () => {
      const { dialog, onConfirm, onCancel } = createDialog();

      // Tras el primer activateFocusedButton el diálogo se destruye (container
      // → null); el segundo intento es no-op por el guard de cancel().
      dialog.activateFocusedButton();
      dialog.activateFocusedButton();

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(dialog.isOpen()).toBe(false);
    });
  });

  describe('ADR-015 — paridad de audio: ENTER suena igual que el click del ratón', () => {
    // Precedente: SwapEventModal.activateFocusedButton llama playUiClick
    // (punto único de SFX.CLICK). ADR-015 exige que el teclado suene lo MISMO
    // que el pointerup del ratón (bindUiClick → playUiClick). El fixture no
    // pasa servicio de audio: el mock de UiSfx registra la LLAMADA del
    // diálogo igual, y `playUiClick(undefined)` es no-op por diseño en real.
    it('ENTER con foco en Cancelar reproduce el click de UI UNA vez (misma cadena que el ratón)', () => {
      const { dialog, onConfirm, onCancel } = createDialog();

      dialog.activateFocusedButton();

      expect(playUiClick).toHaveBeenCalledTimes(1);
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it("ENTER con foco en Confirmar (tras moveFocus('right')) reproduce el click de UI UNA vez", () => {
      const { dialog, onConfirm, onCancel } = createDialog();

      dialog.moveFocus('right');
      dialog.activateFocusedButton();

      expect(playUiClick).toHaveBeenCalledTimes(1);
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it('ENTER sobre un diálogo ya destruido NO suena (guard del container ANTES del play)', () => {
      const { dialog } = createDialog();

      dialog.destroy();
      dialog.activateFocusedButton();

      expect(playUiClick).not.toHaveBeenCalled();
    });

    it('ESC (cancelar) NO reproduce el click de UI — cancelar no confirma (UIScene/SwapEventModal)', () => {
      const { scene, onConfirm, onCancel } = createDialog();

      keyboardHandler(scene, 'keydown-ESC')();

      expect(playUiClick).not.toHaveBeenCalled();
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
    });

    it('la construcción registra bindUiClick en CADA botón (Cancelar y Confirmar) — el sonido del ratón', () => {
      createDialog();

      // Dos botones = dos registros del punto único de click de UI: el
      // pointerup del ratón suena por bindUiClick (independiente de ENTER).
      expect(bindUiClick).toHaveBeenCalledTimes(2);
    });
  });

  describe('ESC — comportamiento existente preservado', () => {
    it('keydown-ESC invoca onCancel (nunca onConfirm)', () => {
      const { dialog, scene, onConfirm, onCancel } = createDialog();

      keyboardHandler(scene, 'keydown-ESC')();

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(dialog.isOpen()).toBe(false);
    });
  });

  describe('BUGFIX claves en MAYÚSCULAS (KeyMap de Phaser)', () => {
    // Bug de la Fase 7e: bindeaba 'keydown-Left'/'keydown-Right'/'keydown-Enter'
    // en minúscula — Phaser emite 'keydown-LEFT'/'keydown-RIGHT'/'keydown-ENTER',
    // así que esos 3 listeners NUNCA disparaban (solo ESC funcionaba).
    it('registra exactamente keydown-LEFT/RIGHT/UP/DOWN/ENTER/ESC, todas en mayúscula', () => {
      const { scene } = createDialog();

      expect(registeredKeyTypes(scene)).toEqual([
        'keydown-LEFT',
        'keydown-RIGHT',
        'keydown-UP',
        'keydown-DOWN',
        'keydown-ENTER',
        'keydown-ESC'
      ]);
    });
  });

  describe('AGENTS §5 — regresión de fuga de listeners en destroy()', () => {
    it('destroy() desengancha exactamente los pares (tipo, referencia) que registró build()', () => {
      const { dialog, scene } = createDialog();
      const keyboard = scene.input.keyboard;

      dialog.destroy();

      const onCalls = keyboard.on.mock.calls as Array<[string, () => void]>;
      const offCalls = keyboard.off.mock.calls as Array<[string, () => void]>;

      // La fuga original: destroy() solo hacía off('keydown-ESC', onEscape)
      // y los otros 5 handlers eran closures anónimos imposibles de
      // desenganchar — cada apertura acumulaba listeners muertos.
      expect(onCalls.length).toBeGreaterThan(0);
      for (const [type, handler] of onCalls) {
        // Cada par exacto (tipo, MISMA referencia de handler) quedó desenganchado.
        expect(offCalls).toContainEqual([type, handler]);
      }
      // Ni más ni menos: la cantidad de offs coincide con la de ons.
      expect(offCalls.length).toBe(onCalls.length);
    });

    it('tras destroy() el diálogo ya no está abierto y cancelar por teclado es inerte', () => {
      const { dialog, scene, onConfirm, onCancel } = createDialog();

      dialog.destroy();

      expect(dialog.isOpen()).toBe(false);
      // Ningún handler nuevo debe disparar acción tras la destrucción: los
      // pares quedaron desenganchados (defensa principal) y, como red de
      // seguridad, cancel()/confirm() temprano-retornan con container null.
      const escHandler = keyboardHandler(scene, 'keydown-ESC');
      escHandler();
      expect(onCancel).not.toHaveBeenCalled();
      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('ratón — comparte la misma cadena que el teclado', () => {
    it('pointerup sobre Cancelar invoca onCancel UNA vez (misma cadena que ENTER con foco 0)', () => {
      const { dialog, scene, onConfirm, onCancel } = createDialog();

      // Zona de Cancelar: el ctor crea ese botón primero (zones[0]).
      scene.zones[0].handlers.pointerup();

      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(onConfirm).not.toHaveBeenCalled();
      expect(dialog.isOpen()).toBe(false);
    });

    it('pointerup sobre Confirmar invoca onConfirm UNA vez (misma cadena que ENTER con foco 1)', () => {
      const { dialog, scene, onConfirm, onCancel } = createDialog();

      // Zona de Confirmar: el segundo botón creado (zones[1]).
      scene.zones[1].handlers.pointerup();

      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(onCancel).not.toHaveBeenCalled();
      expect(dialog.isOpen()).toBe(false);
    });
  });
});
