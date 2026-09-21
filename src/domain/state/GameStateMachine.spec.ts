import { GameStateMachine } from './GameStateMachine';

describe('GameStateMachine', () => {
  it('starts at playing status by default', () => {
    const sm = new GameStateMachine();
    expect(sm.getStatus()).toBe('playing');
    expect(sm.isPlayable()).toBe(true);
  });

  it('handles offer lifecycle: wait -> reject -> playing', () => {
    const sm = new GameStateMachine();
    sm.waitForOffer();
    expect(sm.getStatus()).toBe('awaiting_offer_response');
    expect(sm.isPlayable()).toBe(false);

    sm.rejectOffer();
    expect(sm.getStatus()).toBe('playing');
    expect(sm.isPlayable()).toBe(true);
  });

  it('handles offer acceptance: wait -> accept -> deal_accepted', () => {
    const sm = new GameStateMachine();
    sm.waitForOffer();
    sm.acceptOffer();
    expect(sm.getStatus()).toBe('deal_accepted');
    expect(sm.is('deal_accepted')).toBe(true);
  });

  it('handles defeat and revive cycle: playing -> lose -> revive -> playing', () => {
    const sm = new GameStateMachine();
    sm.lose();
    expect(sm.getStatus()).toBe('lost');

    sm.revive();
    expect(sm.getStatus()).toBe('playing');
    expect(sm.isPlayable()).toBe(true);
  });

  it('throws on invalid transitions', () => {
    const sm = new GameStateMachine();
    expect(() => sm.rejectOffer()).toThrow();
    expect(() => sm.acceptOffer()).toThrow();
    expect(() => sm.revive()).toThrow();
  });
});
