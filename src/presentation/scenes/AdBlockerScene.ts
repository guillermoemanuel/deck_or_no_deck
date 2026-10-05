import Phaser from 'phaser';
import type { AdLifecycleListener } from '../../domain/ports/ICrazyGamesService';

/**
 * Clave de escena — única fuente para iniciarla. La escena SÍ está en el
 * `config.scene` de `main.ts` (al final de la lista: se dibuja arriba de
 * todo) y arranca dormida hasta el primer `game.scene.start()` — misma
 * lección del BUGFIX de AdOverlayScene: registrar en boot, NUNCA
 * `scene.add()` en runtime (carrera con la cola de Phaser).
 */
export const AD_BLOCKER_KEY = 'AdBlockerScene';

// Misma convención visual que AdOverlayScene: fondo carbón translúcido +
// acento cian.
const BACKDROP_ALPHA = 0.65;
const ACCENT_COLOR = 0x00e5ff;
const SPINNER_RADIUS = 26;
const SPINNER_ARC = 270; // grados del arco visible (el resto es el "hueco")
const SPINNER_TURN_MS = 900; // vuelta completa — sin setInterval (regla de eventos)

/**
 * AdBlockerScene — bloqueador de UI genérico durante un ciclo de anuncio
 * del SDK externo (CG-MON-001, ADR-010).
 *
 * Causa raíz: en modo `crazygames` nada bloqueaba la UI durante
 * `request → adStarted → adFinished/adError` — `ResultScene` dejaba
 * "Jugar de nuevo"/"Ir al Menú" vivos, y la navegación corría con el ad
 * en vuelo (el guard `adInProgress` rechazaba el 2.º request pero
 * `onComplete()` navegaba igual, reiniciando GameScene a mitad de anuncio).
 * Requisito oficial: *"Block the UI until either an adFinished or adError
 * event occurs"* (docs.crazygames.com/requirements/ads/).
 *
 * No se cuelga en modo `portal`: ahí `AdOverlayScene` ya ES el
 * bloqueador del overlay propio (su backdrop interactivo + la pausa de
 * GameScene) — tener los dos apilaría fondo y spinner sobre el
 * countdown. El cable `createAdBlockerListener()` decide eso en
 * `main.ts` (composition root).
 *
 * Mecánica (idéntica a AdOverlayScene, que ya está probada en vivo):
 * - Backdrop de pantalla completa **interactivo sin handler**: Phaser lo
 *   trata como el objeto de encima y NO despacha el click a
 *   GameScene/UIScene/ResultScene que siguen activas debajo.
 * - Pausa GameScene mientras dura el ad (mismo criterio que
 *   AdOverlayScene/ShopScene: el tablero y el timer del banquero no
 *   deben avanzar durante el anuncio), con flag local para no "prestar"
 *   una pausa que tomó otra escena — se reanuda en SHUTDOWN sin importar
 *   por qué vía se baje la escena.
 * - Spinner (arco girando con tween de Phaser): sin texto visible, así
 *   que NO necesita claves i18n.
 */
export class AdBlockerScene extends Phaser.Scene {
  constructor() {
    super({ key: AD_BLOCKER_KEY });
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // Pausa GameScene detrás — mismo patrón y razón que AdOverlayScene.
    let pausedGameScene = false;
    if (this.scene.isActive('GameScene')) {
      this.scene.pause('GameScene');
      pausedGameScene = true;
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (pausedGameScene) {
        this.scene.resume('GameScene');
      }
    });

    // Backdrop bloqueador: cubre TODA la pantalla e interactivo (sin
    // handler propio) — absorbe los clicks de las escenas debajo. Sin
    // cerrar: solo el 'ended' del ciclo baja esta escena.
    this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, BACKDROP_ALPHA)
      .setInteractive();

    // Spinner — tween de Phaser sobre el arco (sin timers propios).
    const spinner = this.add.arc(width / 2, height / 2, SPINNER_RADIUS, 0, SPINNER_ARC, false);
    spinner.setStrokeStyle(5, ACCENT_COLOR, 0.95);
    this.tweens.add({ targets: spinner, angle: 360, duration: SPINNER_TURN_MS, repeat: -1 });
  }
}

/**
 * Cable del ciclo de vida del adapter → `AdBlockerScene` (CG-MON-001).
 *
 * Contrato (espejo de `AdLifecyclePhase`):
 * - `'requesting'` o `'started'` → levanta el bloqueador UNA sola vez
 *   por ciclo (el flag `active` evita doble launch si llegan las dos
 *   fases, y permite relanzar si un `'ended'` tardío de un ciclo previo
 *   lo bajó).
 * - `'ended'` → lo baja **solo si estaba activo** (nunca `stop` de una
 *   escena que no corre — Phaser lo advertiría).
 *
 * Se conecta en `main.ts` SOLO fuera del modo `portal` (en portal,
 * AdOverlayScene ya bloquea) — ver ADR-010.
 *
 * @param game instancia sobre la que se start/stop la escena (la misma
 *   que recibe el presenter de AdOverlayScene: composition root).
 */
export function createAdBlockerListener(game: Phaser.Game): AdLifecycleListener {
  let active = false;
  return phase => {
    if (phase === 'ended') {
      if (active) {
        active = false;
        game.scene.stop(AD_BLOCKER_KEY);
      }
      return;
    }
    // 'requesting' o 'started': levantar una sola vez por ciclo.
    if (!active) {
      active = true;
      game.scene.start(AD_BLOCKER_KEY);
    }
  };
}
