import { GameSession } from '../../domain/entities/GameSession';
import { IProgressionService } from '../../domain/ports/IProgressionService';
import { ICrazyGamesService } from '../../domain/ports/ICrazyGamesService';
import { GameEvent } from '../../domain/events/GameEvents';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
import { SessionUpgradeId, findSessionUpgradeDefinition } from '../../domain/value-objects/SessionUpgradeCatalog';

export type PurchaseSessionUpgradeResult =
  | { success: true }
  | { success: false; reason: 'insufficient_coins' | 'unknown_upgrade' | 'not_applicable' }
  // Motivo específico para Duplicar/Triplicar (ver SessionUpgradeCatalog.
  // conflictsWith): distinto de 'not_applicable' a propósito, para que la
  // UI pueda mostrar un mensaje claro ("Ya tenés X activo") en vez del
  // genérico "no se puede comprar" — `conflictsWith` trae el id del
  // upgrade que ya tiene, para armar ese mensaje.
  | { success: false; reason: 'conflicting_upgrade'; conflictsWith: SessionUpgradeId }
  // Motivo propio (tampoco 'not_applicable') para mejoras con
  // requiresRewardedAd cuando hoy no se puede mostrar un anuncio: la
  // mejora ES válida en el estado de la partida (no es un problema del
  // tablero ni de la economía) — lo que falla es que el ENTORNO pueda
  // entregar su efecto (cooldown tras un rewarded fallido, adblock, SDK
  // ausente). 'not_applicable' diría "esto no se puede comprar acá",
  // que es mentira: se puede, sólo que hoy no hay anuncio. Con un
  // motivo aparte la UI distingue "mirá después" de "ya la tenés" o
  // "no te alcanza la plata".
  | { success: false; reason: 'ads_unavailable' };

/**
 * Orquesta la compra de un upgrade DE PARTIDA (consumible — ver
 * SessionUpgrades): cobra del acumulado global PERSISTENTE
 * (IProgressionService, vía ProgressionManager) y aplica el efecto
 * INMEDIATO sobre la GameSession en curso. Si el upgrade no es aplicable
 * en el estado actual de la partida (ej. ya comprado, o nivel de tanque
 * fuera de secuencia), no se cobra nada — el dinero nunca se descuenta
 * sin que el efecto se aplique.
 *
 * Además del estado de la partida, depende del puerto de ANUNCIOS
 * (`ICrazyGamesService`): las mejoras con `requiresRewardedAd` entregan
 * su efecto vía rewarded ad, así que si hoy no se puede mostrar uno, el
 * efecto NO se podría aplicar y cobrar violaría el contrato de arriba.
 * Mismo criterio y misma fuente (`SessionUpgradeDefinition.
 * requiresRewardedAd`) que ListAvailableUpgradesUseCase usa para decidir
 * qué muestra la tienda — acá es la contraparte que rechaza la compra si
 * la fila quedó visible y los ads se cortaron después.
 */
export class PurchaseSessionUpgradeUseCase {
  constructor(
    private readonly session: GameSession,
    private readonly progressionService: IProgressionService,
    private readonly eventBus: SimpleEventEmitter<GameEvent>,
    private readonly crazyGamesService: ICrazyGamesService
  ) {}

  execute(upgradeId: SessionUpgradeId): PurchaseSessionUpgradeResult {
    const definition = findSessionUpgradeDefinition(upgradeId);
    if (!definition) {
      return { success: false, reason: 'unknown_upgrade' };
    }

    // Se chequea ANTES que isApplicable(): comprar Triplicar ya teniendo
    // Duplicar (o viceversa) es un caso más específico que el genérico
    // "no aplicable" — amerita su propio motivo de error (ver el
    // comentario en PurchaseSessionUpgradeResult).
    const conflict = this.findOwnedConflict(definition.conflictsWith);
    if (conflict) {
      return { success: false, reason: 'conflicting_upgrade', conflictsWith: conflict };
    }

    if (!this.isApplicable(upgradeId)) {
      return { success: false, reason: 'not_applicable' };
    }

    // Causa raíz: la fila de la tienda pudo quedar visible con ads
    // disponibles y DESPUÉS cortarse — cooldown tras un rewarded fallido,
    // adblock, SDK ausente o Basic Launch con ads deshabilitados. Si el
    // jugador pagara acá, monedas por un efecto que el entorno no puede
    // entregar, se violaría el contrato del use-case ("el dinero nunca
    // se descuenta sin que el efecto se aplique"), así que se rechaza
    // ANTES de spendCoins. El filtro lee requiresRewardedAd del catálogo
    // (misma fuente que ListAvailableUpgradesUseCase), no una lista de
    // ids propia. Va después de not_applicable: si la compra ya no era
    // válida por el estado de la partida, ese es el motivo real.
    if (definition.requiresRewardedAd && !this.crazyGamesService.isRewardedAdAvailable()) {
      return { success: false, reason: 'ads_unavailable' };
    }

    if (!this.progressionService.spendCoins(definition.cost)) {
      return { success: false, reason: 'insufficient_coins' };
    }

    this.applyEffect(upgradeId);
    return { success: true };
  }

  /** Primer upgrade de `candidates` que el jugador YA tiene en esta partida, o `null` si ninguno. */
  private findOwnedConflict(candidates: readonly SessionUpgradeId[] | undefined): SessionUpgradeId | null {
    if (!candidates || candidates.length === 0) {
      return null;
    }
    const upgrades = this.session.getSessionUpgrades();
    // Delegado en SessionUpgrades.isOwned: única fuente de verdad de
    // "¿ya lo tengo?" (compartida con getState, que consume la UI).
    return candidates.find(id => upgrades.isOwned(id)) ?? null;
  }

  /** Delegado en SessionUpgrades.canPurchase: falso si ya se tiene o si no se cumple el prerequisito (tanques de energía). */
  private isApplicable(upgradeId: SessionUpgradeId): boolean {
    return this.session.getSessionUpgrades().canPurchase(upgradeId);
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