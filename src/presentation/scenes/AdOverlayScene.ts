import Phaser from 'phaser';
import type { AdType } from '../../domain/ports/ICrazyGamesService';
import type { TranslationKey } from '../../shared/i18n/LanguageData';
import { LocalizedText } from '../components/LocalizedText';
import { createAdOverlayResolution, type AdOverlayResult } from './AdOverlayScene.resolution';

/**
 * Clave de escena — única fuente para registrarla/iniciarla.
 * La escena NO está en la lista de `main.ts`: la registra en runtime el
 * presenter de acá abajo (el composition root solo la inyecta, ADR-007).
 */
export const AD_OVERLAY_KEY = 'AdOverlayScene';

/** Duración del anuncio propio: 3 s (constante tunable, ADR-007). */
export const AD_OVERLAY_DURATION_MS = 3000;

/** Cadencia de los ticks del contador. */
const AD_OVERLAY_TICK_MS = 1000;

// Paleta "Casino de Lujo" — misma convención que ShopScene/HowToPlayScene:
// panel carbón + borde de acento cian + filo dorado interior.
const PANEL_FILL = 0x121218;
const COLOR_GOLD = 0xffd76a;
const COLOR_GOLD_HEX = '#ffd76a';
const ACCENT_COLOR = 0x00e5ff;
const COLOR_DANGER = 0xff4d6d;
const COLOR_HINT_HEX = '#8b949e';

const PANEL_WIDTH = 560;
const PANEL_HEIGHT = 320;

/** Datos que el presenter pasa vía `game.scene.start(KEY, data)`. */
export interface AdOverlaySceneData {
  readonly type: AdType;
  readonly onDone: (result: AdOverlayResult) => void;
}

/**
 * Texto secundario según el tipo de anuncio — misma escena para ambos
 * (ADR-007: midgame también es un countdown de 3 s, NO se duplica la
 * escena): solo cambia la leyenda, porque "tu recompensa" no aplica a un
 * anuncio de mitad de partida.
 */
function hintKeyFor(type: AdType): TranslationKey {
  switch (type) {
    case 'rewarded':
      return 'AD_OVERLAY_HINT';
    case 'midgame':
      return 'AD_OVERLAY_HINT_MIDGAME';
  }
}

/**
 * AdOverlayScene — overlay de anuncio PROPIO (sin video, solo countdown de
 * 3 s) que dibuja la UI cuando el adapter de portales externos
 * (`VITE_ADS=portal`) pide un rewarded o un midgame (ADR-007).
 *
 * Esta escena NO toca audio ni eventos de negocio: el adapter emite el
 * lifecycle `'started'` antes de llamar al presenter (ya silenció el juego
 * desde `main.ts`) y `'ended'` cuando la promise de acá abajo resuelve —
 * acá solo hay que resolver y pararse.
 */
export class AdOverlayScene extends Phaser.Scene {
  constructor() {
    super({ key: AD_OVERLAY_KEY });
  }

