import { ICrazyGamesService, AdResult } from '../../../domain/ports/ICrazyGamesService';

/**
 * Fake controlable: el test decide de antemano que resultado devolvera
 * cada llamada a showRewardedAd(), sin depender de window.CrazyGames.
 */
export class FakeCrazyGamesService implements ICrazyGamesService {
  private available = true;
  private nextAdResult: AdResult = { success: true };
  public rewardedAdCallCount = 0;
  public midgameAdCallCount = 0;
  public gameplayStartCalled = false;
  public gameplayStopCalled = false;

  setAvailable(available: boolean): void {
    this.available = available;
  }

  setNextAdResult(result: AdResult): void {
    this.nextAdResult = result;
  }

  isAvailable(): boolean {
    return this.available;
  }

  async showRewardedAd(): Promise<AdResult> {
    this.rewardedAdCallCount += 1;
    return this.nextAdResult;
  }

  async showMidgameAd(): Promise<AdResult> {
    this.midgameAdCallCount += 1;
    return this.nextAdResult;
  }

  reportGameplayStart(): void {
    this.gameplayStartCalled = true;
  }

  reportGameplayStop(): void {
    this.gameplayStopCalled = true;
  }
}
