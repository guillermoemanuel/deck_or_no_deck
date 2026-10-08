import { CAPPED_GAMES_DURATION, CAPPED_OFFER_VALUES, FIRST_ROUND_STREAK_TRIGGER } from './BankerPolicy';

/**
 * Desenlace de una partida NO diaria y NO abandonada, tal como lo necesita
 * la regla anti-farmeo (ADR-014):
 *
 * - `firstRoundDealAccepted`: la partida terminó con un trato aceptado en
 *   la 1ª ronda (ronda del ofrecimiento === 1).
 * - `rejectedRound1Offer`: el jugador VIO la oferta de la 1ª ronda y la
 *   rechazó ("superó la 1ª oferta"). Falso si perdió por energía antes de
 *   la 1ª oferta (cartas 1 a 3) o si aceptó esa misma oferta.
 */
export interface FirstRoundDealGameOutcome {
  readonly firstRoundDealAccepted: boolean;
  readonly rejectedRound1Offer: boolean;
}

/**
 * Estado de la regla anti-farmeo de la 1ª ronda (ADR-014), persistido con
 * el progreso del jugador:
 *
 * - `consecutiveFirstRoundDeals` (0..3): tratos de 1ª ronda seguidos con
 *   la regla inactiva. Al llegar a FIRST_ROUND_STREAK_TRIGGER se activa la
 *   regla, se resetea a 0 y quedan CAPPED_GAMES_DURATION partidas topadas —
 *   por eso el trigger NUNCA se persiste.
 * - `cappedGamesRemaining` (0..5): partidas que quedan con la oferta de la
 *   1ª ronda topada. 0 = regla inactiva.
 *
 * Value object inmutable: cada transición devuelve una instancia nueva.
 */
export class FirstRoundDealStreak {
  /** Estado por defecto de un jugador nuevo (y el que se usa en el Desafío Diario). */
  static readonly INACTIVE = new FirstRoundDealStreak(0, 0);

  constructor(
    readonly consecutiveFirstRoundDeals: number,
    readonly cappedGamesRemaining: number
  ) {
    if (
      !Number.isInteger(consecutiveFirstRoundDeals) ||
      consecutiveFirstRoundDeals < 0 ||
      consecutiveFirstRoundDeals >= FIRST_ROUND_STREAK_TRIGGER
    ) {
      throw new Error(`consecutiveFirstRoundDeals must be an integer in [0, ${FIRST_ROUND_STREAK_TRIGGER - 1}]`);
    }
    if (!Number.isInteger(cappedGamesRemaining) || cappedGamesRemaining < 0 || cappedGamesRemaining > CAPPED_GAMES_DURATION) {
      throw new Error(`cappedGamesRemaining must be an integer in [0, ${CAPPED_GAMES_DURATION}]`);
    }
  }

  /** Regla vigente: hay partidas con la oferta de la 1ª ronda topada. */
  get isActive(): boolean {
    return this.cappedGamesRemaining > 0;
  }

  /**
   * Carga desde persistencia: ausentes, corruptos o fuera de rango => 0
   * (carga retrocompatible con saves anteriores al esquema v5 — ver
   * LocalStorageProgressionRepository.migrateIfNeeded).
   */
  static restore(consecutive: unknown, remaining: unknown): FirstRoundDealStreak {
    const safeInt = (value: unknown, max: number): number =>
      Number.isInteger(value) && (value as number) >= 0 && (value as number) <= max ? (value as number) : 0;
    return new FirstRoundDealStreak(
      safeInt(consecutive, FIRST_ROUND_STREAK_TRIGGER - 1),
      safeInt(remaining, CAPPED_GAMES_DURATION)
    );
  }

  /**
   * Aplica el desenlace de una partida a la regla (ADR-014):
   *
   * 1. Con la regla INACTIVA: un trato de 1ª ronda aceptado suma a la racha;
   *    al llegar al trigger se activa la regla y la racha vuelve a 0.
   * 2. Con la regla INACTIVA: cualquier otro desenlace resetea la racha.
   * 3. Con la regla ACTIVA: la racha no se acumula; la cuenta regresiva solo
   *    baja si el jugador rechazó la oferta topada de la 1ª ronda (aceptarla
   *    o perder antes de verla no la reduce).
   */
  withGameEnd(outcome: FirstRoundDealGameOutcome): FirstRoundDealStreak {
    if (this.isActive) {
      if (!outcome.rejectedRound1Offer) {
        return this;
      }
      return new FirstRoundDealStreak(0, this.cappedGamesRemaining - 1);
    }

    if (!outcome.firstRoundDealAccepted) {
      return FirstRoundDealStreak.INACTIVE;
    }
    const nextStreak = this.consecutiveFirstRoundDeals + 1;
    if (nextStreak >= FIRST_ROUND_STREAK_TRIGGER) {
      return new FirstRoundDealStreak(0, CAPPED_GAMES_DURATION);
    }
    return new FirstRoundDealStreak(nextStreak, 0);
  }

  /**
   * Sortea el tope de la oferta de la 1ª ronda: una muestra uniforme en
   * [0,1) del generador INYECTADO (mismo que el ruido de la oferta, ver
   * GameSessionFactory) mapeada sobre CAPPED_OFFER_VALUES.
   */
  static drawCappedOfferValue(sample: number): number {
    if (!(sample >= 0 && sample < 1)) {
      throw new Error('drawCappedOfferValue sample must be in [0,1)');
    }
    return CAPPED_OFFER_VALUES[Math.floor(sample * CAPPED_OFFER_VALUES.length)];
  }
}
