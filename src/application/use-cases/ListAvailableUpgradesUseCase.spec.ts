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

  // CG-PUB-003: 'ads_disabled' es el estado que reporta el adapter en
  // Basic Launch — las 3 filas dependientes de rewarded tienen que
  // desaparecer igual que con cualquier otro motivo no-disponible, o QA
  // rechaza botones de rewarded sin efecto.
  it('with rewardedAdStatus() "ads_disabled" the 3 rewarded rows disappear (5 left)', () => {
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setRewardedStatus('ads_disabled');
    const useCase = new ListAvailableUpgradesUseCase(crazyGamesService);

    const ids = idsOf(useCase.execute());

    expect(ids).toHaveLength(5);
    expect(ids).not.toContain('double_reward');
    expect(ids).not.toContain('triple_reward');
    expect(ids).not.toContain('revive');
  });

  // CG-MON-006 (auditoría de publicación 2026-10-04): el filtro ocultaba
  // Duplicar/Triplicar/Revivir SIN AVISO cuando el motivo era permanente
  // (adblock, ads_disabled) — el jugador veía 5 filas y no entendía por
  // qué faltaban 3. La política de "¿corresponde el aviso?" vive acá,
  // testeable; ShopScene solo lo dibuja (inline, no popup — popup queda
  // descartado por la auditoría).
  describe('adsNotice() — aviso inline de la tienda (CG-MON-006)', () => {
    it('con "adblock" corresponde: es permanente en la sesión', () => {
      const crazyGamesService = new FakeCrazyGamesService();
      crazyGamesService.setRewardedStatus('adblock');
      const useCase = new ListAvailableUpgradesUseCase(crazyGamesService);

      expect(useCase.adsNotice()).toBe('adblock');
    });

    it('con "ads_disabled" corresponde (Basic Launch, ADR-009)', () => {
      const crazyGamesService = new FakeCrazyGamesService();
      crazyGamesService.setRewardedStatus('ads_disabled');
      const useCase = new ListAvailableUpgradesUseCase(crazyGamesService);

      expect(useCase.adsNotice()).toBe('ads_disabled');
    });

    it('con "available" no corresponde: las 3 filas están a la vista', () => {
      const crazyGamesService = new FakeCrazyGamesService();
      const useCase = new ListAvailableUpgradesUseCase(crazyGamesService);

      expect(useCase.adsNotice()).toBeNull();
    });

    it('los cooldowns NO corresponden: son transitorios (60 s) y la fila vuelve sola', () => {
      const crazyGamesService = new FakeCrazyGamesService();
      const useCase = new ListAvailableUpgradesUseCase(crazyGamesService);

      for (const status of ['cooldown_retryable', 'cooldown_no_fill'] as const) {
        crazyGamesService.setRewardedStatus(status);
        expect(useCase.adsNotice()).toBeNull();
      }
    });

    it('"sdk_unavailable" NO corresponde: es ambiguo (modo none/dev, SDK sin cargar o CDN caído) — avisaría "desactivá tu adblocker" donde no lo hay', () => {
      const crazyGamesService = new FakeCrazyGamesService();
      crazyGamesService.setRewardedStatus('sdk_unavailable');
      const useCase = new ListAvailableUpgradesUseCase(crazyGamesService);

      expect(useCase.adsNotice()).toBeNull();
    });
  });
});
