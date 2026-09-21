import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';

/**
 * Strategy (GoF) para los efectos de celebración al revelar la carta de
 * mayor valor (ver GameScene.playTopValueCardCelebration()).
 *
 * GRASP Polymorphism: en vez de que GameScene decida CÓMO festejar cada
 * mazo con un switch/if (`if (deckId === 'cyberpunk') ... else if ...`),
 * cada mazo aporta su propia implementación de esta interfaz — GameScene
 * solo sabe "pedirle a la estrategia que se reproduzca", nunca CÓMO se ve
 * cada una. Agregar o mejorar el efecto de un mazo es un archivo nuevo
 * (o una edición aislada a uno existente), nunca un cambio en GameScene
 * ni en las estrategias de los demás mazos (Open/Closed).
 *
 * Contrato que toda implementación debe respetar:
 * - `play()` es responsable de crear TODOS sus propios GameObjects,
 *   animarlos, y autodestruirse al terminar — quien la invoca (GameScene)
 *   nunca hace cleanup manual de lo que una estrategia crea.
 * - Debe ser no bloqueante: nunca pausar la escena ni el input. El juego
 *   sigue exactamente igual mientras el efecto corre y se desvanece.
 * - No debe usar `setDepth()` explícito salvo que sea intencional — ver
 *   el comentario en SpotlightSweepEffect sobre por qué el orden de
 *   inserción importa (un efecto puede coincidir con la aparición de un
 *   modal de oferta del banquero, que tampoco usa depth explícito).
 */
export interface DeckCelebrationEffect {
  /**
   * @param scene La GameScene activa — el efecto crea sus propios
   *   GameObjects/tweens sobre ella.
   * @param card La carta revelada que disparó la celebración. Varias
   *   implementaciones no la necesitan (el barrido es pantalla completa,
   *   no depende de dónde estaba la carta) — ahí se recibe igual, sin
   *   usar, para que todas las estrategias compartan una firma uniforme
   *   (así se pueden intercambiar libremente, que es el punto del patrón).
   */
  play(scene: Phaser.Scene, card: Card): void;
}

/**
 * Contrato ESTRUCTURAL (no importa la clase concreta GameScene, evitando
 * un import circular efectos -> GameScene -> efectos) para cualquier
 * escena capaz de ubicar en pantalla una carta por su id — ver
 * GameScene.getCardScreenPosition(). Algunos efectos (ej. los reflectores
 * del mazo Basic) necesitan converger sobre la posición REAL de la carta
 * que disparó la celebración, no una posición fija/centrada.
 */
export interface CardPositionSource {
  getCardScreenPosition(cardId: string): { x: number; y: number } | null;
}

/**
 * Type guard sin `any`: en vez de castear `scene as GameScene` (acoplando
 * este archivo a la clase concreta) o `scene as any` (perdiendo todo
 * chequeo de tipos), se verifica en runtime si la escena recibida
 * expone el método esperado, y TypeScript angosta el tipo de forma
 * segura si es así.
 */
export function hasCardPositionSource(scene: Phaser.Scene): scene is Phaser.Scene & CardPositionSource {
  return Boolean(scene && typeof (scene as Partial<CardPositionSource>).getCardScreenPosition === 'function');
}

/**
 * Calcula las coordenadas globales reales en el canvas de Phaser 3 para cualquier GameObject.
 * Usa prioritariamente getWorldTransformMatrix() (matriz de transformación real en el mundo/canvas)
 * y como fallback getBounds() (bounding box global calculado) o las coordenadas locales x/y.
 */
export function getGameObjectGlobalPosition(
  gameObject: Phaser.GameObjects.GameObject
): { x: number; y: number } {
  const transformObj = gameObject as unknown as Phaser.GameObjects.Components.Transform;
  if (typeof transformObj.getWorldTransformMatrix === 'function') {
    const matrix = transformObj.getWorldTransformMatrix();
    if (
      typeof matrix.tx === 'number' &&
      typeof matrix.ty === 'number' &&
      !Number.isNaN(matrix.tx) &&
      !Number.isNaN(matrix.ty)
    ) {
      return { x: matrix.tx, y: matrix.ty };
    }
  }

  const boundsObj = gameObject as unknown as Phaser.GameObjects.Components.GetBounds;
  if (typeof boundsObj.getBounds === 'function') {
    const bounds = boundsObj.getBounds();
    if (
      typeof bounds.centerX === 'number' &&
      typeof bounds.centerY === 'number' &&
      !Number.isNaN(bounds.centerX) &&
      !Number.isNaN(bounds.centerY)
    ) {
      return { x: bounds.centerX, y: bounds.centerY };
    }
  }

  const pos = gameObject as unknown as { x?: number; y?: number };
  return { x: pos.x ?? 0, y: pos.y ?? 0 };
}

/**
 * Resuelve la posición en pantalla de la carta objetivo de mayor valor (25,000 puntos).
 * - Si la escena implementa CardPositionSource, la consulta.
 * - Si la partida terminó y ResultScene está activa (victoria conservando la carta secreta),
 *   se redirige a la posición de la Carta Secreta en la pantalla de resultado/victoria.
 * - Si no se halla, devuelve como fallback seguro el centro de la pantalla.
 */
export function getCelebrationTargetPosition(
  scene: Phaser.Scene,
  card: Card
): { x: number; y: number } {
  // 1. Si ResultScene está activa en el scene manager y la carta es secreta o la partida terminó:
  if (scene.scene) {
    try {
      if (scene.scene.isActive('ResultScene')) {
        const resultScene = scene.scene.get('ResultScene');
        if (resultScene && hasCardPositionSource(resultScene)) {
          const resultPos = resultScene.getCardScreenPosition(card.id);
          if (resultPos) return resultPos;
        }
      }
    } catch {
      // Ignorar si el scene manager no está listo o en tests unitarios
    }
  }

  // 2. Consultar la escena actual si implementa CardPositionSource
  if (hasCardPositionSource(scene)) {
    const pos = scene.getCardScreenPosition(card.id);
    if (pos) return pos;
  }

  // 3. Fallback seguro: centro de la pantalla
  const width = scene.cameras?.main?.width ?? 1280;
  const height = scene.cameras?.main?.height ?? 720;
  return { x: width / 2, y: height / 2 };
}