import { IRandomProvider } from '../../domain/ports/IRandomProvider';
import { CASE_VALUES } from '../../domain/value-objects/CaseValues';

/**
 * Adapter: implementa IRandomProvider usando crypto.getRandomValues,
 * NO Math.random(). Para un juego cuyo core loop es "confia en que el
 * barajado es justo", usar una fuente criptografica es una decision de
 * integridad del producto, no solo de calidad tecnica.
 */
export class CryptoRandomProvider implements IRandomProvider {
  shuffle<T>(items: readonly T[]): T[] {
    const result = [...items];

    for (let i = result.length - 1; i > 0; i--) {
      const j = this.secureRandomInt(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
  }

  generateBoardValues(): number[] {
    return this.shuffle(CASE_VALUES);
  }

  /**
   * Genera un entero uniforme en [0, exclusiveMax) usando crypto.getRandomValues,
   * con RECHAZO de valores fuera de rango para eliminar el sesgo de modulo.
   */
  private secureRandomInt(exclusiveMax: number): number {
    if (exclusiveMax <= 0) {
      throw new Error('exclusiveMax must be positive');
    }
    if (exclusiveMax === 1) {
      return 0;
    }

    const cryptoObj = this.resolveCrypto();
    const maxValidValue = 256 - (256 % exclusiveMax);
    const buffer = new Uint8Array(1);

    let value: number;
    do {
      cryptoObj.getRandomValues(buffer);
      value = buffer[0];
    } while (value >= maxValidValue);

    return value % exclusiveMax;
  }

  private resolveCrypto(): Crypto {
    if (typeof window !== 'undefined' && window.crypto) {
      return window.crypto;
    }
    throw new Error('CryptoRandomProvider requires a browser environment with window.crypto');
  }
}
