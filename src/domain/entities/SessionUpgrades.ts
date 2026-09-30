import { SessionUpgradeId } from '../value-objects/SessionUpgradeCatalog';

export type EnergyTankLevel = 0 | 1 | 2;

/** Estado visible/comprable de una mejora de partida (ver SessionUpgrades.getState). */
export type SessionUpgradeState = 'acquired' | 'locked' | 'available';

/**
 * Estado de las mejoras compradas DURANTE la partida actual.
 *
 * A diferencia del viejo modelo (upgrades persistentes en localStorage vía
 * IProgressionRepository), estos upgrades son consumibles de partida única:
 * viven ÚNICAMENTE en memoria, como parte de la GameSession que los posee.
 * No requieren ninguna lógica explícita de "expiración" — al terminar la
 * partida, la GameSession (y con ella esta instancia) simplemente se
 * descarta; una partida nueva siempre arranca con una SessionUpgrades
 * en blanco. Nunca se serializa ni se persiste.
 */
export class SessionUpgrades {
  private energyTankLevel: EnergyTankLevel = 0;
  private doubleRewardOwned = false;
  private tripleRewardOwned = false;
  private reviveOwned = false;
  private secretSwapFinalOwned = false;
  private negativeCardShieldOwned = false;
  private negotiatorOwned = false;

  getEnergyTankLevel(): EnergyTankLevel {
    return this.energyTankLevel;
  }

  /** true si el nivel solicitado es exactamente el siguiente disponible (1 tras 0, 2 tras 1). */
  canPurchaseEnergyTankLevel(level: EnergyTankLevel): boolean {
    return level === this.energyTankLevel + 1;
  }

  applyEnergyTankLevel(level: EnergyTankLevel): void {
    if (!this.canPurchaseEnergyTankLevel(level)) {
      throw new Error(
        `No se puede aplicar el nivel ${level} del Tanque de Energía desde el nivel actual ${this.energyTankLevel}`
      );
    }
    this.energyTankLevel = level;
  }

  hasDoubleReward(): boolean {
    return this.doubleRewardOwned;
  }

  hasTripleReward(): boolean {
    return this.tripleRewardOwned;
  }

  hasRevive(): boolean {
    return this.reviveOwned;
  }

  /**
   * Consume el "Revivir" tras usarlo. SIN esto, `reviveOwned` queda en
   * `true` para siempre: como `buildUpgradeFlagsForResultScene()` llama a
   * `hasRevive()` de nuevo en cada NUEVA derrota de la misma partida (no
   * solo una vez al principio), el botón "Revivir" reaparecía en cada
   * pantalla de derrota posterior — bastaba una sola compra de 1.250
   * monedas para revivir un número ilimitado de veces en la misma
   * partida (viendo un anuncio cada vez), haciendo la derrota imposible.
   * Llamar SOLO tras un revive exitoso (ver ReviveWithAdUseCase.execute).
   */
  consumeRevive(): void {
    this.reviveOwned = false;
  }

  hasSecretSwapFinal(): boolean {
    return this.secretSwapFinalOwned;
  }

  /** "Escudo de Carta Negativa": mitiga a la mitad el drenaje de cartas peligrosas (ver GameSession.openCard). */
  hasNegativeCardShield(): boolean {
    return this.negativeCardShieldOwned;
  }

  /** "Negociador": suma un bonus porcentual a la oferta del Banquero (ver GameSession.openCard / Banker.makeOffer). */
  hasNegotiator(): boolean {
    return this.negotiatorOwned;
  }

  grantDoubleReward(): void {
    this.doubleRewardOwned = true;
  }

  grantTripleReward(): void {
    this.tripleRewardOwned = true;
  }

  grantRevive(): void {
    this.reviveOwned = true;
  }

  grantSecretSwapFinal(): void {
    this.secretSwapFinalOwned = true;
  }

  grantNegativeCardShield(): void {
    this.negativeCardShieldOwned = true;
  }

  grantNegotiator(): void {
    this.negotiatorOwned = true;
  }

  /**
   * ¿La mejora ya está adquirida en esta partida?
   * Única fuente de verdad para "¿ya lo tengo?" (la consumen
   * PurchaseSessionUpgradeUseCase y la UI de la tienda).
   */
  isOwned(upgradeId: SessionUpgradeId): boolean {
    switch (upgradeId) {
      case 'energy_tank_1':
        return this.getEnergyTankLevel() >= 1;
      case 'energy_tank_2':
        return this.getEnergyTankLevel() >= 2;
      case 'double_reward':
        return this.doubleRewardOwned;
      case 'triple_reward':
        return this.tripleRewardOwned;
      case 'revive':
        return this.reviveOwned;
      case 'secret_swap_final':
        return this.secretSwapFinalOwned;
      case 'negative_card_shield':
        return this.negativeCardShieldOwned;
      case 'negotiator':
        return this.negotiatorOwned;
    }
  }

  /**
   * ¿Se puede comprar ahora mismo? Falso si ya se tiene, o si no se cumple
   * el prerequisito (los tanques de energía son los únicos con prerequisito
   * de nivel: el nivel N solo es comprable desde el nivel N−1).
   */
  canPurchase(upgradeId: SessionUpgradeId): boolean {
    switch (upgradeId) {
      case 'energy_tank_1':
        return this.canPurchaseEnergyTankLevel(1);
      case 'energy_tank_2':
        return this.canPurchaseEnergyTankLevel(2);
      case 'double_reward':
        return !this.doubleRewardOwned;
      case 'triple_reward':
        return !this.tripleRewardOwned;
      case 'revive':
        return !this.reviveOwned;
      case 'secret_swap_final':
        return !this.secretSwapFinalOwned;
      case 'negative_card_shield':
        return !this.negativeCardShieldOwned;
      case 'negotiator':
        return !this.negotiatorOwned;
    }
  }

  /**
   * Estado visible/comprable de una mejora:
   * 'acquired' = ya la tiene · 'locked' = prerequisito pendiente (solo
   * energy_tank_2 sin energy_tank_1) · 'available' = comprable.
   */
  getState(upgradeId: SessionUpgradeId): SessionUpgradeState {
    if (this.isOwned(upgradeId)) {
      return 'acquired';
    }
    return this.canPurchase(upgradeId) ? 'available' : 'locked';
  }
}
