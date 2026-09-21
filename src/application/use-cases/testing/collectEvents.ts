import { SimpleEventEmitter } from '../../../shared/utils/EventEmitter';

/**
 * Helper compartido: suscribe un array vacio al bus de eventos y lo retorna,
 * evitando repetir el boilerplate de suscripcion en cada test.
 */
export function collectEvents<TEvent>(eventBus: SimpleEventEmitter<TEvent>): TEvent[] {
  const events: TEvent[] = [];
  eventBus.subscribe(event => events.push(event));
  return events;
}
