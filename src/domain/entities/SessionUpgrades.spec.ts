import { SessionUpgrades } from './SessionUpgrades';

describe('SessionUpgrades', () => {
  it('starts with no upgrades owned', () => {
    const upgrades = new SessionUpgrades();

    expect(upgrades.getEnergyTankLevel()).toBe(0);
    expect(upgrades.hasDoubleReward()).toBe(false);
    expect(upgrades.hasTripleReward()).toBe(false);
    expect(upgrades.hasRevive()).toBe(false);
    expect(upgrades.hasSecretSwapFinal()).toBe(false);
    expect(upgrades.hasNegativeCardShield()).toBe(false);
    expect(upgrades.hasNegotiator()).toBe(false);
  });

  describe('energy tank progression', () => {
    it('allows purchasing level 1 from level 0', () => {
      const upgrades = new SessionUpgrades();
      expect(upgrades.canPurchaseEnergyTankLevel(1)).toBe(true);
      upgrades.applyEnergyTankLevel(1);
      expect(upgrades.getEnergyTankLevel()).toBe(1);
    });

    it('allows purchasing level 2 only after level 1', () => {
      const upgrades = new SessionUpgrades();
      expect(upgrades.canPurchaseEnergyTankLevel(2)).toBe(false);

      upgrades.applyEnergyTankLevel(1);
      expect(upgrades.canPurchaseEnergyTankLevel(2)).toBe(true);

      upgrades.applyEnergyTankLevel(2);
      expect(upgrades.getEnergyTankLevel()).toBe(2);
    });

    it('does not allow skipping level 1 to buy level 2 directly', () => {
      const upgrades = new SessionUpgrades();
      expect(() => upgrades.applyEnergyTankLevel(2)).toThrow();
    });

    it('does not allow re-purchasing the same level twice', () => {
      const upgrades = new SessionUpgrades();
      upgrades.applyEnergyTankLevel(1);
      expect(upgrades.canPurchaseEnergyTankLevel(1)).toBe(false);
      expect(() => upgrades.applyEnergyTankLevel(1)).toThrow();
    });

    it('does not allow buying level 2 twice', () => {
      const upgrades = new SessionUpgrades();
      upgrades.applyEnergyTankLevel(1);
      upgrades.applyEnergyTankLevel(2);
      expect(upgrades.canPurchaseEnergyTankLevel(2)).toBe(false);
      expect(() => upgrades.applyEnergyTankLevel(2)).toThrow();
    });
  });

  describe('one-shot grants (double/triple/revive/secret swap)', () => {
    it('grantDoubleReward makes hasDoubleReward true, idempotently', () => {
      const upgrades = new SessionUpgrades();
      upgrades.grantDoubleReward();
      upgrades.grantDoubleReward(); // no debe lanzar ni tener efecto raro
      expect(upgrades.hasDoubleReward()).toBe(true);
    });

    it('grantTripleReward is independent from grantDoubleReward', () => {
      const upgrades = new SessionUpgrades();
      upgrades.grantTripleReward();
      expect(upgrades.hasTripleReward()).toBe(true);
      expect(upgrades.hasDoubleReward()).toBe(false);
    });

    it('both double and triple reward can coexist', () => {
      const upgrades = new SessionUpgrades();
      upgrades.grantDoubleReward();
      upgrades.grantTripleReward();
      expect(upgrades.hasDoubleReward()).toBe(true);
      expect(upgrades.hasTripleReward()).toBe(true);
    });

    it('grantRevive makes hasRevive true', () => {
      const upgrades = new SessionUpgrades();
      upgrades.grantRevive();
      expect(upgrades.hasRevive()).toBe(true);
    });

    // BUGFIX (revive infinito): sin consumeRevive(), hasRevive() se quedaba
    // en true para siempre tras comprarlo una vez, permitiendo revivir sin
    // límite en la misma partida (ver el comentario en consumeRevive() y en
    // ReviveWithAdUseCase.execute()).
    it('consumeRevive makes hasRevive false again after granting it', () => {
      const upgrades = new SessionUpgrades();
      upgrades.grantRevive();

      upgrades.consumeRevive();

      expect(upgrades.hasRevive()).toBe(false);
    });

    it('consumeRevive without ever granting it is a harmless no-op', () => {
      const upgrades = new SessionUpgrades();

      expect(() => upgrades.consumeRevive()).not.toThrow();
      expect(upgrades.hasRevive()).toBe(false);
    });

    it('consumeRevive does not affect other upgrades', () => {
      const upgrades = new SessionUpgrades();
      upgrades.grantRevive();
      upgrades.grantDoubleReward();
      upgrades.grantNegotiator();

      upgrades.consumeRevive();

      expect(upgrades.hasDoubleReward()).toBe(true);
      expect(upgrades.hasNegotiator()).toBe(true);
    });

    it('grantSecretSwapFinal makes hasSecretSwapFinal true', () => {
      const upgrades = new SessionUpgrades();
      upgrades.grantSecretSwapFinal();
      expect(upgrades.hasSecretSwapFinal()).toBe(true);
    });

    it('grantNegativeCardShield makes hasNegativeCardShield true', () => {
      const upgrades = new SessionUpgrades();
      upgrades.grantNegativeCardShield();
      expect(upgrades.hasNegativeCardShield()).toBe(true);
    });

    it('grantNegotiator makes hasNegotiator true', () => {
      const upgrades = new SessionUpgrades();
      upgrades.grantNegotiator();
      expect(upgrades.hasNegotiator()).toBe(true);
    });

    it('all six one-shot grants are independent from each other', () => {
      const upgrades = new SessionUpgrades();
      upgrades.grantDoubleReward();
      upgrades.grantNegotiator();

      expect(upgrades.hasDoubleReward()).toBe(true);
      expect(upgrades.hasNegotiator()).toBe(true);
      expect(upgrades.hasTripleReward()).toBe(false);
      expect(upgrades.hasRevive()).toBe(false);
      expect(upgrades.hasSecretSwapFinal()).toBe(false);
      expect(upgrades.hasNegativeCardShield()).toBe(false);
    });
  });
});
