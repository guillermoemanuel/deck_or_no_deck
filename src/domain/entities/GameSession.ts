import { Card, CardId } from './Card';
import { EnergyLevel } from '../value-objects/EnergyLevel';
import { Banker, BankerOffer } from '../services/Banker';
import { DeckManager } from './DeckManager';
import { GameStateMachine, GameStatus } from '../state/GameStateMachine';
import { getEnergyDeltaForValue } from '../value-objects/EnergyDeltaTable';
import { SessionUpgrades, EnergyTankLevel } from './SessionUpgrades';

export type { GameStatus };

export interface EnergyDrainRule {
  drainFor(cardValue: number): number;
}

/**
 * Regla de negocio central: cada valor posible del mazo tiene un impacto
 * FIJO y explícito sobre la energía (ver EnergyDeltaTable) — ya no se
 * calcula relativo al valor máximo del tablero. Esa fórmula anterior
 * (normalizada) era el bug reportado: para casi todos los valores del
 * mazo (todos salvo el máximo absoluto, 25000) el resultado caía en la
 * rama "protectora" de la fórmula, así que la energía prácticamente
 * nunca bajaba y el jugador no podía perder por agotamiento.
 *
 * Se inyecta como estrategia para permitir mejoras compradas en la tienda
 * ("Blindaje de energía" reduce el drenaje) sin tocar GameSession.
 */
export class DefaultEnergyDrainRule implements EnergyDrainRule {
  /**
   * @param drainMultiplier aplicado ÚNICAMENTE a los deltas que DRENAN
   * energía (valores positivos de la tabla) — así "Blindaje de Energía"
   * reduce el daño de las cartas altas sin afectar el beneficio (protección)
   * de las cartas bajas, que debe permanecer intacto.
   */
  constructor(private readonly drainMultiplier = 1) {}

  drainFor(cardValue: number): number {
    const delta = getEnergyDeltaForValue(cardValue);
    return delta > 0 ? delta * this.drainMultiplier : delta;
  }
}

export interface OpenCardResult {
  readonly card: Card;
  readonly offer: BankerOffer | null;
  readonly isLastCard?: boolean;
  readonly secretCard?: Card;
}

/**
 * Resultado de `reviveWithFullEnergy()`. Casi siempre `wonImmediately` es
 * `false` (el jugador sigue jugando con energía restaurada). Es `true` en
 * el caso límite donde la carta que causó la derrota era la última cerrada
 * del tablero — ver el comentario dentro de `reviveWithFullEnergy()`.
 */
export interface ReviveOutcome {
  readonly wonImmediately: boolean;
  readonly secretCard?: Card;
}

export class GameSession {
  private readonly deckManager: DeckManager;
  private readonly stateMachine: GameStateMachine;
  private energy: EnergyLevel;
  private cardsOpenedCount = 0;
  private hasSwappedSecret = false;
  private currentOffer: BankerOffer | null = null;

  // Mejoras de PARTIDA ÚNICA (consumibles): viven acá, en memoria, y
  // desaparecen junto con esta instancia al terminar la partida — nunca
  // se persisten. Ver SessionUpgrades para el detalle de cada una.
  private readonly sessionUpgrades = new SessionUpgrades();

  constructor(
    initialCards: Card[],
    secretCard: Card,
    private readonly banker: Banker,
    private readonly energyDrainRule: EnergyDrainRule,
    private readonly startingEnergyBonus: number = 0,
    expectedBoardCardsCount = 12
  ) {
    if (expectedBoardCardsCount !== undefined && initialCards.length !== expectedBoardCardsCount) {
      throw new Error(`Board must start with exactly ${expectedBoardCardsCount} cards`);
    }
    this.deckManager = new DeckManager(initialCards, secretCard);
    this.energy = EnergyLevel.full(this.startingEnergyBonus);
    this.stateMachine = new GameStateMachine('playing');
  }

  getDeckManager(): DeckManager {
    return this.deckManager;
  }

