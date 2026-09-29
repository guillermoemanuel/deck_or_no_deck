import { IDailyChallengeRepository } from '../../../domain/ports/IDailyChallengeRepository';
import { IRecordsRepository } from '../../../domain/ports/IRecordsRepository';
import { DailyChallengeState, EMPTY_DAILY_STATE } from '../../../domain/value-objects/DailyChallenge';
import { EMPTY_RECORDS, PlayerRecords } from '../../../domain/value-objects/PlayerRecords';

/** Fakes en memoria para tests: mismo contrato que los adapters de localStorage, sin `window`. */
export class FakeRecordsRepository implements IRecordsRepository {
  constructor(private records: PlayerRecords = EMPTY_RECORDS) {}
  get(): PlayerRecords {
    return this.records;
  }
  save(records: PlayerRecords): void {
    this.records = records;
  }
  reset(): void {
    this.records = EMPTY_RECORDS;
  }
}

export class FakeDailyChallengeRepository implements IDailyChallengeRepository {
  constructor(private state: DailyChallengeState = EMPTY_DAILY_STATE) {}
  get(): DailyChallengeState {
    return this.state;
  }
  save(state: DailyChallengeState): void {
    this.state = state;
  }
}
