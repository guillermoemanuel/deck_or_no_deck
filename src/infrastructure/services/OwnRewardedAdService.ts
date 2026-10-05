import {
  ICrazyGamesService,
  AdResult,
  AdType,
  AdLifecycleListener,
  AdLifecyclePhase,
  RewardedAdStatus
} from '../../domain/ports/ICrazyGamesService';
import { RewardCooldownTracker } from './RewardCooldownTracker';

/** Resultado que el overlay de UI reporta al adapter al cerrarse. */
export type AdOverlayOutcome = {
  /** `true` si el countdown corrió completo; `false` si el jugador cerró el overlay antes de tiempo. */
  readonly completed: boolean;
};

/**
 * Presentador del overlay de anuncio propio (UI de presentación):
 * recibe el tipo de ad y resuelve cuando el overlay se cierra.
 *
 * Vive en `presentation/` e implementa este tipo **estructuralmente** —
 * infrastructure/ NO puede importar presentation/ (regla de dependencias),
 * así que la función se inyecta desde `main.ts` (composition root), mismo
 * patrón de inversión que `GameServices` (ADR-003). El tipo se define acá
 * para que ambos lados compartan el contrato sin cruzar capas.
 */
export type AdOverlayPresenter = (type: AdType) => Promise<AdOverlayOutcome>;

/**
 * Adapter de anuncios PROPIOS para portales externos (ADR-007):
 * implementa el puerto `ICrazyGamesService` sin depender de
 * `window.CrazyGames`. El "anuncio" es un overlay con countdown de 3 s
 * (cancelable) que monta y controla la capa de presentación a través del
 * presenter inyectado — acá solo se orquesta el flujo y la política.
 *
 * Notas de política:
 * - `rewardedAdStatus()` solo produce `available` / `cooldown_retryable`
 *   (ver JSDoc de cada método): sin ad network no hay qué bloquear y sin
 *   SDK externo no falta ninguno, y el countdown propio nunca queda sin
 *   "fill" — `adblock`, `sdk_unavailable` y `cooldown_no_fill` son
 *   estados del adapter de CrazyGames.
 * - El puerto exige que NUNCA lance: cualquier fallo del overlay (el
 *   presenter rechaza) se resuelve como `{ success: false, reason: 'error' }`.
 * - El cooldown de rewarded usa `RewardCooldownTracker`, la FUENTE ÚNICA
 *   de esa semántica (compartida con `CrazyGamesService`) — así la
 *   política de reembolso de ADR-006 es idéntica en ambas plataformas.
 */
export class OwnRewardedAdService implements ICrazyGamesService {
  /**
   * Watchdog del presenter: si el overlay no resuelve en este lapso, el ad
   * se da por perdido y se libera el juego. **Causa raíz:** si el presenter
   * se cuelga (escena que nunca arranca, o `create()` que revienta antes de
   * registrar sus failsafes), `'ended'` jamás se emitía y `adInProgress`
   * quedaba `true` para siempre → audio silenciado y ads bloqueados de por
   * vida. Es el espejo de la filosofía de `CrazyGamesService`
   * (`AD_START_TIMEOUT_MS`): allí el SDK externo puede no llamar de vuelta,
   * acá la promise del presenter puede no resolver. **Por qué 15 s:** el
   * overlay propio dura 3 s de countdown (+ cancelación del jugador a los
   * 3 s como mucho), así que 15 s es un margen holgado: un flujo normal ni
   * se acerca y cualquier promise que llegue acá está realmente colgada.
   */
  private static readonly AD_WATCHDOG_MS = 15000;

  private readonly presenter: AdOverlayPresenter;
  /** Cooldown de 60 s del rewarded, con la semántica extraída a la fuente única. */
  private readonly rewardCooldown: RewardCooldownTracker;
  private readonly lifecycleListeners = new Set<AdLifecycleListener>();
  /** Un overlay a la vez: dos solapados romperían el par started/ended del audio. */
  private adInProgress = false;

