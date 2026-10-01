import { ReviveWithAdUseCase } from './ReviveWithAdUseCase';
import { GameSession, DefaultEnergyDrainRule, EnergyDrainRule } from '../../domain/entities/GameSession';
import { Banker } from '../../domain/services/Banker';
import { OfferCalculator } from '../../domain/services/OfferCalculator';
import { Card } from '../../domain/entities/Card';
import { GameEvent } from '../../domain/events/GameEvents';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
import { costOf } from '../../domain/value-objects/SessionUpgradeCatalog';
import { ProgressionManager } from '../../infrastructure/persistence/ProgressionManager';
import { FakeProgressionRepository } from '../../infrastructure/persistence/testing/FakeProgressionRepository';
import { DeterministicRandomProvider } from '../../infrastructure/services/testing/DeterministicRandomProvider';
import { FakeCrazyGamesService } from '../../infrastructure/services/testing/FakeCrazyGamesService';
import { collectEvents } from './testing/collectEvents';

const STANDARD_VALUES = [1, 5, 10, 25, 50, 100, 250, 500, 750, 1000, 5000, 10000, 25000];

class FixedDrainRule implements EnergyDrainRule {
  drainFor(cardValue: number): number {
    return cardValue;
  }
}

// BUGFIX (revive infinito): ReviveWithAdUseCase ahora exige `hasRevive()`
// además de `status === 'lost'` (ver el comentario en execute()), así que
// toda sesión de prueba que deba llegar hasta el anuncio necesita el
// upgrade concedido — de lo contrario CUALQUIER test de este archivo que
// antes pasaba de largo el chequeo de elegibilidad ahora cortaría antes de
// tiempo con 'not_eligible'. `grantRevive: boolean` por defecto en `true`
// para no repetir `session.getSessionUpgrades().grantRevive()` en cada test;
// el único caso que lo pasa en `false` es el que prueba el fix en sí.
function buildLostSession(grantRevive = true): GameSession {
  const values = [100, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  const boardCards = values.slice(0, 12).map((v, i) => Card.create(`card_${i}`, v));
  const secretCard = Card.create('card_secret', values[12], true);
  const session = new GameSession(boardCards, secretCard, new Banker(new OfferCalculator()), new FixedDrainRule());
  if (grantRevive) {
    session.getSessionUpgrades().grantRevive();
  }
  session.openCard('card_0');
  return session;
}

function buildPlayingSession(): GameSession {
  const boardCards = STANDARD_VALUES.slice(0, 12).map((v, i) => Card.create(`card_${i}`, v));
  const secretCard = Card.create('card_secret', STANDARD_VALUES[12], true);
  return new GameSession(
    boardCards,
    secretCard,
    new Banker(new OfferCalculator()),
    new DefaultEnergyDrainRule()
  );
}

/** Progresión de prueba con saldo sembrado — para asertar el reembolso del costo de "Revivir". */
function buildProgression(seedCoins: number) {
  const repository = new FakeProgressionRepository();
  repository.seedCoins(seedCoins);
  const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
  return { repository, progressionManager };
}

describe('ReviveWithAdUseCase', () => {
  it('returns { revived: false, reason: "not_eligible" } if the game is not currently lost', async () => {
    const session = buildPlayingSession();
    const crazyGamesService = new FakeCrazyGamesService();
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus);

    const result = await useCase.execute();

    expect(result).toEqual({ revived: false, reason: 'not_eligible' });
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
  });

  // BUGFIX (revive infinito): este es el test que habría atrapado el bug
  // reportado — antes del fix, execute() nunca miraba hasRevive() y este
  // caso (perdido, pero SIN el upgrade comprado) igual mostraba el
  // anuncio y revivía gratis.
  it('returns { revived: false, reason: "not_eligible" } if the game is lost but "revive" was never purchased', async () => {
    const session = buildLostSession(/* grantRevive */ false);
    const crazyGamesService = new FakeCrazyGamesService();
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus);

    const result = await useCase.execute();

    expect(result).toEqual({ revived: false, reason: 'not_eligible' });
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
    expect(session.getStatus()).toBe('lost');
  });

  // Esta construcción NO pasa progressionService (parámetro opcional): sin
  // puerto de progresión no hay forma de acreditar el reembolso, así que
  // el use-case devuelve el motivo REAL (SDK ausente) en vez de un
  // 'refunded' que no cumpliría — el jugador queda como hoy, reintentable.
  it('returns { revived: false, reason: "sdk_unavailable" } if the SDK is not available and no progression service was injected', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setAvailable(false);
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus);

    const result = await useCase.execute();

    expect(result).toEqual({ revived: false, reason: 'sdk_unavailable' });
  });

  // Decisión de producto: reembolso por FALLO AMBIENTAL (TOCTOU
  // compra→consumo de docs/testing.md). La tienda ya cobró "Revivir" y el
  // SDK de CrazyGames no está al consumirla: sin reembolso el jugador se
  // iba de la pantalla con las monedas perdidas y sin revivir.
  it('refunds costOf("revive") exactly once when the SDK is not available ("refunded")', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setAvailable(false);
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const { repository, progressionManager } = buildProgression(10000);
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus, progressionManager);

    // Simula la compra previa en la Tienda: el monto sale del catálogo,
    // nunca hardcodeado.
    const balanceBeforePurchase = repository.getCoins();
    expect(progressionManager.spendCoins(costOf('revive'))).toBe(true);

    const result = await useCase.execute();

    expect(result).toEqual({ revived: false, reason: 'refunded' });
    // El saldo vuelve EXACTAMENTE al anterior a la compra: ni un moneda de más.
    expect(repository.getCoins()).toBe(balanceBeforePurchase);
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
    expect(session.getStatus()).toBe('lost');
    expect(session.getSessionUpgrades().hasRevive()).toBe(true);
  });

  // Invariante reembolso XOR efecto: tras cobrar devuelta, el revive queda
  // bloqueado para SIEMPRE — si el efecto pudiera otorgarse igual, sería
  // explotable (fallar a propósito, cobrar devuelta y revivir cuando vuelva
  // el anuncio).
  it('blocks the revive after a refund: with the SDK back it returns "refunded", never revives and pays nothing again', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setAvailable(false);
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const { repository, progressionManager } = buildProgression(10000);
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus, progressionManager);

    progressionManager.spendCoins(costOf('revive'));
    const firstAttempt = await useCase.execute();
    expect(firstAttempt).toEqual({ revived: false, reason: 'refunded' });
    const balanceAfterRefund = repository.getCoins();

    // El SDK vuelve: el revive NO se otorga y el monto no se acredita dos veces.
    crazyGamesService.setAvailable(true);
    const secondAttempt = await useCase.execute();

    expect(secondAttempt).toEqual({ revived: false, reason: 'refunded' });
    expect(repository.getCoins()).toBe(balanceAfterRefund);
    expect(session.getStatus()).toBe('lost');
    expect(session.getSessionUpgrades().hasRevive()).toBe(true);
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
  });

  it('returns "ad_failed" WITHOUT refunding and still allows the retry', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setNextAdResult({ success: false, reason: 'user_cancelled' });
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const { repository, progressionManager } = buildProgression(10000);
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus, progressionManager);

    // El jugador canceló o no completó el anuncio: es SU elección, no un
    // fallo ambiental — no se reembolsa y la compra sigue reintentable.
    progressionManager.spendCoins(costOf('revive'));
    const balanceAfterPurchase = repository.getCoins();

    const failedAttempt = await useCase.execute();

    expect(failedAttempt).toEqual({ revived: false, reason: 'ad_failed' });
    expect(repository.getCoins()).toBe(balanceAfterPurchase);
    expect(session.getStatus()).toBe('lost');
    expect(session.getSessionUpgrades().hasRevive()).toBe(true);

    crazyGamesService.setNextAdResult({ success: true });
    const retryAttempt = await useCase.execute();

    expect(retryAttempt).toEqual({ revived: true });
    expect(session.getStatus()).toBe('playing');
    expect(session.getSessionUpgrades().hasRevive()).toBe(false);
    expect(repository.getCoins()).toBe(balanceAfterPurchase);
  });

  it('does NOT refund when "revive" was never purchased (not_eligible wins over the refund)', async () => {
    const session = buildLostSession(/* grantRevive */ false);
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setAvailable(false);
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const { repository, progressionManager } = buildProgression(10000);
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus, progressionManager);

    const result = await useCase.execute();

    expect(result).toEqual({ revived: false, reason: 'not_eligible' });
    expect(repository.getCoins()).toBe(10000);
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
  });

  it('returns { revived: false, reason: "ad_failed" } and does NOT revive when the ad fails', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setNextAdResult({ success: false, reason: 'user_cancelled' });
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus);

    const result = await useCase.execute();

    expect(result).toEqual({ revived: false, reason: 'ad_failed' });
    expect(session.getStatus()).toBe('lost');
  });

  it('revives the session and emits GameRevived with the real post-revive energy percentage', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const events = collectEvents(eventBus);
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus);

    const result = await useCase.execute();

    expect(result).toEqual({ revived: true });
    expect(session.getStatus()).toBe('playing');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('GameRevived');
    // BUGFIX (nivel de energía): el evento debe reflejar el porcentaje REAL
    // tras revivir (50% de baseline, no un 100 fijo que la presentación
    // usaba antes por su cuenta).
    if (events[0].type === 'GameRevived') {
      expect(events[0].energyPercentage).toBe(session.getEnergyPercentage());
    }
  });

  it('calls showRewardedAd exactly once per execute() call', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus);

    await useCase.execute();

    expect(crazyGamesService.rewardedAdCallCount).toBe(1);
  });

  it('consumes "revive" on a successful revive, so hasRevive() is false right after', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus);

    expect(session.getSessionUpgrades().hasRevive()).toBe(true);
    await useCase.execute();

    expect(session.getSessionUpgrades().hasRevive()).toBe(false);
  });

  it('does NOT consume "revive" when the ad fails (the player keeps their purchase to retry)', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setNextAdResult({ success: false, reason: 'user_cancelled' });
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus);

    await useCase.execute();

    expect(session.getSessionUpgrades().hasRevive()).toBe(true);
  });

  // BUGFIX (revive infinito) — reproduce el exploit reportado de punta a
  // punta con la API pública real: comprar "Revivir" UNA vez alcanzaba
  // para revivir sin límite en la misma partida, viendo un anuncio cada
  // vez. Con el fix, la SEGUNDA derrota de la misma partida ya no ofrece
  // revivir ni vuelve a pedir un anuncio.
  it('does not allow reviving a second time in the same game without buying "revive" again', async () => {
    const session = buildLostSession(); // "revive" comprado una vez
    const crazyGamesService = new FakeCrazyGamesService();
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus);

    const first = await useCase.execute();
    expect(first).toEqual({ revived: true });

    // El jugador sigue jugando tras revivir y pierde POR SEGUNDA VEZ en
    // la misma partida (card_1 también vale 100, como card_0).
    session.openCard('card_1');
    expect(session.getStatus()).toBe('lost');

    const second = await useCase.execute();

    expect(second).toEqual({ revived: false, reason: 'not_eligible' });
    expect(session.getStatus()).toBe('lost');
    // El punto central del bug: el anuncio NO se vuelve a mostrar la segunda vez.
    expect(crazyGamesService.rewardedAdCallCount).toBe(1);
  });
});
