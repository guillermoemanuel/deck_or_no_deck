import Phaser from 'phaser';
import { IAudioService, MusicPlayOptions, SoundPlayOptions } from '../../domain/ports/IAudioService';
import { AUDIO_MANIFEST } from './AudioData';

/**
 * AudioService: implementación concreta de IAudioService.
 *
 * ── DIAGNÓSTICO DEL BUG ORIGINAL (superposición de audio) ──────────────
 * La clase vieja (`AudioManager`) se instanciaba UNA VEZ POR ESCENA/
 * CONTROLADOR: `GameScene`, `ResultScene` y `GameSceneController` cada
 * uno hacía `new AudioManager(this)` y guardaba su propio `currentMusic`
 * privado. Como `scene.sound` en Phaser es en realidad una referencia al
 * MISMO `Phaser.Sound.BaseSoundManager` global (`game.sound`, compartido
 * por todas las escenas), el sonido en sí SÍ era único... pero la
 * REFERENCIA para poder detenerlo NO lo era.
 *
 * Resultado: cuando `ResultScene.exitToMainMenu()` llamaba a
 * `this.audioManager.stopMusic()`, ese `audioManager` era una instancia
 * de `ResultScene` que jamás había reproducido música (su `currentMusic`
 * nació en `null`) — la pista que en verdad sonaba pertenecía a la
 * instancia de `GameScene`, que nadie detenía. Al volver a entrar a
 * `GameScene`, se creaba una AudioManager nueva que reproducía la música
 * de cero, superpuesta sobre la anterior (que seguía viva en el
 * SoundManager global).
 *
 * ── LA SOLUCIÓN ─────────────────────────────────────────────────────────
 * `AudioService` se construye UNA SOLA VEZ en el Composition Root
 * (main.ts), recibiendo el `Phaser.Game` (no una `Phaser.Scene`), y se
 * inyecta a todas las escenas/controladores vía `GameServices` (mismo
 * mecanismo que `crazyGamesService` o `randomProvider`). Al vivir a nivel
 * de Game, sobrevive a la creación/destrucción de cualquier escena
 * individual, por lo que `currentMusic` es un estado único y consistente
 * sin importar cuántas escenas se apilen, reinicien o cierren.
 *
 * Por la misma razón, los fades NO usan `scene.tweens` (un TweenManager
 * atado a una escena puntual, que se destruye en su SHUTDOWN y cortaría
 * el fade a mitad de camino si la escena que lo inició ya no existe).
 * Se implementan con un loop manual sobre `requestAnimationFrame`,
 * independiente del ciclo de vida de cualquier escena.
 */
export class AudioService implements IAudioService {
  private readonly sound: Phaser.Sound.BaseSoundManager;
  private musicVolume = 0.45;
  private sfxVolume = 0.7;
  private muted = false;
  private currentMusic: Phaser.Sound.BaseSound | null = null;
  private currentFadeCancel: (() => void) | null = null;
  private readonly warned = new Set<string>();

  constructor(game: Phaser.Game) {
    // BUGFIX (audio overlap): tomamos el SoundManager del GAME, no el de
    // una escena. Es la misma instancia subyacente, pero anclar la
    // referencia acá (en un objeto que vive tanto como la app) es lo que
    // permite que exista un único punto de verdad para "qué está sonando".
    this.sound = game.sound;
  }

  /** Precarga todo lo declarado en AUDIO_MANIFEST (ver AudioData.ts). */
  static preload(scene: Phaser.Scene): void {
    scene.load.setPath('audio/music/');
    AUDIO_MANIFEST.music.forEach(item => scene.load.audio(item.key, item.file));

    scene.load.setPath('audio/sfx/');
    AUDIO_MANIFEST.sfx.forEach(item => scene.load.audio(item.key, item.file));
  }

