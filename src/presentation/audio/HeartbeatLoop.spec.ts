import { HeartbeatLoop } from './HeartbeatLoop';
import { HEARTBEAT_INTERVAL_MS, HEARTBEAT_FAST_INTERVAL_MS } from './GameplaySfx';
import { createFakeScheduler } from './testing/fakeScheduler';

describe('HeartbeatLoop', () => {
  let play: jest.Mock;
  let fake: ReturnType<typeof createFakeScheduler>;
  let loop: HeartbeatLoop;

  beforeEach(() => {
    play = jest.fn();
    fake = createFakeScheduler();
    loop = new HeartbeatLoop(play, fake.scheduler);
  });

  it('update(50) no reproduce ni arma timer (fuera de zona crítica)', () => {
    loop.update(50);
    expect(play).not.toHaveBeenCalled();
    expect(fake.timers).toHaveLength(0);
  });

  it('update(20) reproduce de una y arma el timer de HEARTBEAT_INTERVAL_MS', () => {
    loop.update(20);
    expect(play).toHaveBeenCalledTimes(1);
    expect(fake.activeTimers()).toHaveLength(1);
    expect(fake.activeTimers()[0].delayMs).toBe(HEARTBEAT_INTERVAL_MS);
  });

  it('el tick del timer reproduce y re-arma el bucle', () => {
    loop.update(20);
    const first = fake.activeTimers()[0];
    first.callback();
    expect(play).toHaveBeenCalledTimes(2);
    // Re-armado: sigue habiendo UN timer vivo de HEARTBEAT_INTERVAL_MS
    // (el anterior quedó consumido al dispararse).
    expect(fake.activeTimers()).toHaveLength(1);
    expect(fake.activeTimers()[0].delayMs).toBe(HEARTBEAT_INTERVAL_MS);
  });

  it('update(20) con timer activo del MISMO intervalo es no-op', () => {
    loop.update(20);
    loop.update(20);
    expect(play).toHaveBeenCalledTimes(1);
    expect(fake.activeTimers()).toHaveLength(1);
  });

  it('update(10) con bucle a 900 cancela y re-arm a 650 sin play extra', () => {
    loop.update(20);
    loop.update(10);
    // Sin play inmediato: el latido ya sonaba con el intervalo anterior.
    expect(play).toHaveBeenCalledTimes(1);
    expect(fake.activeTimers()).toHaveLength(1);
    expect(fake.activeTimers()[0].delayMs).toBe(HEARTBEAT_FAST_INTERVAL_MS);
    // El timer viejo de HEARTBEAT_INTERVAL_MS quedó cancelado.
    expect(fake.timers.filter(t => t.delayMs === HEARTBEAT_INTERVAL_MS).every(t => t.cancelled)).toBe(true);
  });

  it('update(50) cancela todo (sale de zona crítica)', () => {
    loop.update(20);
    loop.update(50);
    expect(fake.activeTimers()).toHaveLength(0);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('stop() cancela el timer activo y limpia estado', () => {
    loop.update(20);
    loop.stop();
    expect(fake.activeTimers()).toHaveLength(0);

    // Tras stop, volver a entrar a zona crítica vuelve a sonar de una.
    loop.update(20);
    expect(play).toHaveBeenCalledTimes(2);
    expect(fake.activeTimers()).toHaveLength(1);
  });
});
