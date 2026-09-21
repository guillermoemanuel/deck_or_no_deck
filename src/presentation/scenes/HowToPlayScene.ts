import Phaser from 'phaser';
import languageManager from '../../shared/i18n/LanguageManager';
import { TranslationKey } from '../../shared/i18n/LanguageData';

/**
 * Configuración de un paso del tutorial. Se usa un array de datos en vez
 * de hardcodear cada paso como método separado — agregar/quitar/reordenar
 * pasos es un cambio de datos, no de lógica (Clean Architecture: la
 * escena no conoce reglas de negocio de la partida real, solo reproduce
 * contenido estático).
 *
 * `titleKey`/`bodyKey` en vez de texto literal — el contenido real se
 * resuelve en cada render vía languageManager.getText(), nunca se
 * hardcodea un idioma acá.
 */
interface TutorialSlide {
  readonly titleKey: TranslationKey;
  readonly bodyKey: TranslationKey;
  /** Dibuja el ícono/esquema del paso usando primitivas de Graphics — sin imágenes externas. */
  readonly draw: (gfx: Phaser.GameObjects.Graphics, container: Phaser.GameObjects.Container, cx: number, cy: number) => void;
}

const MODAL_WIDTH = 720;
const MODAL_HEIGHT = 520;
const ACCENT_COLOR = 0x00e5ff;
const DANGER_COLOR = 0xff4d6d;
const SAFE_COLOR = 0x4dd0ff;
const GOLD_COLOR = 0xf1c40f;

