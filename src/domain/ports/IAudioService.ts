/**
 * Puerto (contrato) que el dominio/presentación consumen, pero que NO
 * implementan. Aplica Dependency Inversion (igual que ICrazyGamesService e
 * IRandomProvider): las Escenas y Controladores de Phaser dependen SOLO de
 * esta abstracción, nunca de `Phaser.Sound.*` ni de `scene.sound`
 * directamente. La implementación concreta (Web Audio / HTML5 Audio vía
 * Phaser) vive en infrastructure/audio/AudioService.ts.
 *
 * Nótese que esta interfaz no importa nada de "phaser" — un puerto de
 * dominio no debe conocer el framework de turno.
 */

export interface MusicPlayOptions {
  /** Duración del fade-in/crossfade en ms. Default a criterio de la implementación. */
  fadeMs?: number;
  /** Volumen objetivo (0..1). Si se omite, se usa el volumen de música configurado. */
  volume?: number;
}

export interface SoundPlayOptions {
  /** Volumen (0..1). Si se omite, se usa el volumen de efectos configurado. */
  volume?: number;
  /** Si el efecto debe repetirse en loop (por defecto false). */
  loop?: boolean;
}

export interface IAudioService {
  /**
   * Reproduce una pista de música en loop. Si ya es la pista activa,
   * no la reinicia (evita relanzar el mismo tema al reingresar a una
   * escena, p. ej. "Jugar de nuevo"). Si había otra música sonando,
   * la detiene (con fade) antes de iniciar la nueva.
   */
  playMusic(key: string, options?: MusicPlayOptions): void;

  /** Detiene la música actualmente activa (si la hay), con fade opcional. */
  stopMusic(fadeMs?: number): void;

  /** Reproduce un efecto de sonido "one-shot" (o en loop si se indica). */
  play(key: string, options?: SoundPlayOptions): void;

  /**
   * Detiene TODO audio activo (música + cualquier efecto en curso).
   * Punto único de "silencio total" a invocar en transiciones de salida
   * (p. ej. volver al menú principal) para evitar fugas/superposición.
   */
  stopAll(fadeMs?: number): void;

  setMuted(muted: boolean): void;
  toggleMuted(): boolean;
  isMuted(): boolean;

  setMusicVolume(volume: number): void;
  setSfxVolume(volume: number): void;

  /** Indica si una key de audio fue precargada y está disponible. */
  hasSound(key: string): boolean;
}
