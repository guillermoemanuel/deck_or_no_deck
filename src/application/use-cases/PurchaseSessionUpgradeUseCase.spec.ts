import { PurchaseSessionUpgradeUseCase } from './PurchaseSessionUpgradeUseCase';
import { GameSession, DefaultEnergyDrainRule, EnergyDrainRule } from '../../domain/entities/GameSession';
import { Banker } from '../../domain/services/Banker';
import { OfferCalculator } from '../../domain/services/OfferCalculator';
import { Card } from '../../domain/entities/Card';
import { GameEvent } from '../../domain/events/GameEvents';
import {
  costOf,
  SessionUpgradeId,
  SESSION_UPGRADE_CATALOG
} from '../../domain/value-objects/SessionUpgradeCatalog';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
import { ProgressionManager } from '../../infrastructure/persistence/ProgressionManager';
import { FakeProgressionRepository } from '../../infrastructure/persistence/testing/FakeProgressionRepository';
import { DeterministicRandomProvider } from '../../infrastructure/services/testing/DeterministicRandomProvider';
import { FakeCrazyGamesService } from '../../infrastructure/services/testing/FakeCrazyGamesService';
import { collectEvents } from './testing/collectEvents';

const STANDARD_VALUES = [1, 5, 10, 25, 50, 100, 250, 500, 750, 1000, 5000, 10000, 25000];

function buildSession(): GameSession {
  const boardCards = STANDARD_VALUES.slice(0, 12).map((v, i) => Card.create(`card_${i}`, v));
  const secretCard = Card.create('card_secret', STANDARD_VALUES[12], true);
  return new GameSession(boardCards, secretCard, new Banker(new OfferCalculator(() => 0.5)), new DefaultEnergyDrainRule());
}

class NoDrainRule implements EnergyDrainRule {
  drainFor(): number {
    return 0;
  }
}

/** Mismo helper que SwapFinalSecretCardUseCase.spec.ts — deja la sesión en la ÚLTIMA jugada (una única carta cerrada restante), sin el upgrade todavía. */
function buildSessionWithOneCardLeft(): GameSession {
  const boardCards = STANDARD_VALUES.slice(0, 12).map((v, i) => Card.create(`card_${i}`, v));
  const secretCard = Card.create('card_secret', STANDARD_VALUES[12], true);
  const session = new GameSession(boardCards, secretCard, new Banker(new OfferCalculator(() => 0.5)), new NoDrainRule());

  for (let i = 0; i < 11; i++) {
    session.openCard(`card_${i}`);
    if (session.getStatus() === 'awaiting_offer_response') {
      session.rejectDeal();
    }
  }
  return session;
}

/** `rewardedAdsAvailable = true` por defecto: mismo comportamiento que el fake hasta que el use-case creció con el puerto de ads. */
function buildContext(seedCoins = 100000, rewardedAdsAvailable = true) {
  const session = buildSession();
  const repository = new FakeProgressionRepository();
  repository.seedCoins(seedCoins);
  const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
  const eventBus = new SimpleEventEmitter<GameEvent>();
  const crazyGamesService = new FakeCrazyGamesService();
  crazyGamesService.setRewardedAvailable(rewardedAdsAvailable);
  const useCase = new PurchaseSessionUpgradeUseCase(session, progressionManager, eventBus, crazyGamesService);
  return { session, repository, progressionManager, eventBus, crazyGamesService, useCase };
}

// Los costos se leen de costOf() (fuente única en SessionUpgradeCatalog):
// este spec verifica que el use-case COBRE el costo publicado, no cuánto
// cuesta cada mejora — eso lo decide el catálogo (AGENTS.md §4).