const TUTORIAL_SLIDES: readonly TutorialSlide[] = [
  {
    titleKey: 'TUTORIAL_STEP_1_TITLE',
    bodyKey: 'TUTORIAL_STEP_1_BODY',
    draw: (gfx, container, cx, cy) => {
      // Carta Secreta destacada, centrada y elevada
      const cardW = 70;
      const cardH = 98;
      gfx.fillStyle(0x1a1a2e, 1).fillRoundedRect(cx - cardW / 2, cy - 70 - cardH / 2, cardW, cardH, 8);
      gfx.lineStyle(3, GOLD_COLOR, 1).strokeRoundedRect(cx - cardW / 2, cy - 70 - cardH / 2, cardW, cardH, 8);
      const star = container.scene.add
        .text(cx, cy - 70, '★', { fontSize: '26px', color: '#f1c40f' })
        .setOrigin(0.5);
      container.add(star);

      // Grupo de cartas cerradas del tablero, en abanico debajo
      const boardY = cy + 60;
      const positions = [-135, -85, -35, 15, 65, 115];
      positions.forEach(offsetX => {
        gfx.fillStyle(0x0f1420, 1).fillRoundedRect(cx + offsetX - 22, boardY - 30, 44, 62, 6);
        gfx.lineStyle(2, ACCENT_COLOR, 0.7).strokeRoundedRect(cx + offsetX - 22, boardY - 30, 44, 62, 6);
      });
    }
  },
  {
    titleKey: 'TUTORIAL_STEP_2_TITLE',
    bodyKey: 'TUTORIAL_STEP_2_BODY',
    draw: (gfx, container, cx, cy) => {
      const barW = 340;
      const barH = 36;
      const x0 = cx - barW / 2;
      const y0 = cy - barH / 2;

      // Marco exterior
      gfx.fillStyle(0x0d1117, 1).fillRoundedRect(x0 - 6, y0 - 6, barW + 12, barH + 12, 10);
      gfx.lineStyle(2, ACCENT_COLOR, 0.9).strokeRoundedRect(x0 - 6, y0 - 6, barW + 12, barH + 12, 10);

      // Segmento seguro (celeste) y segmento de peligro (rojo)
      gfx.fillStyle(SAFE_COLOR, 1).fillRoundedRect(x0, y0, barW * 0.62, barH, 6);
      gfx.fillStyle(DANGER_COLOR, 1).fillRoundedRect(x0 + barW * 0.62, y0, barW * 0.38, barH, 6);

      // Indicador de nivel actual
      const indicatorX = x0 + barW * 0.62;
      gfx.lineStyle(3, 0xffffff, 1);
      gfx.lineBetween(indicatorX, y0 - 14, indicatorX, y0 + barH + 14);

      const safeLabel = container.scene.add
        .text(x0 + barW * 0.31, y0 + barH + 30, languageManager.getText('ENERGY_PROTECT_LABEL'), {
          fontSize: '13px',
          fontFamily: 'Arial, sans-serif',
          color: '#4dd0ff',
          fontStyle: 'bold'
        })
        .setOrigin(0.5);
      const dangerLabel = container.scene.add
        .text(x0 + barW * 0.81, y0 + barH + 30, languageManager.getText('ENERGY_DRAIN_LABEL'), {
          fontSize: '13px',
          fontFamily: 'Arial, sans-serif',
          color: '#ff4d6d',
          fontStyle: 'bold'
        })
        .setOrigin(0.5);
      container.add([safeLabel, dangerLabel]);
    }
  },
  {
    titleKey: 'TUTORIAL_STEP_3_TITLE',
    bodyKey: 'TUTORIAL_STEP_3_BODY',
    draw: (gfx, container, cx, cy) => {
      // Silueta tipo "teléfono neón" del Banquero
      const phoneY = cy - 55;
      gfx.fillStyle(0x1a1a2e, 1).fillRoundedRect(cx - 34, phoneY - 55, 68, 100, 14);
      gfx.lineStyle(3, GOLD_COLOR, 1).strokeRoundedRect(cx - 34, phoneY - 55, 68, 100, 14);
      gfx.fillStyle(GOLD_COLOR, 0.9).fillCircle(cx, phoneY + 30, 5);
      gfx.lineStyle(2, GOLD_COLOR, 0.6).strokeRoundedRect(cx - 24, phoneY - 44, 48, 62, 4);

      // Botones DEAL / NO DEAL
      const btnY = cy + 55;
      gfx.fillStyle(0x145a32, 1).fillRoundedRect(cx - 130, btnY - 20, 110, 44, 10);
      gfx.lineStyle(2, 0x2ecc71, 1).strokeRoundedRect(cx - 130, btnY - 20, 110, 44, 10);
      gfx.fillStyle(0x6e2a2a, 1).fillRoundedRect(cx + 20, btnY - 20, 110, 44, 10);
      gfx.lineStyle(2, DANGER_COLOR, 1).strokeRoundedRect(cx + 20, btnY - 20, 110, 44, 10);

      const dealText = container.scene.add
        .text(cx - 75, btnY, languageManager.getText('BANKER_DEAL_BUTTON'), {
          fontSize: '16px',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          color: '#2ecc71'
        })
        .setOrigin(0.5);
      const noDealText = container.scene.add
        .text(cx + 75, btnY, languageManager.getText('BANKER_NO_DEAL_BUTTON'), {
          fontSize: '14px',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          color: '#ff4d6d'
        })
        .setOrigin(0.5);
      container.add([dealText, noDealText]);
    }
  },
  {
    titleKey: 'TUTORIAL_STEP_4_TITLE',
    bodyKey: 'TUTORIAL_STEP_4_BODY',
    draw: (gfx, container, cx, cy) => {
      const cardW = 64;
      const cardH = 90;

      gfx.fillStyle(0x1a1a2e, 1).fillRoundedRect(cx - 120 - cardW / 2, cy - cardH / 2, cardW, cardH, 8);
      gfx.lineStyle(3, GOLD_COLOR, 1).strokeRoundedRect(cx - 120 - cardW / 2, cy - cardH / 2, cardW, cardH, 8);

      gfx.fillStyle(0x0f1420, 1).fillRoundedRect(cx + 120 - cardW / 2, cy - cardH / 2, cardW, cardH, 8);
      gfx.lineStyle(3, ACCENT_COLOR, 1).strokeRoundedRect(cx + 120 - cardW / 2, cy - cardH / 2, cardW, cardH, 8);

      // Flechas curvas de intercambio (arcos superior e inferior)
      gfx.lineStyle(3, 0xffffff, 0.9);
      gfx.beginPath();
      gfx.arc(cx, cy, 95, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340), false);
      gfx.strokePath();
      gfx.beginPath();
      gfx.arc(cx, cy, 95, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160), false);
      gfx.strokePath();

      // Puntas de flecha (triángulos simples)
      gfx.fillStyle(0xffffff, 1);
      gfx.fillTriangle(cx + 92, cy - 35, cx + 80, cy - 42, cx + 80, cy - 22);
      gfx.fillTriangle(cx - 92, cy + 35, cx - 80, cy + 42, cx - 80, cy + 22);

      const percentText = container.scene.add
        .text(cx, cy + 80, languageManager.getText('TUTORIAL_MIDGAME_PERCENT_LABEL', { percent: 50 }), {
          fontSize: '13px',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          color: '#ffd166'
        })
        .setOrigin(0.5);
      container.add(percentText);
    }
  },
  {
    titleKey: 'TUTORIAL_STEP_5_TITLE',
    bodyKey: 'TUTORIAL_STEP_5_BODY',
    draw: (gfx, container, cx, cy) => {
      // Cofre estilizado
      const chestY = cy + 10;
      gfx.fillStyle(0x5a3b1e, 1).fillRoundedRect(cx - 70, chestY - 10, 140, 60, 8);
      gfx.lineStyle(3, GOLD_COLOR, 1).strokeRoundedRect(cx - 70, chestY - 10, 140, 60, 8);
      gfx.fillStyle(0x7a5230, 1).fillRoundedRect(cx - 70, chestY - 45, 140, 40, 8);
      gfx.lineStyle(3, GOLD_COLOR, 1).strokeRoundedRect(cx - 70, chestY - 45, 140, 40, 8);
      gfx.fillStyle(GOLD_COLOR, 1).fillRoundedRect(cx - 10, chestY - 20, 20, 16, 3);

      // Monedas saliendo del cofre
      const coinPositions: Array<[number, number]> = [
        [-90, -60],
        [-55, -85],
        [10, -95],
        [70, -70],
        [95, -40]
      ];
      coinPositions.forEach(([ox, oy]) => {
        gfx.fillStyle(GOLD_COLOR, 1).fillCircle(cx + ox, chestY + oy, 12);
        gfx.lineStyle(2, 0xffffff, 0.6).strokeCircle(cx + ox, chestY + oy, 12);
      });

      const shopText = container.scene.add
        .text(cx, chestY + 90, languageManager.getText('TUTORIAL_SHOP_UPGRADES_LABEL'), {
          fontSize: '13px',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          color: '#f1c40f'
        })
        .setOrigin(0.5);
      container.add(shopText);
    }
  }
];

