import {
  SESSION_UPGRADE_CATALOG,
  SessionUpgradeId,
  findSessionUpgradeDefinition
} from './SessionUpgradeCatalog';

describe('SessionUpgradeCatalog', () => {
  // El efecto de estas mejoras se entrega via rewarded ad: si el entorno no
  // puede mostrar anuncios, no deben ofrecerse (el jugador pagaria por algo
  // que no puede usar). El catalogo declara la NECESIDAD, no la disponibilidad.
  it('declara requiresRewardedAd exactamente en double_reward, triple_reward y revive', () => {
    const rewardedIds = SESSION_UPGRADE_CATALOG
      .filter(u => u.requiresRewardedAd === true)
      .map(u => u.id)
      .sort();

    expect(rewardedIds).toEqual(['double_reward', 'revive', 'triple_reward']);
  });

  it('todas las entradas tienen claves i18n de nombre y descripción, y costo positivo', () => {
    for (const upgrade of SESSION_UPGRADE_CATALOG) {
      expect(typeof upgrade.id).toBe('string');
      expect(upgrade.name.length).toBeGreaterThan(0);
      expect(upgrade.description.length).toBeGreaterThan(0);
      expect(upgrade.cost).toBeGreaterThan(0);
    }
  });

  it('mantiene la regla de costos: triple cuesta exactamente el doble que double', () => {
    // Sin precios hardcodeados: ambos se derivan del catálogo real.
    const doubleCost = findSessionUpgradeDefinition('double_reward')?.cost;
    const tripleCost = findSessionUpgradeDefinition('triple_reward')?.cost;

    expect(doubleCost).toBeDefined();

    // Guard de tipos sin cast `as` (los casts están reservados para la
    // frontera Phaser/SDK): descarta undefined antes de hacer aritmética.
    if (doubleCost === undefined || tripleCost === undefined) {
      throw new Error('Los costos de double_reward y triple_reward deben existir en el catálogo');
    }

    expect(tripleCost).toBe(doubleCost * 2);
  });

  it('cada id del catálogo se puede resolver con findSessionUpgradeDefinition', () => {
    for (const upgrade of SESSION_UPGRADE_CATALOG) {
      expect(findSessionUpgradeDefinition(upgrade.id)).toBe(upgrade);
    }
  });

  it('los ids del catálogo coinciden con el tipo SessionUpgradeId', () => {
    const ids: readonly SessionUpgradeId[] = SESSION_UPGRADE_CATALOG.map(u => u.id);
    expect(new Set(ids).size).toBe(SESSION_UPGRADE_CATALOG.length);
  });
});
