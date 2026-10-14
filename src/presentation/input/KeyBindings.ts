/**
 * Fase 1 de controles de teclado — registro de keydown por tecla sobre un
 * target estructural (mismo patrón sin Phaser que `ClickTarget`/`UiSfx`).
 *
 * Causa (AGENTS §5): las suscripciones se desusan en SHUTDOWN/DESTROY con la
 * MISMA referencia de handler — por eso `bindKeys` registra el handler tal
 * cual (sin wrapper) y devuelve el `unsubscribe()` que hace `off` con los
 * pares exactos; wrappers romperían la igualdad referencial del emitter.
 */

/**
 * Estructural mínimo que cumplen los emisores de teclado de Phaser
 * (`on('keydown-<KEY>', handler)` / `off`) — este módulo NO importa Phaser.
 */
export interface KeyboardTargetLike {
  on(event: string, callback: (...args: never[]) => void): unknown;
  off(event: string, callback: (...args: never[]) => void): unknown;
}

/**
 * Registra cada `key → handler` como evento `'keydown-' + key` en `target`
 * usando la MISMA referencia de handler (sin wrapper) y devuelve un
 * `unsubscribe()` que hace `off` con esos mismos pares.
 *
 * - `target` nullish → no registra nada y el `unsubscribe` es un noop seguro.
 * - Doble llamada a `unsubscribe()` es segura (flag interno).
 */
export function bindKeys(
  target: KeyboardTargetLike | null | undefined,
  // `(...args: never[]) => void` en vez de `() => void`: una escena puede
  // necesitar el evento de Phaser (p. ej. `event.repeat` para ignorar el
  // auto-repeat de una flecha mantenida) sin caer en wrappers — que la
  // igualdad referencial on/off (AGENTS §5) prohíbe.
  bindings: Readonly<Record<string, (...args: never[]) => void>>
): () => void {
  if (!target) {
    return () => {
      // Nada registrado: desuscripción sin efecto, siempre segura de llamar.
    };
  }

  const entries = Object.entries(bindings);
  for (const [key, handler] of entries) {
    target.on('keydown-' + key, handler);
  }

  let unsubscribed = false;
  return () => {
    if (unsubscribed) return;
    unsubscribed = true;
    for (const [key, handler] of entries) {
      target.off('keydown-' + key, handler);
    }
  };
}