  /**
   * @param presenter función que muestra/oculta el overlay de UI (inyectada por main.ts).
   * @param now reloj inyectable que se pasa a `RewardCooldownTracker`, para que
   *   los specs puedan vencer la ventana de 60 s sin mockear `Date.now`.
   *   Por defecto usa el reloj real, igual que `CrazyGamesService`.
   */
  constructor(presenter: AdOverlayPresenter, now: () => number = () => Date.now()) {
    this.presenter = presenter;
    this.rewardCooldown = new RewardCooldownTracker(now);
  }

  /**
   * Equivalente simétrico a `CrazyGamesService.init()` para que main.ts
   * (composition root) pueda cablear el adapter elegido por `VITE_ADS` con
   * la misma forma de código en cualquier modo (ADR-007). No-op que
   * resuelve de inmediato: no hay SDK externo que inicializar — el overlay
   * se monta recién cuando un `show*Ad()` invoca al presenter. Llamarla
   * más de una vez es seguro.
   */
  init(): Promise<void> {
    return Promise.resolve();
  }

  /**
   * Siempre `true`: sin SDK externo no hay "modo deshabilitado" — en un
   * navegador normal siempre hay anuncios propios que servir (el contenido
   * lo proveemos nosotros). Por eso este adapter jamás reporta
   * `sdk_unavailable` (el estado existe para cuando falta el script de
   * CrazyGames, ver ADR-007).
   */
  isAvailable(): boolean {
    return true;
  }

  /** Azúcar: `rewardedAdStatus() === 'available'` (fuente única de la lógica). */
  isRewardedAdAvailable(): boolean {
    return this.rewardedAdStatus() === 'available';
  }

  /**
   * Motivo por el que hoy NO se puede ofrecer un rewarded (o
   * `'available'`). Solo consulta el tracker de cooldown: este adapter
   * NUNCA devuelve `adblock` ni `sdk_unavailable` — sin ad network no hay
   * qué bloquear (no hay script de terceros que un adblock pueda frenar)
   * ni SDK externo que falte (el overlay es nuestro). La política de
   * reembolso de ADR-006 cubre igual los estados que sí puede producir
   * (`cooldown_retryable`, cuando el jugador cancela el countdown): el
   * motivo del cooldown manda exactamente igual que en el adapter de
   * CrazyGames. Tampoco produce `cooldown_no_fill` (ver JSDoc de requestAd).
   */
  rewardedAdStatus(): RewardedAdStatus {
    return this.rewardCooldown.cooldownState() ?? 'available';
  }

  /**
   * Suscribe al ciclo de vida de este adapter: emite solo
   * `'started'`/`'ended'` (NO `'requesting'` — su overlay propio ES el
   * anuncio: no hay ventana de request sin cubrir, ADR-010). Devuelve la
   * función para desuscribirse (igual mecánica que CrazyGamesService).
   */
  onAdLifecycle(listener: AdLifecycleListener): () => void {
    this.lifecycleListeners.add(listener);
    return () => {
      this.lifecycleListeners.delete(listener);
    };
  }

  showRewardedAd(): Promise<AdResult> {
    return this.requestAd('rewarded');
  }

  showMidgameAd(): Promise<AdResult> {
    return this.requestAd('midgame');
  }

  /**
   * No-op: `gameplayStart`/`gameplayStop` son telemetría de la PLATAFORMA
   * CrazyGames (aparece en su dashboard de desarrolladores). En modo portal
   * no hay a quién reportar. La firma se mantiene para que main.ts y
   * GameScene no tengan que ramificar según el adapter elegido por
   * `VITE_ADS` (ADR-007) — mismo motivo que getUserLocale()/init().
   */
  reportGameplayStart(): void {
    // Sin destinatario: ver JSDoc del método.
  }

