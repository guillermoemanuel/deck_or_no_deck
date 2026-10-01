import type { RewardedAdStatus } from '../../domain/ports/ICrazyGamesService';

/**
 * Estado del cooldown de rewarded que produce este tracker (subconjunto de
 * `RewardedAdStatus` — el dominio define la unión, acá solo se reporta).
 */
export type RewardCooldownState = Extract<RewardedAdStatus, 'cooldown_no_fill' | 'cooldown_retryable'>;

/**
 * Motivo del rewarded que falló y que armó el cooldown:
 * - `'no_fill'`: fallo AMBIENTAL (el SDK no tuvo anuncio para servir).
 * - `'other'`: cualquier otro fallo — error del SDK, timeout o
 *   cancelación del propio jugador.
 */
export type RewardCooldownFailure = 'no_fill' | 'other';

/**
 * Semántica del cooldown de rewarded ads (60 s) con su motivo, extraída de
 * `CrazyGamesService` para ser la FUENTE ÚNICA de este comportamiento.
 *
 * Causa raíz: la política de reembolso al consumir una mejora comprada
 * (ADR-006 enmendado) depende de DISTINGUIR el motivo del cooldown —
 * `cooldown_no_fill` se reembolsa (fallo ambiental, reintentar no promete
 * nada) mientras que `cooldown_retryable` NO se reembolsa (un fallo
 * autoinfligido como la cancelación del jugador no puede generar
 * reembolso). Próximamente un SEGUNDO adapter de ads (anuncio propio con
 * countdown para portales externos) necesita producir estados IDÉNTICOS:
 * duplicar el cooldown en cada adapter haría divergir la política de
 * reembolso entre plataformas, así que ambos delegan acá.
 *
 * El reloj se inyecta (`now`) para que los specs no dependan de
 * `Date.now`; por defecto usa el reloj real, igual que el adapter.
 * Clase sin estado observable afuera de su API: no lanza nunca.
 */
export class RewardCooldownTracker {
  /** Tras un rewarded fallido, no se ofrecen acciones con rewarded durante este lapso. */
  static readonly COOLDOWN_MS = 60000;

  private readonly now: () => number;
  /** `0` = sin cooldown activo; `now() >= blockedUntil` = ventana vencida. */
  private blockedUntil = 0;
  /**
   * Motivo del último fallo (o `null` si nunca falló / el último fue
   * exitoso). Solo tiene sentido mientras la ventana está activa: un
   * éxito lo limpia junto con el cooldown para que el estado observado
   * sea exactamente `'available'`, sin motivo residual.
   */
  private lastFailure: RewardCooldownFailure | null = null;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  /**
   * Éxito del rewarded: limpia el cooldown Y el motivo — el estado vuelve
   * a `null` (disponible) sin avanzar el reloj, y un fallo posterior
   * arranca una ventana nueva con SU motivo.
   */
  noteSuccess(): void {
    this.blockedUntil = 0;
    this.lastFailure = null;
  }

  /**
   * Fallo del rewarded: arma la ventana de 60 s (completa desde ESTE
   * instante, aunque ya hubiera otro cooldown activo) y registra el
   * motivo que decide la política de reembolso (ADR-006).
   */
  noteFailure(kind: RewardCooldownFailure): void {
    this.blockedUntil = this.now() + RewardCooldownTracker.COOLDOWN_MS;
    this.lastFailure = kind;
  }

  /**
   * Estado del cooldown AHORA: `'cooldown_no_fill'` / `'cooldown_retryable'`
   * mientras la ventana siga abierta, o `null` si no hay cooldown (nunca
   * falló, último resultado exitoso, o la ventana ya venció — el cooldown
   * SIEMPRE vence, nunca es permanente).
   */
  cooldownState(): RewardCooldownState | null {
    if (this.now() < this.blockedUntil) {
      return this.lastFailure === 'no_fill' ? 'cooldown_no_fill' : 'cooldown_retryable';
    }
    return null;
  }
}
