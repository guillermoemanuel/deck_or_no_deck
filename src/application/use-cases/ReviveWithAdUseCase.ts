import { GameSession } from '../../domain/entities/GameSession';
import { ICrazyGamesService } from '../../domain/ports/ICrazyGamesService';
import { GameEvent } from '../../domain/events/GameEvents';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
import { IProgressionService } from '../../domain/ports/IProgressionService';
import { TOP_CASE_VALUE } from '../../domain/value-objects/CaseValues';
import { costOf } from '../../domain/value-objects/SessionUpgradeCatalog';

export type ReviveResult =
  | { revived: true }
  | { revived: false; reason: 'ad_failed' | 'sdk_unavailable' | 'not_eligible' | 'refunded' };

/**
 * Coordina un efecto secundario (anuncio recompensado) con una regla de
 * dominio (revivir). El dominio permanece ignorante de que existio un anuncio.
 */
export class ReviveWithAdUseCase {
  // Marca el reembolso por fallo ambiental (ver execute()): una vez
  // reembolsado, el revive queda bloqueado para siempre en esta instancia.
  private refunded = false;

  constructor(
    private readonly session: GameSession,
    private readonly crazyGamesService: ICrazyGamesService,
    private readonly eventBus: SimpleEventEmitter<GameEvent>,
    // Opcional por lo mismo que en OpenCardUseCase: solo hace falta para el
    // caso límite de "victoria inmediata al revivir" (ver más abajo), que
    // necesita acreditar el premio exactamente como una victoria normal —
    // y ahora también para reembolsar el costo si no hay anuncios
    // disponibles (ver execute()): sin él no se puede acreditar y la rama
    // de reembolso devuelve 'sdk_unavailable' en vez de mentir con
    // 'refunded'.
    private readonly progressionService?: IProgressionService
  ) {}

  async execute(): Promise<ReviveResult> {
    // Invariante reembolso XOR efecto: si ya se reembolsó, el revive se
    // bloquea acá mismo — nunca reembolso y después el efecto.
    if (this.refunded) {
      return { revived: false, reason: 'refunded' };
    }

    // BUGFIX (revive infinito): faltaba el chequeo de `hasRevive()` acá.
    // "Revivir" es un consumible de UNA sola vez (se compra por 1.250
    // monedas en la Tienda), pero como nada lo consumía, una única compra
    // permitía revivir un número ilimitado de veces en la misma partida —
    // ver el comentario en SessionUpgrades.consumeRevive().
    if (this.session.getStatus() !== 'lost' || !this.session.getSessionUpgrades().hasRevive()) {
      return { revived: false, reason: 'not_eligible' };
    }

    if (!this.crazyGamesService.isRewardedAdAvailable()) {
      // Sin puerto de progresión no hay forma de acreditar el reembolso:
      // se devuelve el motivo REAL (`sdk_unavailable`, que con el chequeo
      // ampliado también cubre adblock/cooldown — es el único motivo sin
      // reembolso disponible en la unión) en vez de un 'refunded' que no
      // cumpliría — el jugador queda como antes, con la jugada
      // reintentable, y no se le promete una devolución que no llegó.
      if (!this.progressionService) {
        return { revived: false, reason: 'sdk_unavailable' };
      }

      // BUGFIX (TOCTOU compra→consumo): "Revivir" YA se cobró en la Tienda
      // y NO hay anuncios rewarded para consumirla: SDK entero ausente
      // (Basic Launch sin ads, o el script del SDK ni siquiera llegó a
      // cargar), ADBLOCK DETECTADO, o la ventana de cooldown de 60 s tras
      // un rewarded fallido. Sin esto el jugador se iba de la pantalla con
      // las monedas perdidas y sin revivir — con el alcance anterior (solo
      // `!isAvailable()`) el jugador con adblock (o fill muerto) compraba,
      // reintentaba en bucle y nunca recibía nada. Se reembolsa el costo
      // del catálogo UNA sola vez y `refunded` (chequeado arriba) bloquea
      // el revive posterior: invariante reembolso XOR efecto, nunca ambos
      // (cobrar devuelta y revivir igual cuando vuelva el anuncio sería
      // explotable).
      //
      // `ad_failed` sigue significando "el intento se hizo y falló"
      // (cancelación del jugador o anuncio que no se completó): ahí NO se
      // reembolsa y la compra es reintentable. PERO la causa raíz es que el
      // servicio real pone el cooldown de 60 s con CUALQUIER rewarded
      // fallido, INCLUIDA la cancelación del jugador — el cooldown puede
      // ser autoinfligido. Un segundo click dentro de la ventana cae en el
      // pre-chequeo de arriba, reembolsa y cierra el reclamo para siempre;
      // reintentar exige esperar a que venzan los 60 s
      // (CrazyGamesService.settle() → rewardedBlockedUntil = now + 60000).
      this.progressionService.awardGameplayCoins(costOf('revive'));
      this.refunded = true;
      return { revived: false, reason: 'refunded' };
    }

    const adResult = await this.crazyGamesService.showRewardedAd();

    if (!adResult.success) {
      return { revived: false, reason: 'ad_failed' };
    }

    // Se consume ANTES de revivir (no después): si por algún motivo
    // `reviveWithFullEnergy()` lanzara, es más seguro fallar con el
    // consumible ya gastado que dejarlo reutilizable indefinidamente.
    this.session.getSessionUpgrades().consumeRevive();
    const outcome = this.session.reviveWithFullEnergy();

    // BUGFIX (partida trabada): la carta que causó la derrota era la
    // última cerrada del tablero — no queda ninguna carta más para abrir,
    // así que esto NO es un revive normal: se resuelve como victoria
    // inmediata, con el mismo evento (`GameWon`) y la misma acreditación
    // de premio que usa OpenCardUseCase cuando el tablero se vacía
    // abriendo una carta. Sin esto, la partida quedaba en 'playing' sin
    // ninguna jugada posible (ver el comentario en GameSession).
    if (outcome.wonImmediately && outcome.secretCard) {
      const prize = outcome.secretCard.value;
      this.progressionService?.awardGameplayCoins(prize);
      this.eventBus.emit({ type: 'LastCardRevealed', secretCard: outcome.secretCard });
      if (outcome.secretCard.value === TOP_CASE_VALUE) {
        this.eventBus.emit({ type: 'TopValueCardRevealed', card: outcome.secretCard });
      }
      this.eventBus.emit({ type: 'GameWon', finalAmount: prize });
      return { revived: true };
    }

    // BUGFIX (nivel de energía): el porcentaje post-revive ya NO es
    // necesariamente 100 (EnergyLevel.STARTING = 50, + bonus de tienda si
    // aplica) — se lee del dominio en vez de que la presentación asuma un
    // valor fijo.
    this.eventBus.emit({ type: 'GameRevived', energyPercentage: this.session.getEnergyPercentage() });

    return { revived: true };
  }
}
