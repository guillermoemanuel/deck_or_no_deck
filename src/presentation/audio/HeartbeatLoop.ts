import { heartbeatIntervalFor } from './GameplaySfx';

/**
 * Adaptador de temporización: en producción es un wrapper sobre
 * `scene.time.delayedCall()` (ver GameSceneController), en tests un scheduler
 * falso. Devuelve siempre una función `cancel()`.
 */
export interface HeartbeatScheduler {
  add(delayMs: number, callback: () => void): () => void;
}

/**
 * Bucle de latido del corazón: reproduce `play` a intervalos decrecientes
 * mientras el porcentaje de energía esté en zona crítica.
 *
 * Módulo puro, sin Phaser — toda la mecánica de umbrales vive en
 * `GameplaySfx.heartbeatIntervalFor()`.
 */
export class HeartbeatLoop {
  private cancelCurrent: (() => void) | null = null;
  private currentInterval: number | null = null;
  // Token de vigencia: invalida ticks de timers cancelados o re-armados
  // (defensa si el scheduler llegara a disparar un callback ya removido).
  private token = 0;

  constructor(
    private readonly play: () => void,
    private readonly scheduler: HeartbeatScheduler
  ) {}

  /**
   * Sincroniza el bucle con el nuevo porcentaje de energía.
   *
   * Semántica:
   * - fuera de zona crítica → `stop()`;
   * - sin timer activo → reproduce YA y arma el timer (el primer latido es
   *   inmediato a propósito: el jugador debe sentir el cambio al cruzar el
   *   umbral, no esperar un intervalo entero para notarlo);
   * - timer activo con el MISMO intervalo → no-op;
   * - timer activo con OTRO intervalo → cancela y re-arma sin play extra
   *   (el latido anterior ya sonó recién).
   */
  update(percentage: number): void {
    const interval = heartbeatIntervalFor(percentage);
    if (interval === null) {
      this.stop();
      return;
    }
    const hasTimer = this.cancelCurrent !== null;
    if (hasTimer && this.currentInterval === interval) return;
    if (hasTimer) {
      this.token++;
      this.cancelCurrent?.();
      this.cancelCurrent = null;
    }
    this.arm(interval, !hasTimer);
  }

  /** Cancela el timer activo (si existe) y limpia el estado interno. */
  stop(): void {
    this.token++;
    this.cancelCurrent?.();
    this.cancelCurrent = null;
    this.currentInterval = null;
  }

  private arm(interval: number, playFirst: boolean): void {
    if (playFirst) this.play();
    const token = ++this.token;
    this.currentInterval = interval;
    this.cancelCurrent = this.scheduler.add(interval, () => {
      // Timer cancelado/re-armado en el medio: su tick ya no corresponde.
      if (token !== this.token) return;
      // Tick del bucle: suena y re-arma con el MISMO intervalo — el timer
      // que se acaba de disparar ya no puede cancelarse, por eso se limpia
      // el handle antes de volver a armar.
      this.play();
      this.cancelCurrent = null;
      this.arm(interval, false);
    });
  }
}
