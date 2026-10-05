import { ICrazyGamesService } from '../../domain/ports/ICrazyGamesService';
import { IProgressionService } from '../../domain/ports/IProgressionService';
import { costOf } from '../../domain/value-objects/SessionUpgradeCatalog';

export type RewardMultiplier = 2 | 3;

export type MultiplyRewardResult =
  | { success: true; bonusAwarded: number; newTotal: number }
  | { success: false; reason: 'ad_failed' | 'already_claimed' | 'refunded' | 'ads_cooldown' };

/**
 * Coordina "ver anuncio -> si tiene exito, otorgar la diferencia entre premio
 * base y premio multiplicado". El monto BASE ya fue acreditado por
 * ResolveDealUseCase al aceptar el DEAL — aqui solo se otorga la DIFERENCIA.
 *
 * Aplica Dependency Inversion recibiendo IProgressionService e ICrazyGamesService.
 *
 * PRECONDICIÓN DEL LLAMADOR (no verificable acá): `multiplier` debe ser la
 * mejora que el jugador POSEE. A diferencia de ReviveWithAdUseCase — que
 * inyecta la sesión y corta con `not_eligible` vía `session.hasRevive()` —
 * este use-case no recibe la GameSession, así que no puede validar la
 * tenencia: reembolsa `costOf(multiplier === 2 ? 'double_reward' :
 * 'triple_reward')` a ciegas bajo la política 2 de execute() (permanencia
 * o sin fill) y devuelve `'ads_cooldown'` sin reembolsar ante un cooldown
 * reintentable. Hoy es inalcanzable: los
 * flags con los que se construye el botón salen de la sesión viva
 * (GameSceneController.buildUpgradeFlagsForResultScene), el catálogo prohíbe
 * comprar double+triple a la vez (SessionUpgradeCatalog.conflictsWith) y
 * SessionUpgrades no persiste entre partidas. SI ALGÚN DÍA se relanza la
 * escena con flags sucios, ese es el hueco: la verificación de tenencia
 * vive en presentación, no en este use-case.
 */
export class MultiplyRewardUseCase {
  private claimed = false;
  private isProcessing = false;
  // Marca el reembolso de la política 2 (permanencia / sin fill — ver
  // execute()): una vez reembolsado, el reclamo queda bloqueado para
  // siempre. 'ads_cooldown' NUNCA lo setea.
  private refunded = false;

  constructor(
    private readonly baseAmount: number,
    private readonly crazyGamesService: ICrazyGamesService,
    private readonly progressionService: IProgressionService
  ) {}

