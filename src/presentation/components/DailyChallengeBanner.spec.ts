// Fase 7 (teclado PC) — Bug 1: el banner del Desafío Diario del menú
// principal no entraba en el anillo de foco de las flechas porque nunca se
// registró en `focusEntries`. Este spec cubre la API de teclado que el
// banner expone para que MainMenuScene lo registre:
//
//   1. `isAvailable(): boolean` — si el desafío de hoy ya se jugó/completó,
//      el banner no es candidato de foco (paridad con el ratón: el hit zone
//      solo se crea cuando está disponible).
//   2. `highlight(on: boolean)` — ÚNICO dueño del resaltado: el hover del
//      ratón y el foco de teclado comparten el mismo cambio de fillStyle
//      (criterio M2 del review de la Fase 3).
//   3. `activate(): void` — activa el desafío TAL CUAL hace el `pointerup`
//      del ratón: pide el modo diario en el registry, suena SFX.BONUS_CLAIM
//      (el click de reclamo) y navega vía onStart. El handler del puntero
//      delega en `activate()` — un solo camino.
//
// Escrito rojo-primero (docs/testing.md §4): los métodos se implementaron
// DESPUÉS de este spec, con el rojo verificado en runtime (`… is not a
// function`) — el spec se tipa contra `DailyChallengeBannerKeyboardApi`,
// el contrato, igual que CardView.spec con CardViewKeyboardFocusApi.
//
// Entorno `node` (sin jsdom): mock mínimo de 'phaser' al estilo de
// CardView.spec (LocalizedText es REAL y extiende GameObjects.Text, así que
// el mock necesita una clase Text con setOrigin/setPosition/once). Los
// servicios se inyectan vía jest.mock('../GameServices') y el registry del
// modo diario es un fake con jest.fn() observable.
jest.mock('phaser', () => {
  class Text {
    constructor(
      _scene: unknown,
      _x: number,
      _y: number,
      _text: string,
      _style: unknown
    ) {}
    setOrigin(): this {
      return this;
    }
    setPosition(): this {
      return this;
    }
    once(): this {
      return this;
    }
  }
  return {
    GameObjects: {
      Text,
      Events: { DESTROY: 'destroy' }
    }
  };
});

jest.mock('../GameServices', () => ({
  getServices: jest.fn()
}));

import { EMPTY_DAILY_STATE, DailyChallengeState } from '../../domain/value-objects/DailyChallenge';
import { getUtcDateKey } from '../../domain/value-objects/DailyBoard';
import { EMPTY_RECORDS } from '../../domain/value-objects/PlayerRecords';
import { SFX } from '../../shared/audio/AudioData';
import { getServices } from '../GameServices';
import { DailyChallengeBanner } from './DailyChallengeBanner';

type BannerCtorArgs = ConstructorParameters<typeof DailyChallengeBanner>;

/**
 * API de DailyChallengeBanner para el foco de teclado (Fase 7): el spec se
 * tipa contra esta intersección por robustez (los métodos ya existen en la
 * clase real desde el cierre de la 7a).
 */
type DailyChallengeBannerKeyboardApi = DailyChallengeBanner & {
  isAvailable(): boolean;
  highlight(on: boolean): void;
  activate(): void;
};

/** FillStyle actual del fondo del banner: lo que el real refleja en setFillStyle. */
interface FakeFill {
  color: number;
  alpha: number;
}

interface FakeRectangle {
  fill: FakeFill;
  setStrokeStyle: jest.Mock;
  setFillStyle: jest.Mock;
  on: jest.Mock;
  handlers: Record<string, () => void>;
}

interface FakeZone {
  handlers: Record<string, () => void>;
  setOrigin: jest.Mock;
  setInteractive: jest.Mock;
  on: jest.Mock;
}

interface FakeScene {
  add: {
    rectangle: jest.Mock;
    zone: jest.Mock;
    container: jest.Mock;
    existing: jest.Mock;
  };
  game: { registry: { set: jest.Mock; get: jest.Mock; remove: jest.Mock } };
}

function createFakeRectangle(color: number, alpha: number): FakeRectangle {
  const rect: FakeRectangle = {
    fill: { color, alpha },
    setStrokeStyle: jest.fn((): FakeRectangle => rect),
    setFillStyle: jest.fn((newColor: number, newAlpha: number): FakeRectangle => {
      rect.fill = { color: newColor, alpha: newAlpha };
      return rect;
    }),
    on: jest.fn(),
    handlers: {}
  };
  return rect;
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
  return {
    add: {
      rectangle: jest.fn((_x: number, _y: number, _w: number, _h: number, color: number, alpha: number) =>
        createFakeRectangle(color, alpha)
      ),
      zone: jest.fn((): FakeZone => createFakeZone()),
      container: jest.fn(() => ({ add: jest.fn(), destroy: jest.fn() })),
      existing: jest.fn()
    },
    game: { registry: { set: jest.fn(), get: jest.fn(), remove: jest.fn() } }
  };
}

interface BannerFixture {
  banner: DailyChallengeBannerKeyboardApi;
  /** undefined cuando el banner NO está disponible (no crea hit zone). */
  zone: FakeZone | undefined;
  bg: FakeRectangle;
  registrySet: jest.Mock;
  play: jest.Mock;
  onStart: jest.Mock;
  todayKey: string;
}

/**
 * Crea un DailyChallengeBanner REAL sobre la escena falsa (cada fixture es
 * independiente). `dailyState` por defecto = desafío de hoy disponible.
 */
