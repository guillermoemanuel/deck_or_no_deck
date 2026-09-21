/**
 * Emisor propio, minimalista, sin dependencias.
 * NO usamos Phaser.Events.EventEmitter aqui porque este archivo
 * puede ser importado desde application/, que debe permanecer
 * agnostica de Phaser.
 */
export class SimpleEventEmitter<TEvent> {
  private listeners: Array<(event: TEvent) => void> = [];

  subscribe(listener: (event: TEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  emit(event: TEvent): void {
    this.listeners.forEach(listener => listener(event));
  }

  clear(): void {
    this.listeners = [];
  }
}
