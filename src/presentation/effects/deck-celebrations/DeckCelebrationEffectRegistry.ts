import { DeckSetupId } from '../../../domain/value-objects/DeckSetups';
import { DeckCelebrationEffect } from './DeckCelebrationEffect';
import { CyberpunkMatrixRainEffect } from './CyberpunkMatrixRainEffect';
import { BatSwarmEffect } from './BatSwarmEffect';
import { OvniAbductionEffect } from './OvniAbductionEffect';
import { GlacierShatterEffect } from './GlacierShatterEffect';
import { EgyptSandstormEffect } from './EgyptSandstormEffect';
import { NullCelebrationEffect } from './NullCelebrationEffect';
import { VegasRouletteEffect } from './VegasRouletteEffect';
import { WW2CombatEffect } from './WW2CombatEffect';
import { TheaterSpotlightsEffect } from './TheaterSpotlightsEffect';
import { MedievalSiegeEffect } from './MedievalSiegeEffect';
import { TarotAuraEffect } from './TarotAuraEffect';

/**
 * GRASP Polymorphism + Strategy: mapa COMPLETO mazo -> estrategia de
 * celebración. Agregar o mejorar el efecto de un mazo es un archivo
 * nuevo (o una edición aislada a uno existente) más UNA línea acá —
 * nunca un cambio en GameScene.ts ni en las estrategias de los demás
 * mazos.
 *
 * Es un `Record` COMPLETO (todas las DeckSetupId, no `Partial`) a
 * propósito: así el compilador OBLIGA a que todo mazo nuevo agregado a
 * DeckSetups.ts tenga una entrada acá (aunque sea el Null Object), en
 * vez de fallar en silencio en runtime si alguien se olvida.
 */
const noEffect = new NullCelebrationEffect();

const DECK_CELEBRATION_EFFECTS: Record<DeckSetupId, DeckCelebrationEffect> = {
  basic: new TheaterSpotlightsEffect(),
  cyberpunk: new CyberpunkMatrixRainEffect(),
  medieval: new MedievalSiegeEffect(),
  tarot: new TarotAuraEffect(),
  vegas: new VegasRouletteEffect(),
  ww2: new WW2CombatEffect(),
  dracula: new BatSwarmEffect(),
  glacier: new GlacierShatterEffect(),
  egypt: new EgyptSandstormEffect(),
  ovni: new OvniAbductionEffect()
};

/**
 * Resuelve la estrategia de celebración del mazo activo. Este es el
 * ÚNICO punto donde GameScene toca la registry — todo lo demás
 * (GameScene.playTopValueCardCelebration()) es una llamada polimórfica
 * ciega a `.play()`, sin ningún condicional sobre `deckId`.
 */
export function getDeckCelebrationEffect(deckId: DeckSetupId): DeckCelebrationEffect {
  return DECK_CELEBRATION_EFFECTS[deckId] ?? noEffect;
}