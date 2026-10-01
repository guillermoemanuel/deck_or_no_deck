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

  // Decisión de producto ampliada: el pre-chequeo es `!isRewardedAdAvailable()`,
  // que además del SDK ausente (subsumido arriba) cubre adblock detectado y la
  // ventana de cooldown de 60 s tras un rewarded fallido — todos los caminos
  // en los que el dinero quedaría trabado comprando algo que nunca se puede usar.
  it('refunds the cost when the SDK IS available but ads are not (adblock/cooldown), without ever asking for an ad', async () => {
    const repository = new FakeProgressionRepository();
    repository.seedCoins(10000);
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    // SDK presente pero ads bloqueados: modela adblock detectado o la ventana
    // de cooldown de 60 s (isAvailable() sigue true, isRewardedAdAvailable() false).
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
  // reembolso por ads caídos, si los ads vuelven el reclamo sigue bloqueado —
  // sin segundo crédito y sin efecto.
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

    // Los ads vuelven (cooldown vencido / adblock desactivado): el reclamo NO
    // se otorga y el monto no se acredita dos veces.
    crazyGamesService.setRewardedAvailable(true);
    const secondAttempt = await useCase.execute(2);

    expect(secondAttempt).toEqual({ success: false, reason: 'refunded' });
    expect(repository.getCoins()).toBe(balanceAfterRefund);
    expect(crazyGamesService.rewardedAdCallCount).toBe(0);
  });

  // Hallazgo reviewer — la secuencia más alcanzable en producción: el
  // servicio real pone cooldown de 60 s con CUALQUIER rewarded fallido,
  // INCLUIDA la cancelación del jugador (CrazyGamesService.settle() →
  // rewardedBlockedUntil = now + 60000), y el pre-chequeo se evalúa en
  // cada click. El reintento libre solo sobrevive esperando 60 s.
  it('after a player-cancelled ad the self-inflicted cooldown makes the next click refund exactly once and close the claim', async () => {
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

    // El servicio real acaba de poner el cooldown de 60 s por ese fallo.
    crazyGamesService.setRewardedAvailable(false);

    // Clic 2 a los 10 s: el cooldown lo provocó el propio jugador, pero el
    // pre-chequeo no lo distingue — reembolsa EXACTAMENTE costOf(id) y
    // cierra el reclamo, sin volver a pedir un anuncio.
    const secondAttempt = await useCase.execute(2);
    expect(secondAttempt).toEqual({ success: false, reason: 'refunded' });
    expect(repository.getCoins() - balanceAfterPurchase).toBe(costOf('double_reward'));
    expect(repository.getCoins()).toBe(balanceBeforePurchase);
    expect(crazyGamesService.rewardedAdCallCount).toBe(1);

    // 60 s simulados: el cooldown vence y los ads vuelven — el reclamo
    // sigue bloqueado (reembolso XOR efecto), sin segundo crédito.
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
