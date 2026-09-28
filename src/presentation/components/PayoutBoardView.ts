import Phaser from 'phaser';
import { LocalizedText } from './LocalizedText';

/**
 * PayoutBoardView: panel lateral tipo "board de valores" (como en el programa
 * original) que lista TODOS los montos posibles del mazo, en orden descendente,
 * y va marcando/tachando cada uno a medida que se revela en la partida —
 * ya sea al abrir una carta del tablero, al intercambiar la carta secreta
 * (la descartada se revela), o al finalizar el juego (carta secreta final).
 *
 * Es un componente puramente visual: no calcula nada, solo recibe la lista
 * de valores posibles y "marca" los que la escena le indica via markValueRevealed().
 */
export class PayoutBoardView extends Phaser.GameObjects.Container {
  private readonly rowsByValue = new Map<
    number,
    { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text; strike: Phaser.GameObjects.Rectangle }
  >();

  constructor(scene: Phaser.Scene, x: number, y: number, values: readonly number[]) {
    super(scene, x, y);

    const sortedDescending = [...values].sort((a, b) => b - a);
    const rowHeight = 25;
    const rowWidth = 132;

    const title = new LocalizedText(scene, 0, -30, 'GAME_VALUES_TITLE', {
      fontSize: '15px',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      color: '#8b949e',
      align: 'center',
      lineSpacing: 2
    }).setOrigin(0.5, 1);
    this.add(title);

    sortedDescending.forEach((value, index) => {
      const rowY = index * rowHeight;

      const bg = scene.add
        .rectangle(0, rowY, rowWidth, rowHeight - 3, 0x121824, 0.85)
        .setStrokeStyle(1, 0x30363d);

      const text = scene.add
        .text(0, rowY, `$${value.toLocaleString()}`, {
          fontSize: '16px',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          color: '#e6edf3'
        })
        .setOrigin(0.5);

      // Linea de "tachado" superpuesta, oculta hasta que el valor se marque.
      const strike = scene.add
        .rectangle(0, rowY, rowWidth - 10, 2, 0xff4d6d, 0.9)
        .setVisible(false);

      this.add([bg, text, strike]);
      this.rowsByValue.set(value, { bg, text, strike });
    });

    scene.add.existing(this);
  }

  /**
   * BUGFIX (bug_banker_flow): durante la pausa previa a mostrar la oferta
   * del banquero, destaca brevemente TODOS los valores que siguen en juego
   * (los que aun no fueron tachados) con un pulso de brillo — ayuda al
   * jugador a repasar qué montos quedan disponibles mientras espera.
   */
  pulseRemainingValues(): void {
    this.rowsByValue.forEach(row => {
      if (row.strike.visible) return; // ya revelado, no es "valor en juego"

      // Aplicamos primero el color de resalte (esto resetea strokeAlpha a 1),
      // y recien despues animamos la opacidad para el efecto de parpadeo.
      row.bg.setStrokeStyle(2, 0xffd166, 1);

      this.scene.tweens.add({
        targets: row.bg,
        strokeAlpha: { from: 1, to: 0.25 },
        duration: 260,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut'
      });

      this.scene.tweens.add({
        targets: row.text,
        scale: { from: 1, to: 1.08 },
        duration: 260,
        yoyo: true,
        repeat: 2,
        ease: 'Sine.easeInOut'
      });

      // Restaura el borde tenue original una vez terminado el pulso,
      // salvo que el valor ya se haya marcado como revelado mientras tanto.
      this.scene.time.delayedCall(1800, () => {
        if (!row.strike.visible) {
          row.bg.setStrokeStyle(1, 0x30363d);
        }
      });
    });
  }

  /**
   * Marca un valor como "ya salio" en la partida — idempotente: si el valor
   * no existe en el board (no deberia pasar) o ya estaba marcado, no hace nada.
   */
  markValueRevealed(value: number): void {
    const row = this.rowsByValue.get(value);
    if (!row || row.strike.visible) return;

    row.strike.setVisible(true);
    row.text.setColor('#5b6472');
    row.text.setAlpha(0.55);
    row.bg.setFillStyle(0x0d1117, 0.6);
    row.bg.setStrokeStyle(1, 0x21262d, 0.6);

    // Pequeño "pulso" de la linea de tachado para que el jugador note el
    // cambio sin ser intrusivo.
    this.scene.tweens.add({
      targets: row.strike,
      scaleX: { from: 0, to: 1 },
      duration: 220,
      ease: 'Cubic.easeOut'
    });
  }
}