import { GameSession } from '../../domain/entities/GameSession';
import { IProgressionService } from '../../domain/ports/IProgressionService';
import { GameEvent } from '../../domain/events/GameEvents';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
import { SessionUpgradeId, findSessionUpgradeDefinition } from '../../domain/value-objects/SessionUpgradeCatalog';

export type PurchaseSessionUpgradeResult =
  | { success: true }
  | { success: false; reason: 'insufficient_coins' | 'unknown_upgrade' | 'not_applicable' };

/**
 * Orquesta la compra de un upgrade DE PARTIDA (consumible — ver
 * SessionUpgrades): cobra del acumulado global PERSISTENTE
 * (IProgressionService, vía ProgressionManager) y aplica el efecto
 * INMEDIATO sobre la GameSession en curso. Si el upgrade no es aplicable
 * en el estado actual de la partida (ej. ya comprado, o nivel de tanque
 * fuera de secuencia), no se cobra nada — el dinero nunca se descuenta
 * sin que el efecto se aplique.
 */
export class PurchaseSessionUpgradeUseCase {
  constructor(
    private readonly session: GameSession,
    private readonly progressionService: IProgressionService,
    private readonly eventBus: SimpleEventEmitter<GameEvent>
  ) {}

  execute(upgradeId: SessionUpgradeId): PurchaseSessionUpgradeResult {
    const definition = findSessionUpgradeDefinition(upgradeId);
    if (!definition) {
      return { success: false, reason: 'unknown_upgrade' };
    }

    if (!this.isApplicable(upgradeId)) {
      return { success: false, reason: 'not_applicable' };
    }

    if (!this.progressionService.spendCoins(definition.cost)) {
      return { success: false, reason: 'insufficient_coins' };
    }

    this.applyEffect(upgradeId);
    return { success: true };
  }

  private isApplicable(upgradeId: SessionUpgradeId): boolean {
    const upgrades = this.session.getSessionUpgrades();
    switch (upgradeId) {
      case 'energy_tank_1':
        return upgrades.canPurchaseEnergyTankLevel(1);
      case 'energy_tank_2':
        return upgrades.canPurchaseEnergyTankLevel(2);
      case 'double_reward':
        return !upgrades.hasDoubleReward();
      case 'triple_reward':
        return !upgrades.hasTripleReward();
      case 'revive':
        return !upgrades.hasRevive();
      case 'secret_swap_final':
        return !upgrades.hasSecretSwapFinal();
      case 'negative_card_shield':
        return !upgrades.hasNegativeCardShield();
      case 'negotiator':
        return !upgrades.hasNegotiator();
    }
  }

  private applyEffect(upgradeId: SessionUpgradeId): void {
    const upgrades = this.session.getSessionUpgrades();
    switch (upgradeId) {
      case 'energy_tank_1':
        this.session.applyEnergyTankUpgrade(1);
        this.eventBus.emit({
          type: 'EnergyTankUpgraded',
          capacityMultiplier: 1.25,
          energyPercentage: this.session.getEnergyPercentage()
        });
        break;
      case 'energy_tank_2':
        this.session.applyEnergyTankUpgrade(2);
        this.eventBus.emit({
          type: 'EnergyTankUpgraded',
          capacityMultiplier: 1.5,
          energyPercentage: this.session.getEnergyPercentage()
        });
        break;
      case 'double_reward':
        upgrades.grantDoubleReward();
        break;
      case 'triple_reward':
        upgrades.grantTripleReward();
        break;
      case 'revive':
        upgrades.grantRevive();
        break;
      case 'secret_swap_final':
        upgrades.grantSecretSwapFinal();
        // BUGFIX (secret_swap_final comprado en la última jugada): la
        // disponibilidad de este intercambio normalmente se anuncia una
        // única vez, justo al abrir la anteúltima carta (ver
        // OpenCardUseCase.execute() → evento 'FinalCardSwapAvailable').
        // Si en ese momento el jugador todavía no tenía el upgrade, ese
        // aviso nunca se disparaba — y como nada más vuelve a chequear
        // la condición, comprarlo DESPUÉS, ya con una única carta
        // cerrada restante, no ofrecía la opción de intercambio hasta
        // la partida siguiente. Se repite acá el mismo chequeo
        // (session.canSwapFinalSecretCard()) inmediatamente después de
        // otorgar el upgrade: si el tablero YA está en esa última
        // jugada, se anuncia la disponibilidad ahora mismo, en vez de
        // esperar a un próximo 'openCard' que no va a volver a llegar.
        if (this.session.canSwapFinalSecretCard()) {
          this.eventBus.emit({ type: 'FinalCardSwapAvailable' });
        }
        break;
      case 'negative_card_shield':
        upgrades.grantNegativeCardShield();
        break;
      case 'negotiator':
        upgrades.grantNegotiator();
        break;
    }
  }
}