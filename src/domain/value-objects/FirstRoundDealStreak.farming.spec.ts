/**
 * Simulación de granjero (ADR-014): mide el EFECTO ECONÓMICO de la regla
 * anti-farmeo con semillas fijas sobre partidas REALES (GameSession,
 * EnergyDeltaTable y OfferCalculator de verdad — mismo molde que
 * BankerPolicy.balance.spec.ts, sin lógica duplicada del dominio).
 *
 * Tres corridas sobre los MISMOS planes:
 *
 *  1. Granjero SIN regla: acepta la oferta de la 1ª ronda siempre.
 *     Referencia del farmeo clásico (≈ 798 monedas por carta abierta).
 *  2. Granjero CON regla: acepta la 1ª hasta quedar topado y mientras
 *     dure la cuenta regresiva rechaza la topada y acepta la 2ª ronda.
 *     Rango exigido: 480–620 monedas por carta (el farmeo queda
 *     diluido a mitad, sin matarlo).
 *  3. Granjero con p=0.7 de aceptar la 1ª (y que jamás acepta una
 *     oferta topada de 1–10 monedas): entre 27 % y 37 % de las partidas
 *     se juegan con la regla activa.
 *
 * Además valida el invariante del cap: TODA oferta de la 1ª ronda
 * emitida con la regla activa pertenece a CAPPED_OFFER_VALUES (el
 * promedio natural de 9 cartas cerradas nunca baja de ~150, así que
 * min(natural, cap) = cap siempre).
 *
 * Determinista: semillas fijas → siempre los mismos números entre corridas.
 */
import { GameSession, DefaultEnergyDrainRule } from '../entities/GameSession';
import { Card } from '../entities/Card';
import { Banker } from '../services/Banker';
import { OfferCalculator } from '../services/OfferCalculator';
import { CASE_VALUES } from './CaseValues';
import { createSeededRandom } from './DailyBoard';
import { LOSS_PENALTY_AMOUNT } from './GamePenalties';
import { CAPPED_OFFER_VALUES } from './BankerPolicy';
import { FirstRoundDealStreak, FirstRoundDealGameOutcome } from './FirstRoundDealStreak';

jest.setTimeout(600000);

/** 20000 partidas por corrida: error estándar del % topadas ≈ 0.3 %. */
const N_GAMES = 20000;
const BASE_SEED = 0x4f21a001;
/** Probabilidad del granjero "normal" de aceptar la oferta de la 1ª ronda. */
const ACCEPT_ROUND_1_PROB = 0.7;

