import Phaser from 'phaser';
import { HudIconButton } from './HudIconButton';
import { IAudioService } from '../../domain/ports/IAudioService';
import languageManager from '../../shared/i18n/LanguageManager';

const BUTTON_SIZE = 48; // >= 44px táctil, ya lo fuerza HudIconButton igual
const BUTTON_GAP = 14; // separación horizontal entre "Sonido" y "Pantalla Completa"
const EDGE_MARGIN = 20; // distancia del borde del botón al borde de la cámara

/**
 * Controles persistentes de Sonido (ON/OFF) y Pantalla Completa/Ventana,
 * anclados a la esquina INFERIOR derecha de la cámara — mismo
 * `HudIconButton` (panel + ícono + descripción al lado + feedback de
 * hover/press) que ya se usa en UIScene/GameScene.
 *
 * Se extrajo a un componente propio (en vez de duplicar la lógica en
 * cada escena) para que MainMenuScene, HowToPlayScene, DeckSelectionScene
 * y UIScene compartan EXACTAMENTE el mismo comportamiento y look & feel:
 * el jugador puede cambiar el tamaño de pantalla y silenciar/activar el
 * audio desde cualquier parte del juego, de forma coherente.
 *
 * Uso en cualquier escena:
 * ```ts
 * const hudControls = new SoundFullscreenControls(this, services.audioService);
 * this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => hudControls.destroy());
 * ```
 */
export class SoundFullscreenControls {
  private readonly scene: Phaser.Scene;
  private readonly audioService: IAudioService;
  private readonly muteButton: HudIconButton;
  private readonly fullscreenButton: HudIconButton;

  // Bound una sola vez para poder hacer `off()` con la MISMA referencia
  // en destroy() — pasar una arrow function nueva a `off()` no
  // desengancharía nada.
  private readonly handleScaleResize = (gameSize: Phaser.Structs.Size): void => {
    this.layout(gameSize.width, gameSize.height);
  };
  private readonly handleFullscreenChange = (): void => {
    this.refreshFullscreenButton();
  };
  // Bound una sola vez (mismo motivo que los dos de arriba) para poder
  // desuscribirse en destroy() con la MISMA referencia — ver
  // languageManager.onLanguageChanged(). Actualiza SOLO las etiquetas de
  // texto (íconos/estado no cambian con el idioma) y reacomoda el
  // renglón, ya que "Sonido Activado"/"Pantalla Completa" ocupan otro
  // ancho que "Sound On"/"Full Screen".
  private readonly handleLanguageChanged = (): void => {
    this.refreshMuteButton();
    this.refreshFullscreenButton();
  };
  // Desuscripción de LanguageManager — se resuelve en destroy(), mismo
  // patrón que los `off()` del ScaleManager de acá abajo.
  private readonly unsubscribeLanguageChanged: () => void;

