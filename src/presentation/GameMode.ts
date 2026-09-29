import Phaser from 'phaser';

/**
 * Modo con el que va a arrancar la próxima GameScene. Se pasa por `registry`
 * (igual que GameServices) y NO por los datos de `scene.start(...)`, porque
 * Phaser conserva los datos de la última llamada cuando se reinicia una
 * escena sin datos (`scene.restart()` desde "Jugar de nuevo"): un desafío
 * diario se repetiría solo. Acá el pedido se CONSUME una única vez.
 */
export type GameMode = { readonly mode: 'normal' } | { readonly mode: 'daily'; readonly dateKey: string };

const REGISTRY_KEY = 'gameMode:pending';

export function requestDailyChallenge(registry: Phaser.Data.DataManager, dateKey: string): void {
  registry.set(REGISTRY_KEY, { mode: 'daily', dateKey } satisfies GameMode);
}

/** Descarta un pedido pendiente (p. ej. el jugador volvió al menú sin llegar a jugar). */
export function clearPendingGameMode(registry: Phaser.Data.DataManager): void {
  registry.remove(REGISTRY_KEY);
}

/**
 * Lee y CONSUME el modo pendiente. Si el pedido es de un día que ya no es
 * "hoy" (la partida se demoró pasada la medianoche UTC), cae a modo normal
 * para no completar el desafío equivocado.
 */
export function consumeGameMode(registry: Phaser.Data.DataManager, todayKey: string): GameMode {
  const pending = registry.get(REGISTRY_KEY) as GameMode | undefined;
  registry.remove(REGISTRY_KEY);
  if (pending && pending.mode === 'daily' && pending.dateKey === todayKey) {
    return pending;
  }
  return { mode: 'normal' };
}
