import { ICrazyGamesService } from '../../domain/ports/ICrazyGamesService';
import { IProgressionService } from '../../domain/ports/IProgressionService';
import { costOf } from '../../domain/value-objects/SessionUpgradeCatalog';

export type RewardMultiplier = 2 | 3;

export type MultiplyRewardResult =
  | { success: true; bonusAwarded: number; newTotal: number }
  | { success: false; reason: 'ad_failed' | 'already_claimed' | 'refunded' };

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
 * tenencia y reembolsa `costOf(multiplier === 2 ? 'double_reward' :
 * 'triple_reward')` a ciegas si el SDK no está. Hoy es inalcanzable: los
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
  // Marca el reembolso por fallo ambiental (ver execute()): una vez
  // reembolsado, el reclamo queda bloqueado para siempre.
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

    if (!this.crazyGamesService.isAvailable()) {
      // BUGFIX (TOCTOU compra→consumo): la mejora YA se cobró en la
      // Tienda y el SDK de CrazyGames NO está al consumirla (SDK entero
      // ausente: Basic Launch sin ads, o el script del SDK ni siquiera
      // llegó a cargar) — sin esto el jugador se iba de la pantalla con las
      // monedas perdidas y sin recibir nada. Se reembolsa el costo del
      // catálogo UNA sola vez y `refunded` (chequeado arriba) bloquea el
      // reclamo posterior: invariante reembolso XOR efecto, nunca ambos
      // (fallar, cobrar devuelta y reclamar igual cuando vuelva el
      // anuncio sería explotable).
      //
      // LÍMITE de este reembolso: NO cubre el adblock. El reembolso solo
      // se dispara con `!isAvailable()`; si el adblockador únicamente
      // mata el FILL de los anuncios, el SDK sigue "disponible", el
      // consumo cae en `ad_failed` → SIN reembolso y con el botón
      // reintentable (decisión de producto: `ad_failed` es fallo del
      // anuncio, no del entorno).
      this.progressionService.awardGameplayCoins(costOf(multiplier === 2 ? 'double_reward' : 'triple_reward'));
      this.refunded = true;
      return { success: false, reason: 'refunded' };
    }

    // Marcado SINCRONICO, antes de cualquier `await`: cierra la ventana de
    // carrera para llamadas concurrentes sin necesidad de un mutex real.
    this.isProcessing = true;

    try {
      const adResult = await this.crazyGamesService.showRewardedAd();
      if (!adResult.success) {
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
}
