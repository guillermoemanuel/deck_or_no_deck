// Fase 3 — controles de teclado PC: el tablero de GameScene se navega con
// flechas y Enter, y el foco tiene que resaltar la carta apuntada. Este
// spec cubre los DOS gaps de foco de `CardView` agregados en la Fase 3:
//
//   1. `isLocked(): boolean` — antes `setLocked()` (CardView.ts) solo
//      llamaba a disableInteractive()/setInteractive() sin guardar el flag,
//      así que nada podía preguntar "¿esta carta está bloqueada?".
//   2. `setKeyboardFocus(on: boolean)` — highlight de foco de teclado que
//      replica el MISMO efecto visual del hover pero SIN depender de la
//      interactividad del sprite: la carta secreta del pedestal está
//      locked + disableInteractive y aun así debe poder resaltarse.
//
// Escrito rojo-primero (docs/testing.md §4): los dos métodos se
// implementaron DESPUÉS de este spec, con el rojo verificado en runtime
// (`… is not a function`) y el typecheck/lint en verde (el spec se tipa
// contra `CardViewKeyboardFocusApi`, el contrato).
//
// Entorno `node` (sin jsdom): mock mínimo de 'phaser' al estilo de
// SoundFullscreenControls.spec / DeckCelebrationEffect.spec. Como CardView
// extiende Phaser.GameObjects.Container, el mock necesita una clase con la
// que poder heredar; el resto de la escena (add.rectangle/image/text y
// tweens) lo fakea este spec con jest.fn() observables. CardView (la clase
// REAL) no se mockea: los tests la ejercitan de punta a punta.
jest.mock('phaser', () => {
  class Container {
    scene: unknown;
    x: number;
    y: number;
    scale: number;
    constructor(scene: unknown, x: number, y: number) {
      this.scene = scene;
      this.x = x;
      this.y = y;
      this.scale = 1;
    }
    add(): void {}
    setScale(scale: number): void {
      this.scale = scale;
    }
    emit(): void {}
  }
  return { GameObjects: { Container } };
});

import { CardView } from './CardView';

type CardViewCtorArgs = ConstructorParameters<typeof CardView>;

/**
 * API de CardView para el foco de teclado PC (Fase 3): el spec se tipa
 * contra esta intersección por robustez (los métodos ya existen en la
 * clase real desde el cierre de la Fase 3).
 */
type CardViewKeyboardFocusApi = CardView & {
  isLocked(): boolean;
  setKeyboardFocus(on: boolean): void;
};

/** Glow del borde: el spec lee `strokeAlpha` (lo que el real refleja en setStrokeStyle). */
interface FakeGlow {
  strokeAlpha: number;
  setStrokeStyle: jest.Mock;
}

/**
 * Sprite de la carta: `interactive` refleja lo que en el real producen
 * setInteractive()/disableInteractive(); `handlers` registra los eventos
 * que CardView suscribe con on() para poder disparar el hover a mano.
 */
interface FakeSprite {
  interactive: boolean;
  handlers: Record<string, () => void>;
  on: jest.Mock;
  setInteractive: jest.Mock;
  disableInteractive: jest.Mock;
  setTexture: jest.Mock;
}

interface FakeText {
  setOrigin: jest.Mock;
  setVisible: jest.Mock;
  setText: jest.Mock;
  setColor: jest.Mock;
}

interface FakeTweens {
  add: jest.Mock;
  killTweensOf: jest.Mock;
}

interface FakeScene {
  add: {
    rectangle: jest.Mock;
    image: jest.Mock;
    text: jest.Mock;
    existing: jest.Mock;
  };
  tweens: FakeTweens;
  glow: FakeGlow;
  sprite: FakeSprite;
}

function createFakeText(): FakeText {
  const text: FakeText = {
    setOrigin: jest.fn((): FakeText => text),
    setVisible: jest.fn((): FakeText => text),
    setText: jest.fn((): FakeText => text),
    setColor: jest.fn((): FakeText => text)
  };
  return text;
}

function createFakeScene(): FakeScene {
  const glow: FakeGlow = {
    strokeAlpha: 0,
    setStrokeStyle: jest.fn((_width: number, _color: number, alpha: number): FakeGlow => {
      glow.strokeAlpha = alpha;
      return glow;
    })
  };

  const sprite: FakeSprite = {
    interactive: false,
    handlers: {},
    on: jest.fn((event: string, handler: () => void): FakeSprite => {
      sprite.handlers[event] = handler;
      return sprite;
    }),
    setInteractive: jest.fn((): FakeSprite => {
      sprite.interactive = true;
      return sprite;
    }),
    disableInteractive: jest.fn((): FakeSprite => {
      sprite.interactive = false;
      return sprite;
    }),
    setTexture: jest.fn((): FakeSprite => sprite)
  };

  return {
    add: {
      rectangle: jest.fn((): FakeGlow => glow),
      image: jest.fn((): FakeSprite => sprite),
      text: jest.fn((): FakeText => createFakeText()),
      existing: jest.fn()
    },
    tweens: {
      add: jest.fn(),
      killTweensOf: jest.fn()
    },
    glow,
    sprite
  };
}

