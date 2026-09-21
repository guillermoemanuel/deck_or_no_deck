import { MultiplyRewardUseCase } from './MultiplyRewardUseCase';
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

  it('returns { success: false, reason: "sdk_unavailable" } without awarding coins', async () => {
    const repository = new FakeProgressionRepository();
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setAvailable(false);
    const useCase = new MultiplyRewardUseCase(1000, crazyGamesService, progressionManager);

    const result = await useCase.execute(2);

    expect(result).toEqual({ success: false, reason: 'sdk_unavailable' });
    expect(repository.getCoins()).toBe(0);
  });

  it('returns { success: false, reason: "ad_failed" } and allows a retry afterward', async () => {
    const repository = new FakeProgressionRepository();
    const progressionManager = new ProgressionManager(repository, new DeterministicRandomProvider());
    const crazyGamesService = new FakeCrazyGamesService();
    crazyGamesService.setNextAdResult({ success: false, reason: 'ad_unavailable' });
    const useCase = new MultiplyRewardUseCase(1000, crazyGamesService, progressionManager);

    const failedAttempt = await useCase.execute(2);
    expect(failedAttempt).toEqual({ success: false, reason: 'ad_failed' });
    expect(useCase.isClaimed()).toBe(false);

    crazyGamesService.setNextAdResult({ success: true });
    const retryAttempt = await useCase.execute(2);
    expect(retryAttempt).toMatchObject({ success: true, bonusAwarded: 1000 });
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
