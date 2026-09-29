import { OnboardingFlow } from './OnboardingFlow';
import { FakeOnboardingRepository } from '../../infrastructure/persistence/testing/FakeOnboardingRepository';
import { GameEvent } from '../../domain/events/GameEvents';
import { Card } from '../../domain/entities/Card';

const card = { id: 'card_1', value: 100 } as unknown as Card;

const cardOpened: GameEvent = { type: 'CardOpened', card, energyRemaining: 60, cardsUntilNextOffer: 2 };
const offerMade = { type: 'BankerOfferMade', offer: { amount: 500 } } as unknown as GameEvent;

describe('OnboardingFlow', () => {
  it('muestra la secuencia completa de una primera partida: abrir carta → energía → banquero', () => {
    const flow = new OnboardingFlow(new FakeOnboardingRepository());

    expect(flow.onBoardReady()).toEqual({ kind: 'show', hint: 'open_card' });
    expect(flow.onGameEvent(cardOpened)).toEqual({ kind: 'show', hint: 'energy' });
    // 2ª carta: el consejo de energía ya cumplió su función.
    expect(flow.onGameEvent(cardOpened)).toEqual({ kind: 'hide' });
    expect(flow.onGameEvent(cardOpened)).toEqual({ kind: 'none' });
    expect(flow.onGameEvent(offerMade)).toEqual({ kind: 'show', hint: 'banker_offer' });
    expect(flow.onGameEvent({ type: 'DealRejected' })).toEqual({ kind: 'hide' });
  });

  it('oculta el consejo del banquero al aceptar la oferta', () => {
    const flow = new OnboardingFlow(new FakeOnboardingRepository({ seen: ['open_card', 'energy'] }));

    expect(flow.onGameEvent(offerMade)).toEqual({ kind: 'show', hint: 'banker_offer' });
    expect(flow.onGameEvent({ type: 'DealAccepted', amount: 500, secretCardValue: 100 })).toEqual({ kind: 'hide' });
  });

  it('cada consejo se muestra una sola vez en la vida del jugador', () => {
    const repo = new FakeOnboardingRepository();
    const first = new OnboardingFlow(repo);
    first.onBoardReady();

    // Nueva partida (nuevo flow, mismo repositorio).
    const second = new OnboardingFlow(repo);
    expect(second.onBoardReady()).toEqual({ kind: 'none' });
    expect(second.onGameEvent(cardOpened)).toEqual({ kind: 'show', hint: 'energy' });
  });

  it('marca el consejo como visto al mostrarlo, aunque el jugador cierre la pestaña antes de cerrarlo', () => {
    const repo = new FakeOnboardingRepository();
    new OnboardingFlow(repo).onBoardReady();

    expect(repo.getSeenHints()).toEqual(['open_card']);
  });

  it('"Omitir consejos" oculta el actual, persiste y desactiva todo lo que sigue', () => {
    const repo = new FakeOnboardingRepository();
    const flow = new OnboardingFlow(repo);
    flow.onBoardReady();

    expect(flow.skipAll()).toEqual({ kind: 'hide' });
    expect(repo.isSkipped()).toBe(true);
    expect(flow.onGameEvent(cardOpened)).toEqual({ kind: 'none' });
    expect(flow.onGameEvent(offerMade)).toEqual({ kind: 'none' });
    expect(new OnboardingFlow(repo).isActive()).toBe(false);
  });

  it('skipAll sin consejo en pantalla no pide ocultar nada', () => {
    const flow = new OnboardingFlow(new FakeOnboardingRepository());

    expect(flow.skipAll()).toEqual({ kind: 'none' });
  });

  it('isActive es false cuando ya se vieron todos los consejos', () => {
    const flow = new OnboardingFlow(new FakeOnboardingRepository({ seen: ['open_card', 'energy', 'banker_offer'] }));

    expect(flow.isActive()).toBe(false);
    expect(flow.onBoardReady()).toEqual({ kind: 'none' });
  });

  it('ignora eventos irrelevantes', () => {
    const flow = new OnboardingFlow(new FakeOnboardingRepository());

    expect(flow.onGameEvent({ type: 'MidgameSwapAvailable' })).toEqual({ kind: 'none' });
  });

  it('si termina la partida con un consejo visible, lo oculta', () => {
    const flow = new OnboardingFlow(new FakeOnboardingRepository());
    flow.onBoardReady();

    expect(flow.onGameEvent({ type: 'GameLost' })).toEqual({ kind: 'hide' });
  });
});