  async execute(multiplier: RewardMultiplier): Promise<MultiplyRewardResult> {
    // Invariante reembolso XOR efecto: si ya se reembolsó, el reclamo se
    // bloquea acá mismo y nunca se vuelve a acreditar ni a otorgar.
    if (this.refunded) {
      return { success: false, reason: 'refunded' };
    }

    if (this.claimed || this.isProcessing) {
      return { success: false, reason: 'already_claimed' };
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
      case 'cooldown_retryable': {
        // POLÍTICA 1 — fallo REINTENTABLE → NO se reembolsa.
        // Causa raíz: el servicio real pone el cooldown de 60 s con
        // CUALQUIER rewarded fallido, INCLUIDA la cancelación del propio
        // jugador (settle() → RewardCooldownTracker.noteFailure('other') →
        // ahora + 60000), así que la ventana puede ser AUTOINFLIGIDA: reembolsar
        // dentro de ella era un FORFEIT NO QUERIDO — el jugador cancelaba
        // el anuncio, cobraba el costo y perdía para siempre la chance del
        // efecto. Acá no se acredita nada, NO se setea `refunded` (el
        // chequeo XOR del inicio queda intacto) y no se pide el anuncio:
        // la UI traduce 'ads_cooldown' ("probá en unos segundos") y a los
        // 60 s el mismo reclamo reintenta de verdad. En cambio,
        // 'sdk_unavailable' / 'adblock' / 'ads_disabled' /
        // 'cooldown_no_fill' (política 2) son estados donde el reintento
        // no promete nada → ahí SÍ se reembolsa. `ad_failed` sigue
        // significando "el intento se hizo y falló" (cancelación o
        // anuncio no completado): tampoco reembolsa y el reintento es
        // libre.
        return { success: false, reason: 'ads_cooldown' };
      }
      case 'sdk_unavailable':
      case 'adblock':
      case 'ads_disabled':
      case 'cooldown_no_fill':
        // POLÍTICA 2 — PERMANENCIA en la sesión (SDK entero ausente: el
        // script del SDK que nunca cargó; ADBLOCK DETECTADO; ADS
        // DESHABILITADOS por Basic Launch, ADR-009) o cooldown AMBIENTAL
        // sin FILL: el reintento no promete nada y el dinero quedaría
        // trabado.
        return this.policyTwoRefund(multiplier);
    }

    // Marcado SINCRONICO, antes de cualquier `await`: cierra la ventana de
    // carrera para llamadas concurrentes sin necesidad de un mutex real.
    this.isProcessing = true;

    try {
      const adResult = await this.crazyGamesService.showRewardedAd();
      if (!adResult.success) {
        // CG-PUB-003: el adError del SDK puede VOLVERSE PERMANENTE justo
        // al fallar ('adsDisabledBasicLaunch' → 'ads_disabled', o un
        // 'adblock' que hasAdblock() no detectó), cuando el status previo
        // seguía en 'available'. Re-evaluamos el motivo DESPUÉS del fallo:
        // si pasó a ser permanente, aplica la POLÍTICA 2 (reembolso) YA —
        // de lo contrario el primer intento de Basic Launch terminaba en
        // 'ad_failed' sin reembolso y, con las filas de la tienda
        // ocultas, el jugador nunca volvía a reclamar.
        const statusAfterFailure = this.crazyGamesService.rewardedAdStatus();
        if (statusAfterFailure === 'ads_disabled' || statusAfterFailure === 'adblock') {
          return this.policyTwoRefund(multiplier);
        }
        return { success: false, reason: 'ad_failed' };
      }

      const bonusAwarded = this.baseAmount * (multiplier - 1);
      this.progressionService.awardGameplayCoins(bonusAwarded);
      this.claimed = true;

      return { success: true, bonusAwarded, newTotal: this.progressionService.getCoins() };
    } finally {
      this.isProcessing = false;
    }
  }

  isClaimed(): boolean {
    return this.claimed;
  }

  /**
   * POLÍTICA 2 (ADR-006): reembolso por motivos PERMANENTES en la sesión
   * (`sdk_unavailable`, `adblock`, `ads_disabled`) o cooldown ambiental
   * sin fill — extraído del switch para poder aplicarlo TAMBIÉN después
   * de un adError que vuelve el estado permanente en vuelo (CG-PUB-003).
   *
   * BUGFIX (TOCTOU compra→consumo): la mejora YA se cobró en la Tienda y
   * NO hay anuncio rewarded para consumirla — sin esto el jugador se iba
   * de la pantalla con las monedas perdidas y sin recibir nada. Se
   * reembolsa el costo del catálogo UNA sola vez y `refunded` (chequeado
   * al inicio de execute) bloquea el reclamo posterior: invariante
   * reembolso XOR efecto, nunca ambos (fallar, cobrar devuelta y
   * reclamar igual cuando vuelva el anuncio sería explotable).
   */
  private policyTwoRefund(multiplier: RewardMultiplier): MultiplyRewardResult {
    this.progressionService.awardGameplayCoins(costOf(multiplier === 2 ? 'double_reward' : 'triple_reward'));
    this.refunded = true;
    return { success: false, reason: 'refunded' };
  }
}
