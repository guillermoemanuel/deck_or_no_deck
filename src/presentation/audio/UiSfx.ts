import { IAudioService } from '../../domain/ports/IAudioService';
import { SFX } from '../../shared/audio/AudioData';

/**
 * Estructural mínimo que cumplen los GameObjects interactivos de Phaser
 * (`on(event, callback)`) — este módulo NO importa Phaser.
 */
export interface ClickTarget {
  on(event: 'pointerup', callback: () => void): unknown;
}

/**
 * Punto único del click genérico de UI: registra un `pointerup` en el
 * target que reproduce `SFX.CLICK` (best-effort, mismo patrón silencioso
 * que CardView — un fallo de audio nunca rompe la interacción).
 *
 * Sin `audio` no se registra NADA (target queda como estaba).
 *
 * NOTA deliberada: NO va en CardView ni en los botones Trato/No trato de
 * BankerOfferPanel — esos tienen sus propios sonidos (variantes de carta,
 * deal/no-deal) y el click genérico los encimaría.
 */
export function bindUiClick(target: ClickTarget, audio?: IAudioService): void {
  if (!audio) return;
  target.on('pointerup', () => {
    try {
      audio.play(SFX.CLICK);
    } catch {
      // Audio best-effort: nunca propaga al handler de interacción.
    }
  });
}
