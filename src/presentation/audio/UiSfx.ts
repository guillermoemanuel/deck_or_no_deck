import { IAudioService } from '../../domain/ports/IAudioService';
import { SFX } from '../../shared/audio/AudioData';

/**
 * Estructural mínimo del pointer de Phaser que lee el guard de
 * `bindUiClick` — este módulo NO importa Phaser, igual que ClickTarget.
 */
export interface ClickPointerLike {
  readonly downY: number;
  readonly y: number;
}

/**
 * Estructural mínimo que cumplen los GameObjects interactivos de Phaser
 * (`on(event, callback)`) — este módulo NO importa Phaser.
 */
export interface ClickTarget {
  on(event: 'pointerup', callback: (pointer?: ClickPointerLike) => void): unknown;
}

/**
 * Punto único del click genérico de UI: registra un `pointerup` en el
 * target que reproduce `SFX.CLICK` (best-effort, mismo patrón silencioso
 * que CardView — un fallo de audio nunca rompe la interacción).
 *
 * Sin `audio` no se registra NADA (target queda como estaba).
 *
 * `shouldPlay` (opcional): guard para suppress el sonido cuando el
 * pointerup NO representa un click real — usado por la Tienda compacta
 * para no sonar el click cuando un arrastre de scroll termina sobre un
 * botón (click fantasma). Se invoca SOLO si el evento trae pointer; si el
 * guard decide, el play se salta. Sin guard el comportamiento es idéntico
 * al histórico.
 *
 * NOTA deliberada: NO va en CardView ni en los botones Trato/No trato de
 * BankerOfferPanel — esos tienen sus propios sonidos (variantes de carta,
 * deal/no-deal), y el click genérico los encimaría.
 */
export function bindUiClick(
  target: ClickTarget,
  audio?: IAudioService,
  shouldPlay?: (pointer: ClickPointerLike) => boolean
): void {
  if (!audio) return;
  target.on('pointerup', (pointer?: ClickPointerLike) => {
    if (shouldPlay && pointer && !shouldPlay(pointer)) {
      return;
    }
    try {
      audio.play(SFX.CLICK);
    } catch {
      // Audio best-effort: nunca propaga al handler de interacción.
    }
  });
}
