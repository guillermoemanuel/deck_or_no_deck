import { SessionUpgrades, SessionUpgradeState } from './SessionUpgrades';
import { SessionUpgradeId } from '../value-objects/SessionUpgradeCatalog';

const ALL_UPGRADE_IDS: readonly SessionUpgradeId[] = [
  'energy_tank_1',
  'energy_tank_2',
  'negative_card_shield',
  'negotiator',
  'double_reward',
  'triple_reward',
  'revive',
  'secret_swap_final'
];

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

  describe('isOwned / canPurchase / getState', () => {
    it('reports every upgrade as not owned on an empty session', () => {
      const upgrades = new SessionUpgrades();

      for (const id of ALL_UPGRADE_IDS) {
        expect(upgrades.isOwned(id)).toBe(false);
      }
    });

    it('allows purchasing everything except energy_tank_2 on an empty session', () => {
      const upgrades = new SessionUpgrades();

      expect(upgrades.canPurchase('energy_tank_1')).toBe(true);
      expect(upgrades.canPurchase('energy_tank_2')).toBe(false); // prerequisito: nivel 1
      expect(upgrades.canPurchase('negative_card_shield')).toBe(true);
      expect(upgrades.canPurchase('negotiator')).toBe(true);
      expect(upgrades.canPurchase('double_reward')).toBe(true);
      expect(upgrades.canPurchase('triple_reward')).toBe(true);
      expect(upgrades.canPurchase('revive')).toBe(true);
      expect(upgrades.canPurchase('secret_swap_final')).toBe(true);
    });

    it('marks energy_tank_2 as locked and everything else available on an empty session', () => {
      const upgrades = new SessionUpgrades();

      expect(upgrades.getState('energy_tank_1')).toBe('available');
      expect(upgrades.getState('energy_tank_2')).toBe('locked');
      expect(upgrades.getState('negative_card_shield')).toBe('available');
      expect(upgrades.getState('negotiator')).toBe('available');
      expect(upgrades.getState('double_reward')).toBe('available');
      expect(upgrades.getState('triple_reward')).toBe('available');
      expect(upgrades.getState('revive')).toBe('available');
      expect(upgrades.getState('secret_swap_final')).toBe('available');
    });

    it('follows the energy tank level sequence (level 0 → tank_1 available, tank_2 locked)', () => {
      const upgrades = new SessionUpgrades();

      expect(upgrades.getState('energy_tank_1')).toBe('available');
      expect(upgrades.getState('energy_tank_2')).toBe('locked');
      expect(upgrades.canPurchase('energy_tank_1')).toBe(true);
      expect(upgrades.canPurchase('energy_tank_2')).toBe(false);
    });

    it('follows the energy tank level sequence (level 1 → tank_1 acquired, tank_2 available)', () => {
      const upgrades = new SessionUpgrades();
      upgrades.applyEnergyTankLevel(1);

      expect(upgrades.getState('energy_tank_1')).toBe('acquired');
      expect(upgrades.getState('energy_tank_2')).toBe('available');
      expect(upgrades.canPurchase('energy_tank_1')).toBe(false);
      expect(upgrades.canPurchase('energy_tank_2')).toBe(true);
    });

    it('follows the energy tank level sequence (level 2 → both acquired)', () => {
      const upgrades = new SessionUpgrades();
      upgrades.applyEnergyTankLevel(1);
      upgrades.applyEnergyTankLevel(2);

      expect(upgrades.getState('energy_tank_1')).toBe('acquired');
      expect(upgrades.getState('energy_tank_2')).toBe('acquired');
      expect(upgrades.canPurchase('energy_tank_1')).toBe(false);
      expect(upgrades.canPurchase('energy_tank_2')).toBe(false);
    });

    it('reports acquired + not purchasable after granting each one-shot upgrade', () => {
      const grants: Record<string, (u: SessionUpgrades) => void> = {
        negative_card_shield: u => u.grantNegativeCardShield(),
        negotiator: u => u.grantNegotiator(),
        double_reward: u => u.grantDoubleReward(),
        triple_reward: u => u.grantTripleReward(),
        revive: u => u.grantRevive(),
        secret_swap_final: u => u.grantSecretSwapFinal()
      };

      for (const [id, grant] of Object.entries(grants)) {
        const upgrades = new SessionUpgrades();
        grant(upgrades);

        expect(upgrades.isOwned(id as SessionUpgradeId)).toBe(true);
        expect(upgrades.getState(id as SessionUpgradeId)).toBe('acquired');
        expect(upgrades.canPurchase(id as SessionUpgradeId)).toBe(false);
      }
    });

    it('reports acquired + not purchasable for both tank levels once maxed out', () => {
      const upgrades = new SessionUpgrades();
      upgrades.applyEnergyTankLevel(1);
      upgrades.applyEnergyTankLevel(2);

      for (const id of ['energy_tank_1', 'energy_tank_2'] as const) {
        expect(upgrades.isOwned(id)).toBe(true);
        expect(upgrades.getState(id)).toBe('acquired');
        expect(upgrades.canPurchase(id)).toBe(false);
      }
    });

    it('keeps coherence: available ⟺ canPurchase, acquired ⟺ isOwned (empty session)', () => {
      const upgrades = new SessionUpgrades();

      for (const id of ALL_UPGRADE_IDS) {
        const state: SessionUpgradeState = upgrades.getState(id);
        expect(state === 'available').toBe(upgrades.canPurchase(id));
        expect(state === 'acquired').toBe(upgrades.isOwned(id));
      }
    });

    it('keeps coherence: available ⟺ canPurchase, acquired ⟺ isOwned (after acquiring some)', () => {
      const upgrades = new SessionUpgrades();
      upgrades.applyEnergyTankLevel(1);
      upgrades.grantNegotiator();
      upgrades.grantSecretSwapFinal();

      for (const id of ALL_UPGRADE_IDS) {
        const state: SessionUpgradeState = upgrades.getState(id);
        expect(state === 'available').toBe(upgrades.canPurchase(id));
        expect(state === 'acquired').toBe(upgrades.isOwned(id));
      }
    });
  });
});
