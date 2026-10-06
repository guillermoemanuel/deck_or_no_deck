import Phaser from 'phaser';
import { getServices } from '../GameServices';
import { getDeckSetup } from '../../domain/value-objects/DeckSetups';

/** A dónde ir tras precargar — ver PreloadScene.init(). */
export interface PreloadSceneData {
  readonly nextScene?: 'MainMenuScene' | 'GameScene';
}

export class PreloadScene extends Phaser.Scene {
  // Por defecto vuelve al menú (arranque normal de la app vía BootScene).
  // DeckSelectionScene la relanza pidiendo 'GameScene' explícitamente —
  // ver el comentario en preload() sobre por qué hace falta re-precargar.
  private nextScene: NonNullable<PreloadSceneData['nextScene']> = 'MainMenuScene';

  constructor() {
    super({ key: 'PreloadScene' });
  }

  init(data: PreloadSceneData): void {
    this.nextScene = data?.nextScene ?? 'MainMenuScene';
  }

  preload(): void {
    this.renderLoadingBar();

    // Carga dinámica del mazo activo: PreloadScene lee el `selectedDeckId`
    // persistido (ProgressionManager) y resuelve los nombres de archivo
    // reales desde DECK_SETUPS. El resto del juego (CardView, GameScene,
    // etc.) sigue usando siempre las claves genéricas 'card-back',
    // 'card-front' y 'backdrop' — nunca necesitan saber qué tema está
    // activo, así que un mazo nuevo no requiere tocar ninguna otra escena.
    //
    // Esta escena se re-ejecuta cada vez que DeckSelectionScene confirma
    // una selección (ver su botón "Aceptar"), no solo al bootear la app:
    // el mazo activo puede haber cambiado respecto al que se cargó la
    // última vez, y Phaser permite recargar una textura bajo la misma key
    // sin problema (simplemente la reemplaza).
    const services = getServices(this);
    const selectedDeckId = services.progressionManager.getSelectedDeckId();
    const activeSetup = getDeckSetup(selectedDeckId);

    // BUGFIX crítico: Phaser NO sobreescribe una textura si la key ya
    // existe en el TextureManager (que vive a nivel del Game, sobrevive
    // a través de reinicios de escena) — simplemente ignora la nueva
    // carga y deja la textura vieja. Sin este removeIfExists(), cambiar
    // de mazo en DeckSelectionScene nunca se reflejaría visualmente tras
    // la primera partida.
    this.removeTextureIfExists('card-back');
    this.removeTextureIfExists('card-front');
    this.removeTextureIfExists('backdrop');
    this.removeTextureIfExists('banker-portrait');
    this.removeTextureIfExists('energy-bar-bg');
    this.removeTextureIfExists('energy-bar-fill');

    this.load.image('card-back', `assets/cards/${activeSetup.cardBack}.png`);
    this.load.image('card-front', `assets/cards/${activeSetup.cardFront}.png`);
    this.load.image('backdrop', `assets/ui/background/${activeSetup.background}.webp`);
    this.load.image('energy-bar-bg', `assets/ui/energy-bar/${activeSetup.energyBarBg}.webp`);
    this.load.image('energy-bar-fill', `assets/ui/energy-bar/${activeSetup.energyBarFill}.webp`);
    this.load.image('banker-portrait', `assets/ui/portrait/${activeSetup.portrait}.webp`);

    // Íconos del HUD (Tienda/Salir/Bono/Sonido/Pantalla Completa) — NO
    // dependen del mazo activo, así que se cargan una sola vez y no
    // pasan por removeTextureIfExists(): a diferencia de card-back/
    // card-front/backdrop/etc., estos assets nunca cambian entre
    // recargas de PreloadScene (selección de mazo), por lo que dejar la
    // textura ya cacheada de una carga anterior es exactamente lo que
    // queremos (evita una descarga de red redundante en cada partida).
    this.load.image('hud-shop', 'assets/ui/hud/shop.webp');
    this.load.image('hud-exit', 'assets/ui/hud/exit.webp');
    this.load.image('hud-bonus', 'assets/ui/hud/bonus.webp');
    this.load.image('hud-fullscreen', 'assets/ui/hud/fullscreen.webp');
    this.load.image('hud-windows', 'assets/ui/hud/window.webp');
    this.load.image('hud-soundon', 'assets/ui/hud/soundon.webp');
    this.load.image('hud-soundoff', 'assets/ui/hud/soundoff.webp');

    // Fondo fotográfico del Menú Principal (mesa/banquero, sin títulos ni
    // textos horneados en la imagen — MainMenuScene dibuja "DECK OR NO
    // DECK" y el subtítulo encima). Tampoco depende del mazo activo.
    this.load.image('main-menu-bg', 'assets/ui/main-menu.webp');

    // Música de gameplay del mazo activo: clave GENÉRICA + archivo
    // dinámico desde DeckSetups.musicGameplay (mismo patrón que card-back/
    // card-front — GameScene sigue pidiendo 'music_gameplay' sin saber qué
    // mazo está activo). Sin removeAudioIfExists() el LoaderPlugin SALTEA
    // la recarga (File.hasCacheConflict: la clave ya existe en la caché de
    // audio) y seguiría sonando la pista del mazo anterior — mismo
    // mecanismo del BUGFIX de texturas de más arriba.
    this.removeAudioIfExists('music_gameplay');
    this.load.audio('music_gameplay', `assets/audio/music/${activeSetup.musicGameplay}.mp3`);
    this.load.audio('sfx-card-open', 'assets/audio/sfx/card-open.mp3');
    this.load.audio('sfx-offer', 'assets/audio/sfx/offer.mp3');
  }

  private removeTextureIfExists(key: string): void {
    if (this.textures.exists(key)) {
      this.textures.remove(key);
    }
  }

  // Espejo de removeTextureIfExists() para la caché de audio (Cache.audio,
  // un BaseCache con el mismo contrato add/s/remove/exists). Ver comentario
  // del load.audio('music_gameplay') por qué hace falta.
  private removeAudioIfExists(key: string): void {
    if (this.cache.audio.exists(key)) {
      this.cache.audio.remove(key);
    }
  }

  create(): void {
    if (this.nextScene === 'GameScene') {
      // Venimos de DeckSelectionScene con los assets del mazo elegido ya
      // recargados — entramos directo a la partida (misma secuencia que
      // el botón "JUGAR" del menú).
      this.scene.start('GameScene');
      this.scene.launch('UIScene');
    } else {
      this.scene.start('MainMenuScene');
    }
  }

  private renderLoadingBar(): void {
    const { width, height } = this.cameras.main;
    const bg = this.add.image(width / 2, height / 2, 'loading-bg');
    const bar = this.add.image(width / 2 - 150, height / 2, 'loading-bar').setOrigin(0, 0.5);

    this.load.on('progress', (value: number) => {
      bar.setScale(value, 1);
    });

    this.load.on('complete', () => {
      bg.destroy();
      bar.destroy();
    });
  }
}