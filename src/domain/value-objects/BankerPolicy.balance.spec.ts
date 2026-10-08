/**
 * Spec de equilibrio (ADR-013): simula miles de partidas REALES —
 * GameSession, EnergyDeltaTable y OfferCalculator de verdad, sin lógica
 * duplicada — con semillas fijas, para verificar que la política de
 * `BankerPolicy.ts` produce el dilema deal/no deal:
 *
 *  - jugar más cartas gana en EV a costa de subir la tasa de derrotas;
 *  - ninguna estrategia de "aceptar si la oferta parece buena" domina a
 *    jugar hasta el final con el ruido real de la política (±20 %);
 *  - con un ruido más fino (±10 %) aceptar cuando la oferta es ≥ 90 %
 *    del promedio tampoco supera a nunca aceptar.
 *
 * Determinista: semillas fijas → siempre los mismos números entre
 * corridas. Los rangos de este spec son invariantes duras de AGENTS §4:
 * si fallan, primero el test rojo y después el código.
 *
 * La EV se calcula NETA de la penalidad real (`LOSS_PENALTY_AMOUNT`),
 * incluida la derrota por agotamiento de energía.
 */
import { GameSession, DefaultEnergyDrainRule } from '../entities/GameSession';
import { Card } from '../entities/Card';
import { Banker } from '../services/Banker';
import { OfferCalculator } from '../services/OfferCalculator';
import { CASE_VALUES } from './CaseValues';
import { createSeededRandom } from './DailyBoard';
import { LOSS_PENALTY_AMOUNT } from './GamePenalties';
import { OFFER_NOISE } from './BankerPolicy';

jest.setTimeout(600000);

/** ≥ 5000 partidas exigidas por la política; determinista con semillas fijas. */
const N_GAMES = 50000;
const BASE_SEED = 0x5eed2026;

interface GamePlan {
  /** Cartas del tablero (12, sin la secreta) — datos planos para reconstruirlas por corrida. */
  readonly board: ReadonlyArray<{ readonly id: string; readonly value: number }>;
  /** ids del tablero en el orden en que se abren (aleatorio sembrado). */
  readonly openingOrder: readonly string[];
  readonly secretValue: number;
  /** Una muestra de ruido por oferta (máximo 3 por partida: rondas 1, 2 y 3). */
  readonly noiseSamples: readonly number[];
}

