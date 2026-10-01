import { GameSession } from '../../domain/entities/GameSession';
import { ICrazyGamesService } from '../../domain/ports/ICrazyGamesService';
import { GameEvent } from '../../domain/events/GameEvents';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
import { IProgressionService } from '../../domain/ports/IProgressionService';
import { TOP_CASE_VALUE } from '../../domain/value-objects/CaseValues';
import { costOf } from '../../domain/value-objects/SessionUpgradeCatalog';

export type ReviveResult =
  | { revived: true }
  | { revived: false; reason: 'ad_failed' | 'sdk_unavailable' | 'not_eligible' | 'refunded' | 'ads_cooldown' };

/**
 * Coordina un efecto secundario (anuncio recompensado) con una regla de
 * dominio (revivir). El dominio permanece ignorante de que existio un anuncio.
 */
export class ReviveWithAdUseCase {
  // Marca el reembolso de la política 2 (permanencia / sin fill — ver
  // execute()): una vez reembolsado, el revive queda bloqueado para siempre
  // en esta instancia. 'ads_cooldown' NUNCA lo setea.
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

    // Política de 2 niveles al consumir: el MOTIVO que reporta
    // `rewardedAdStatus()` (su JSDoc es la especificación — ADR-006)
    // decide si se reembolsa o no. DOS políticas porque los motivos se
    // parten en dos grupos con consecuencias opuestas para el jugador.
    const rewardedStatus = this.crazyGamesService.rewardedAdStatus();
    switch (rewardedStatus) {
      case 'available':
        // Hay anuncio para ofrecer: el intento real sigue abajo, sin cambios.
        break;
      case 'cooldown_retryable':
        // POLÍTICA 1 — fallo REINTENTABLE → NO se reembolsa. Causa raíz:
        // el servicio real pone el cooldown de 60 s con CUALQUIER rewarded
        // fallido, INCLUIDA la cancelación del propio jugador
        // (settle() → RewardCooldownTracker: ahora + 60000),
        // así que la ventana puede ser AUTOINFLIGIDA: reembolsar dentro de
        // ella era un FORFEIT NO QUERIDO — cancelar el anuncio de Revivir
        // cobraba el costo y perdía para siempre la chance de revivir. Acá
        // no se acredita nada, NO se setea `refunded` (el chequeo XOR del
        // inicio queda intacto), no se pide el anuncio y no hace falta el
        // puerto de progresión: la UI traduce 'ads_cooldown' ("probá en
        // unos segundos") y a los 60 s el mismo revive reintenta de verdad.
        return { revived: false, reason: 'ads_cooldown' };
      case 'sdk_unavailable':
      case 'adblock':
      case 'cooldown_no_fill': {
        // POLÍTICA 2 — PERMANENCIA en la sesión (SDK entero ausente: Basic
        // Launch sin ads o el script del SDK que nunca cargó; ADBLOCK
        // DETECTADO) o cooldown AMBIENTAL sin FILL: el reintento no promete
        // nada y el dinero quedaría trabado.
        //
        // Sin puerto de progresión no hay forma de acreditar el reembolso:
        // se devuelve el motivo REAL `sdk_unavailable` (único de esta
        // política disponible en la unión) en vez de un 'refunded' que no
        // cumpliría — el jugador queda como antes, con la jugada
        // reintentable, y no se le promete una devolución que no llegó.
        if (!this.progressionService) {
          return { revived: false, reason: 'sdk_unavailable' };
        }

        // BUGFIX (TOCTOU compra→consumo): "Revivir" YA se cobró en la
        // Tienda y NO hay anuncio rewarded para consumirla — sin esto el
        // jugador se iba de la pantalla con las monedas perdidas y sin
        // revivir. Se reembolsa el costo del catálogo UNA sola vez y
        // `refunded` (chequeado arriba) bloquea el revive posterior:
        // invariante reembolso XOR efecto, nunca ambos (cobrar devuelta y
        // revivir igual cuando vuelva el anuncio sería explotable).
        this.progressionService.awardGameplayCoins(costOf('revive'));
        this.refunded = true;
        return { revived: false, reason: 'refunded' };
      }
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
