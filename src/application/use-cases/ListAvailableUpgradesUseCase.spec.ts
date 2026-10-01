import { ListAvailableUpgradesUseCase } from './ListAvailableUpgradesUseCase';
import {
  SESSION_UPGRADE_CATALOG,
  SessionUpgradeId
} from '../../domain/value-objects/SessionUpgradeCatalog';
import { FakeCrazyGamesService } from '../../infrastructure/services/testing/FakeCrazyGamesService';

function idsOf(result: readonly { readonly id: SessionUpgradeId }[]): SessionUpgradeId[] {
  return result.map(u => u.id);
}

describe('ListAvailableUpgradesUseCase', () => {
  it('with rewarded ads available it returns the 8 catalog ids, in the same order', () => {
    const crazyGamesService = new FakeCrazyGamesService();
    const useCase = new ListAvailableUpgradesUseCase(crazyGamesService);

    const result = useCase.execute();

    expect(result).toHaveLength(8);
    expect(idsOf(result)).toEqual(SESSION_UPGRADE_CATALOG.map(u => u.id));
  });

  it('with rewarded ads NOT available it returns exactly 5, without double_reward, triple_reward nor revive', () => {
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setRewardedAvailable(false);
    const useCase = new ListAvailableUpgradesUseCase(crazyGamesService);

    const ids = idsOf(useCase.execute());

    expect(ids).toHaveLength(5);
    expect(ids).not.toContain('double_reward');
    expect(ids).not.toContain('triple_reward');
    expect(ids).not.toContain('revive');
  });

  it('returns exactly the filtered SESSION_UPGRADE_CATALOG: same objects and same order, without cloning', () => {
    const crazyGamesService = new FakeCrazyGamesService();
    const useCase = new ListAvailableUpgradesUseCase(crazyGamesService);

    // Contrato de la lógica que hoy vive en ShopScene: la salida es EL
    // catálogo filtrado (mismas referencias, mismo orden), no una copia ni
    // una lista rearmada. El predicado se replica tal cual para que el test
    // falle si el use-case empieza a reordenar o a clonar elementos.
    const rewardedAdsUsable = true;
    const withAds = useCase.execute();
    expect(withAds).toEqual(SESSION_UPGRADE_CATALOG.filter(u => rewardedAdsUsable || !u.requiresRewardedAd));
    withAds.forEach((definition, index) => {
      expect(definition).toBe(SESSION_UPGRADE_CATALOG[index]);
    });

    const rewardedAdsUnusable = false;
    crazyGamesService.setRewardedAvailable(rewardedAdsUnusable);
    const withoutAds = useCase.execute();
    expect(withoutAds).toEqual(
      SESSION_UPGRADE_CATALOG.filter(u => rewardedAdsUnusable || !u.requiresRewardedAd)
    );
    expect(withoutAds.length).toBeGreaterThan(0);
    withoutAds.forEach(definition => {
      expect(SESSION_UPGRADE_CATALOG).toContain(definition);
    });
  });

  it('same use-case instance: when availability comes back, all 8 upgrades reappear on their own', () => {
    const crazyGamesService = new FakeCrazyGamesService();
    const useCase = new ListAvailableUpgradesUseCase(crazyGamesService);

    crazyGamesService.setRewardedAvailable(false);
    expect(useCase.execute()).toHaveLength(5);

    crazyGamesService.setRewardedAvailable(true);
    expect(idsOf(useCase.execute())).toEqual(SESSION_UPGRADE_CATALOG.map(u => u.id));
    expect(useCase.execute()).toHaveLength(8);
  });
});
