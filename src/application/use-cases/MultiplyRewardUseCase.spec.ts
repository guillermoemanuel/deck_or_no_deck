import { MultiplyRewardUseCase } from './MultiplyRewardUseCase';
import { costOf } from '../../domain/value-objects/SessionUpgradeCatalog';
import { ProgressionManager } from '../../infrastructure/persistence/ProgressionManager';
import { FakeProgressionRepository } from '../../infrastructure/persistence/testing/FakeProgressionRepository';
import { DeterministicRandomProvider } from '../../infrastructure/services/testing/DeterministicRandomProvider';
import { FakeCrazyGamesService } from '../../infrastructure/services/testing/FakeCrazyGamesService';

describe('MultiplyRewardUseCase', () => {
  it('awards baseAmount * (multiplier - 1) as bonus, not the full multiplied total', async () => {
    const repository = new FakeProgressionRepository();
    repository.seedCoins(0);
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    const useCase = new MultiplyRewardUseCase(1000, crazyGamesService, progressionManager);

    const result = await useCase.execute(2);

    expect(result).toMatchObject({ success: true, bonusAwarded: 1000 });
    expect(repository.getCoins()).toBe(1000);
  });

  it('awards baseAmount * 2 as bonus for a triple multiplier', async () => {
    const repository = new FakeProgressionRepository();
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    const useCase = new MultiplyRewardUseCase(500, crazyGamesService, progressionManager);

    const result = await useCase.execute(3);

    expect(result).toMatchObject({ success: true, bonusAwarded: 1000 });
  });

  it('returns { success: false, reason: "already_claimed" } on a second call', async () => {
    const progressionManager = new ProgressionManager(new FakeProgressionRepository(), new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    const useCase = new MultiplyRewardUseCase(1000, crazyGamesService, progressionManager);

    await useCase.execute(2);
    const secondAttempt = await useCase.execute(3);

    expect(secondAttempt).toEqual({ success: false, reason: 'already_claimed' });
  });

  it('does not award any coins twice, even if execute is called concurrently', async () => {
    const repository = new FakeProgressionRepository();
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    const useCase = new MultiplyRewardUseCase(1000, crazyGamesService, progressionManager);

    const [first, second] = await Promise.all([useCase.execute(2), useCase.execute(2)]);

    const successes = [first, second].filter(r => r.success);
    const failures = [first, second].filter(r => !r.success);

    expect(successes).toHaveLength(1);
    expect(repository.getCoins()).toBe(1000);

    // La llamada perdedora debe cortarse de inmediato (sin esperar el anuncio),
    // gracias al flag sincronico `isProcessing` seteado antes del await.
    expect(failures).toHaveLength(1);
    if (!failures[0].success) {
      expect(failures[0].reason).toBe('already_claimed');
    }

    // Solo UNA llamada al SDK de anuncios — la segunda ni siquiera llega a pedirlo.
    expect(crazyGamesService.rewardedAdCallCount).toBe(1);
  });

  it('rejects a second concurrent call even while the first is still awaiting the ad', async () => {
    const repository = new FakeProgressionRepository();
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    const useCase = new MultiplyRewardUseCase(1000, crazyGamesService, progressionManager);

    // No esperamos la primera promesa antes de lanzar la segunda —
    // exactamente el escenario de un doble click accidental.
    const firstPromise = useCase.execute(2);
    const secondResult = await useCase.execute(2);

    expect(secondResult).toEqual({ success: false, reason: 'already_claimed' });

    const firstResult = await firstPromise;
    expect(firstResult.success).toBe(true);
  });

  // Decisión de producto: reembolso por FALLO AMBIENTAL (TOCTOU
  // compra→consumo de docs/testing.md). La tienda ya cobró la mejora y el
  // SDK de CrazyGames no está al consumirla: sin reembolso el jugador se
  // iba de la pantalla con las monedas perdidas y nada a cambio.
  it('refunds the upgrade cost exactly once when the SDK is not available ("refunded")', async () => {
    const repository = new FakeProgressionRepository();
    repository.seedCoins(10000);
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setAvailable(false);
    const useCase = new MultiplyRewardUseCase(1000, crazyGamesService, progressionManager);

    // Simula la compra previa en la Tienda: el monto sale del catálogo,
    // nunca hardcodeado.
    const balanceBeforePurchase = repository.getCoins();
    expect(progressionManager.spendCoins(costOf('double_reward'))).toBe(true);

    const result = await useCase.execute(2);

    expect(result).toEqual({ success: false, reason: 'refunded' });
    // El saldo vuelve EXACTAMENTE al anterior a la compra: ni un moneda de más.
    expect(repository.getCoins()).toBe(balanceBeforePurchase);
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
  });

  it('refunds costOf("triple_reward") — not the double one — when the triple multiplier hits the missing SDK', async () => {
    const repository = new FakeProgressionRepository();
    repository.seedCoins(10000);
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setAvailable(false);
    const useCase = new MultiplyRewardUseCase(1000, crazyGamesService, progressionManager);

    const balanceBeforePurchase = repository.getCoins();
    expect(progressionManager.spendCoins(costOf('triple_reward'))).toBe(true);
    const balanceAfterPurchase = repository.getCoins();

    const result = await useCase.execute(3);

    expect(result).toEqual({ success: false, reason: 'refunded' });
    expect(repository.getCoins()).toBe(balanceBeforePurchase);
    // El monto reembolsado es EXACTAMENTE costOf("triple_reward").
    expect(repository.getCoins() - balanceAfterPurchase).toBe(costOf('triple_reward'));
  });

  // Invariante reembolso XOR efecto: tras cobrar devuelta, el reclamo
  // queda bloqueado para SIEMPRE — si el efecto pudiera otorgarse igual,
  // sería explotable (fallar a propósito, cobrar devuelta y reclamar el
  // anuncio cuando vuelva).
  it('blocks the effect after a refund: a later attempt with the SDK back returns "refunded" and pays nothing', async () => {
    const repository = new FakeProgressionRepository();
    repository.seedCoins(10000);
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setAvailable(false);
    const useCase = new MultiplyRewardUseCase(1000, crazyGamesService, progressionManager);

    progressionManager.spendCoins(costOf('double_reward'));
    const firstAttempt = await useCase.execute(2);
    expect(firstAttempt).toEqual({ success: false, reason: 'refunded' });
    const balanceAfterRefund = repository.getCoins();

    // El SDK vuelve: el reclamo NO se otorga y el monto no se acredita dos veces.
    crazyGamesService.setAvailable(true);
    const secondAttempt = await useCase.execute(2);

    expect(secondAttempt).toEqual({ success: false, reason: 'refunded' });
    expect(repository.getCoins()).toBe(balanceAfterRefund);
  });

  it('returns { success: false, reason: "ad_failed" } WITHOUT any refund and allows a retry afterward', async () => {
    const repository = new FakeProgressionRepository();
    repository.seedCoins(10000);
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setNextAdResult({ success: false, reason: 'ad_unavailable' });
    const useCase = new MultiplyRewardUseCase(1000, crazyGamesService, progressionManager);

    // El jugador canceló o no completó el anuncio: es SU elección, no un
    // fallo ambiental — no se reembolsa y el botón sigue reintentable.
    progressionManager.spendCoins(costOf('double_reward'));
    const balanceAfterPurchase = repository.getCoins();

    const failedAttempt = await useCase.execute(2);
    expect(failedAttempt).toEqual({ success: false, reason: 'ad_failed' });
    expect(repository.getCoins()).toBe(balanceAfterPurchase);
    expect(useCase.isClaimed()).toBe(false);

    crazyGamesService.setNextAdResult({ success: true });
    const retryAttempt = await useCase.execute(2);
    expect(retryAttempt).toMatchObject({ success: true, bonusAwarded: 1000 });
    expect(repository.getCoins()).toBe(balanceAfterPurchase + 1000);
  });

  // Decisión de producto ampliada: el chequeo es `rewardedAdStatus()` con
  // la política 2 (permanencia / sin fill). Este caso modela ADBLOCK
  // detectado — estado PERMANENTE que reembolsa — con el SDK entero
  // presente: dinero que quedaría trabado comprando algo que nunca se
  // puede usar. El cooldown REINTENTABLE no reembolsa: ver los tests de
  // 'ads_cooldown' de abajo.
  it('refunds the cost when the SDK IS available but ads are blocked (adblock), without ever asking for an ad', async () => {
    const repository = new FakeProgressionRepository();
    repository.seedCoins(10000);
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    // SDK presente pero ads bloqueados: modela adblock detectado
    // (isAvailable() sigue true, rewardedAdStatus() = 'adblock').
    crazyGamesService.setRewardedAvailable(false);
    const useCase = new MultiplyRewardUseCase(1000, crazyGamesService, progressionManager);

    const balanceBeforePurchase = repository.getCoins();
    expect(progressionManager.spendCoins(costOf('double_reward'))).toBe(true);
    const balanceAfterPurchase = repository.getCoins();

    const result = await useCase.execute(2);

    expect(result).toEqual({ success: false, reason: 'refunded' });
    // El reembolso es EXACTAMENTE costOf('double_reward'), una sola vez.
    expect(repository.getCoins() - balanceAfterPurchase).toBe(costOf('double_reward'));
    expect(repository.getCoins()).toBe(balanceBeforePurchase);
    // Nunca se intentó mostrar un anuncio que no podía rendir: sin llamada al SDK.
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
  });

  // Invariante reembolso XOR efecto, con el alcance ampliado: tras el
  // reembolso por adblock, si el adblock se desactiva el reclamo sigue
  // bloqueado — sin segundo crédito y sin efecto.
  it('keeps the refund final: with ads available again a later attempt returns "refunded" and pays nothing', async () => {
    const repository = new FakeProgressionRepository();
    repository.seedCoins(10000);
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setRewardedAvailable(false);
    const useCase = new MultiplyRewardUseCase(1000, crazyGamesService, progressionManager);

    progressionManager.spendCoins(costOf('double_reward'));
    const firstAttempt = await useCase.execute(2);
    expect(firstAttempt).toEqual({ success: false, reason: 'refunded' });
    const balanceAfterRefund = repository.getCoins();

    // El adblock se desactiva: el reclamo NO se otorga y el monto no se
    // acredita dos veces.
    crazyGamesService.setRewardedAvailable(true);
    const secondAttempt = await useCase.execute(2);

    expect(secondAttempt).toEqual({ success: false, reason: 'refunded' });
    expect(repository.getCoins()).toBe(balanceAfterRefund);
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
  });

  // Política de 2 niveles (JSDoc de ICrazyGamesService.rewardedAdStatus,
  // ADR-006): el motivo del no-disponible decide la política. Acá el
  // cooldown de 60 s viene de un fallo REINTENTABLE — el servicio real lo
  // activa con CUALQUIER rewarded fallido, INCLUIDA la cancelación del
  // propio jugador (CrazyGamesService.settle() → rewardedBlockedUntil =
  // now + 60000) —, así que reembolsar dentro de la ventana era un
  // FORFEIT AUTOINFLIGIDO: cancelar y cobrar el dinero cerraba el reclamo
  // perdiendo la chance del efecto. Devuelve el motivo nuevo sin tocar el
  // saldo ni el flag `refunded`.
  it('returns "ads_cooldown" WITHOUT refunding while the cooldown is retryable: balance intact, no ad asked, claim still open', async () => {
    const repository = new FakeProgressionRepository();
    repository.seedCoins(10000);
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    // SDK presente (isAvailable() true) pero en cooldown por un fallo
    // reintentable: el motivo del puerto es exactamente 'cooldown_retryable'.
    crazyGamesService.setRewardedStatus('cooldown_retryable');
    const useCase = new MultiplyRewardUseCase(1000, crazyGamesService, progressionManager);

    const balanceBeforePurchase = repository.getCoins();
    expect(progressionManager.spendCoins(costOf('double_reward'))).toBe(true);
    const balanceAfterPurchase = repository.getCoins();

    const result = await useCase.execute(2);

    expect(result).toEqual({ success: false, reason: 'ads_cooldown' });
    // Sin reembolso: el saldo queda EXACTAMENTE el de después de la compra
    // (NO volvió al anterior a ella).
    expect(repository.getCoins()).toBe(balanceAfterPurchase);
    expect(repository.getCoins()).not.toBe(balanceBeforePurchase);
    // Ni siquiera se pidió el anuncio: la ventana de cooldown lo impedía.
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);

    // `refunded` NO quedó seteado: un segundo click dentro de la ventana
    // vuelve a dar 'ads_cooldown' — si el reembolso se hubiera acreditado,
    // el chequeo XOR del inicio devolvería 'refunded'.
    const secondClick = await useCase.execute(2);
    expect(secondClick).toEqual({ success: false, reason: 'ads_cooldown' });
    expect(repository.getCoins()).toBe(balanceAfterPurchase);
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
  });

  // Paridad con el test anterior: el reembolso que NO ocurrió no cerró
  // nada — vencidos los 60 s la MISMA instancia reintenta de verdad y el
  // efecto se entrega (si 'ads_cooldown' hubiera seteado `refunded`, este
  // click devolvería 'refunded' sin pedir el anuncio).
  it('after the 60 s cooldown expires the SAME claim attempts the ad for real and delivers the effect', async () => {
    const repository = new FakeProgressionRepository();
    repository.seedCoins(10000);
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setRewardedStatus('cooldown_retryable');
    const useCase = new MultiplyRewardUseCase(1000, crazyGamesService, progressionManager);

    progressionManager.spendCoins(costOf('double_reward'));
    const balanceAfterPurchase = repository.getCoins();

    const blockedAttempt = await useCase.execute(2);
    expect(blockedAttempt).toEqual({ success: false, reason: 'ads_cooldown' });
    expect(repository.getCoins()).toBe(balanceAfterPurchase);

    // 60 s simulados: el cooldown vence y el estado vuelve a 'available'.
    crazyGamesService.setRewardedStatus('available');
    crazyGamesService.setNextAdResult({ success: true });

    const retryAttempt = await useCase.execute(2);

    expect(retryAttempt).toMatchObject({ success: true, bonusAwarded: 1000 });
    // El intento real ocurrió (1 sola llamada al SDK) y el efecto se pagó.
    expect(crazyGamesService.rewardedAdCallCount).toBe(1);
    expect(repository.getCoins()).toBe(balanceAfterPurchase + 1000);
    expect(useCase.isClaimed()).toBe(true);
  });

  // El otro lado de la política: el cooldown AMBIENTAL (sin fill) no
  // promete nada en el reintento — el dinero quedaría trabado —, así que
  // ahí SÍ se reembolsa el costo exacto del catálogo, una sola vez.
  it('refunds costOf("double_reward") exactly once when the cooldown came from a no-fill failure ("refunded")', async () => {
    const repository = new FakeProgressionRepository();
    repository.seedCoins(10000);
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setRewardedStatus('cooldown_no_fill');
    const useCase = new MultiplyRewardUseCase(1000, crazyGamesService, progressionManager);

    const balanceBeforePurchase = repository.getCoins();
    expect(progressionManager.spendCoins(costOf('double_reward'))).toBe(true);
    const balanceAfterPurchase = repository.getCoins();

    const result = await useCase.execute(2);

    expect(result).toEqual({ success: false, reason: 'refunded' });
    // El reembolso es EXACTAMENTE costOf('double_reward'), una sola vez.
    expect(repository.getCoins() - balanceAfterPurchase).toBe(costOf('double_reward'));
    expect(repository.getCoins()).toBe(balanceBeforePurchase);
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
  });

  // Secuencia mixta (cancelación + adblock): primero la cancelación del
  // propio jugador — `ad_failed`, sin reembolso — y entre los dos clics el
  // SDK reporta ADBLOCK, estado PERMANENTE que SÍ reembolsa (política 2 de
  // rewardedAdStatus()). Nota: setRewardedAvailable(false) setea
  // 'adblock', no el cooldown; el cooldown AUTOINFLIGIDO ya NO reembolsa
  // (era la política vieja, un forfeit) y está cubierto por los tests de
  // 'ads_cooldown' de arriba.
  it('after a player-cancelled ad, adblock detected before the next click refunds exactly once and closes the claim', async () => {
    const repository = new FakeProgressionRepository();
    repository.seedCoins(10000);
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setNextAdResult({ success: false, reason: 'user_cancelled' });
    const useCase = new MultiplyRewardUseCase(1000, crazyGamesService, progressionManager);

    const balanceBeforePurchase = repository.getCoins();
    expect(progressionManager.spendCoins(costOf('double_reward'))).toBe(true);
    const balanceAfterPurchase = repository.getCoins();

    // Clic 1: el anuncio se pidió y falló (cancelación del jugador) —
    // `ad_failed` SIN reembolso, el saldo tras la compra queda intacto.
    const firstAttempt = await useCase.execute(2);
    expect(firstAttempt).toEqual({ success: false, reason: 'ad_failed' });
    expect(repository.getCoins()).toBe(balanceAfterPurchase);
    expect(useCase.isClaimed()).toBe(false);
    expect(crazyGamesService.rewardedAdCallCount).toBe(1);

    // Entre los dos clics se detecta adblock: rewardedAdStatus() = 'adblock'.
    crazyGamesService.setRewardedAvailable(false);

    // Clic 2: adblock es PERMANENTE en la sesión — reembolsa EXACTAMENTE
    // costOf(id) y cierra el reclamo, sin volver a pedir un anuncio.
    const secondAttempt = await useCase.execute(2);
    expect(secondAttempt).toEqual({ success: false, reason: 'refunded' });
    expect(repository.getCoins() - balanceAfterPurchase).toBe(costOf('double_reward'));
    expect(repository.getCoins()).toBe(balanceBeforePurchase);
    expect(crazyGamesService.rewardedAdCallCount).toBe(1);

    // El adblock se desactiva: el reclamo sigue bloqueado (reembolso XOR
    // efecto), sin segundo crédito.
    crazyGamesService.setRewardedAvailable(true);
    const thirdAttempt = await useCase.execute(2);
    expect(thirdAttempt).toEqual({ success: false, reason: 'refunded' });
    expect(repository.getCoins()).toBe(balanceBeforePurchase);
    expect(crazyGamesService.rewardedAdCallCount).toBe(1);
  });

  it('newTotal in the result reflects the actual repository balance after the bonus', async () => {
    const repository = new FakeProgressionRepository();
    repository.seedCoins(500);
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    const useCase = new MultiplyRewardUseCase(1000, crazyGamesService, progressionManager);

    const result = await useCase.execute(2);

    expect(result).toMatchObject({ success: true, newTotal: 1500 });
  });
});
