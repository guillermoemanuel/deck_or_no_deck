import Phaser from 'phaser';
import { Card } from '../../../domain/entities/Card';
import { DeckCelebrationEffect } from './DeckCelebrationEffect';

/**
 * Null Object (GoF): estrategia para mazos que todavía no tienen efecto
 * propio. Evita un `if`/`default: break` en el punto de uso — GameScene
 * simplemente llama `.play()` sobre lo que la registry le devuelva, sin
 * preguntarse nunca "¿hay algo que hacer para este mazo?". Ese chequeo
 * queda encapsulado ACÁ, no repartido por el código consumidor.
 */
export class NullCelebrationEffect implements DeckCelebrationEffect {
  play(_scene: Phaser.Scene, _card: Card): void {
    // Intencionalmente vacío: el reflector genérico (SpotlightSweepEffect,
    // que GameScene siempre reproduce aparte) ya es suficiente celebración
    // para este mazo.
  }
}