interface FarmPlan {
  /** CASE_VALUES barajados: values[secretIndex] sale del tablero. */
  readonly values: readonly number[];
  readonly secretIndex: number;
  /** ids del tablero en el orden en que se abren (aleatorio sembrado). */
  readonly openingOrder: readonly string[];
  readonly secretValue: number;
  /** Una muestra de ruido por oferta (máximo 3 por partida: rondas 1-3). */
  readonly noiseSamples: readonly number[];
  /** Muestra extra para el sorteo del cap — solo se consume si la regla está activa. */
  readonly capSample: number;
  /** Dado de aceptación de la 1ª ronda para la corrida con p=0.7. */
  readonly acceptRoll: number;
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

function buildPlan(seed: number): FarmPlan {
  const rnd = createSeededRandom(seed);
  const values = shuffle(CASE_VALUES, rnd);
  const secretIndex = Math.floor(rnd() * values.length);
  // ids renumerados como los arma GameSessionFactory: `card_${índice original}`.
  const boardIds = values.map((_, i) => i).filter(i => i !== secretIndex).map(i => `card_${i}`);
  return {
    values,
    secretIndex,
    openingOrder: shuffle(boardIds, rnd),
    secretValue: values[secretIndex],
    noiseSamples: [rnd(), rnd(), rnd()],
    capSample: rnd(),
    acceptRoll: rnd()
  };
}

const PLANS: FarmPlan[] = Array.from({ length: N_GAMES }, (_, i) => buildPlan(BASE_SEED + i * 7919));

/** true = acepta la oferta de la ronda dada. */
type Decision = (ctx: { round: number; active: boolean; acceptRoll: number }) => boolean;

/** Acepta la 1ª siempre que la regla esté inactiva; con la regla activa espera a la 2ª. */
const DECIDE_FARMER: Decision = ({ round, active }) => (round === 1 ? !active : true);

/** Acepta la 1ª con p=0.7 si la regla está inactiva; una oferta topada (1–10) jamás. */
const DECIDE_FARMER_P70: Decision = ({ round, active, acceptRoll }) =>
  round === 1 ? !active && acceptRoll < ACCEPT_ROUND_1_PROB : true;

interface GameResult {
  /** Premio ganado, o -LOSS_PENALTY_AMOUNT si la energía se agotó. */
  readonly coins: number;
  readonly cardsOpened: number;
  readonly outcome: FirstRoundDealGameOutcome;
  readonly activeAtStart: boolean;
  /** Ofertas de la 1ª ronda vistas con la regla activa (para validar el cap). */
  readonly cappedRound1Offers: readonly number[];
}

function playGame(plan: FarmPlan, streak: FirstRoundDealStreak, decide: Decision): GameResult {
  const activeAtStart = streak.isActive;
  // Misma secuencia que arma GameSessionFactory: sorteo del cap PRIMERO
  // (solo si activo) y después el ruido de cada oferta.
  const samples = activeAtStart ? [plan.capSample, ...plan.noiseSamples] : [...plan.noiseSamples];
  const nextSample = (): number => {
    const value = samples.shift();
    if (value === undefined) throw new Error('sin muestras de ruido disponibles');
    return value;
  };
  const cap = activeAtStart ? FirstRoundDealStreak.drawCappedOfferValue(nextSample()) : null;
  const boardCards = plan.values
    .map((value, i) => (i === plan.secretIndex ? null : Card.create(`card_${i}`, value, false)))
    .filter((card): card is Card => card !== null);
  const session = new GameSession(
    boardCards,
    Card.create(`card_${plan.secretIndex}`, plan.secretValue, true),
    new Banker(new OfferCalculator(nextSample, cap)),
    new DefaultEnergyDrainRule()
  );

  let cardsOpened = 0;
  let sawRound1 = false;
  const cappedRound1Offers: number[] = [];

  for (const id of plan.openingOrder) {
    const result = session.openCard(id);
    cardsOpened += 1;

    if (session.getStatus() === 'lost') {
      return {
        coins: -LOSS_PENALTY_AMOUNT,
        cardsOpened,
        outcome: { firstRoundDealAccepted: false, rejectedRound1Offer: sawRound1 },
        activeAtStart,
        cappedRound1Offers
      };
    }
    if (result.isLastCard) {
      return {
        coins: result.secretCard?.value ?? plan.secretValue,
        cardsOpened,
        outcome: { firstRoundDealAccepted: false, rejectedRound1Offer: sawRound1 },
        activeAtStart,
        cappedRound1Offers
      };
    }
    if (result.offer !== null) {
      const round = result.offer.roundNumber;
      if (round === 1) {
        sawRound1 = true;
        if (activeAtStart) {
          cappedRound1Offers.push(result.offer.amount);
        }
      }
      if (decide({ round, active: activeAtStart, acceptRoll: plan.acceptRoll })) {
        const prize = session.acceptDeal();
        return {
          coins: prize,
          cardsOpened,
          outcome: {
            firstRoundDealAccepted: round === 1,
            rejectedRound1Offer: round !== 1 && sawRound1
          },
          activeAtStart,
          cappedRound1Offers
        };
      }
      session.rejectDeal();
    }
  }
  throw new Error('La simulación terminó sin victoria ni derrota');
}

interface CorridaResult {
  readonly coinsPerCard: number;
  readonly gamesTopadas: number;
  readonly cappedRound1Offers: number[];
}

function simulate(decide: Decision, applyRule: boolean): CorridaResult {
  let streak = FirstRoundDealStreak.INACTIVE;
  let totalCoins = 0;
  let totalCards = 0;
  let gamesTopadas = 0;
  const cappedRound1Offers: number[] = [];

  for (const plan of PLANS) {
    const result = playGame(plan, applyRule ? streak : FirstRoundDealStreak.INACTIVE, decide);
    totalCoins += result.coins;
    totalCards += result.cardsOpened;
    if (result.activeAtStart) {
      gamesTopadas += 1;
    }
    cappedRound1Offers.push(...result.cappedRound1Offers);
    if (applyRule) {
      // Misma transición que usa RecordFirstRoundDealOutcomeUseCase en producción.
      streak = streak.withGameEnd(result.outcome);
    }
  }

  return {
    coinsPerCard: totalCoins / totalCards,
    gamesTopadas,
    cappedRound1Offers
  };
}

describe('FirstRoundDealStreak.farming — economía del farmeo bajo la regla anti-farmeo (ADR-014)', () => {
  it('granjero con regla: 480–620 monedas por carta; sin regla ≈ 798 (el farmeo baja a mitad, no se mata)', () => {
    const withRule = simulate(DECIDE_FARMER, true);
    const withoutRule = simulate(DECIDE_FARMER, false);

    console.info(
      `[farming] monedas/carta con regla = ${withRule.coinsPerCard.toFixed(1)} · ` +
        `sin regla = ${withoutRule.coinsPerCard.toFixed(1)} · ` +
        `partidas topadas = ${((withRule.gamesTopadas / N_GAMES) * 100).toFixed(1)}%`
    );

    expect(withRule.coinsPerCard).toBeGreaterThanOrEqual(480);
    expect(withRule.coinsPerCard).toBeLessThanOrEqual(620);
    // La referencia sin regla (≈ 798) queda muy por encima: la regla corta
    // el rendimiento del granjero a menos del 80 % del farmeo libre.
    expect(withoutRule.coinsPerCard).toBeGreaterThanOrEqual(740);
    expect(withoutRule.coinsPerCard).toBeLessThanOrEqual(860);
    expect(withRule.coinsPerCard).toBeLessThan(withoutRule.coinsPerCard * 0.8);
  });

  it('granjero p=0.7: entre 27 % y 37 % de las partidas se juegan topadas', () => {
    const result = simulate(DECIDE_FARMER_P70, true);
    const ratio = result.gamesTopadas / N_GAMES;

    console.info(`[farming] p=0.7 → partidas topadas = ${(ratio * 100).toFixed(1)}%`);

    expect(ratio).toBeGreaterThanOrEqual(0.27);
    expect(ratio).toBeLessThanOrEqual(0.37);
  });

  it('TODA oferta de la 1ª ronda emitida con la regla activa es un valor del catálogo topado', () => {
    const result = simulate(DECIDE_FARMER, true);

    // Si la regla nunca activara, este test no probaría nada: exigimos
    // que la corrida haya visto ofertas topadas de verdad.
    expect(result.cappedRound1Offers.length).toBeGreaterThan(0);
    for (const amount of result.cappedRound1Offers) {
      expect(CAPPED_OFFER_VALUES).toContain(amount);
    }
  });
});