  getSessionUpgrades(): SessionUpgrades {
    return this.sessionUpgrades;
  }

  /**
   * Upgrade "Tanque de Energía" — efecto INMEDIATO sobre la partida en
   * curso: sube el techo de la barra de energía (nivel 1: +25%, nivel 2:
   * +50% sobre la base de 100) y otorga esa capacidad extra como energía
   * ya disponible (ver EnergyLevel.withNewCeiling).
   */
  applyEnergyTankUpgrade(level: EnergyTankLevel): void {
    this.sessionUpgrades.applyEnergyTankLevel(level);
    const multiplier = level === 1 ? 1.25 : 1.5;
    const newCeiling = 100 * multiplier;
    this.energy = this.energy.withNewCeiling(newCeiling);
  }

  openCard(cardId: CardId): OpenCardResult {
    this.assertPlayable();

    const opened = this.deckManager.openCard(cardId);

    // Upgrade "Escudo de Carta Negativa": mitiga a la mitad el drenaje de
    // cartas peligrosas (delta positivo de EnergyDeltaTable) ANTES de
    // aplicar el nuevo estado de energía. Las cartas protectoras (delta
    // negativo) no se ven afectadas — el escudo solo atenúa daño.
    const rawDelta = this.energyDrainRule.drainFor(opened.value);
    const mitigatedDelta =
      this.sessionUpgrades.hasNegativeCardShield() && rawDelta > 0 ? rawDelta * 0.5 : rawDelta;
    this.energy = this.energy.drain(mitigatedDelta);
    this.cardsOpenedCount += 1;

    if (this.energy.isDepleted()) {
      this.stateMachine.lose();
      return { card: opened, offer: null };
    }

    // Verificación de fin de juego (todas las cartas del tablero abiertas)
    if (this.deckManager.getClosedCards().length === 0) {
      const revealedSecret = this.deckManager.openSecretCard();
      this.stateMachine.win();
      return { card: opened, offer: null, isLastCard: true, secretCard: revealedSecret };
    }

    if (this.banker.shouldMakeOffer(this.cardsOpenedCount)) {
      const closed = this.deckManager.getClosedCards();
      // Upgrade "Negociador": bonus porcentual inyectado en el momento de
      // la oferta — el Banquero/OfferCalculator no conocen SessionUpgrades,
      // solo reciben el numero ya resuelto (Dependency Inversion).
      const negotiatorBonus = this.sessionUpgrades.hasNegotiator() ? 0.15 : 0;
      this.currentOffer = this.banker.makeOffer(closed, negotiatorBonus);
      this.stateMachine.waitForOffer();
      return { card: opened, offer: this.currentOffer };
    }

    return { card: opened, offer: null };
  }

  isMidgameSwapAvailable(): boolean {
    const threshold = this.deckManager.getMidgameSwapThreshold();
    return this.cardsOpenedCount === threshold && !this.hasSwappedSecret;
  }

  swapSecretCard(boardCardId: CardId): { oldSecret: Card; newSecret: Card } {
    if (!this.isMidgameSwapAvailable()) {
      throw new Error('Midgame swap is not available right now');
    }

    const result = this.deckManager.swapSecretCard(boardCardId);
    this.hasSwappedSecret = true;
    return result;
  }

  /**
   * Upgrade "Cambio de Carta Secreta": solo disponible en la ÚLTIMA jugada
   * de la partida (una única carta cerrada restante en el tablero).
   */
  canSwapFinalSecretCard(): boolean {
    return (
      this.sessionUpgrades.hasSecretSwapFinal() &&
      this.stateMachine.isPlayable() &&
      this.deckManager.getClosedCards().length === 1
    );
  }

