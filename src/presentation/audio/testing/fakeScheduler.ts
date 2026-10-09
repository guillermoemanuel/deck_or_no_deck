import { HeartbeatScheduler } from '../HeartbeatLoop';

export interface FakeTimer {
  delayMs: number;
  callback: () => void;
  cancelled: boolean;
}

/**
 * Scheduler falso con temporizador para specs de latido/sonido (sin Phaser).
 * Compartido por HeartbeatLoop.spec y GameplaySoundtrack.spec — vivir en un
 * solo archivo evita la copia N+1 del helper (PLAYBOOK §1).
 */
export function createFakeScheduler() {
  const timers: FakeTimer[] = [];
  const scheduler: HeartbeatScheduler = {
    add(delayMs: number, callback: () => void): () => void {
      const timer: FakeTimer = { delayMs, callback: () => undefined, cancelled: false };
      // Disparar el timer lo consume (igual que un delayedCall de Phaser
      // que ya se ejecutó): deja de estar activo y ejecuta el callback real.
      timer.callback = () => {
        if (timer.cancelled) return;
        timer.cancelled = true;
        callback();
      };
      timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    }
  };
  const activeTimers = (): FakeTimer[] => timers.filter(t => !t.cancelled);
  return { scheduler, timers, activeTimers };
}
