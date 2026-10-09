import Phaser from 'phaser';
import { HudIconButton } from './HudIconButton';
import { IAudioService } from '../../domain/ports/IAudioService';
import languageManager from '../../shared/i18n/LanguageManager';

const BUTTON_SIZE = 48; // >= 44px táctil, ya lo fuerza HudIconButton igual
const BUTTON_GAP = 14; // separación horizontal entre "Sonido" y "Pantalla Completa"
const EDGE_MARGIN = 20; // distancia del borde del botón al borde de la cámara

/**
 * Controles persistentes de Sonido (ON/OFF) y, opcionalmente, Pantalla
 * Completa/Ventana — anclados a la esquina INFERIOR derecha de la
 * cámara — mismo `HudIconButton` (panel + ícono + descripción al lado +
 * feedback de hover/press) que ya se usa en UIScene/GameScene.
 *
 * Se extrajo a un componente propio (en vez de duplicar la lógica en
 * cada escena) para que MainMenuScene, HowToPlayScene, DeckSelectionScene
 * y UIScene compartan EXACTAMENTE el mismo comportamiento y look & feel.
 *
 * BOTÓN DE PANTALLA COMPLETA — apagado por defecto (ADR-008):
 * CrazyGames prohíbe explícitamente los botones de pantalla completa
 * dentro del propio juego ("Custom in-game fullscreen buttons are
 * prohibited, as they can interfere with other features") — ellos ya
 * proveen el suyo alrededor del iframe. Por eso el default del flag es
 * `false`: un build sin configuración nunca incumple (default seguro,
 * coherente con el default `'crazygames'` de `VITE_ADS`).
 *
 * El flag real viaja en el bag `services.fullscreenEnabled`
 * (`GameServices`), resuelto por `main.ts` desde `VITE_FULLSCREEN` +
 * `VITE_ADS` con `resolveFullscreenEnabled()` (ADR-008): en modo
 * crazygames es `false` SIEMPRE (la prohibición de la plataforma manda
 * sobre la env); en portal/none lo decide la env que escribe la tool
 * `/ads-adapter` junto a `VITE_ADS`. Las 4 escenas que instancian este
 * componente lo pasan explícitamente:
 * ```ts
 * new SoundFullscreenControls(this, services.audioService, services.fullscreenEnabled);
 * ```
 * (Antes de ADR-008 el default era `true` mientras este JSDoc juraba lo
 * contrario: las 4 escenas heredaban el botón prohibido — CG-PUB-002 de
 * la auditoría de publicación, con spec rojo→verde.)
 *
 * Uso en cualquier escena (CrazyGames, con Sonido únicamente):
 * ```ts
 * const hudControls = new SoundFullscreenControls(this, services.audioService);
 * this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => hudControls.destroy());
 * ```
 */
export class SoundFullscreenControls {
  private readonly scene: Phaser.Scene;
  private readonly audioService: IAudioService;
  private readonly muteButton: HudIconButton;
  // `null` cuando showFullscreenButton=false (default) — el botón NUNCA
  // se instancia en ese caso, no solo se oculta, para no dejar un
  // GameObject invisible escuchando el ScaleManager de más.
  private readonly fullscreenButton: HudIconButton | null;

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

  /**
   * @param showFullscreenButton Default `false` (ADR-008 — prohibición de
   * CrazyGames, ver el comentario de la clase). Las escenas pasan el
   * flag resuelto: `services.fullscreenEnabled`.
   */
  constructor(scene: Phaser.Scene, audioService: IAudioService, showFullscreenButton: boolean = false) {
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
      { size: BUTTON_SIZE, label: languageManager.getText(initialMuted ? 'HUD_SOUND_OFF' : 'HUD_SOUND_ON') },
      this.audioService
    );

    // iPhone/iOS Safari no ofrece Fullscreen API para páginas: el botón no
    // haría nada (QA no admite botones sin efecto), así que no se crea.
    if (showFullscreenButton && scene.scale.fullscreen.available) {
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
        { size: BUTTON_SIZE, label: languageManager.getText(scene.scale.isFullscreen ? 'HUD_WINDOWED' : 'HUD_FULLSCREEN') },
        this.audioService
      );
      scene.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, this.handleFullscreenChange);
      scene.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, this.handleFullscreenChange);
    } else {
      this.fullscreenButton = null;
    }

    this.layout(scene.scale.gameSize.width, scene.scale.gameSize.height);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleResize);
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
    // Sin botón de Pantalla Completa (default), "Sonido" queda solo,
    // pegado al borde — no hay un segundo botón que encadenar.
    if (this.fullscreenButton) {
      this.placeIconRightToLeft(this.fullscreenButton, nextRightEdge, y);
    }
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

  /** No-op si el botón está desactivado (`fullscreenButton === null`) — deja llamar a este método sin condicionales en cada call site (handleFullscreenChange, handleLanguageChanged). */
  private refreshFullscreenButton(): void {
    if (!this.fullscreenButton) return;

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
    // Estos dos solo se engancharon en el constructor si
    // showFullscreenButton=true (ver arriba) — `off()` de un listener
    // nunca enganchado es un no-op inofensivo en Phaser, pero se guarda
    // detrás del mismo `if` por simetría/legibilidad con el alta.
    if (this.fullscreenButton) {
      this.scene.scale.off(Phaser.Scale.Events.ENTER_FULLSCREEN, this.handleFullscreenChange);
      this.scene.scale.off(Phaser.Scale.Events.LEAVE_FULLSCREEN, this.handleFullscreenChange);
    }
    // REQ i18n: desuscripción del LanguageManager — es un singleton de
    // módulo (ver LanguageManager.ts) que vive más allá de esta escena,
    // así que sin este `unsubscribe()` cada MainMenuScene/GameScene/etc.
    // que se recrea iría apilando listeners sobre botones ya destruidos.
    this.unsubscribeLanguageChanged();
    this.muteButton.destroy();
    this.fullscreenButton?.destroy();
  }
}