  /**
   * Ejecuta el intercambio final: la Carta Secreta original se revela
   * (ocupando el slot de la última carta del tablero, igual que el swap
   * de mitad de juego) y el valor de la carta que estaba en el tablero
   * pasa a ser el premio DEFINITIVO — la partida termina aquí, como una
   * victoria, sin necesidad de "abrir" formalmente esa última carta.
   */
  swapFinalSecretCard(): { oldSecret: Card; newSecret: Card; finalPrize: number } {
    if (!this.canSwapFinalSecretCard()) {
      throw new Error('Final secret card swap is not available right now');
    }

    const lastClosedCard = this.deckManager.getClosedCards()[0];
    const { oldSecret, newSecret } = this.deckManager.swapSecretCard(lastClosedCard.id);
    const finalPrize = newSecret.value;
    this.stateMachine.win();

    return { oldSecret, newSecret, finalPrize };
  }

  openSecretCard(): Card {
    return this.deckManager.openSecretCard();
  }

  acceptDeal(): number {
    if (!this.stateMachine.is('awaiting_offer_response') || !this.currentOffer) {
      throw new Error('No active offer to accept');
    }
    this.stateMachine.acceptOffer();
    return this.currentOffer.amount;
  }

  rejectDeal(): void {
    if (!this.stateMachine.is('awaiting_offer_response')) {
      throw new Error('No active offer to reject');
    }
    this.stateMachine.rejectOffer();
    this.currentOffer = null;
  }

  reviveWithFullEnergy(): ReviveOutcome {
    if (!this.stateMachine.is('lost')) {
      throw new Error('Revive is only available after losing');
    }
    // Preserva el TECHO actual (this.energy.getCeiling()) — si el jugador
    // ya había comprado el upgrade "Tanque de Energía" antes de perder,
    // revivir no debe borrar esa mejora ya pagada en esta misma partida.
    this.energy = EnergyLevel.full(this.startingEnergyBonus, this.energy.getCeiling());
    this.stateMachine.revive();

    // BUGFIX (partida trabada al revivir con el tablero ya vacío): si la
    // carta que causó la derrota era la ÚLTIMA cerrada del tablero,
    // openCard() ya la había abierto/quitado de `deckManager` ANTES de
    // detectar el agotamiento de energía (ver el `return` temprano más
    // arriba, en el bloque `if (this.energy.isDepleted())`) — así que su
    // chequeo de "tablero limpio → victoria" nunca llegó a correr. Al
    // revivir no queda ninguna carta más para abrir, y como ese chequeo
    // solo vive dentro de openCard(), ningún evento futuro de "abrir
    // carta" iba a volver a dispararlo: la partida quedaba en 'playing'
    // para siempre, sin ninguna jugada posible. Se repite acá la MISMA
    // regla ("sin cartas cerradas → se revela la secreta y se gana").
    if (this.deckManager.getClosedCards().length === 0) {
      const revealedSecret = this.deckManager.openSecretCard();
      this.stateMachine.win();
      return { wonImmediately: true, secretCard: revealedSecret };
    }

    return { wonImmediately: false };
  }

  getStatus(): GameStatus {
    return this.stateMachine.getStatus();
  }

  getEnergyPercentage(): number {
    return this.energy.toPercentageOfBase();
  }

  getEnergyRaw(): number {
    return this.energy.toNumber();
  }

  getCardsOpenedCount(): number {
    return this.cardsOpenedCount;
  }

  /** Cartas que faltan abrir hasta la próxima oferta del Banquero — ver Banker.cardsUntilNextOffer(). */
  getCardsUntilNextBankerOffer(): number  {
    return this.banker.cardsUntilNextOffer(this.cardsOpenedCount, this.deckManager.getBoardCardsCount());
  }

  getClosedCards(): Card[] {
    return this.deckManager.getClosedCards();
  }

  getSecretCard(): Card {
    return this.deckManager.getSecretCard();
  }

  private assertPlayable(): void {
    if (!this.stateMachine.isPlayable()) {
      throw new Error(`Cannot open card while game status is "${this.stateMachine.getStatus()}"`);
    }
  }
}
