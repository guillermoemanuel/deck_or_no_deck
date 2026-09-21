import Phaser from 'phaser';
import { GameSession } from '../domain/entities/GameSession';
import { PurchaseSessionUpgradeUseCase } from '../application/use-cases/PurchaseSessionUpgradeUseCase';

const REGISTRY_KEY = 'activeSessionBridge';

/**
 * Puente minimo entre GameScene (dueña de la GameSession) y ShopScene
 * (una escena distinta, lanzada en paralelo vía el botón "Tienda" de
 * UIScene). Los upgrades ahora son consumibles de PARTIDA ÚNICA — se
 * compran y aplican sobre la sesión EN CURSO — así que ShopScene necesita
 * leer/mutar esa sesión sin acoplarse directamente a GameScene.
 *
 * Se apoya en game.registry (el mismo mecanismo ya usado para GameServices),
 * manteniendo a GameSession y PurchaseSessionUpgradeUseCase completamente
 * ajenos a Phaser — este archivo es la ÚNICA pieza de presentación que los
 * conoce como par.
 */
export interface ActiveSessionBridge {
  readonly session: GameSession;
  readonly purchaseSessionUpgradeUseCase: PurchaseSessionUpgradeUseCase;
}

export function setActiveSessionBridge(scene: Phaser.Scene, bridge: ActiveSessionBridge): void {
  scene.registry.set(REGISTRY_KEY, bridge);
}

export function getActiveSessionBridge(scene: Phaser.Scene): ActiveSessionBridge | null {
  return (scene.registry.get(REGISTRY_KEY) as ActiveSessionBridge | undefined) ?? null;
}

export function clearActiveSessionBridge(scene: Phaser.Scene): void {
  scene.registry.remove(REGISTRY_KEY);
}