  playMusic(key: string, options: MusicPlayOptions = {}): void {
    const fadeMs = options.fadeMs ?? 800;

    if (!this.hasSound(key)) {
      this.warnMissing(key);
      return;
    }

    // Si ya es la pista activa y sigue sonando, no reiniciar: evita un
    // corte/relanzamiento audible al reingresar a GameScene (p. ej. al
    // presionar "Jugar de nuevo", que reinicia la escena pero no debería
    // interrumpir la música si es la misma).
    if (this.currentMusic && this.currentMusic.key === key && this.isPlaying(this.currentMusic)) {
      return;
    }

    // Corta cualquier música previa (de cualquier escena) antes de iniciar
    // la nueva — este es el guardado central que faltaba en el diseño
    // anterior.
    this.stopMusic(fadeMs);

    const targetVolume = options.volume ?? this.musicVolume;
    const music = this.sound.add(key, { loop: true, volume: 0 });
    music.play();
    this.currentMusic = music;

    this.fade(music, this.muted ? 0 : targetVolume, fadeMs);
  }

  stopMusic(fadeMs = 500): void {
    if (!this.currentMusic) return;

    const music = this.currentMusic;
    this.currentMusic = null;
    this.cancelActiveFade();

    if (fadeMs <= 0) {
      music.stop();
      music.destroy();
      return;
    }

    this.fade(music, 0, fadeMs, () => {
      music.stop();
      music.destroy();
    });
  }

  stopAll(fadeMs = 0): void {
    // BUGFIX (bug_fix_audio_lifecycle): punto único de "silencio total".
    // ResultScene.exitToMainMenu() lo invoca ANTES de detener/transicionar
    // escenas, garantizando que ni la música de partida ni ningún efecto
    // en curso sobrevivan al volver al menú principal.
    this.stopMusic(fadeMs);
    this.sound.stopAll();
  }

  play(key: string, options: SoundPlayOptions = {}): void {
    if (this.muted) return;
    if (!this.hasSound(key)) {
      this.warnMissing(key);
      return;
    }

    this.sound.play(key, {
      volume: options.volume ?? this.sfxVolume,
      loop: options.loop ?? false
    });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.sound.mute = muted;
  }

  toggleMuted(): boolean {
    this.setMuted(!this.muted);
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMusicVolume(volume: number): void {
    this.musicVolume = Phaser.Math.Clamp(volume, 0, 1);
    if (this.currentMusic && 'setVolume' in this.currentMusic) {
      (this.currentMusic as unknown as { setVolume: (v: number) => void }).setVolume(this.musicVolume);
    }
  }

  setSfxVolume(volume: number): void {
    this.sfxVolume = Phaser.Math.Clamp(volume, 0, 1);
  }

  hasSound(key: string): boolean {
    return this.sound.game.cache.audio.exists(key);
  }

  private isPlaying(sound: Phaser.Sound.BaseSound): boolean {
    return (sound as unknown as { isPlaying?: boolean }).isPlaying === true;
  }

  private warnMissing(key: string): void {
    if (this.warned.has(key)) return;
    this.warned.add(key);
    console.warn(
      `[AudioService] Falta el archivo de audio para "${key}". ` +
        `Revisá /public/audio/README.md y src/infrastructure/audio/AudioData.ts.`
    );
  }

  private cancelActiveFade(): void {
    this.currentFadeCancel?.();
    this.currentFadeCancel = null;
  }

  /**
   * Fade manual de volumen, independiente de cualquier Scene.TweenManager
   * (ver comentario de clase). Cancelable para que un stopMusic()
   * disparado en medio de un fade previo no pise la limpieza del sonido.
   */
  private fade(sound: Phaser.Sound.BaseSound, target: number, durationMs: number, onComplete?: () => void): void {
    this.cancelActiveFade();

    const anySound = sound as unknown as { volume?: number; setVolume?: (v: number) => void };
    const start = anySound.volume ?? 0;

    if (durationMs <= 0) {
      this.setSoundVolume(sound, target);
      onComplete?.();
      return;
    }

    const startTime = performance.now();
    let cancelled = false;
    this.currentFadeCancel = () => {
      cancelled = true;
    };

    const step = (now: number): void => {
      if (cancelled) return;
      const t = Math.min(1, (now - startTime) / durationMs);
      this.setSoundVolume(sound, start + (target - start) * t);

      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        this.currentFadeCancel = null;
        onComplete?.();
      }
    };

    requestAnimationFrame(step);
  }

  private setSoundVolume(sound: Phaser.Sound.BaseSound, volume: number): void {
    const anySound = sound as unknown as { volume?: number; setVolume?: (v: number) => void };
    if (typeof anySound.setVolume === 'function') {
      anySound.setVolume(volume);
    } else {
      anySound.volume = volume;
    }
  }
}
