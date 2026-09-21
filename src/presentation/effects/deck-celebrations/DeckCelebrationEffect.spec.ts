jest.mock('phaser', () => ({
  Scene: class {},
  GameObjects: {
    Container: class {},
    Graphics: class {},
    Rectangle: class {},
    Circle: class {},
    Text: class {},
    Ellipse: class {}
  },
  BlendModes: {
    ADD: 1
  },
  Math: {
    DegToRad: (deg: number) => (deg * Math.PI) / 180,
    RadToDeg: (rad: number) => (rad * 180) / Math.PI,
    Angle: {
      Between: () => 0
    }
  }
}));

import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import {
  hasCardPositionSource,
  getGameObjectGlobalPosition,
  getCelebrationTargetPosition,
  CardPositionSource
} from './DeckCelebrationEffect';
import { BatSwarmEffect } from './BatSwarmEffect';
import { CyberpunkMatrixRainEffect } from './CyberpunkMatrixRainEffect';
import { EgyptSandstormEffect } from './EgyptSandstormEffect';
import { GlacierShatterEffect } from './GlacierShatterEffect';
import { MedievalSiegeEffect } from './MedievalSiegeEffect';
import { OvniAbductionEffect } from './OvniAbductionEffect';
import { TarotAuraEffect } from './TarotAuraEffect';
import { TheaterSpotlightsEffect } from './TheaterSpotlightsEffect';
import { VegasRouletteEffect } from './VegasRouletteEffect';
import { WW2CombatEffect } from './WW2CombatEffect';
import { getDeckCelebrationEffect } from './DeckCelebrationEffectRegistry';

describe('DeckCelebrationEffect & Position Source', () => {
  describe('hasCardPositionSource', () => {
    it('returns true when scene implements getCardScreenPosition function', () => {
      const mockScene = {
        getCardScreenPosition: () => ({ x: 100, y: 200 })
      } as unknown as Phaser.Scene;

      expect(hasCardPositionSource(mockScene)).toBe(true);
    });

    it('returns false when scene does not implement getCardScreenPosition', () => {
      const mockScene = {} as unknown as Phaser.Scene;
      expect(hasCardPositionSource(mockScene)).toBe(false);
    });

    it('returns false for null or undefined', () => {
      expect(hasCardPositionSource(null as unknown as Phaser.Scene)).toBe(false);
      expect(hasCardPositionSource(undefined as unknown as Phaser.Scene)).toBe(false);
    });
  });

  describe('getGameObjectGlobalPosition', () => {
    it('extracts world coordinates from getWorldTransformMatrix if available', () => {
      const mockGameObject = {
        getWorldTransformMatrix: () => ({ tx: 350, ty: 450 }),
        getBounds: () => ({ centerX: 999, centerY: 999 }),
        x: 10,
        y: 20
      } as unknown as Phaser.GameObjects.GameObject;

      const pos = getGameObjectGlobalPosition(mockGameObject);
      expect(pos).toEqual({ x: 350, y: 450 });
    });

    it('falls back to getBounds when getWorldTransformMatrix is not present', () => {
      const mockGameObject = {
        getBounds: () => ({ centerX: 512, centerY: 384 }),
        x: 15,
        y: 25
      } as unknown as Phaser.GameObjects.GameObject;

      const pos = getGameObjectGlobalPosition(mockGameObject);
      expect(pos).toEqual({ x: 512, y: 384 });
    });

    it('falls back to local x/y if neither matrix nor bounds available', () => {
      const mockGameObject = {
        x: 123,
        y: 456
      } as unknown as Phaser.GameObjects.GameObject;

      const pos = getGameObjectGlobalPosition(mockGameObject);
      expect(pos).toEqual({ x: 123, y: 456 });
    });
  });

  describe('getCelebrationTargetPosition', () => {
    const card = Card.create('card_7', 25000, false);

    it('resolves coordinates via CardPositionSource if implemented by scene', () => {
      const mockScene = {
        getCardScreenPosition: (id: string) => (id === 'card_7' ? { x: 300, y: 400 } : null),
        cameras: { main: { width: 1280, height: 720 } }
      } as unknown as Phaser.Scene;

      const pos = getCelebrationTargetPosition(mockScene, card);
      expect(pos).toEqual({ x: 300, y: 400 });
    });

    it('redirects to ResultScene if ResultScene is active on the scene manager (secret card win)', () => {
      const mockResultScene: CardPositionSource = {
        getCardScreenPosition: () => ({ x: 640, y: 312 })
      };

      const mockScene = {
        scene: {
          isActive: (key: string) => key === 'ResultScene',
          get: (key: string) => (key === 'ResultScene' ? mockResultScene : null)
        },
        getCardScreenPosition: () => ({ x: 999, y: 999 }),
        cameras: { main: { width: 1280, height: 720 } }
      } as unknown as Phaser.Scene;

      const pos = getCelebrationTargetPosition(mockScene, card);
      expect(pos).toEqual({ x: 640, y: 312 });
    });

    it('falls back to camera center when no position source is found', () => {
      const mockScene = {
        cameras: { main: { width: 1280, height: 720 } }
      } as unknown as Phaser.Scene;

      const pos = getCelebrationTargetPosition(mockScene, card);
      expect(pos).toEqual({ x: 640, y: 360 });
    });
  });

  describe('All 10 Celebration Effects Registration and Interface', () => {
    it('registers all 10 theme effects properly in DeckCelebrationEffectRegistry', () => {
      expect(getDeckCelebrationEffect('dracula')).toBeInstanceOf(BatSwarmEffect);
      expect(getDeckCelebrationEffect('cyberpunk')).toBeInstanceOf(CyberpunkMatrixRainEffect);
      expect(getDeckCelebrationEffect('egypt')).toBeInstanceOf(EgyptSandstormEffect);
      expect(getDeckCelebrationEffect('glacier')).toBeInstanceOf(GlacierShatterEffect);
      expect(getDeckCelebrationEffect('medieval')).toBeInstanceOf(MedievalSiegeEffect);
      expect(getDeckCelebrationEffect('ovni')).toBeInstanceOf(OvniAbductionEffect);
      expect(getDeckCelebrationEffect('tarot')).toBeInstanceOf(TarotAuraEffect);
      expect(getDeckCelebrationEffect('basic')).toBeInstanceOf(TheaterSpotlightsEffect);
      expect(getDeckCelebrationEffect('vegas')).toBeInstanceOf(VegasRouletteEffect);
      expect(getDeckCelebrationEffect('ww2')).toBeInstanceOf(WW2CombatEffect);
    });
  });
});
