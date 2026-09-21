/**
 * Catalogo de mejoras como datos puros de dominio.
 * La infraestructura (LocalStorageProgressionRepository) solo persiste
 * que IDs fueron comprados — nunca decide QUE hace cada mejora.
 */
export type UpgradeEffectType = 'energyDrainMultiplier' | 'offerBonusPercentage' | 'startingEnergyBonus';

export interface UpgradeDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly cost: number;
  readonly effectType: UpgradeEffectType;
  readonly effectValue: number;
  readonly maxLevel: number;
}

export const UPGRADE_CATALOG: readonly UpgradeDefinition[] = [
  {
    id: 'energy_shield',
    name: 'Blindaje de Energia',
    description: 'Reduce el drenaje de energia al abrir cartas altas.',
    cost: 500,
    effectType: 'energyDrainMultiplier',
    effectValue: 0.85,
    maxLevel: 3
  },
  {
    id: 'master_negotiator',
    name: 'Negociador Maestro',
    description: 'El Banquero ofrece un porcentaje adicional sobre su calculo base.',
    cost: 750,
    effectType: 'offerBonusPercentage',
    effectValue: 0.05,
    maxLevel: 3
  },
  {
    id: 'reserve_tank',
    name: 'Tanque de Reserva',
    description: 'Comienza cada partida con energia extra.',
    cost: 400,
    effectType: 'startingEnergyBonus',
    effectValue: 10,
    maxLevel: 2
  }
] as const;

export function findUpgradeDefinition(id: string): UpgradeDefinition | undefined {
  return UPGRADE_CATALOG.find(u => u.id === id);
}