  constructor(scene: Phaser.Scene, audioService: IAudioService) {
    this.scene = scene;
    this.audioService = audioService;

    // Alterna vía la capa de servicio de audio (IAudioService, la MISMA
    // instancia a nivel Game en todas las escenas) en vez de tocar
    // `this.sound.mute` directo, para no romper la abstracción de Clean
    // Architecture ya establecida en el resto del proyecto (ver
    // AudioService.ts).
    const initialMuted = audioService.isMuted();
    this.muteButton = new HudIconButton(
      scene,
      0,
      0,
      initialMuted ? 'hud-soundoff' : 'hud-soundon',
      () => {
        this.audioService.toggleMuted();
        this.refreshMuteButton();
      },
      { size: BUTTON_SIZE, label: languageManager.getText(initialMuted ? 'HUD_SOUND_OFF' : 'HUD_SOUND_ON') }
    );

    // `this.scene.scale.toggleFullscreen()` es la API nativa de Phaser 3
    // para esto; el ícono se actualiza solo cuando el ScaleManager
    // confirma el cambio real de estado (eventos ENTER_FULLSCREEN/
    // LEAVE_FULLSCREEN registrados más abajo), no de forma optimista al
    // click — así el ícono nunca queda "mintiendo" si el navegador/
    // iframe rechaza el pedido de fullscreen.
    this.fullscreenButton = new HudIconButton(
      scene,
      0,
      0,
      scene.scale.isFullscreen ? 'hud-windows' : 'hud-fullscreen',
      () => scene.scale.toggleFullscreen(),
      { size: BUTTON_SIZE, label: languageManager.getText(scene.scale.isFullscreen ? 'HUD_WINDOWED' : 'HUD_FULLSCREEN') }
    );

    this.layout(scene.scale.gameSize.width, scene.scale.gameSize.height);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleResize);
    scene.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, this.handleFullscreenChange);
    scene.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, this.handleFullscreenChange);
    // REQ i18n: reactividad en caliente — si el jugador cambia el idioma
    // en configuración mientras este componente ya está montado (HUD de
    // GameScene, o el propio MainMenuScene/HowToPlayScene/
    // DeckSelectionScene que lo instancian), las etiquetas se refrescan
    // sin recrear el componente.
    this.unsubscribeLanguageChanged = languageManager.onLanguageChanged(this.handleLanguageChanged);
  }

  /**
   * Recalcula la posición de ambos botones, anclados a la esquina
   * INFERIOR derecha de la cámara. Se llama una vez al crear el
   * componente, en cada evento `resize` del ScaleManager, y de nuevo
   * cada vez que cambia el texto de alguno de los dos botones (el ancho
   * de "Sonido ON"/"Sonido OFF" y "Pantalla Completa"/"Ventana" difiere).
   */
  private layout(width: number, height: number): void {
    const y = height - EDGE_MARGIN - BUTTON_SIZE / 2;
    const rightEdge = width - EDGE_MARGIN;
    const nextRightEdge = this.placeIconRightToLeft(this.muteButton, rightEdge, y);
    this.placeIconRightToLeft(this.fullscreenButton, nextRightEdge, y);
  }

  /**
   * Posiciona un botón con su ícono pegado a `rightEdge` y devuelve el
   * nuevo `rightEdge` para el siguiente botón: el borde izquierdo de LA
   * DESCRIPCIÓN de este botón, menos el espaciado entre botones — así la
   * descripción (ancho variable) nunca choca con el ícono del siguiente.
   */
  private placeIconRightToLeft(button: HudIconButton, rightEdge: number, y: number): number {
    const iconCenterX = rightEdge - BUTTON_SIZE / 2;
    button.setPosition(iconCenterX, y);
    return rightEdge - button.getTotalWidth() - BUTTON_GAP;
  }

  private refreshMuteButton(): void {
    const muted = this.audioService.isMuted();
    this.muteButton.setIconTexture(muted ? 'hud-soundoff' : 'hud-soundon');
    this.muteButton.setLabel(languageManager.getText(muted ? 'HUD_SOUND_OFF' : 'HUD_SOUND_ON'));
    this.layout(this.scene.scale.gameSize.width, this.scene.scale.gameSize.height);
  }

  private refreshFullscreenButton(): void {
    const isFullscreen = this.scene.scale.isFullscreen;
    this.fullscreenButton.setIconTexture(isFullscreen ? 'hud-windows' : 'hud-fullscreen');
    this.fullscreenButton.setLabel(languageManager.getText(isFullscreen ? 'HUD_WINDOWED' : 'HUD_FULLSCREEN'));
    this.layout(this.scene.scale.gameSize.width, this.scene.scale.gameSize.height);
  }

  /**
   * Limpieza completa: listeners del ScaleManager (RESIZE/
   * ENTER_FULLSCREEN/LEAVE_FULLSCREEN) + ambos HudIconButton (que a su
   * vez desenganchan sus propios listeners pointerover/pointerout/
   * pointerdown/pointerup, ver HudIconButton.destroy()). Debe llamarse
   * desde el SHUTDOWN de la escena dueña — el ScaleManager vive a nivel
   * Game, así que estos listeners NO se limpian solos con la escena.
   */
  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleResize);
    this.scene.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, this.handleFullscreenChange);
    this.scene.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, this.handleFullscreenChange);
    // REQ i18n: desuscripción del LanguageManager — es un singleton de
    // módulo (ver LanguageManager.ts) que vive más allá de esta escena,
    // así que sin este `unsubscribe()` cada MainMenuScene/GameScene/etc.
    // que se recrea iría apilando listeners sobre botones ya destruidos.
    this.unsubscribeLanguageChanged();
    this.muteButton.destroy();
    this.fullscreenButton.destroy();
  }
}