function shuffle<T>(items: readonly T[], rnd: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

function buildPlan(seed: number): GamePlan {
  const rnd = createSeededRandom(seed);
  const values = shuffle(CASE_VALUES, rnd);
  const secretIndex = Math.floor(rnd() * CASE_VALUES.length);
  const boardValues = values.filter((_, i) => i !== secretIndex);
  const board = boardValues.map((value, i) => ({ id: `card_${i}`, value }));
  return {
    board,
    openingOrder: shuffle(board.map(c => c.id), rnd),
    secretValue: values[secretIndex],
    noiseSamples: [rnd(), rnd(), rnd()]
  };
}

const PLANS: GamePlan[] = Array.from({ length: N_GAMES }, (_, i) => buildPlan(BASE_SEED + i * 7919));

interface Outcome {
  readonly prize: number;
  readonly defeated: boolean;
}

/** Decide si se acepta la oferta de la ronda dada (promedio de las cartas cerradas actuales). */
type OfferPredicate = (offer: number, average: number, round: number) => boolean;

function play(
  plan: GamePlan,
  acceptIf: OfferPredicate,
  transformSample: (u: number) => number = u => u
): Outcome {
  const boardCards = plan.board.map(c => Card.create(c.id, c.value, false));
  let noiseIndex = 0;
  // El generador lo consume OfferCalculator: UNA muestra por oferta.
  const generator = () => transformSample(plan.noiseSamples[noiseIndex++]);
  const session = new GameSession(
    boardCards,
    Card.create('secret', plan.secretValue, true),
    new Banker(new OfferCalculator(generator)),
    new DefaultEnergyDrainRule()
  );

  let round = 0;
  for (const id of plan.openingOrder) {
    const result = session.openCard(id);

    if (session.getStatus() === 'lost') {
      return { prize: 0, defeated: true };
    }
    if (result.isLastCard) {
      return { prize: result.secretCard?.value ?? plan.secretValue, defeated: false };
    }
    if (result.offer !== null) {
      round += 1;
      const closed = session.getClosedCards().map(c => c.value);
      const average = closed.reduce((sum, v) => sum + v, 0) / closed.length;
      if (acceptIf(result.offer.amount, average, round)) {
        return { prize: session.acceptDeal(), defeated: false };
      }
      session.rejectDeal();
    }
  }
  throw new Error('La simulación terminó sin victoria ni derrota');
}

const STRATEGIES = {
  acceptFirst: (_offer: number, _average: number, round: number) => round === 1,
  acceptSecond: (_offer: number, _average: number, round: number) => round === 2,
  acceptThird: (_offer: number, _average: number, round: number) => round === 3,
  never: () => false,
  threshold90: (offer: number, average: number) => offer >= 0.9 * average
} satisfies Record<string, OfferPredicate>;

interface SimulationResult {
  readonly ev: number;
  readonly defeatRate: number;
}

const results = new Map<string, SimulationResult>();

function simulate(
  strategy: OfferPredicate,
  label: string,
  transformSample?: (u: number) => number
): SimulationResult {
  const cached = results.get(label);
  if (cached !== undefined) {
    return cached;
  }

  let total = 0;
  let defeated = 0;
  for (const plan of PLANS) {
    const outcome = play(plan, strategy, transformSample);
    total += outcome.prize - (outcome.defeated ? LOSS_PENALTY_AMOUNT : 0);
    if (outcome.defeated) {
      defeated += 1;
    }
  }
  const computed: SimulationResult = {
    ev: total / PLANS.length,
    defeatRate: defeated / PLANS.length
  };
  results.set(label, computed);
  return computed;
}

/** Muestrea el ruido de la política (±OFFER_NOISE) y lo comprime a ±0.10. */
const effectiveNoise10 = (u: number): number => 0.5 + (u - 0.5) * (0.1 / OFFER_NOISE);

describe('BankerPolicy.balance — equilibrio de la política del banquero (ADR-013)', () => {
  // Simulación de referencia del rebalance (penalidad −1000 real, misma
  // política): el spec tolera ±6 % por diferencias de muestreo.
  const REFERENCE_EV = {
    acceptFirst: 2370,
    acceptSecond: 2531,
    acceptThird: 2749,
    never: 2801
  };
  const TOLERANCE = 0.06;

  function expectWithinTolerance(ev: number, reference: number): void {
    expect(ev).toBeGreaterThanOrEqual(reference * (1 - TOLERANCE));
    expect(ev).toBeLessThanOrEqual(reference * (1 + TOLERANCE));
  }

  it('el orden de EVs es el dilema: 1ª < 2ª < 3ª ≤ nunca, cada una dentro de ±6 % de la referencia', () => {
    const first = simulate(STRATEGIES.acceptFirst, 'acceptFirst');
    const second = simulate(STRATEGIES.acceptSecond, 'acceptSecond');
    const third = simulate(STRATEGIES.acceptThird, 'acceptThird');
    const never = simulate(STRATEGIES.never, 'never');

    // Dirección del dilema: cada carta abierta extra gana en promedio.
    expect(first.ev).toBeLessThan(second.ev);
    expect(second.ev).toBeLessThan(third.ev);
    expect(third.ev).toBeLessThanOrEqual(never.ev);

    // Valores absolutos contra la simulación de referencia (±6 %).
    expectWithinTolerance(first.ev, REFERENCE_EV.acceptFirst);
    expectWithinTolerance(second.ev, REFERENCE_EV.acceptSecond);
    expectWithinTolerance(third.ev, REFERENCE_EV.acceptThird);
    expectWithinTolerance(never.ev, REFERENCE_EV.never);

    // Resumen de la corrida: si un rango falla, los números quedan a la vista.
    console.info(
      `[balance] EVs 1ª=${first.ev.toFixed(1)} 2ª=${second.ev.toFixed(1)} 3ª=${third.ev.toFixed(1)} ` +
        `nunca=${never.ev.toFixed(1)} · derrotas 1ª=${(first.defeatRate * 100).toFixed(1)}% ` +
        `nunca=${(never.defeatRate * 100).toFixed(1)}%`
    );
  });

  it('aceptar la 1ª oferta conserva al menos el 75 % del EV de la mejor estrategia', () => {
    const first = simulate(STRATEGIES.acceptFirst, 'acceptFirst');
    const best = Math.max(
      first.ev,
      simulate(STRATEGIES.acceptSecond, 'acceptSecond').ev,
      simulate(STRATEGIES.acceptThird, 'acceptThird').ev,
      simulate(STRATEGIES.never, 'never').ev
    );

    expect(first.ev / best).toBeGreaterThanOrEqual(0.75);
  });

  it('tasas de derrota en rango: jugar hasta el final 22–30 %, aceptando la 1ª 3–9 %', () => {
    const first = simulate(STRATEGIES.acceptFirst, 'acceptFirst');
    const never = simulate(STRATEGIES.never, 'never');

    expect(never.defeatRate).toBeGreaterThanOrEqual(0.22);
    expect(never.defeatRate).toBeLessThanOrEqual(0.3);
    expect(first.defeatRate).toBeGreaterThanOrEqual(0.03);
    expect(first.defeatRate).toBeLessThanOrEqual(0.09);
  });

  it('con ruido efectivo ±10 %, "oferta ≥ 90 % del promedio" NO supera a "nunca aceptar"', () => {
    const threshold = simulate(STRATEGIES.threshold90, 'threshold90@noise10', effectiveNoise10);
    const never = simulate(STRATEGIES.never, 'never');

    console.info(`[balance] thr90@ruido±10% = ${threshold.ev.toFixed(1)} vs nunca = ${never.ev.toFixed(1)}`);
    expect(threshold.ev).toBeLessThanOrEqual(never.ev);
  });
});
