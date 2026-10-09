import { SFX } from '../../shared/audio/AudioData';
import { IAudioService } from '../../domain/ports/IAudioService';
import { GameEvent } from '../../domain/events/GameEvents';
import { Card } from '../../domain/entities/Card';
import { GameplaySoundtrack } from './GameplaySoundtrack';
import { LOSE_AFTER_DEPLETED_DELAY_MS, HEARTBEAT_INTERVAL_MS } from './GameplaySfx';
import { createFakeScheduler } from './testing/fakeScheduler';

function cardOpened(energyRemaining: number): GameEvent {
  return {
    type: 'CardOpened',
    card: Card.create('c1', 100),
    energyRemaining,
    cardsUntilNextOffer: 3
  };
}

describe('GameplaySoundtrack', () => {
  let audioPlay: jest.Mock;
  let audio: IAudioService;
  let fake: ReturnType<typeof createFakeScheduler>;
  let soundtrack: GameplaySoundtrack;

  beforeEach(() => {
    audioPlay = jest.fn();
    audio = { play: audioPlay } as unknown as IAudioService;
    fake = createFakeScheduler();
    soundtrack = new GameplaySoundtrack(audio, fake.scheduler);
  });

  it('DealAccepted → GameWon reproduce SOLO sfx-deal (sin doble fanfarria)', () => {
    soundtrack.onEvent({ type: 'DealAccepted', amount: 500, secretCardValue: 100 });
    soundtrack.onEvent({ type: 'GameWon', finalAmount: 500 });
    expect(audioPlay.mock.calls).toEqual([[SFX.DEAL]]);
  });

  it('GameWon sin deal aceptado reproduce sfx-win', () => {
    soundtrack.onEvent({ type: 'GameWon', finalAmount: 1000 });
    expect(audioPlay.mock.calls).toEqual([[SFX.WIN]]);
  });

  it('DealRejected reproduce sfx-no-deal', () => {
    soundtrack.onEvent({ type: 'DealRejected' });
    expect(audioPlay.mock.calls).toEqual([[SFX.NO_DEAL]]);
  });

  it('SecretCardSwapped y FinalSecretCardSwapped reproducen sfx-swap', () => {
    soundtrack.onEvent({
      type: 'SecretCardSwapped',
      newSecretCard: Card.create('c2', 50, true),
      oldSecretCard: Card.create('c1', 100)
    });
    soundtrack.onEvent({
      type: 'FinalSecretCardSwapped',
      oldSecretCard: Card.create('c1', 100),
      newSecretCard: Card.create('c2', 50, true),
      finalPrize: 50
    });
    expect(audioPlay.mock.calls).toEqual([[SFX.SWAP], [SFX.SWAP]]);
  });

  it('EnergyDepleted → GameLost: depleted al instante, lose recién al timer de 900', () => {
    soundtrack.onEvent({ type: 'EnergyDepleted' });
    expect(audioPlay.mock.calls).toEqual([[SFX.ENERGY_DEPLETED]]);

    soundtrack.onEvent({ type: 'GameLost' });
    // El latido de la derrota espera a que caiga el sonido de drenaje.
    expect(audioPlay.mock.calls).toEqual([[SFX.ENERGY_DEPLETED]]);

    const loseTimers = fake.timers.filter(t => t.delayMs === LOSE_AFTER_DEPLETED_DELAY_MS);
    expect(loseTimers).toHaveLength(1);
    loseTimers[0].callback();
    expect(audioPlay.mock.calls).toEqual([[SFX.ENERGY_DEPLETED], [SFX.LOSE]]);
  });

  it('GameLost sin EnergyDepleted reproduce sfx-lose inmediato', () => {
    soundtrack.onEvent({ type: 'GameLost' });
    expect(audioPlay.mock.calls).toEqual([[SFX.LOSE]]);
    expect(fake.activeTimers()).toHaveLength(0);
  });

  it('GameRevived reproduce sfx-revive y cancela el lose pendiente', () => {
    soundtrack.onEvent({ type: 'EnergyDepleted' });
    soundtrack.onEvent({ type: 'GameLost' });
    soundtrack.onEvent({ type: 'GameRevived', energyPercentage: 60 });

    expect(audioPlay.mock.calls).toEqual([[SFX.ENERGY_DEPLETED], [SFX.REVIVE]]);

    // Disparamos todos los timers que queden vivos: el de lose ya fue
    // cancelado por el revive, así que no puede sonar sfx-lose.
    fake.activeTimers().forEach(t => t.callback());
    expect(audioPlay.mock.calls).not.toContainEqual([SFX.LOSE]);
  });

  it('stop() cancela el latido y el lose pendiente (SHUTDOWN)', () => {
    soundtrack.onEvent(cardOpened(20)); // arma latido
    soundtrack.onEvent({ type: 'EnergyDepleted' });
    soundtrack.onEvent({ type: 'GameLost' }); // arma lose

    soundtrack.stop();
    expect(fake.activeTimers()).toHaveLength(0);
  });

  it('CardOpened con 20% reproduce latido inmediato y otro al disparar el timer', () => {
    soundtrack.onEvent(cardOpened(20));
    expect(audioPlay.mock.calls).toEqual([[SFX.HEARTBEAT]]);
    expect(fake.activeTimers()).toHaveLength(1);
    expect(fake.activeTimers()[0].delayMs).toBe(HEARTBEAT_INTERVAL_MS);

    fake.activeTimers()[0].callback();
    expect(audioPlay.mock.calls).toEqual([[SFX.HEARTBEAT], [SFX.HEARTBEAT]]);
  });

  it('CardOpened con 80% no reproduce nada ni arma timers', () => {
    soundtrack.onEvent(cardOpened(80));
    expect(audioPlay).not.toHaveBeenCalled();
    expect(fake.timers).toHaveLength(0);
  });

  it('GameWon detiene el latido (el timer posterior no reproduce)', () => {
    soundtrack.onEvent(cardOpened(20));
    soundtrack.onEvent({ type: 'GameWon', finalAmount: 1000 });

    const heartbeatTimers = fake.timers.filter(t => t.delayMs === HEARTBEAT_INTERVAL_MS);
    expect(heartbeatTimers).toHaveLength(1);
    heartbeatTimers[0].callback(); // disparo tardío: el loop ya se frenó

    expect(audioPlay.mock.calls).toEqual([[SFX.HEARTBEAT], [SFX.WIN]]);
  });

  it('GameLost detiene el latido (el timer posterior no reproduce)', () => {
    soundtrack.onEvent(cardOpened(20));
    soundtrack.onEvent({ type: 'GameLost' });

    const heartbeatTimers = fake.timers.filter(t => t.delayMs === HEARTBEAT_INTERVAL_MS);
    expect(heartbeatTimers).toHaveLength(1);
    heartbeatTimers[0].callback();

    expect(audioPlay.mock.calls).toEqual([[SFX.HEARTBEAT], [SFX.LOSE]]);
  });

  it('EnergyTankUpgraded re-evalúa el latido contra el nuevo porcentaje', () => {
    soundtrack.onEvent({ type: 'EnergyTankUpgraded', capacityMultiplier: 1.25, energyPercentage: 20 });
    expect(audioPlay.mock.calls).toEqual([[SFX.HEARTBEAT]]);
    expect(fake.activeTimers()).toHaveLength(1);
  });

  it('sin audio (undefined) ningún evento explota', () => {
    const silent = new GameplaySoundtrack(undefined, fake.scheduler);
    expect(() => {
      silent.onEvent(cardOpened(20));
      silent.onEvent({ type: 'EnergyDepleted' });
      silent.onEvent({ type: 'GameLost' });
      silent.onEvent({ type: 'GameRevived', energyPercentage: 60 });
      silent.onEvent({ type: 'GameWon', finalAmount: 100 });
      silent.stop();
    }).not.toThrow();
  });
});