  /** No-op simétrico a `reportGameplayStart()` — ver su JSDoc. */
  reportGameplayStop(): void {
    // Sin destinatario: ver JSDoc de reportGameplayStart().
  }

  /**
   * Mejora sobre el adapter real: `CrazyGamesService.getUserLocale()`
   * devuelve `null` cuando el SDK no está disponible (fuera de CrazyGames
   * no hay locale reportable), mientras que acá el locale lo lee del
   * propio navegador (`navigator.language`) — así la auto-detección de
   * idioma (LanguageManager.applyDetectedLocale()) sigue funcionando en
   * portales externos. Guards con `typeof` + try/catch: en Node/SSR/test
   * sin `window`/`navigator` devuelve `null` y NUNCA lanza, mismo
   * criterio defensivo que el resto de los dos adapters.
   */
  async getUserLocale(): Promise<string | null> {
    try {
      if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return null;
      }
      const language: unknown = navigator.language;
      return typeof language === 'string' && language.length > 0 ? language : null;
    } catch {
      return null;
    }
  }

  private emitLifecycle(phase: AdLifecyclePhase, type: AdType): void {
    // Un listener que revienta no debe cortar el resto (ni el flujo del
    // ad): misma red de seguridad que CrazyGamesService.emitLifecycle().
    this.lifecycleListeners.forEach(listener => {
      try {
        listener(phase, type);
      } catch (error) {
        console.warn('[OwnRewardedAdService] Ad lifecycle listener threw', error);
      }
    });
  }

  /**
   * Flujo del overlay propio, simétrico a `CrazyGamesService.requestAd()`:
   *
   * 1. Emite `started` ANTES de mostrar el overlay — contrato del puerto:
   *    los consumidores (main.ts) silencian el juego recién cuando el ad
   *    se ve, no al pedirlo.
   * 2. Espera el presenter — o el watchdog de 15 s, lo que llegue primero;
   *    el resultado gana por orden de llegada (ver punto 7).
   * 3. `completed: true` → éxito (y en rewarded, limpia cooldown+motivo).
   * 4. `completed: false` → `user_cancelled`. **Causa raíz (R5 de la
   *    auditoría):** en producción con CrazyGames la cancelación del
   *    jugador se colapsa en `'error'` porque el SDK ajeno no la distingue
   *    — el motivo quedaba "muerto". Acá `'user_cancelled'` es honesto: el
   *    tracker lo registra como fallo `'other'` → `cooldown_retryable` →
   *    la política de ADR-006 muestra `RESULT_AD_COOLDOWN` con botones
   *    vivos y a los 60 s el jugador reintenta de verdad (reembolsar en
   *    este camino sería un forfeit autoinfligido).
   * 5. Si el presenter lanza (overlay roto, excepción de UI): se degrada a
   *    `'error'` — el puerto prohíbe rechazar la promesa hacia el caller.
   * 6. `ended` se emite en TODOS los caminos (finally), para restaurar el
   *    audio aunque algo falle a mitad de overlay.
   * 7. **Watchdog de 15 s** (`AD_WATCHDOG_MS`, espejo de la filosofía de
   *    `CrazyGamesService`): si el presenter nunca resuelve, a los 15 s se
   *    emite `'ended'` (audio restaurado) y se resuelve `'error'` vía
   *    `noteFailure('other')` → `cooldown_retryable` → sin reembolso,
   *    reintento real a los 60 s (ADR-006). El `Promise.race` tiene guard
   *    de asentado: **primer resultado gana**; un resultado del presenter
   *    que llegue DESPUÉS del timeout se descarta entero (ni `noteSuccess`,
   *    ni doble resolve, ni doble lifecycle — `'ended'` ya se emitió). Si
   *    el watchdog gana, la escena overlay puede quedar visible: el jugador
   *    la cierra con el ✕ — en la práctica es una ruta residual, porque los
   *    failsafes de `AdOverlayScene` están al inicio de `create()` (si la
   *    escena revienta antes de registrarlos, no hay overlay visible que
   *    cerrar de todos modos).
   *
   * Sobre `'no_fill'` / `cooldown_no_fill`: el countdown propio SIEMPRE
   * "llena" si el jugador lo completa — no existe "el ad network no tuvo
   * anuncio que servir". Este adapter jamás llama a
   * `noteFailure('no_fill')` y por lo tanto NUNCA produce
   * `cooldown_no_fill`; ese estado existe para el adapter de CrazyGames
   * (ahí sí hay un ad network externo con fallo ambiental posible).
   *
   * Paridad de tracker con `CrazyGamesService.settle()`: solo `rewarded`
   * toca el cooldown — `midgame` no lo arma ni lo limpia.
   */
  private async requestAd(type: AdType): Promise<AdResult> {
    // Un solo overlay a la vez (mismo guard que CrazyGamesService): si ya
    // hay uno en curso, el segundo se resuelve 'error' SIN tocar el
    // tracker — el jugador no vio ningún anuncio que pudiera "fallar".
    if (this.adInProgress) {
      return { success: false, reason: 'error' };
    }
    this.adInProgress = true;

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      this.emitLifecycle('started', type);

      // Watchdog contra un presenter colgado (ver AD_WATCHDOG_MS): el race
      // tiene guard de asentado — el primer resultado gana. `Promise.race`
      // engancha un handler en el presenter aunque ya haya ganado el
      // timeout, así que un rechazo TARDÍO tampoco se escapa como
      // unhandled rejection; su valor, en cambio, se descarta solo.
      const watchdog = new Promise<null>(resolve => {
        timer = setTimeout(() => {
          console.warn(
            `[OwnRewardedAdService] El overlay del ad "${type}" no respondió en ` +
              `${OwnRewardedAdService.AD_WATCHDOG_MS}ms (presenter colgado) — se libera el juego.`
          );
          resolve(null);
        }, OwnRewardedAdService.AD_WATCHDOG_MS);
      });
      const outcome = await Promise.race([this.presenter(type), watchdog]);

      if (outcome === null) {
        // GANÓ EL WATCHDOG: el presenter sigue colgado. Se degrada a
        // 'error' retryable (sin reembolso, reintento a los 60 s). El
        // resultado tardío del presenter, si llega después, queda
        // descartado por el guard de asentado: esta ruta ya resolvió,
        // `finally` ya emitió 'ended' y el tracker ya registró el fallo.
        if (type === 'rewarded') {
          this.rewardCooldown.noteFailure('other');
        }
        return { success: false, reason: 'error' };
      }

      if (outcome.completed) {
        if (type === 'rewarded') {
          // Éxito → limpia cooldown Y motivo (vuelve a 'available' sin avanzar el reloj).
          this.rewardCooldown.noteSuccess();
        }
        return { success: true };
      }

      // Cancelación del jugador: motivo honesto en este adapter (ver JSDoc
      // de la clase y el punto 4 arriba) → 'other' → cooldown_retryable.
      if (type === 'rewarded') {
        this.rewardCooldown.noteFailure('other');
      }
      return { success: false, reason: 'user_cancelled' };
    } catch (error) {
      console.warn('[OwnRewardedAdService] El overlay presenter lanzó una excepción:', error);
      if (type === 'rewarded') {
        // Fallo "normal" (no ambiental) → siempre retryable, nunca no_fill.
        this.rewardCooldown.noteFailure('other');
      }
      return { success: false, reason: 'error' };
    } finally {
      // El timer se limpia SIEMPRE: en el flujo normal (3 s de countdown)
      // el watchdog queda armado y sin esto quedaría un timer de 15 s vivo
      // por request. Si ya venció, limpiarlo es inofensivo.
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      this.adInProgress = false;
      this.emitLifecycle('ended', type);
    }
  }
}
