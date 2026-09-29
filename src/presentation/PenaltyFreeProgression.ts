import { IProgressionService } from '../domain/ports/IProgressionService';

/**
 * Envuelve el servicio de progresión para una partida SIN castigo por
 * derrota (Desafío Diario): todo se delega tal cual — premios, upgrades,
 * monedas — salvo `applyLossPenalty`, que no hace nada. Se usa un Proxy en
 * lugar de reimplementar cada método, así cualquier método futuro del puerto
 * sigue funcionando sin tocar esta clase.
 */
export function createPenaltyFreeProgression(base: IProgressionService): IProgressionService {
  return new Proxy(base, {
    get(target, property) {
      if (property === 'applyLossPenalty') {
        return () => undefined;
      }
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}
