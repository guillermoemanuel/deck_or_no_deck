import { ICrazyGamesService } from '../../domain/ports/ICrazyGamesService';
import {
  SESSION_UPGRADE_CATALOG,
  SessionUpgradeDefinition
} from '../../domain/value-objects/SessionUpgradeCatalog';

/**
 * Decide qué mejoras muestra la tienda AHORA: filtra el catálogo del
 * dominio ocultando las mejoras con `requiresRewardedAd` (Duplicar,
 * Triplicar, Revivir) cuando hoy no se puede mostrar un rewarded ad —
 * Basic Launch con ads deshabilitados, adblock, SDK ausente o sin fill
 * reciente. Si se ofrecieran, el jugador pagaría monedas por algo que no
 * puede usar y QA rechaza botones de rewarded sin efecto; reaparecen solas
 * cuando vuelve a haber anuncios (el filtro se re-evalúa en cada execute).
 *
 * La DISPONIBILIDAD de anuncios la decide el puerto `ICrazyGamesService`
 * (infraestructura), nunca el dominio: acá solo se aplica el filtro sobre
 * `SessionUpgradeDefinition.requiresRewardedAd`, que es lo único que el
 * catálogo declara.
 */
export class ListAvailableUpgradesUseCase {
  constructor(private readonly crazyGamesService: ICrazyGamesService) {}

  /** Catálogo visible AHORA: oculta las mejoras con requiresRewardedAd si no se puede mostrar un rewarded ad. */
  execute(): readonly SessionUpgradeDefinition[] {
    const rewardedAdsUsable = this.crazyGamesService.isRewardedAdAvailable();
    return SESSION_UPGRADE_CATALOG.filter(u => rewardedAdsUsable || !u.requiresRewardedAd);
  }

  /**
   * CG-MON-006: motivo por el que la tienda debe mostrar el aviso
   * INLINE de "faltan filas por ads", o `null` si no corresponde. Solo
   * motivos PERMANENTES en la sesión:
   *
   * - `'adblock'` / `'ads_disabled'`: las 3 filas con
   *   `requiresRewardedAd` están ocultas hasta que cambie algo que el
   *   jugador controla (su adblocker) o la plataforma (Basic Launch) —
   *   sin aviso, el jugador veía 5 filas y no entendía por qué faltaban
   *   Duplicar/Triplicar/Revivir (auditoría CG-MON-006; el aviso es
   *   inline, un popup queda descartado por la auditoría).
   * - `'cooldown_*'`: NO — transitorio (60 s), el aviso parpadearía y
   *   la fila reaparece sola.
   * - `'sdk_unavailable'`: NO — ambiguo (modo `none`/dev, SDK sin
   *   cargar o CDN caído): avisaría "desactivá tu adblocker" donde no
   *   lo hay.
   */
  adsNotice(): 'adblock' | 'ads_disabled' | null {
    const status = this.crazyGamesService.rewardedAdStatus();
    return status === 'adblock' || status === 'ads_disabled' ? status : null;
  }
}
