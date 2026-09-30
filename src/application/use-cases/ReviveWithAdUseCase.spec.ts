import { ReviveWithAdUseCase } from './ReviveWithAdUseCase';
import { GameSession, DefaultEnergyDrainRule, EnergyDrainRule } from '../../domain/entities/GameSession';
import { Banker } from '../../domain/services/Banker';
import { OfferCalculator } from '../../domain/services/OfferCalculator';
import { Card } from '../../domain/entities/Card';
import { GameEvent } from '../../domain/events/GameEvents';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
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

  it('returns { revived: false, reason: "sdk_unavailable" } if the SDK is not available', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setAvailable(false);
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus);

    const result = await useCase.execute();

    expect(result).toEqual({ revived: false, reason: 'sdk_unavailable' });
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
