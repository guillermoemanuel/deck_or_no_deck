import Phaser from 'phaser';
import { IAudioService, MusicPlayOptions, SoundPlayOptions } from '../../domain/ports/IAudioService';
import { AUDIO_MANIFEST, SFX } from '../../shared/audio/AudioData';

/**
 * BUGFIX (bug_sfx_apilado): ventana (en ms) mínima entre dos
 * reproducciones de la MISMA clave. Dos clicks rápidos apilaban instancias
 * encima (sonido duplicado/golpeado); un eco real del juego tarda más.
 */
const ANTI_STACK_WINDOW_MS = 40;

/**
 * BUGFIX (bug_sfx_apilado): efectos que SÍ deben poder apilarse dentro de
 * la ventana — el contador de monedas dispara el mismo sample por moneda y
 * cortarlo sonaría un conteo entrecortado.
 */
const ANTI_STACK_EXEMPT_KEYS: readonly string[] = [SFX.COINS_COUNT];

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
  /**
   * CG-MON-002: silencio que impone la PLATAFORMA (`game.settings.muteAudio`
   * de CrazyGames o el override local `?muteAudio=true`) — capa SEPARADA
   * de `muted` (pref del jugador) porque el requisito de la plataforma es
   * explícito: *"This setting should take priority over your in-game audio
   * settings … be sure this doesn't enable the audio back if it is disabled
   * in the SDK settings"*. Por eso el efectivo es `muted || platformMuted`:
   * el toggle del HUD no puede re-encender lo que la plataforma silenció,
   * y al liberar la plataforma manda de vuelta el pref del jugador.
   */
  private platformMuted = false;
  private currentMusic: Phaser.Sound.BaseSound | null = null;
  private currentFadeCancel: (() => void) | null = null;
  private readonly warned = new Set<string>();
  /** BUGFIX (bug_sfx_volumen_ignorado): volumen propio de cada SFX según AUDIO_MANIFEST.sfx. */
  private readonly sfxVolumes: ReadonlyMap<string, number>;
  /** BUGFIX (bug_sfx_apilado): último instante (ms) en que sonó cada clave. */
  private readonly lastPlayAt = new Map<string, number>();

  constructor(game: Phaser.Game, private readonly now: () => number = () => Date.now()) {
    // BUGFIX (audio overlap): tomamos el SoundManager del GAME, no el de
    // una escena. Es la misma instancia subyacente, pero anclar la
    // referencia acá (en un objeto que vive tanto como la app) es lo que
    // permite que exista un único punto de verdad para "qué está sonando".
    this.sound = game.sound;

    // BUGFIX (bug_sfx_volumen_ignorado): el `volume` de cada efecto en
    // AUDIO_MANIFEST.sfx se declaraba pero se IGNORABA al reproducir
    // (mandaba solo el global del jugador), con lo que un click sonaba tan
    // fuerte como una tirada de bombo. Se precalcula una vez por clave.
    this.sfxVolumes = new Map(AUDIO_MANIFEST.sfx.map(item => [item.key, item.volume ?? 1]));
  }

  // No existe `static preload()`: la carga es UNA sola y vive en
  // PreloadScene, que recorre AUDIO_MANIFEST al arrancar la partida. La
  // versión vieja apuntaba a paths inexistentes (`audio/music/` sin
  // `assets/`) y no tenía ningún llamador — PLAYBOOK §3, código muerto.

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
    if (this.isMuted()) return;
    if (!this.hasSound(key)) {
      this.warnMissing(key);
      return;
    }

    // BUGFIX (bug_sfx_apilado): dos clicks rápidos apilaban instancias de
    // la misma clave (sonido duplicado/golpeado). Dentro de la ventana se
    // descarta el disparo, salvo para las claves exentas del listado.
    const now = this.now();
    const lastPlayAt = this.lastPlayAt.get(key);
    if (
      !ANTI_STACK_EXEMPT_KEYS.includes(key) &&
      lastPlayAt !== undefined &&
      now - lastPlayAt < ANTI_STACK_WINDOW_MS
    ) {
      return;
    }
    this.lastPlayAt.set(key, now);

    // BUGFIX (bug_sfx_volumen_ignorado): el volumen del manifiesto
    // (AUDIO_MANIFEST.sfx[key].volume) se ignoraba y mandaba solo el
    // global del jugador. Ahora se multiplican: el del manifiesto es el
    // balanceo de diseño, el global es lo que afina el jugador en la
    // configuración (el override puntual del caller también multiplica).
    this.sound.play(key, {
      volume: (options.volume ?? this.sfxVolume) * (this.sfxVolumes.get(key) ?? 1),
      loop: options.loop ?? false
    });
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.applyMute();
  }

  /**
   * CG-MON-002: capa de silencio de la plataforma — ver el JSDoc del
   * campo `platformMuted`. `true` silencia sin tocar el pref del
   * jugador; liberar (`false`) devuelve el control a ese pref.
   */
  setPlatformMuted(muted: boolean): void {
    if (this.platformMuted === muted) return;
    this.platformMuted = muted;
    this.applyMute();
  }

  toggleMuted(): boolean {
    // Apunta al ESTADO EFECTIVO (lo que el jugador oye): con la
    // plataforma silenciando, el click significa "que suene" y queda
    // registrado como pref (false) para que suene apenas la plataforma
    // libere — jamás enciende el audio contra el mute de la plataforma.
    this.setMuted(!this.isMuted());
    return this.isMuted();
  }

  isMuted(): boolean {
    return this.muted || this.platformMuted;
  }

  /** Fuente única del estado audible: pref del jugador O silencio de plataforma. */
  private applyMute(): void {
    this.sound.mute = this.muted || this.platformMuted;
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
    // BUGFIX (bug_warnmissing_path): el mensaje viejo apuntaba a
    // /public/audio/README.md (inexistente) y a la ubicación anterior del
    // manifiesto; señalaba un path con el que nadie podía depurar. La
    // carpeta se elige según la familia: este método lo comparten play()
    // y playMusic(), y apuntar solo a sfx/ desorientaba ante una música
    // faltante.
    const folder = key.startsWith('sfx-') ? 'public/assets/audio/sfx/' : 'public/assets/audio/music/';
    console.warn(
      `[AudioService] Falta el archivo de audio para "${key}". ` +
        `Revisá ${folder} y src/shared/audio/AudioData.ts.`
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