function createBanner(dailyState: DailyChallengeState = EMPTY_DAILY_STATE): BannerFixture {
  const scene = createFakeScene();
  const todayKey = getUtcDateKey(Date.now());
  const registrySet = scene.game.registry.set as jest.Mock;
  const play = jest.fn();

  (getServices as jest.Mock).mockReturnValue({
    dailyChallengeRepository: { get: () => dailyState },
    recordsRepository: { get: () => EMPTY_RECORDS },
    audioService: { play }
  });

  const onStart = jest.fn();
  const banner = new DailyChallengeBanner(scene as unknown as BannerCtorArgs[0], {
    x: 640,
    y: 352,
    width: 420,
    height: 64,
    onStart
  }) as unknown as DailyChallengeBannerKeyboardApi;

  // El hit zone interactivo del banner (SOLO existe si está disponible) y
  // el bg del panel: bg es el ÚNICO rectangle creado por el banner, zone la
  // ÚNICA zona — pero si no hay resultados el banner no está disponible y no
  // creó zona. Se deja `undefined` para que los tests de "not available"
  // puedan construir el fixture sin romper el acceso a `mock.results[0]`.
  const zoneMock = scene.add.zone as jest.Mock;
  const zone = zoneMock.mock.results.length > 0 ? (zoneMock.mock.results[0].value as FakeZone) : undefined;
  const bg = (scene.add.rectangle as jest.Mock).mock.results[0].value as FakeRectangle;

  return { banner, zone, bg, registrySet, play, onStart, todayKey };
}

/**
 * La zona del hit interactivo solo existe cuando el banner está disponible
 * (paridad con el ratón). Los tests que disparan puntero usan esta narrowing
 * helper en vez de `!` para no ensuciar el spec con non-null assertions.
 */
function requireZone(fixture: BannerFixture): FakeZone {
  if (!fixture.zone) throw new Error('banner no disponible: no creó hit zone');
  return fixture.zone;
}

describe('DailyChallengeBanner', () => {
  describe('isAvailable (candidatura de foco)', () => {
    it('is true when the daily challenge of today is still available', () => {
      const { banner } = createBanner();

      expect(banner.isAvailable()).toBe(true);
    });

    it('is false when the daily of today was already completed', () => {
      const { banner } = createBanner({ ...EMPTY_DAILY_STATE, lastCompletedDate: getUtcDateKey(Date.now()) });

      expect(banner.isAvailable()).toBe(false);
    });

    it('is false when the daily of today was started but not finished', () => {
      const { banner } = createBanner({ ...EMPTY_DAILY_STATE, lastStartedDate: getUtcDateKey(Date.now()) });

      expect(banner.isAvailable()).toBe(false);
    });
  });

  describe('highlight (unico dueno del resaltado, paridad con el hover)', () => {
    it('highlight(true) applies the hover fill and highlight(false) restores the rest fill', () => {
      const { banner, bg } = createBanner();

      banner.highlight(true);
      expect(bg.fill).toEqual({ color: 0x1c1c26, alpha: 0.95 });

      banner.highlight(false);
      expect(bg.fill).toEqual({ color: 0x121218, alpha: 0.92 });
    });

    it('the mouse pointerover/pointerout handlers produce the SAME fill as highlight (single owner)', () => {
      const fixture = createBanner();
      const zone = requireZone(fixture);
      const { banner, bg } = fixture;

      zone.handlers['pointerover']();
      const hoverFill = { ...bg.fill };
      banner.highlight(true);
      expect(bg.fill).toEqual(hoverFill);

      zone.handlers['pointerout']();
      const restFill = { ...bg.fill };
      banner.highlight(false);
      expect(bg.fill).toEqual(restFill);
    });
  });

  describe('activate (paridad con el pointerup del raton)', () => {
    it('available: requests the daily mode, plays BONUS_CLAIM and navigates via onStart', () => {
      const { banner, registrySet, play, onStart, todayKey } = createBanner();

      banner.activate();

      expect(registrySet).toHaveBeenCalledTimes(1);
      expect(registrySet).toHaveBeenCalledWith(expect.any(String), { mode: 'daily', dateKey: todayKey });
      expect(play).toHaveBeenCalledTimes(1);
      expect(play).toHaveBeenCalledWith(SFX.BONUS_CLAIM);
      expect(onStart).toHaveBeenCalledTimes(1);
    });

    it('not available: is a silent no-op (no registry request, no sound, no navigation)', () => {
      const completed = { ...EMPTY_DAILY_STATE, lastCompletedDate: getUtcDateKey(Date.now()) };
      const { banner, registrySet, play, onStart } = createBanner(completed);

      banner.activate();

      expect(registrySet).not.toHaveBeenCalled();
      expect(play).not.toHaveBeenCalled();
      expect(onStart).not.toHaveBeenCalled();
    });

    it('the zone pointerup handler is the SAME path as activate (request + sound + navigation, once)', () => {
      const fixture = createBanner();
      const zone = requireZone(fixture);
      const { registrySet, play, onStart, todayKey } = fixture;

      zone.handlers['pointerup']();

      expect(registrySet).toHaveBeenCalledTimes(1);
      expect(registrySet).toHaveBeenCalledWith(expect.any(String), { mode: 'daily', dateKey: todayKey });
      expect(play).toHaveBeenCalledTimes(1);
      expect(play).toHaveBeenCalledWith(SFX.BONUS_CLAIM);
      expect(onStart).toHaveBeenCalledTimes(1);
    });
  });
});