  create(data: AdOverlaySceneData): void {
    if (!data) {
      // Arranque sin datos (nadie lo hace hoy: solo el presenter inicia
      // esta escena): no hay `onDone` que resolver ni nada que dibujar.
      this.scene.stop();
      return;
    }

    const { width, height } = this.cameras.main;
    const panelX = width / 2 - PANEL_WIDTH / 2;
    const panelY = height / 2 - PANEL_HEIGHT / 2;

    // Resolución normal de los dos caminos buenos/malos. `onDone` es
    // single-shot (ver createAdOverlayResolution), así que el apagado
    // normal que VIENE DESPUÉS de resolver queda descartado sin efecto.
    const finish = (completed: boolean): void => {
      data.onDone({ completed });
      this.scene.stop();
    };

    // Red de seguridad: si la escena se apaga por cualquier motivo
    // externo (scene.stop de otro lado, remove/destroy de la escena)
    // sin que el contador ni el ✕ hayan resuelto, la promise del
    // presenter NO queda colgada — resuelve `{ completed: false }` y el
    // adapter lo trata como cancelación (user_cancelled → cooldown
    // retryable → RESULT_AD_COOLDOWN, ADR-007). Se escucha también
    // DESTROY porque Phaser destruye escenas SIN emitir SHUTDOWN; el
    // listener de DESTROY se retira en el SHUTDOWN normal para no
    // acumular huérfanos entre una apertura y la siguiente.
    const failSafe = (): void => data.onDone({ completed: false });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.DESTROY, failSafe);
      failSafe();
    });
    this.events.once(Phaser.Scenes.Events.DESTROY, failSafe);

    // Pausa GameScene detrás del overlay — mismo criterio que ShopScene:
    // mientras dura el anuncio no debe avanzar el tablero ni el timer del
    // banquero. Se reanuda en SHUTDOWN sin importar por qué vía se cierre
    // (✕, contador, stop externo). El flag local evita "prestar" una pausa
    // que tomó OTRA escena (p. ej. la Tienda, que puede haber pausado
    // GameScene antes de pedir este mismo anuncio).
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

    // Backdrop bloqueador: cubre TODA la pantalla y es interactivo (sin
    // handler propio) — Phaser lo trata como el objeto "de encima" y no
    // despacha el click a GameScene/UIScene/ShopScene que siguen activas
    // debajo. Solo el ✕ cancela: tocar fuera del panel NO cierra el
    // anuncio (mismo criterio de bloqueo que el rectángulo de ShopScene).
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.75).setInteractive();

    // Panel centrado — mismo acabado "Casino de Lujo" que los modales de
    // HowToPlayScene/ShopScene: carbón + borde de acento + halo exterior +
    // filo dorado interior muy fino.
    const panel = this.add.graphics();
    panel.fillStyle(PANEL_FILL, 0.97).fillRoundedRect(panelX, panelY, PANEL_WIDTH, PANEL_HEIGHT, 18);
    panel.lineStyle(3, ACCENT_COLOR, 0.9).strokeRoundedRect(panelX, panelY, PANEL_WIDTH, PANEL_HEIGHT, 18);
    panel.lineStyle(8, ACCENT_COLOR, 0.15).strokeRoundedRect(panelX - 4, panelY - 4, PANEL_WIDTH + 8, PANEL_HEIGHT + 8, 20);
    panel.lineStyle(1, COLOR_GOLD, 0.2).strokeRoundedRect(panelX + 5, panelY + 5, PANEL_WIDTH - 10, PANEL_HEIGHT - 10, 14);

    new LocalizedText(this, width / 2, panelY + 46, 'AD_OVERLAY_TITLE', {
      fontFamily: 'Arial, sans-serif',
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);

    // Contador grande — el valor es un número puro (no una clave i18n),
    // por eso es un Text plano y no LocalizedText.
    const countdownText = this.add
      .text(
        width / 2,
        height / 2 - 10,
        String(Math.ceil(AD_OVERLAY_DURATION_MS / 1000)),
        {
          fontFamily: 'Arial, sans-serif',
          fontSize: '72px',
          fontStyle: 'bold',
          color: COLOR_GOLD_HEX
        }
      )
      .setOrigin(0.5);

    // Leyenda según tipo de anuncio (ver hintKeyFor) — LocalizedText se
    // re-renderiza sola si el jugador cambia de idioma con el overlay abierto.
    new LocalizedText(
      this,
      width / 2,
      panelY + PANEL_HEIGHT - 62,
      hintKeyFor(data.type),
      {
        fontFamily: 'Arial, sans-serif',
        fontSize: '15px',
        color: COLOR_HINT_HEX,
        align: 'center',
        wordWrap: { width: PANEL_WIDTH - 90 }
      }
    ).setOrigin(0.5);

    this.createCloseButton(panelX + PANEL_WIDTH - 32, panelY + 32, () => finish(false));

    // Cuenta regresiva con el timer de Phaser de la escena (sin
    // setInterval/polling, regla de eventos del proyecto): un tick por
    // segundo, `repeat` cubre 3 → 2 → 1, y el último tick cierra con
    // `{ completed: true }`. El valor mostrado se deriva del tiempo
    // restante real (Math.ceil(remaining / 1000)), así que un tick atrasado
    // (pestaña en background) muestra el número correcto en vez de mentir.
    const deadline = this.time.now + AD_OVERLAY_DURATION_MS;
    this.time.addEvent({
      delay: AD_OVERLAY_TICK_MS,
      repeat: AD_OVERLAY_DURATION_MS / AD_OVERLAY_TICK_MS - 1,
      callback: () => {
        const remaining = deadline - this.time.now;
        if (remaining <= 0) {
          finish(true);
          return;
        }
        countdownText.setText(String(Math.ceil(remaining / 1000)));
      }
    });
  }

  /** ✕ de cancelar — mismo chrome que el cierre de ShopScene (círculo peligro + hover). La '✕' es un glifo, no un string traducible. */
  private createCloseButton(x: number, y: number, onClose: () => void): void {
    const bg = this.add
      .circle(0, 0, 16, PANEL_FILL, 0.95)
      .setStrokeStyle(2, COLOR_DANGER, 0.8)
      .setInteractive({ useHandCursor: true });
    const label = this.add
      .text(0, 0, '✕', { fontSize: '16px', fontFamily: 'Arial, sans-serif', color: '#ffffff' })
      .setOrigin(0.5);

    bg.on('pointerover', () => bg.setFillStyle(0x6e2a2a, 0.95));
    bg.on('pointerout', () => bg.setFillStyle(PANEL_FILL, 0.95));
    bg.on('pointerup', onClose);

    this.add.container(x, y, [bg, label]);
  }
}