/** Escala de reposo típica del tablero (BUGFIX bug_card_focus: ni 1.0 fijo). */
const BASE_SCALE = 0.88;

interface CardFixture {
  card: CardViewKeyboardFocusApi;
  glow: FakeGlow;
  sprite: FakeSprite;
  tweens: FakeTweens;
}

/** Crea una CardView REAL sobre la escena falsa (cada fixture es independiente). */
function createCard(): CardFixture {
  const scene = createFakeScene();
  const card = new CardView(
    scene as unknown as CardViewCtorArgs[0],
    640,
    360,
    'card_1'
  ) as unknown as CardViewKeyboardFocusApi;
  return { card, glow: scene.glow, sprite: scene.sprite, tweens: scene.tweens };
}

/** Escala objetivo del último tween pedido a `scene.tweens.add`. */
function lastTweenScale(tweens: FakeTweens): number {
  const calls = tweens.add.mock.calls;
  return (calls[calls.length - 1][0] as { scale: number }).scale;
}

describe('CardView', () => {
  describe('setLocked / isLocked (persistencia del estado de bloqueo)', () => {
    it('a freshly created CardView is not locked', () => {
      const { card } = createCard();

      expect(card.isLocked()).toBe(false);
    });

    it('setLocked(true) marks the card as locked and setLocked(false) unlocks it', () => {
      const { card } = createCard();

      card.setLocked(true);
      expect(card.isLocked()).toBe(true);

      card.setLocked(false);
      expect(card.isLocked()).toBe(false);
    });

    // Comportamiento previo que debe quedar INTACTO: setLocked() ya
    // deshabilita/habilita la interactividad del sprite; el flag nuevo no
    // puede reemplazar ese efecto, tiene que acompañarlo.
    it('setLocked(true) still disables the sprite interaction and setLocked(false) re-enables it', () => {
      const { card, sprite } = createCard();
      // El ctor la deja interactiva.
      expect(sprite.interactive).toBe(true);

      card.setLocked(true);
      expect(sprite.disableInteractive).toHaveBeenCalledTimes(1);
      expect(sprite.interactive).toBe(false);

      // setInteractive ya se llamó una vez en el ctor: se cuentan las
      // llamadas NUEVAS que trae el desbloqueo.
      const enablesBefore = sprite.setInteractive.mock.calls.length;
      card.setLocked(false);
      expect(sprite.setInteractive.mock.calls.length).toBe(enablesBefore + 1);
      expect(sprite.interactive).toBe(true);
    });
  });

  describe('setKeyboardFocus (highlight de foco de teclado)', () => {
    it('setKeyboardFocus(true) lights the glow and asks for an enlarged scale tween, and false restores both', () => {
      const { card, glow, tweens } = createCard();
      card.setBaseScale(BASE_SCALE);

      card.setKeyboardFocus(true);
      expect(glow.strokeAlpha).toBeGreaterThan(0);
      expect(tweens.add).toHaveBeenCalledTimes(1);
      expect(lastTweenScale(tweens)).toBeGreaterThan(BASE_SCALE);

      card.setKeyboardFocus(false);
      expect(glow.strokeAlpha).toBe(0);
      expect(tweens.add).toHaveBeenCalledTimes(2);
      expect(lastTweenScale(tweens)).toBeCloseTo(BASE_SCALE, 6);
    });

    // Paridad con el hover: el foco de teclado tiene que producir el MISMO
    // resaltado que pointerover/pointerout sobre la misma carta (mismo
    // alpha de glow y misma escala objetivo), no una versión parecida.
    it('setKeyboardFocus(true) reproduces the pointer hover highlight on the same card', () => {
      const { card, glow, sprite, tweens } = createCard();
      card.setBaseScale(BASE_SCALE);

      sprite.handlers.pointerover();
      expect(glow.strokeAlpha).toBeGreaterThan(0);
      expect(tweens.add).toHaveBeenCalledTimes(1);
      const hoverGlowAlpha = glow.strokeAlpha;
      const hoverTargetScale = lastTweenScale(tweens);
      sprite.handlers.pointerout();

      card.setKeyboardFocus(true);

      expect(glow.strokeAlpha).toBe(hoverGlowAlpha);
      expect(tweens.add).toHaveBeenCalledTimes(3);
      expect(lastTweenScale(tweens)).toBeCloseTo(hoverTargetScale, 6);
    });

    // El hover temprano (isRevealed) es el contrato: una carta ya
    // resuelta no se resalta, ni con puntero ni con teclado.
    it('setKeyboardFocus(true) does not touch glow or tweens on a revealed card', () => {
      const { card, glow, tweens } = createCard();
      card.revealValue(500);
      expect(card.isCardOpen()).toBe(true);

      const strokeCallsBefore = glow.setStrokeStyle.mock.calls.length;
      const tweenCallsBefore = tweens.add.mock.calls.length;

      card.setKeyboardFocus(true);

      expect(glow.setStrokeStyle.mock.calls.length).toBe(strokeCallsBefore);
      expect(tweens.add.mock.calls.length).toBe(tweenCallsBefore);
      expect(glow.strokeAlpha).toBe(0);
    });

    it('setKeyboardFocus(true) is idempotent: a second call keeps the glow lit without errors', () => {
      const { card, glow } = createCard();

      expect(() => {
        card.setKeyboardFocus(true);
        card.setKeyboardFocus(true);
      }).not.toThrow();
      expect(glow.strokeAlpha).toBeGreaterThan(0);
    });

    // Sin foco previo no hay nada que deshacer: no puede romper ni puede
    // meter un tween de escala que la carta no pidió.
    it('setKeyboardFocus(false) without a previous focus is a safe no-op', () => {
      const { card, glow, tweens } = createCard();
      const tweenCallsBefore = tweens.add.mock.calls.length;

      expect(() => card.setKeyboardFocus(false)).not.toThrow();
      expect(tweens.add.mock.calls.length).toBe(tweenCallsBefore);
      expect(glow.strokeAlpha).toBe(0);
    });

    // Motivo de existir del método: la carta secreta del pedestal está
    // locked (disableInteractive) y aun así Enter debe poder resaltarla —
    // el highlight no depende de la interactividad del sprite.
    it('a locked card can still be keyboard-focused without re-enabling the sprite', () => {
      const { card, glow, sprite, tweens } = createCard();
      card.setBaseScale(BASE_SCALE);
      card.setLocked(true);
      expect(sprite.interactive).toBe(false);

      card.setKeyboardFocus(true);

      expect(glow.strokeAlpha).toBeGreaterThan(0);
      expect(tweens.add).toHaveBeenCalledTimes(1);
      expect(lastTweenScale(tweens)).toBeGreaterThan(BASE_SCALE);
      expect(sprite.interactive).toBe(false);
    });

    // M2 (review Fase 3): el highlight tiene DOS dueños derivados — un
    // pointerout NO apaga el glow de una carta que sigue enfocada por
    // teclado (antes cada dueño apagaba por su cuenta y el foco quedaba
    // invisible mientras Enter seguía actuando sobre esa carta).
    it('pointerout does not clear the glow while the card keeps keyboard focus', () => {
      const { card, glow, sprite } = createCard();
      card.setKeyboardFocus(true);
      expect(glow.strokeAlpha).toBeGreaterThan(0);

      sprite.handlers.pointerout();

      expect(glow.strokeAlpha).toBeGreaterThan(0);
    });

    // M2 (review Fase 3): bloquear la carta apaga el foco de teclado y su
    // residuo de escala (initialScale × 1.06) — sin esto, durante la
    // ventana del banquero la carta enfocada quedaba sin glow pero
    // agrandada, y tras el unlock el foco seguía activo invisible.
    it('setLocked(true) clears an active keyboard focus and restores the base scale', () => {
      const { card, glow, tweens } = createCard();
      card.setBaseScale(BASE_SCALE);
      card.setKeyboardFocus(true);
      expect(lastTweenScale(tweens)).toBeGreaterThan(BASE_SCALE);

      card.setLocked(true);

      expect(glow.strokeAlpha).toBe(0);
      expect(card.scale).toBeCloseTo(BASE_SCALE, 6);
      // El foco quedó limpio: un setKeyboardFocus(false) posterior es
      // no-op con cero tweens nuevos (bandera ya en false).
      const tweenCallsBefore = tweens.add.mock.calls.length;
      card.setKeyboardFocus(false);
      expect(tweens.add.mock.calls.length).toBe(tweenCallsBefore);
    });

    // B1 (review Fase 3): el DisplayList destruye los game objects ANTES
    // que los listeners de SHUTDOWN de la escena — setKeyboardFocus sobre
    // una CardView destruida (scene undefined) debe ser no-op sin lanzar,
    // o el TypeError abortaría el resto de la limpieza de la partida.
    it('setKeyboardFocus on a destroyed view (scene undefined) is a safe no-op', () => {
      const { card } = createCard();
      card.setKeyboardFocus(true);
      // Simula el destroy de Phaser: GameObject.destroy pone scene en
      // undefined antes de que GameScene corra su clearKbFocus.
      (card as unknown as { scene: unknown }).scene = undefined;

      expect(() => card.setKeyboardFocus(false)).not.toThrow();
    });

    // resetAsFaceDown limpia los DOS dueños del highlight: si el puntero
    // quedara en true, un refreshHighlight posterior sería no-op y la
    // carta re-repartida se quedaría sin resaltar.
    it('resetAsFaceDown clears both highlight owners so a later hover lights up again', () => {
      const { card, glow, sprite } = createCard();
      card.setKeyboardFocus(true);
      sprite.handlers.pointerover(); // los dos dueños encendidos
      card.resetAsFaceDown();
      expect(glow.strokeAlpha).toBe(0);

      sprite.handlers.pointerout();
      expect(glow.strokeAlpha).toBe(0);
    });
  });
});
