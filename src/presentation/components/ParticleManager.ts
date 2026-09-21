import Phaser from 'phaser';

/**
 * ParticleManager: Gestiona emisores de particulas para elevar el juego
 * al estandar visual AAA Neon Arcade.
 *
 * Utiliza texturas generadas programaticamente en tiempo de ejecucion
 * (sin requerir imagenes PNG adicionales para particulas).
 */
export class ParticleManager {
  private static texturesInitialized = false;

  constructor(private readonly scene: Phaser.Scene) {
    ParticleManager.initTextures(scene);
  }

  private static initTextures(scene: Phaser.Scene): void {
    if (ParticleManager.texturesInitialized) return;

    // Crear textura de particula circular brillante
    if (!scene.textures.exists('particle_sparkle')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffffff, 1);
      g.fillCircle(8, 8, 8);
      g.generateTexture('particle_sparkle', 16, 16);
      g.destroy();
    }

    // Crear textura de particula tipo chispa o estrella
    if (!scene.textures.exists('particle_star')) {
      const g = scene.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0x00ffff, 1);
      g.fillRect(2, 6, 12, 4);
      g.fillRect(6, 2, 4, 12);
      g.generateTexture('particle_star', 16, 16);
      g.destroy();
    }

    ParticleManager.texturesInitialized = true;
  }

  /**
   * Explosion de chispas y confeti dorado/verde al ganar o cerrar un buen trato.
   */
  emitVictoryBurst(x: number, y: number): void {
    const emitter = this.scene.add.particles(x, y, 'particle_sparkle', {
      speed: { min: 100, max: 350 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.8, end: 0 },
      alpha: { start: 1, end: 0 },
      tint: [0x2ecc71, 0xf1c40f, 0x00ffff, 0xffffff],
      lifespan: { min: 600, max: 1200 },
      gravityY: 150,
      quantity: 40,
      emitting: false
    });

    emitter.explode(40);
    this.scene.time.delayedCall(1300, () => emitter.destroy());
  }

  /**
   * Destello de revelado al voltear una carta (azul cian si es baja, rojo neon si es alta).
   */
  emitCardRevealBurst(x: number, y: number, isHighValue: boolean): void {
    const tint = isHighValue ? [0xff3366, 0xff0033, 0xffffff] : [0x00ffff, 0x00ff88, 0xffffff];

    const emitter = this.scene.add.particles(x, y, 'particle_star', {
      speed: { min: 50, max: 180 },
      angle: { min: 0, max: 360 },
      scale: { start: 0.6, end: 0 },
      alpha: { start: 0.9, end: 0 },
      tint,
      lifespan: 400,
      quantity: 16,
      emitting: false
    });

    emitter.explode(16);
    this.scene.time.delayedCall(500, () => emitter.destroy());
  }

  /**
   * Chispas de alerta de energia critica (< 20%).
   */
  emitCriticalEnergySparks(x: number, y: number): Phaser.GameObjects.Particles.ParticleEmitter {
    return this.scene.add.particles(x, y, 'particle_sparkle', {
      speed: { min: 30, max: 80 },
      angle: { min: 250, max: 290 },
      scale: { start: 0.4, end: 0 },
      alpha: { start: 0.8, end: 0 },
      tint: [0xff3333, 0xff9900],
      lifespan: 500,
      frequency: 120
    });
  }
}