/**
 * HowToPlayScene: tutorial interactivo de 5 pasos, accesible desde
 * MainMenuScene. Desacoplada por completo del estado real de partida —
 * solo consume TUTORIAL_SLIDES (datos estáticos locales) y no importa
 * nada de domain/ ni application/, cumpliendo con mantenerse ajena a la
 * lógica de negocio real del juego.
 *
 * i18n: como todo el contenido (título, indicador de paso, ilustraciones,
 * botones) se reconstruye por completo en cada `renderStep()`/`create()`
 * — nunca queda un Text "vivo" mientras el idioma podría cambiar (el
 * selector de idioma solo existe en MainMenuScene, jamás junto con esta
 * escena) — alcanza con leer `languageManager.getText()` en el momento de
 * crear cada texto. No hace falta LocalizedText acá; ver MainMenuScene y
 * ShopScene para el patrón de actualización EN VIVO cuando sí aplica.
 */
export class HowToPlayScene extends Phaser.Scene {
  private currentStep = 0;
  private isTransitioning = false;

  private modalContainer!: Phaser.GameObjects.Container;
  private contentContainer!: Phaser.GameObjects.Container;
  private stepIndicatorText!: Phaser.GameObjects.Text;

  private prevButton!: Phaser.GameObjects.Container;
  private nextButton!: Phaser.GameObjects.Container;
  private nextButtonLabel!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: 'HowToPlayScene' });
  }

  /**
   * Ciclo de vida estándar: se reinicia el paso a 0 cada vez que se entra
   * a la escena, sin importar en qué paso se haya quedado la vez anterior.
   */
  init(): void {
    this.currentStep = 0;
    this.isTransitioning = false;
  }

  /**
   * No hace falta precargar ningún asset: todo el contenido visual se
   * dibuja con la API de Graphics (this.add.graphics) según el requisito
   * de evitar imágenes externas para esta escena.
   */
  preload(): void {
    // Intencionalmente vacío.
  }

  create(): void {
    const { width, height } = this.cameras.main;

    // Fondo atenuador de pantalla completa, detrás del modal
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.75);

    // --- Modal flotante: fondo oscuro translúcido + borde neón ---
    this.modalContainer = this.add.container(width / 2, height / 2);
    const modalBg = this.add.graphics();
    modalBg.fillStyle(0x0a0f1d, 0.97).fillRoundedRect(-MODAL_WIDTH / 2, -MODAL_HEIGHT / 2, MODAL_WIDTH, MODAL_HEIGHT, 18);
    modalBg.lineStyle(3, ACCENT_COLOR, 0.9).strokeRoundedRect(-MODAL_WIDTH / 2, -MODAL_HEIGHT / 2, MODAL_WIDTH, MODAL_HEIGHT, 18);
    // Resplandor exterior sutil, un segundo trazo más ancho y tenue
    modalBg.lineStyle(8, ACCENT_COLOR, 0.15).strokeRoundedRect(-MODAL_WIDTH / 2 - 4, -MODAL_HEIGHT / 2 - 4, MODAL_WIDTH + 8, MODAL_HEIGHT + 8, 20);
    this.modalContainer.add(modalBg);

    this.modalContainer.add(
      this.add
        .text(0, -MODAL_HEIGHT / 2 + 34, languageManager.getText('TUTORIAL_TITLE'), {
          fontSize: '26px',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          color: '#ffffff'
        })
        .setOrigin(0.5)
    );

    // Botón de cierre "X" — esquina superior derecha del modal
    this.modalContainer.add(this.createCloseButton());

    // Indicador de paso ("2 / 5")
    this.stepIndicatorText = this.add
      .text(0, -MODAL_HEIGHT / 2 + 66, '', {
        fontSize: '13px',
        fontFamily: 'Arial, sans-serif',
        color: '#8b949e'
      })
      .setOrigin(0.5);
    this.modalContainer.add(this.stepIndicatorText);

    // Contenedor de contenido: se vacía y repuebla en cada cambio de paso
    // (mismo patrón ya usado en ShopScene para alternar pestañas) — así
    // los tweens de transición animan un único contenedor, prolijo.
    this.contentContainer = this.add.container(0, 0);
    this.modalContainer.add(this.contentContainer);

    // Navegación Prev / Next + "Volver al Menú"
    this.prevButton = this.createNavButton(-MODAL_WIDTH / 2 + 90, MODAL_HEIGHT / 2 - 44, languageManager.getText('TUTORIAL_PREV_BUTTON'), () =>
      this.goToStep(this.currentStep - 1)
    );
    this.nextButton = this.createNavButton(MODAL_WIDTH / 2 - 90, MODAL_HEIGHT / 2 - 44, languageManager.getText('TUTORIAL_NEXT_BUTTON'), () =>
      this.handleNextPressed()
    );
    this.nextButtonLabel = this.nextButton.getAt(1) as Phaser.GameObjects.Text;
    this.modalContainer.add([this.prevButton, this.nextButton]);
    this.modalContainer.add(this.createBackToMenuButton());

    // Entrada del modal: fade + pequeño scale-in
    this.modalContainer.setAlpha(0).setScale(0.9);
    this.tweens.add({ targets: this.modalContainer, alpha: 1, scale: 1, duration: 280, ease: 'Back.easeOut' });

    this.renderStep(0, 'none');
  }

  /**
   * No se requiere lógica por-frame: toda la interacción es dirigida por
   * eventos (clicks) y tweens con sus propios callbacks — se deja vacío
   * a propósito en vez de sondear estado en cada tick.
   */
  update(): void {
    // Intencionalmente vacío.
  }

  // ------------------------------------------------------------------
  // Navegación entre pasos
  // ------------------------------------------------------------------

  private handleNextPressed(): void {
    const isLastStep = this.currentStep === TUTORIAL_SLIDES.length - 1;
    if (isLastStep) {
      this.exitToMainMenu();
      return;
    }
    this.goToStep(this.currentStep + 1);
  }

  private goToStep(targetStep: number): void {
    if (this.isTransitioning) return;
    if (targetStep < 0 || targetStep >= TUTORIAL_SLIDES.length) return;

    const direction: 'forward' | 'backward' = targetStep > this.currentStep ? 'forward' : 'backward';
    this.isTransitioning = true;

    // Deslizamiento lateral + fade: el contenido saliente se desliza y
    // desvanece hacia el lado opuesto de la navegación, el entrante
    // aparece desde el lado correspondiente — refuerza visualmente la
    // dirección del cambio de paso.
    const exitOffsetX = direction === 'forward' ? -60 : 60;
    this.tweens.add({
      targets: this.contentContainer,
      x: exitOffsetX,
      alpha: 0,
      duration: 160,
      ease: 'Cubic.easeIn',
      onComplete: () => {
        this.currentStep = targetStep;
        this.renderStep(targetStep, direction);
        this.isTransitioning = false;
      }
    });
  }

  /**
   * Reconstruye el contenido del paso actual (texto + ilustración) y lo
   * anima de entrada. `enterDirection: 'none'` se usa solo en la carga
   * inicial de la escena (sin animación de deslizamiento, solo el
   * fade-in general del modal ya aplicado en create()).
   */
  private renderStep(stepIndex: number, enterDirection: 'forward' | 'backward' | 'none'): void {
    this.contentContainer.removeAll(true);
    const slide = TUTORIAL_SLIDES[stepIndex];

    const illustrationCenterY = -60;
    const gfx = this.add.graphics();
    slide.draw(gfx, this.contentContainer, 0, illustrationCenterY);
    this.contentContainer.add(gfx);

    this.contentContainer.add(
      this.add
        .text(0, 120, languageManager.getText(slide.titleKey), {
          fontSize: '20px',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          color: '#ffd166'
        })
        .setOrigin(0.5)
    );

    this.contentContainer.add(
      this.add
        .text(0, 160, languageManager.getText(slide.bodyKey), {
          fontSize: '15px',
          fontFamily: 'Arial, sans-serif',
          color: '#e6edf3',
          align: 'center',
          wordWrap: { width: MODAL_WIDTH - 120 },
          lineSpacing: 4
        })
        .setOrigin(0.5)
    );

    this.stepIndicatorText.setText(
      languageManager.getText('TUTORIAL_STEP_COUNTER', { current: stepIndex + 1, total: TUTORIAL_SLIDES.length })
    );
    this.updateNavButtonsVisibility();

    if (enterDirection === 'none') {
      this.contentContainer.setPosition(0, 0).setAlpha(1);
      return;
    }

    const enterFromX = enterDirection === 'forward' ? 60 : -60;
    this.contentContainer.setPosition(enterFromX, 0).setAlpha(0);
    this.tweens.add({ targets: this.contentContainer, x: 0, alpha: 1, duration: 220, ease: 'Cubic.easeOut' });
  }

  /**
   * "Anterior" oculto en el primer paso; "Siguiente" pasa a mostrarse
   * como "Comenzar" en el último paso (no se deshabilita — siempre debe
   * quedar una salida clara hacia el juego).
   */
  private updateNavButtonsVisibility(): void {
    const isFirstStep = this.currentStep === 0;
    const isLastStep = this.currentStep === TUTORIAL_SLIDES.length - 1;

    this.prevButton.setVisible(!isFirstStep);
    this.nextButtonLabel.setText(languageManager.getText(isLastStep ? 'TUTORIAL_START_BUTTON' : 'TUTORIAL_NEXT_BUTTON'));
  }

  // ------------------------------------------------------------------
  // Construcción de botones (Graphics + Text, sin imágenes externas)
  // ------------------------------------------------------------------

  private createNavButton(x: number, y: number, label: string, onClick: () => void): Phaser.GameObjects.Container {
    const bg = this.add
      .rectangle(0, 0, 150, 44, 0x21262d)
      .setStrokeStyle(2, ACCENT_COLOR, 0.8)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(0, 0, label, { fontSize: '15px', fontFamily: 'Arial, sans-serif', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);

    bg.on('pointerover', () => bg.setFillStyle(0x2d333b));
    bg.on('pointerout', () => bg.setFillStyle(0x21262d));
    bg.on('pointerup', onClick);

    return this.add.container(x, y, [bg, text]);
  }

  private createCloseButton(): Phaser.GameObjects.Container {
    const x = MODAL_WIDTH / 2 - 30;
    const y = -MODAL_HEIGHT / 2 + 30;

    const bg = this.add.circle(0, 0, 16, 0x21262d).setStrokeStyle(2, DANGER_COLOR, 0.8).setInteractive({ useHandCursor: true });
    const label = this.add
      .text(0, 0, '✕', { fontSize: '16px', fontFamily: 'Arial, sans-serif', color: '#ffffff' })
      .setOrigin(0.5);

    bg.on('pointerover', () => bg.setFillStyle(0x6e2a2a));
    bg.on('pointerout', () => bg.setFillStyle(0x21262d));
    bg.on('pointerup', () => this.exitToMainMenu());

    return this.add.container(x, y, [bg, label]);
  }

  private createBackToMenuButton(): Phaser.GameObjects.Container {
    const bg = this.add
      .rectangle(0, MODAL_HEIGHT / 2 - 44, 220, 34, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(0, MODAL_HEIGHT / 2 - 44, languageManager.getText('TUTORIAL_BACK_TO_MENU'), {
        fontSize: '12px',
        fontFamily: 'Arial, sans-serif',
        color: '#8b949e'
      })
      .setOrigin(0.5);

    bg.on('pointerover', () => text.setColor('#ffffff'));
    bg.on('pointerout', () => text.setColor('#8b949e'));
    bg.on('pointerup', () => this.exitToMainMenu());

    return this.add.container(0, 0, [bg, text]);
  }

  // ------------------------------------------------------------------
  // Salida
  // ------------------------------------------------------------------

  private exitToMainMenu(): void {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    // Transición de salida suave (fade + scale-down) antes de redirigir.
    this.tweens.add({
      targets: this.modalContainer,
      alpha: 0,
      scale: 0.9,
      duration: 200,
      ease: 'Cubic.easeIn',
      onComplete: () => this.scene.start('MainMenuScene')
    });
  }
}