describe('PurchaseSessionUpgradeUseCase', () => {
  it('returns unknown_upgrade for an invalid id', () => {
    const { useCase } = buildContext();
    // @ts-expect-error probando un id invalido a proposito
    const result = useCase.execute('does_not_exist');
    expect(result).toEqual({ success: false, reason: 'unknown_upgrade' });
  });

  it('fails with insufficient_coins and does NOT apply the effect', () => {
    const { session, useCase } = buildContext(0);

    const result = useCase.execute('energy_tank_1');

    expect(result).toEqual({ success: false, reason: 'insufficient_coins' });
    expect(session.getSessionUpgrades().getEnergyTankLevel()).toBe(0);
  });

  describe('energy_tank_1 / energy_tank_2', () => {
    it('applies level 1 immediately, charges its cost, and emits EnergyTankUpgraded', () => {
      const { session, repository, eventBus, useCase } = buildContext();
      const events = collectEvents(eventBus);

      const result = useCase.execute('energy_tank_1');

      expect(result).toEqual({ success: true });
      expect(session.getSessionUpgrades().getEnergyTankLevel()).toBe(1);
      expect(repository.getCoins()).toBe(100000 - costOf('energy_tank_1'));
      expect(events).toContainEqual(
        expect.objectContaining({ type: 'EnergyTankUpgraded', capacityMultiplier: 1.25 })
      );
    });

    it('rejects energy_tank_2 before energy_tank_1 (not_applicable, no charge)', () => {
      const { repository, useCase } = buildContext();

      const result = useCase.execute('energy_tank_2');

      expect(result).toEqual({ success: false, reason: 'not_applicable' });
      expect(repository.getCoins()).toBe(100000); // no se cobro nada
    });

    it('allows energy_tank_2 after energy_tank_1', () => {
      const { session, useCase } = buildContext();
      useCase.execute('energy_tank_1');

      const result = useCase.execute('energy_tank_2');

      expect(result).toEqual({ success: true });
      expect(session.getSessionUpgrades().getEnergyTankLevel()).toBe(2);
    });

    it('rejects buying energy_tank_1 twice', () => {
      const { useCase } = buildContext();
      useCase.execute('energy_tank_1');

      const result = useCase.execute('energy_tank_1');

      expect(result).toEqual({ success: false, reason: 'not_applicable' });
    });
  });

  describe('double_reward / triple_reward', () => {
    it('triple_reward costs exactly double double_reward (design rule)', () => {
      // Verificado contra el catalogo real, no un valor hardcodeado aparte.
      const { repository, useCase: useCaseA } = buildContext();
      useCaseA.execute('double_reward');
      const coinsAfterDouble = 100000 - repository.getCoins();

      const { repository: repoB, useCase: useCaseB } = buildContext();
      useCaseB.execute('triple_reward');
      const coinsAfterTriple = 100000 - repoB.getCoins();

      expect(coinsAfterTriple).toBe(coinsAfterDouble * 2);
    });

    // Superado por el describe "mutual exclusion (conflictsWith)" más abajo:
    // ya NO pueden coexistir en la misma partida — solo un multiplicador de
    // premio por partida (ver SessionUpgradeCatalog.conflictsWith).

    it('rejects buying the same one-shot upgrade twice', () => {
      const { useCase } = buildContext();
      useCase.execute('double_reward');
      const second = useCase.execute('double_reward');

      expect(second).toEqual({ success: false, reason: 'not_applicable' });
    });
  });

  describe('revive', () => {
    it('grants the revive flag on the session', () => {
      const { session, useCase } = buildContext();
      useCase.execute('revive');
      expect(session.getSessionUpgrades().hasRevive()).toBe(true);
    });
  });

  describe('secret_swap_final', () => {
    it('grants the flag without requiring any particular board state', () => {
      const { session, useCase } = buildContext();
      const result = useCase.execute('secret_swap_final');

      expect(result).toEqual({ success: true });
      expect(session.getSessionUpgrades().hasSecretSwapFinal()).toBe(true);
    });

    it('does NOT emit FinalCardSwapAvailable when the board is not on its last card', () => {
      const { eventBus, useCase } = buildContext();
      const events = collectEvents(eventBus);

      useCase.execute('secret_swap_final');

      expect(events).toHaveLength(0);
    });

    // BUGFIX reportado: comprar este upgrade estando YA en la última
    // jugada (una única carta cerrada restante) no ofrecía la opción de
    // intercambio hasta la partida siguiente, porque esa disponibilidad
    // normalmente se anuncia una única vez, al abrir la anteúltima carta
    // (ver OpenCardUseCase.execute()) — momento que para esta compra ya
    // pasó. Ver PurchaseSessionUpgradeUseCase.applyEffect().
    it('emits FinalCardSwapAvailable immediately when purchased with exactly 1 closed card left', () => {
      const session = buildSessionWithOneCardLeft();
      const repository = new FakeProgressionRepository();
      repository.seedCoins(100000);
      const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
      const eventBus = new SimpleEventEmitter<GameEvent>();
      const events = collectEvents(eventBus);
      const useCase = new PurchaseSessionUpgradeUseCase(session, progressionManager, eventBus, new FakeCrazyGamesService());

      const result = useCase.execute('secret_swap_final');

      expect(result).toEqual({ success: true });
      expect(events).toContainEqual({ type: 'FinalCardSwapAvailable' });
    });
  });

  describe('negative_card_shield', () => {
    it('grants the flag and charges its cost', () => {
      const { session, repository, useCase } = buildContext();

      const result = useCase.execute('negative_card_shield');

      expect(result).toEqual({ success: true });
      expect(session.getSessionUpgrades().hasNegativeCardShield()).toBe(true);
      expect(repository.getCoins()).toBe(100000 - costOf('negative_card_shield'));
    });

    it('rejects buying it twice', () => {
      const { useCase } = buildContext();
      useCase.execute('negative_card_shield');

      const second = useCase.execute('negative_card_shield');

      expect(second).toEqual({ success: false, reason: 'not_applicable' });
    });
  });

  describe('negotiator', () => {
    it('grants the flag and charges its cost', () => {
      const { session, repository, useCase } = buildContext();

      const result = useCase.execute('negotiator');

      expect(result).toEqual({ success: true });
      expect(session.getSessionUpgrades().hasNegotiator()).toBe(true);
      expect(repository.getCoins()).toBe(100000 - costOf('negotiator'));
    });

    it('coexists with negative_card_shield in the same session', () => {
      const { session, useCase } = buildContext();
      useCase.execute('negotiator');
      useCase.execute('negative_card_shield');

      expect(session.getSessionUpgrades().hasNegotiator()).toBe(true);
      expect(session.getSessionUpgrades().hasNegativeCardShield()).toBe(true);
    });

    it('rejects buying it twice', () => {
      const { useCase } = buildContext();
      useCase.execute('negotiator');

      const second = useCase.execute('negotiator');

      expect(second).toEqual({ success: false, reason: 'not_applicable' });
    });
  });

  describe('double_reward / triple_reward mutual exclusion (conflictsWith)', () => {
    it('blocks buying triple_reward when double_reward is already owned, without charging', () => {
      const { session, repository, useCase } = buildContext();
      useCase.execute('double_reward');
      const coinsAfterDouble = repository.getCoins();

      const result = useCase.execute('triple_reward');

      expect(result).toEqual({ success: false, reason: 'conflicting_upgrade', conflictsWith: 'double_reward' });
      expect(session.getSessionUpgrades().hasTripleReward()).toBe(false);
      expect(repository.getCoins()).toBe(coinsAfterDouble);
    });

    it('blocks buying double_reward when triple_reward is already owned, without charging', () => {
      const { session, repository, useCase } = buildContext();
      useCase.execute('triple_reward');
      const coinsAfterTriple = repository.getCoins();

      const result = useCase.execute('double_reward');

      expect(result).toEqual({ success: false, reason: 'conflicting_upgrade', conflictsWith: 'triple_reward' });
      expect(session.getSessionUpgrades().hasDoubleReward()).toBe(false);
      expect(repository.getCoins()).toBe(coinsAfterTriple);
    });

    it('still allows buying either one on its own', () => {
      const { session, useCase } = buildContext();

      expect(useCase.execute('double_reward')).toEqual({ success: true });
      expect(session.getSessionUpgrades().hasDoubleReward()).toBe(true);
    });

    it('the conflict check runs before the already-owned check (repeat purchase still reports conflicting_upgrade, not not_applicable)', () => {
      const { useCase } = buildContext();
      useCase.execute('double_reward');
      useCase.execute('double_reward'); // ya sería not_applicable por sí solo

      const result = useCase.execute('triple_reward');

      expect(result).toEqual({ success: false, reason: 'conflicting_upgrade', conflictsWith: 'double_reward' });
    });

    it('other upgrades without conflictsWith are unaffected', () => {
      const { session, useCase } = buildContext();
      useCase.execute('double_reward');

      expect(useCase.execute('negotiator')).toEqual({ success: true });
      expect(session.getSessionUpgrades().hasNegotiator()).toBe(true);
    });
  });

  describe('requiresRewardedAd gate (ads_unavailable)', () => {
    it('rejects double_reward when rewarded ads are NOT available, without charging nor granting', () => {
      const { session, repository, useCase } = buildContext(100000, false);

      const result = useCase.execute('double_reward');

      expect(result).toEqual({ success: false, reason: 'ads_unavailable' });
      expect(repository.getCoins()).toBe(100000); // no se cobro nada
      expect(session.getSessionUpgrades().isOwned('double_reward')).toBe(false);
    });

    it('still charges negotiator with ads unavailable (the filter uses requiresRewardedAd from the catalog, not what the shop displays)', () => {
      const { session, repository, useCase } = buildContext(100000, false);

      const result = useCase.execute('negotiator');

      expect(result).toEqual({ success: true });
      expect(session.getSessionUpgrades().isOwned('negotiator')).toBe(true);
      expect(repository.getCoins()).toBe(100000 - costOf('negotiator'));
    });

    it('conflicting_upgrade still wins over ads_unavailable (the precedence of the existing checks does not change)', () => {
      const { repository, crazyGamesService, useCase } = buildContext();
      useCase.execute('double_reward');
      const coinsAfterDouble = repository.getCoins();
      // Los ads se cortan DESPUÉS de que la fila era visible (cooldown,
      // adblock, SDK ausente): el chequeo de conflicto va primero igual.
      crazyGamesService.setRewardedAvailable(false);

      const result = useCase.execute('triple_reward');

      expect(result).toEqual({ success: false, reason: 'conflicting_upgrade', conflictsWith: 'double_reward' });
      expect(repository.getCoins()).toBe(coinsAfterDouble);
    });

    // Nota: el test anterior que afirmaba not_applicable > ads_unavailable con
    // energy_tank_2 fue ELIMINADO por redundante — energy_tank_2 no tiene
    // requiresRewardedAd en el catálogo, así que el gate de ads jamás podría
    // devolver ads_unavailable para ese id y el test pasaría aunque la
    // precedencia estuviera mal ubicada. La precedencia real queda cubierta por
    // el de revive (abajo), cuyo id SÍ requiere ads.

    it('not_applicable also wins for an upgrade THAT requires ads (repeat revive with ads cut off)', () => {
      const { repository, crazyGamesService, useCase } = buildContext();
      useCase.execute('revive');
      const coinsAfterRevive = repository.getCoins();
      crazyGamesService.setRewardedAvailable(false);

      const result = useCase.execute('revive');

      expect(result).toEqual({ success: false, reason: 'not_applicable' });
      expect(repository.getCoins()).toBe(coinsAfterRevive);
    });

    it('ads_unavailable wins over insufficient_coins (low balance and ads cut off)', () => {
      // Saldo deliberadamente menor al costo: si alguien invirtiera el orden
      // (spendCoins antes del gate de ads), el jugador con poco saldo vería
      // 'insufficient_coins' en vez del motivo real — la fila quedó visible
      // pero hoy no se puede mostrar el anuncio.
      const seedCoins = costOf('double_reward') - 1;
      const { session, repository, useCase } = buildContext(seedCoins, false);

      const result = useCase.execute('double_reward');

      expect(result).toEqual({ success: false, reason: 'ads_unavailable' });
      expect(repository.getCoins()).toBe(seedCoins); // no se cobro nada
      expect(session.getSessionUpgrades().isOwned('double_reward')).toBe(false);
    });

    it('with ads available double_reward is purchased normally (parity with current behavior)', () => {
      const { session, repository, useCase } = buildContext();

      const result = useCase.execute('double_reward');

      expect(result).toEqual({ success: true });
      expect(session.getSessionUpgrades().isOwned('double_reward')).toBe(true);
      expect(repository.getCoins()).toBe(100000 - costOf('double_reward'));
    });
  });

  // Límite aceptado #2 de docs/testing.md: el switch de applyEffect
  // devuelve `void`, así que TypeScript NO exige que cubra todos los
  // SessionUpgradeId — un id NUEVO en el catálogo compilaría, pasaría por
  // spendCoins y NO aplicaría ningún efecto. Este spec recorre
  // SESSION_UPGRADE_CATALOG (ids leídos del catálogo, nada hardcodeado) y
  // afirma que cada compra deja un rastro observable en el estado REAL de
  // la partida: si mañana aparece un 9º id sin rama en applyEffect, acá
  // falla.
  describe('applyEffect cubre todo el catálogo', () => {
    const catalogIds = SESSION_UPGRADE_CATALOG.map(definition => definition.id);

    /** Los dos ids cuyo efecto NO es un flag sino subir la capacidad del tanque. */
    const ENERGY_TANK_IDS: readonly SessionUpgradeId[] = ['energy_tank_1', 'energy_tank_2'];

    /**
     * Techo de la barra de energía: GameSession no lo expone directamente,
     * se deriva de los dos observables reales (valor crudo y porcentaje
     * sobre la base, que ES el techo — ver EnergyLevel.toPercentageOfBase).
     * No se hardcodea 125/150: si cambian los multiplicadores del tanque,
     * esta derivación sigue leyendo el estado post-compra.
     */
    function energyCeilingOf(session: GameSession): number {
      return session.getEnergyRaw() / (session.getEnergyPercentage() / 100);
    }

    it.each(catalogIds)('%s: the purchase leaves its effect applied on the session', id => {
      const { session, useCase } = buildContext();

      // Prerequisito de secuencia: energy_tank_2 solo es comprable desde el
      // nivel 1 (SessionUpgrades.canPurchase). Se resuelve de forma genérica
      // — si el id NO es comprable en una sesión fresca, antes se compra el
      // nivel anterior — en vez de ramificar por id. De paso cubre el caso
      // "comprar el segundo nivel del tanque después del primero".
      if (!session.getSessionUpgrades().canPurchase(id)) {
        expect(useCase.execute('energy_tank_1')).toEqual({ success: true });
      }

      const tankLevelBefore = session.getSessionUpgrades().getEnergyTankLevel();
      const ceilingBefore = energyCeilingOf(session);

      const result = useCase.execute(id);

      expect(result).toEqual({ success: true });
      // Efecto observable para TODOS los ids: la mejora queda adquirida
      // (SessionUpgrades.isOwned es la única fuente de "¿ya lo tengo?").
      expect(session.getSessionUpgrades().isOwned(id)).toBe(true);

      if (ENERGY_TANK_IDS.includes(id)) {
        // El efecto de los tanques no es un flag: es subir el TECHO de la
        // barra (EnergyLevel.withNewCeiling) y avanzar el nivel real.
        expect(session.getSessionUpgrades().getEnergyTankLevel()).toBeGreaterThan(tankLevelBefore);
        expect(energyCeilingOf(session)).toBeGreaterThan(ceilingBefore);
      }
    });
  });
});