/**
 * Presenter del anuncio propio — vive en `presentation` y se INYECTA en
 * `main.ts` (composition root) HACIA el adapter de infraestructura
 * (ADR-007): `infrastructure/` no puede importar `presentation/`, así que
 * la dependencia va al revés — el adapter recibe esta función como
 * argumento, mismo patrón que GameServices/ProgressionManager (ADR-003).
 *
 * Contrato estructural que consume el adapter:
 * `(type: AdType) => Promise<{ completed: boolean }>` — siempre resuelve,
 * nunca rechaza:
 *
 * - `{ completed: true }`  → el contador llegó a 0 (anuncio completado).
 * - `{ completed: false }` → el jugador tocó ✕, o la escena se apagó sin
 *   resolver (red de seguridad) o el juego se destruyó — el adapter lo
 *   traduce a `user_cancelled` (cooldown retryable, ADR-007).
 *
 * Garantías:
 * - Registro idempotente: la escena se agrega a `game.scene` solo si
 *   todavía no existe (no se duplica entre un anuncio y el siguiente).
 * - Resolución única: la primera resolución gana (`resolveOnce`).
 * - No se cuelga: además de los SHUTDOWN/DESTROY de la propia escena, si
 *   el juego se destruye antes de que resuelva, resuelve
 *   `{ completed: false }` y desuscribe ese listener.
 *
 * @param game instancia sobre la que se registra/inicia la escena (la
 * recibe el adapter porque infrastructure no tiene acceso al juego).
 * @param type `'rewarded' | 'midgame'` — misma escena para ambos
 * (ADR-007); solo cambia la leyenda inferior.
 */
export function presentAdOverlay(game: Phaser.Game, type: AdType): Promise<AdOverlayResult> {
  const cleanups: Array<() => void> = [];
  const resolution = createAdOverlayResolution(() => {
    // Al resolverse, deja los listeners de seguridad desuscritos para no
    // acumularlos entre anuncios.
    for (const cleanup of cleanups.splice(0)) {
      cleanup();
    }
  });

  if (!game.scene.getScene(AD_OVERLAY_KEY)) {
    game.scene.add(AD_OVERLAY_KEY, AdOverlayScene, false);
  }

  // Red de seguridad a nivel juego: si Phaser se destruye con la escena
  // todavía sin resolver (o sin siquiera haber arrancado), la promise del
  // adapter NO queda colgada.
  const onGameDestroyed = (): void => {
    resolution.resolveOnce({ completed: false });
  };
  game.events.once(Phaser.Core.Events.DESTROY, onGameDestroyed);
  cleanups.push(() => game.events.off(Phaser.Core.Events.DESTROY, onGameDestroyed));

  game.scene.start(
    AD_OVERLAY_KEY,
    { type, onDone: resolution.resolveOnce } satisfies AdOverlaySceneData
  );

  return resolution.promise;
}
