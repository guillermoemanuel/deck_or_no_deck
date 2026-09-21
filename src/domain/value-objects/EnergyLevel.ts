/**
 * Value Object: garantiza que la energia nunca exista en un estado invalido.
 * Inmutable — cada operacion retorna una nueva instancia.
 *
 * El "techo" (ceiling) de la barra ya NO es una constante fija: el upgrade
 * de partida "Tanque de Energía" lo aumenta dinámicamente durante la
 * partida en curso (ver GameSession.applyEnergyTankUpgrade). Por defecto
 * sigue siendo 100, igual que antes de ese refactor.
 */
export class EnergyLevel {
  private static readonly MIN = 0;
  private static readonly DEFAULT_CEILING = 100;

  // El punto de partida de una partida nueva (o al revivir) es la MITAD
  // del techo vigente — con el techo por defecto (100) sigue siendo 50,
  // igual que antes.
  private static readonly STARTING_RATIO = 0.5;

  private constructor(private readonly value: number, private readonly ceiling: number) {}

  static full(bonus = 0, ceiling: number = EnergyLevel.DEFAULT_CEILING): EnergyLevel {
    const starting = ceiling * EnergyLevel.STARTING_RATIO;
    return new EnergyLevel(EnergyLevel.clamp(starting + Math.max(0, bonus), ceiling), ceiling);
  }

  static of(value: number, ceiling: number = EnergyLevel.DEFAULT_CEILING): EnergyLevel {
    return new EnergyLevel(EnergyLevel.clamp(value, ceiling), ceiling);
  }

  drain(amount: number): EnergyLevel {
    // Acota simetricamente a [0, ceiling] — tanto para dano (positivo)
    // como para proteccion (negativo, que en realidad suma energia).
    return new EnergyLevel(EnergyLevel.clamp(this.value - amount, this.ceiling), this.ceiling);
  }

  restore(amount: number): EnergyLevel {
    return new EnergyLevel(EnergyLevel.clamp(this.value + amount, this.ceiling), this.ceiling);
  }

  /**
   * Upgrade "Tanque de Energía": sube el TECHO de la barra para el resto
   * de la partida actual. El aumento de capacidad se otorga tambien como
   * energia extra inmediata (mismo delta) — si no, agrandar el techo sin
   * tocar el valor actual haria que el PORCENTAJE mostrado bajara de
   * golpe (ej. 70/100=70% pasaria a 70/125=56%), un efecto "nerf" opuesto
   * a la intencion de comprar una mejora.
   */
  withNewCeiling(newCeiling: number): EnergyLevel {
    if (newCeiling <= this.ceiling) {
      throw new Error(`El nuevo techo (${newCeiling}) debe ser mayor al actual (${this.ceiling})`);
    }
    const capacityBonus = newCeiling - this.ceiling;
    return new EnergyLevel(EnergyLevel.clamp(this.value + capacityBonus, newCeiling), newCeiling);
  }

  isDepleted(): boolean {
    return this.value <= EnergyLevel.MIN;
  }

  toNumber(): number {
    return this.value;
  }

  getCeiling(): number {
    return this.ceiling;
  }

  toPercentageOfBase(): number {
    return (this.value / this.ceiling) * 100;
  }

  private static clamp(value: number, ceiling: number): number {
    return Math.min(ceiling, Math.max(EnergyLevel.MIN, value));
  }
}
