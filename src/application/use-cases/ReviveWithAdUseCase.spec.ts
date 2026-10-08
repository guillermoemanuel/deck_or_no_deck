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
  const session = new GameSession(boardCards, secretCard, new Banker(new OfferCalculator(() => 0.5)), new FixedDrainRule());
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
    new Banker(new OfferCalculator(() => 0.5)),
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
  // el use-case devuelve el motivo REAL (`sdk_unavailable`, que bajo la
  // política 2 cubre adblock/sin fill — es el único motivo de esa política
  // disponible en la unión; el cooldown reintentable devuelve
  // 'ads_cooldown', que no necesita reembolso) en vez de un 'refunded' que
  // no cumpliría — el jugador queda como antes, con la jugada reintentable.
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

  // Decisión de producto ampliada: el chequeo es `rewardedAdStatus()` con
  // la política 2 (permanencia / sin fill). Este caso modela ADBLOCK
  // detectado — estado PERMANENTE que reembolsa — con el SDK entero
  // presente: dinero del "Revivir" que quedaría trabado. El cooldown
  // REINTENTABLE no reembolsa: ver los tests de 'ads_cooldown' de abajo.
  it('refunds costOf("revive") when the SDK IS available but ads are blocked (adblock), without ever asking for an ad', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    // SDK presente pero ads bloqueados: modela adblock detectado
    // (isAvailable() sigue true, rewardedAdStatus() = 'adblock').
    crazyGamesService.setRewardedAvailable(false);
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const { repository, progressionManager } = buildProgression(10000);
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus, progressionManager);

    const balanceBeforePurchase = repository.getCoins();
    expect(progressionManager.spendCoins(costOf('revive'))).toBe(true);
    const balanceAfterPurchase = repository.getCoins();

    const result = await useCase.execute();

    expect(result).toEqual({ revived: false, reason: 'refunded' });
    // El reembolso es EXACTAMENTE costOf('revive'), una sola vez.
    expect(repository.getCoins() - balanceAfterPurchase).toBe(costOf('revive'));
    expect(repository.getCoins()).toBe(balanceBeforePurchase);
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
    expect(session.getStatus()).toBe('lost');
    expect(session.getSessionUpgrades().hasRevive()).toBe(true);
  });

  // Invariante reembolso XOR efecto, con el alcance ampliado: tras el
  // reembolso por adblock, si el adblock se desactiva el revive sigue
  // bloqueado — sin segundo crédito y sin efecto.
  it('keeps the refund final: with ads available again a later attempt returns "refunded" and never revives', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setRewardedAvailable(false);
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const { repository, progressionManager } = buildProgression(10000);
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus, progressionManager);

    progressionManager.spendCoins(costOf('revive'));
    const firstAttempt = await useCase.execute();
    expect(firstAttempt).toEqual({ revived: false, reason: 'refunded' });
    const balanceAfterRefund = repository.getCoins();

    // El adblock se desactiva: el revive NO se otorga y el monto no se
    // acredita dos veces.
    crazyGamesService.setRewardedAvailable(true);
    const secondAttempt = await useCase.execute();

    expect(secondAttempt).toEqual({ revived: false, reason: 'refunded' });
    expect(repository.getCoins()).toBe(balanceAfterRefund);
    expect(session.getStatus()).toBe('lost');
    expect(session.getSessionUpgrades().hasRevive()).toBe(true);
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
  });

  // Política de 2 niveles (JSDoc de ICrazyGamesService.rewardedAdStatus,
  // ADR-006): el motivo del no-disponible decide la política. Acá el
  // cooldown de 60 s viene de un fallo REINTENTABLE — el servicio real lo
  // activa con CUALQUIER rewarded fallido, INCLUIDA la cancelación del
  // propio jugador (settle() → RewardCooldownTracker: ahora + 60000) —,
  // así que reembolsar dentro de la ventana era un
  // FORFEIT AUTOINFLIGIDO: el jugador cancelaba el anuncio de Revivir,
  // cobraba el dinero y perdía para siempre la chance de revivir. Devuelve
  // el motivo nuevo sin tocar el saldo ni el flag `refunded`.
  it('returns "ads_cooldown" WITHOUT refunding while the cooldown is retryable: balance intact, revive intact, no ad asked', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setRewardedStatus('cooldown_retryable');
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const { repository, progressionManager } = buildProgression(10000);
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus, progressionManager);

    const balanceBeforePurchase = repository.getCoins();
    expect(progressionManager.spendCoins(costOf('revive'))).toBe(true);
    const balanceAfterPurchase = repository.getCoins();

    const result = await useCase.execute();

    expect(result).toEqual({ revived: false, reason: 'ads_cooldown' });
    // Sin reembolso: el saldo queda EXACTAMENTE el de después de la compra
    // (NO volvió al anterior a ella).
    expect(repository.getCoins()).toBe(balanceAfterPurchase);
    expect(repository.getCoins()).not.toBe(balanceBeforePurchase);
    // Ni siquiera se pidió el anuncio: la ventana de cooldown lo impedía.
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
    expect(session.getStatus()).toBe('lost');
    expect(session.getSessionUpgrades().hasRevive()).toBe(true);

    // `refunded` NO quedó seteado: un segundo click dentro de la ventana
    // vuelve a dar 'ads_cooldown' — si el reembolso se hubiera acreditado,
    // el chequeo XOR del inicio devolvería 'refunded'.
    const secondClick = await useCase.execute();
    expect(secondClick).toEqual({ revived: false, reason: 'ads_cooldown' });
    expect(repository.getCoins()).toBe(balanceAfterPurchase);
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
    expect(session.getSessionUpgrades().hasRevive()).toBe(true);
  });

  // Paridad con el test anterior: el reembolso que NO ocurrió no cerró
  // nada — vencidos los 60 s la MISMA instancia reintenta de verdad y el
  // revive se entrega (si 'ads_cooldown' hubiera seteado `refunded`, este
  // click devolvería 'refunded' sin pedir el anuncio).
  it('after the 60 s cooldown expires the SAME claim attempts the ad for real and revives', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setRewardedStatus('cooldown_retryable');
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const { repository, progressionManager } = buildProgression(10000);
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus, progressionManager);

    progressionManager.spendCoins(costOf('revive'));
    const balanceAfterPurchase = repository.getCoins();

    const blockedAttempt = await useCase.execute();
    expect(blockedAttempt).toEqual({ revived: false, reason: 'ads_cooldown' });
    expect(repository.getCoins()).toBe(balanceAfterPurchase);

    // 60 s simulados: el cooldown vence y el estado vuelve a 'available'.
    crazyGamesService.setRewardedStatus('available');
    crazyGamesService.setNextAdResult({ success: true });

    const retryAttempt = await useCase.execute();

    expect(retryAttempt).toEqual({ revived: true });
    // El intento real ocurrió (1 sola llamada al SDK) y el revive se
    // entregó: ni reembolso ni monedas de más.
    expect(crazyGamesService.rewardedAdCallCount).toBe(1);
    expect(repository.getCoins()).toBe(balanceAfterPurchase);
    expect(session.getStatus()).toBe('playing');
    expect(session.getSessionUpgrades().hasRevive()).toBe(false);
  });

  // El otro lado de la política: el cooldown AMBIENTAL (sin fill) no
  // promete nada en el reintento — el dinero quedaría trabado —, así que
  // ahí SÍ se reembolsa el costo exacto del catálogo, una sola vez.
  it('refunds costOf("revive") exactly once when the cooldown came from a no-fill failure ("refunded")', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setRewardedStatus('cooldown_no_fill');
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const { repository, progressionManager } = buildProgression(10000);
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus, progressionManager);

    const balanceBeforePurchase = repository.getCoins();
    expect(progressionManager.spendCoins(costOf('revive'))).toBe(true);
    const balanceAfterPurchase = repository.getCoins();

    const result = await useCase.execute();

    expect(result).toEqual({ revived: false, reason: 'refunded' });
    // El reembolso es EXACTAMENTE costOf('revive'), una sola vez.
    expect(repository.getCoins() - balanceAfterPurchase).toBe(costOf('revive'));
    expect(repository.getCoins()).toBe(balanceBeforePurchase);
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
    expect(session.getStatus()).toBe('lost');
    expect(session.getSessionUpgrades().hasRevive()).toBe(true);
  });

  // Secuencia mixta (cancelación + adblock): primero la cancelación del
  // propio jugador — `ad_failed`, sin reembolso — y entre los dos clics el
  // SDK reporta ADBLOCK, estado PERMANENTE que SÍ reembolsa (política 2 de
  // rewardedAdStatus()). Nota: setRewardedAvailable(false) setea
  // 'adblock', no el cooldown; el cooldown AUTOINFLIGIDO ya NO reembolsa
  // (era la política vieja, un forfeit — el jugador cancelaba Revivir y
  // cobraba el dinero perdiendo la chance de revivir) y está cubierto por
  // los tests de 'ads_cooldown' de arriba.
  it('after a player-cancelled ad, adblock detected before the next click refunds exactly once and closes the revive claim', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setNextAdResult({ success: false, reason: 'user_cancelled' });
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const { repository, progressionManager } = buildProgression(10000);
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus, progressionManager);

    const balanceBeforePurchase = repository.getCoins();
    expect(progressionManager.spendCoins(costOf('revive'))).toBe(true);
    const balanceAfterPurchase = repository.getCoins();

    // Clic 1: el anuncio se pidió y falló (cancelación del jugador) —
    // `ad_failed` SIN reembolso, el saldo tras la compra queda intacto.
    const firstAttempt = await useCase.execute();
    expect(firstAttempt).toEqual({ revived: false, reason: 'ad_failed' });
    expect(repository.getCoins()).toBe(balanceAfterPurchase);
    expect(crazyGamesService.rewardedAdCallCount).toBe(1);

    // Entre los dos clics se detecta adblock: rewardedAdStatus() = 'adblock'.
    crazyGamesService.setRewardedAvailable(false);

    // Clic 2: adblock es PERMANENTE en la sesión — reembolsa EXACTAMENTE
    // costOf('revive') y cierra el reclamo, sin volver a pedir un anuncio.
    const secondAttempt = await useCase.execute();
    expect(secondAttempt).toEqual({ revived: false, reason: 'refunded' });
    expect(repository.getCoins() - balanceAfterPurchase).toBe(costOf('revive'));
    expect(repository.getCoins()).toBe(balanceBeforePurchase);
    expect(crazyGamesService.rewardedAdCallCount).toBe(1);

    // El adblock se desactiva: el revive sigue bloqueado (reembolso XOR
    // efecto), sin segundo crédito.
    crazyGamesService.setRewardedAvailable(true);
    const thirdAttempt = await useCase.execute();
    expect(thirdAttempt).toEqual({ revived: false, reason: 'refunded' });
    expect(repository.getCoins()).toBe(balanceBeforePurchase);
    expect(crazyGamesService.rewardedAdCallCount).toBe(1);
    expect(session.getStatus()).toBe('lost');
    expect(session.getSessionUpgrades().hasRevive()).toBe(true);
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

  // CG-PUB-003 (auditoría de publicación 2026-10-04): Basic Launch →
  // adError {code: 'adsDisabledBasicLaunch'} → el adapter lo cachea como
  // estado PERMANENTE 'ads_disabled' (ADR-009). Si el motivo ya es
  // permanente ANTES de consumir, entra directo en la POLÍTICA 2.
  it('con rewardedAdStatus() "ads_disabled" el revive reembolsa costOf("revive") exactamente una vez (política 2)', async () => {
    const session = buildLostSession();
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setRewardedStatus('ads_disabled');
    const eventBus = new SimpleEventEmitter<GameEvent>();
    const { repository, progressionManager } = buildProgression(10000);
    const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus, progressionManager);

    // Simula la compra previa en la Tienda: el monto sale del catálogo.
    const balanceBeforePurchase = repository.getCoins();
    expect(progressionManager.spendCoins(costOf('revive'))).toBe(true);

    const result = await useCase.execute();

    expect(result).toEqual({ revived: false, reason: 'refunded' });
    // El saldo vuelve EXACTAMENTE al anterior a la compra: ni un moneda de más.
    expect(repository.getCoins()).toBe(balanceBeforePurchase);
    // Nunca se pide el anuncio: el estado ya lo dice todo.
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
    expect(session.getStatus()).toBe('lost');
  });

  // El caso REAL de CG-PUB-003: al consumir el status todavía era
  // 'available' (recién el adError del SDK lo vuelve permanente). Antes
  // del fix el resultado era 'ad_failed' SIN reembolso — el jugador
  // pagaba monedas por un botón que nunca iba a funcionar. Re-evaluar el
  // motivo DESPUÉS del fallo y entrar en la política 2 es lo que cierra
  // el criterio de rechazo QA.
  it.each(['ads_disabled', 'adblock'] as const)(
    'si el adError del SDK vuelve el estado "%s" al consumir, el PRIMER intento ya reembolsa (no "ad_failed")',
    async (statusAfterFailure) => {
      const session = buildLostSession();
      const crazyGamesService = new FakeCrazyGamesService();
      crazyGamesService.setNextAdResult({ success: false, reason: 'error' });
      crazyGamesService.setRewardedStatusAfterNextAd(statusAfterFailure);
      const eventBus = new SimpleEventEmitter<GameEvent>();
      const { repository, progressionManager } = buildProgression(10000);
      const useCase = new ReviveWithAdUseCase(session, crazyGamesService, eventBus, progressionManager);

      const balanceBeforePurchase = repository.getCoins();
      expect(progressionManager.spendCoins(costOf('revive'))).toBe(true);

      const result = await useCase.execute();

      expect(result).toEqual({ revived: false, reason: 'refunded' });
      expect(repository.getCoins()).toBe(balanceBeforePurchase);
      // El anuncio SÍ se pidió (falló en vuelo): el reembolso es post-fallo.
      expect(crazyGamesService.rewardedAdCallCount).toBe(1);
      expect(session.getStatus()).toBe('lost');
    }
  );
});
