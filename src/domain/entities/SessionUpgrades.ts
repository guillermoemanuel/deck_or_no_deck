export type EnergyTankLevel = 0 | 1 | 2;

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
}
