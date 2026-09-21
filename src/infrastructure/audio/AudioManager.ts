import Phaser from 'phaser';
// Asegúrate de cambiar también AudioData a .ts o que exporte correctamente el objeto
import { AUDIO_MANIFEST } from './AudioData'; 

export default class AudioManager {
    private scene: Phaser.Scene;
    private musicVolume: number;
    private sfxVolume: number;
    private muted: boolean;
    private currentMusic: Phaser.Sound.BaseSound | null;
    private _warned: Set<string>;

    constructor(scene: Phaser.Scene) {
        this.scene = scene;
        this.musicVolume = 0.15;
        this.sfxVolume = 0.7;
        this.muted = false;
        this.currentMusic = null;
        this._warned = new Set<string>();
    }

    // --- MÚSICA (un solo tema sonando por vez, con crossfade) ---

    playMusic(key: string = 'music_gameplay', options: { fadeMs?: number; volume?: number } = {}): void {
        const fadeMs = options.fadeMs ?? 800;
        
        if (!this.hasSound(key)) return this._warnMissing(key);
        
        // Verificamos si es un sonido que se puede reproducir (WebAudio / HTML5 Audio)
        if (this.currentMusic && this.currentMusic.key === key && (this.currentMusic as any).isPlaying) return;

        this.stopMusic(fadeMs);

        const targetVolume = options.volume ?? this.musicVolume;
        const sound = this.scene.sound.add(key, { loop: true, volume: 0 });
        sound.play();
        this.currentMusic = sound;

        this.scene.tweens.add({
            targets: sound,
            volume: this.muted ? 0 : targetVolume,
            duration: fadeMs
        });
    }

    stopMusic(fadeMs: number = 500): void {
        if (!this.currentMusic) return;
        const music = this.currentMusic;
        this.currentMusic = null;

        if (fadeMs <= 0) {
            music.stop();
            return;
        }

        this.scene.tweens.add({
            targets: music,
            volume: 0,
            duration: fadeMs,
            onComplete: () => music.stop()
        });
    }

    // --- EFECTOS (one-shot) ---

    play(key: string, config: Phaser.Types.Sound.SoundConfig = {}): void {
        if (!this.hasSound(key)) return this._warnMissing(key);
        if (this.muted) return;

        this.scene.sound.play(key, { volume: this.sfxVolume, ...config });
    }

    // --- CONTROLES (mute / volumen) ---

    setMuted(muted: boolean): void {
        this.muted = muted;
        this.scene.sound.mute = muted;
    }

    toggleMuted(): boolean {
        this.setMuted(!this.muted);
        return this.muted;
    }

    setMusicVolume(v: number): void {
        this.musicVolume = Phaser.Math.Clamp(v, 0, 1);
        if (this.currentMusic) {
            // Evaluamos si el tipo de sonido tiene el método setVolume
            if ('setVolume' in this.currentMusic) {
                (this.currentMusic as any).setVolume(this.musicVolume);
            }
        }
    }

    setSfxVolume(v: number): void {
        this.sfxVolume = Phaser.Math.Clamp(v, 0, 1);
    }

    // --- UTIL ---

    hasSound(key: string): boolean {
        return this.scene.cache.audio.exists(key);
    }

    private _warnMissing(key: string): void {
        if (this._warned.has(key)) return;
        this._warned.add(key);
        console.warn(
            `[AudioManager] Falta el archivo de audio para "${key}". ` +
            `Revisá /public/audio/README.md y src/infrastructure/audio/AudioData.ts.`
        );
    }

    /**
     * Precarga TODO lo declarado en AUDIO_MANIFEST.
     */
    static preload(scene: Phaser.Scene): void {
        scene.load.setPath('audio/music/');
        AUDIO_MANIFEST.music.forEach((item: { key: string; file: string }) => scene.load.audio(item.key, item.file));

        scene.load.setPath('audio/sfx/');
        AUDIO_MANIFEST.sfx.forEach((item: { key: string; file: string }) => scene.load.audio(item.key, item.file));
    }
}