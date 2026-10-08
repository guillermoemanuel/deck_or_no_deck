import { Card } from '../entities/Card';
import {
  OFFER_MAX_RATIO,
  OFFER_MIN_RATIO,
  OFFER_NOISE,
  OFFER_ROUND_FACTORS
} from '../value-objects/BankerPolicy';

/**
 * Calcula la oferta del Banquero con la política de `BankerPolicy.ts`
 * (ADR-013):
 *
 *   oferta = round(clamp(promedio × factor[ronda] × (1 + ruido) × (1 + bono),
 *                         0.5 × promedio, 1.2 × promedio))
 *
 * - `promedio` es el de las cartas CERRADAS del tablero — la carta secreta
 *   ya no participa del cálculo (antes se mezclaba con peso 0.2).
 * - `ruido` uniforme en ±OFFER_NOISE (±20 %): UNA muestra por oferta del
 *   generador inyectado por constructor, nunca `Math.random()` en dominio.
 * - El bono del "Negociador" (+15 %) se aplica ANTES del clamp.
 *
 * El generador llega por constructor para que la partida normal use
 * `IRandomProvider.nextFloat()` (crypto) y el Desafío Diario una semilla
 * del día (ver `DailyBoard.createDailyBankerRandom`): misma fecha, mismas
 * muestras para todos los jugadores.
 */
export class OfferCalculator {
  constructor(private readonly random: () => number) {}

  calculate(closedCards: Card[], roundNumber: number, negotiatorBonusPercentage = 0): number {
    if (closedCards.length === 0) {
      throw new Error('Cannot calculate offer with no closed cards remaining');
    }
    if (negotiatorBonusPercentage < 0) {
      throw new Error('negotiatorBonusPercentage cannot be negative');
    }

    const sample = this.random();
    if (!(sample >= 0 && sample < 1)) {
      throw new Error('OfferCalculator random generator must return a value in [0,1)');
    }

    const boardAverage = this.average(closedCards.map(c => c.value));
    const factor = OfferCalculator.factorForRound(roundNumber);
    const noise = (sample - 0.5) * 2 * OFFER_NOISE;

    const rawOffer = boardAverage * factor * (1 + noise) * (1 + negotiatorBonusPercentage);

    const clamped = Math.min(
      Math.max(rawOffer, OFFER_MIN_RATIO * boardAverage),
      OFFER_MAX_RATIO * boardAverage
    );
    return Math.round(clamped);
  }

  /** Rondas 1..3 → factores de la tabla; fuera de rango → primer/último factor. */
  private static factorForRound(roundNumber: number): number {
    const clamped = Math.min(Math.max(Math.trunc(roundNumber), 1), OFFER_ROUND_FACTORS.length);
    return OFFER_ROUND_FACTORS[clamped - 1];
  }

  private average(values: number[]): number {
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }
}
