import Phaser from 'phaser';
import { applyFontFloor, getMinDesignFontPx } from '../../shared/utils/CompactScreen';

/**
 * Sube el tamaño de fuente de TODO texto Phaser cuando el juego se está
 * mostrando reducido (teléfonos, ventanas chicas), para que nunca quede por
 * debajo de ~12 px físicos. En escritorio a 720p o más el factor de
 * reducción es ≤ 1 y esto no hace nada.
 *
 * Se aplica en un único punto (TextStyle) en lugar de tocar los ~120
 * `fontSize` sueltos de las escenas. El piso se consulta AL CREAR cada
 * texto, con el factor de escala vigente en ese momento.
 *
 * Es best-effort: si Phaser cambiara esa API interna, se registra un aviso y
 * el juego sigue funcionando (solo sin el piso).
 */
export function installCompactTextFloor(game: Phaser.Game): void {
  try {
    const proto = Phaser.GameObjects.TextStyle.prototype as unknown as Record<string, unknown> & {
      setStyle: (this: unknown, style: unknown, updateText?: boolean, setDefaults?: boolean) => unknown;
      setFontSize: (this: unknown, size: string | number) => unknown;
    };
    if (proto['__compactFloorInstalled'] === true) {
      return;
    }

    const currentFloor = (): number => getMinDesignFontPx(game.scale.displayScale.x);

    const originalSetStyle = proto.setStyle;
    proto.setStyle = function (style: unknown, updateText?: boolean, setDefaults?: boolean): unknown {
      let patched = style;
      if (style && typeof style === 'object' && 'fontSize' in style) {
        const raw = (style as { fontSize?: string | number }).fontSize;
        if (raw !== undefined) {
          patched = { ...(style as object), fontSize: applyFontFloor(raw, currentFloor()) };
        }
      }
      return originalSetStyle.call(this, patched, updateText, setDefaults);
    };

    const originalSetFontSize = proto.setFontSize;
    proto.setFontSize = function (size: string | number): unknown {
      return originalSetFontSize.call(this, applyFontFloor(size, currentFloor()));
    };

    proto['__compactFloorInstalled'] = true;
  } catch (error) {
    console.warn('[CompactTextFloor] No se pudo instalar el piso de fuente; se sigue sin él.', error);
  }
}
