/**
 * Catálogo de mejoras de PARTIDA ÚNICA (consumibles — ver SessionUpgrades).
 * Reemplaza al viejo UPGRADE_CATALOG persistente (energy_shield,
 * master_negotiator, reserve_tank): ahora TODAS las mejoras compradas en
 * la tienda tienen efecto inmediato en la partida en curso y se pierden
 * por completo al terminar esa partida, se hayan usado o no.
 */
export type SessionUpgradeId =
  | 'energy_tank_1'
  | 'energy_tank_2'
  | 'negative_card_shield'
  | 'negotiator'
  | 'double_reward'
  | 'triple_reward'
  | 'revive'
  | 'secret_swap_final';

export interface SessionUpgradeDefinition {
  readonly id: SessionUpgradeId;
  readonly name: string;
  readonly description: string;
  readonly cost: number;
  /**
   * Otros upgrades que NO pueden coexistir con este en la misma partida
   * (ej. "Duplicar" y "Triplicar" — dos multiplicadores de premio a la
   * vez no tiene sentido: solo uno se termina usando en ResultScene). Se
   * declara en AMBAS direcciones (double↔triple) a propósito: no se
   * infiere la relación inversa automáticamente, para que
   * PurchaseSessionUpgradeUseCase pueda chequear con una simple
   * búsqueda en el catálogo, sin necesitar un grafo bidireccional.
   */
  readonly conflictsWith?: readonly SessionUpgradeId[];
  /**
   * true cuando el EFECTO de esta mejora se entrega vía rewarded ad
   * (anuncio recompensado) y no de forma automática. Si el entorno no
   * puede mostrar anuncios, la mejora no debe ofrecerse: el jugador
   * estaría pagando por algo que no puede usar. Deja explícito que la
   * DISPONIBILIDAD de anuncios no es asunto del dominio — acá solo se
   * declara la necesidad; quién decide si el entorno puede mostrarlos es
   * la infraestructura/presentación.
   */
  readonly requiresRewardedAd?: boolean;
}

// Restricción de diseño explícita: el costo de "Triplicar" debe ser
// EXACTAMENTE el doble del costo de "Duplicar" — se deriva del mismo
// valor base en vez de hardcodearse por separado, para que la regla se
// cumpla estructuralmente y no pueda desincronizarse en un futuro cambio.
const DOUBLE_REWARD_COST = 3000;

export const SESSION_UPGRADE_CATALOG: readonly SessionUpgradeDefinition[] = [
  {
    id: 'energy_tank_1',
    name: 'UPGRADE_NAME_ENERGY_TANK_1',
    description: 'UPGRADE_DESC_ENERGY_TANK_1',
    cost: 500
  },
  {
    id: 'energy_tank_2',
    name: 'UPGRADE_NAME_ENERGY_TANK_2',
    description: 'UPGRADE_DESC_ENERGY_TANK_2',
    cost: 800
  },
  {
    id: 'negative_card_shield',
    name: 'UPGRADE_NAME_NEGATIVE_CARD_SHIELD',
    description: 'UPGRADE_DESC_NEGATIVE_CARD_SHIELD',
    cost: 750
  },
  {
    id: 'negotiator',
    name: 'UPGRADE_NAME_NEGOTIATOR',
    description: 'UPGRADE_DESC_NEGOTIATOR',
    cost: 1000
  },
  {
    id: 'double_reward',
    name: 'UPGRADE_NAME_DOUBLE_REWARD',
    description: 'UPGRADE_DESC_DOUBLE_REWARD',
    cost: DOUBLE_REWARD_COST,
    conflictsWith: ['triple_reward'],
    requiresRewardedAd: true
  },
  {
    id: 'triple_reward',
    name: 'UPGRADE_NAME_TRIPLE_REWARD',
    description: 'UPGRADE_DESC_TRIPLE_REWARD',
    cost: DOUBLE_REWARD_COST * 2,
    conflictsWith: ['double_reward'],
    requiresRewardedAd: true
  },
  {
    id: 'revive',
    name: 'UPGRADE_NAME_REVIVE',
    description: 'UPGRADE_DESC_REVIVE',
    cost: 1250,
    requiresRewardedAd: true
  },
  {
    id: 'secret_swap_final',
    name: 'UPGRADE_NAME_SECRET_SWAP_FINAL',
    description: 'UPGRADE_DESC_SECRET_SWAP_FINAL',
    cost: 1750
  }
] as const;

export function findSessionUpgradeDefinition(id: SessionUpgradeId): SessionUpgradeDefinition | undefined {
  return SESSION_UPGRADE_CATALOG.find(u => u.id === id);
}
