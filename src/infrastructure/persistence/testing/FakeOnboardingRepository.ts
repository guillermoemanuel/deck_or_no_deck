import { IOnboardingRepository, OnboardingHintId } from '../../../domain/ports/IOnboardingRepository';

/** Fake en memoria para tests: mismo contrato que el adapter de localStorage, sin `window`. */
export class FakeOnboardingRepository implements IOnboardingRepository {
  private seen: OnboardingHintId[];
  private skipped: boolean;

  constructor(initial: { seen?: OnboardingHintId[]; skipped?: boolean } = {}) {
    this.seen = [...(initial.seen ?? [])];
    this.skipped = initial.skipped ?? false;
  }

  getSeenHints(): OnboardingHintId[] {
    return [...this.seen];
  }

  markSeen(hint: OnboardingHintId): void {
    if (!this.seen.includes(hint)) {
      this.seen.push(hint);
    }
  }

  isSkipped(): boolean {
    return this.skipped;
  }

  markSkipped(): void {
    this.skipped = true;
  }
}
