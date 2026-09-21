import Phaser from 'phaser';
import { getServices } from '../GameServices';
import languageManager from '../../shared/i18n/LanguageManager';
import { SupportedLanguage, TranslationKey } from '../../shared/i18n/LanguageData';
import { LocalizedText } from '../components/LocalizedText';

/** Paleta "Casino de Lujo" — reutiliza tonos ya presentes en CardView/ResultScene
 * (oro, cian, rojo rubí, verde esmeralda) para mantener cohesión visual con
 * el resto del juego en vez de introducir una paleta nueva y desconectada. */
const COLOR_BG_BASE = 0x08080a;
const COLOR_BG_GLOW = 0x241b3a; // resplandor ambiental violeta/carbón, muy sutil
const COLOR_GOLD = 0xffd76a;
const COLOR_GOLD_DIM = 0xd4af37;
const COLOR_GOLD_HEX = '#ffd76a';
const COLOR_GOLD_STROKE_HEX = '#7a4a00';
const COLOR_SILVER_HEX = '#c7c7cf';
const COLOR_WHITE_HEX = '#ffffff';

/** Configuración de un botón de menú estilo casino (fondo oscuro + borde de acento). */
interface CasinoButtonConfig {
  y: number;
  width: number;
  height: number;
  labelKey: TranslationKey;
  accentColor: number;
  onClick: () => void;
}

/** Silueta decorativa de carta usada de fondo, para poder animarla levemente en update(). */
interface DecorativeCard {
  graphic: Phaser.GameObjects.Graphics;
  baseAngle: number;
  swaySpeed: number;
  swayRange: number;
}

/**
 * MainMenuScene: pantalla de inicio, estilo "Game Show / Casino de Lujo"
 * para "DECK OR NO DECK".
 *
 * Es el destino del botón "Salir" del modal de fin de partida (ver
 * ResultScene.exitToMainMenu) y el punto de arranque normal del juego tras
 * PreloadScene.
 *
 * Único lugar del juego con el selector de idioma (ES | EN, esquina
 * superior derecha) — cambiar el idioma acá actualiza los textos de ESTA
 * escena EN CALIENTE (ver LocalizedText), sin reiniciar nada. El resto de
 * las escenas nunca corren simultáneamente con el selector, así que
 * simplemente leen el idioma vigente al crearse.
 *
 * Nota de diseño: el título "DECK OR NO DECK" y el subtítulo emotivo se
 * renderizan como texto fijo (no vía LocalizedText) porque requieren un
 * tratamiento tipográfico palabra-por-palabra (oro/blanco, tamaños
 * distintos) que una única clave de traducción interpolada no puede
 * expresar limpiamente. El resto de los textos funcionales (monedas,
 * botones) sigue 100% localizado como antes.
 */
export class MainMenuScene extends Phaser.Scene {
  private languageButtons = new Map<SupportedLanguage, { bg: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }>();
  private decorativeCards: DecorativeCard[] = [];
  private elapsedMs = 0;

  constructor() {
    super({ key: 'MainMenuScene' });
  }

  preload(): void {
    // Sin carga de assets propia: PreloadScene centraliza toda la carga
    // antes de que cualquier escena de gameplay/menú arranque.
  }

  create(): void {
    const { width, height } = this.cameras.main;
    const services = getServices(this);

    this.decorativeCards = [];
    this.elapsedMs = 0;

    this.drawAtmosphere(width, height);
    this.drawDecorativeCardSilhouettes(width, height);

    // --- Título principal ---------------------------------------------
    this.createStyledTitle(width / 2, height * 0.22);

    // --- Subtítulo emotivo ----------------------------------------------
    this.createSubtitle(width / 2, height * 0.32, width);

    // --- Contador de monedas ---------------------------------------------
    const coins = services.progressionManager.getCoins();
    new LocalizedText(
      this,
      width / 2,
      height * 0.42,
      'MENU_COINS_LABEL',
      {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color: COLOR_GOLD_HEX
      },
      { amount: coins.toLocaleString() }
    ).setOrigin(0.5);

    // --- Botonera principal ------------------------------------------------
    const buttonWidth = Math.min(280, width * 0.42);
    const buttonHeight = 56;
    const buttonGap = 18;
    const buttonsStartY = height * 0.54;

    const buttons: CasinoButtonConfig[] = [
      {
        y: buttonsStartY,
        width: buttonWidth,
        height: buttonHeight,
        labelKey: 'MENU_PLAY_AGAIN_BUTTON',
        accentColor: 0x2ea043,
        onClick: () => {
          // requirement_scene_flow_and_selection: con más de un mazo
          // desbloqueado, la selección de mazo es obligatoria antes de picar
          // la Carta Secreta. Con solo el básico, se omite automáticamente.
          if (services.progressionManager.hasMoreThanBasicDeck()) {
            this.scene.start('DeckSelectionScene');
          } else {
            this.scene.start('GameScene');
            this.scene.launch('UIScene');
          }
        }
      },
      {
        y: buttonsStartY + (buttonHeight + buttonGap),
        width: buttonWidth,
        height: buttonHeight,
        labelKey: 'MENU_NEW_GAME_BUTTON',
        accentColor: 0xff4d6d,
        onClick: () => {
          services.progressionManager.resetAllProgress();
          this.scene.start('GameScene');
          this.scene.launch('UIScene');
        }
      },
      {
        y: buttonsStartY + (buttonHeight + buttonGap) * 2,
        width: buttonWidth,
        height: buttonHeight,
        labelKey: 'MENU_SHOP_BUTTON',
        accentColor: COLOR_GOLD_DIM,
        onClick: () => this.scene.launch('ShopScene')
      },
      {
        y: buttonsStartY + (buttonHeight + buttonGap) * 3,
        width: buttonWidth,
        height: buttonHeight,
        labelKey: 'MENU_HOW_TO_PLAY_BUTTON',
        accentColor: 0x00e5ff,
        onClick: () => this.scene.start('HowToPlayScene')
      }
    ];

    buttons.forEach(config => this.createCasinoButton(width / 2, config));

    this.renderLanguageSelector();
  }

  update(_time: number, delta: number): void {
    // Micro-animación ambiental: las siluetas de cartas del fondo "respiran"
    // con una oscilación de rotación muy sutil, para que el menú se sienta
    // vivo sin distraer del contenido principal.
    this.elapsedMs += delta;

    this.decorativeCards.forEach(card => {
      const offset = Math.sin(this.elapsedMs * card.swaySpeed) * card.swayRange;
      card.graphic.setAngle(card.baseAngle + offset);
    });
  }

  /**
   * Fondo negro carbón profundo con un resplandor ambiental centrado que
   * simula un degradado radial. Se usa una técnica cross-renderer segura
   * (círculos concéntricos con alpha decreciente) en vez de
   * `fillGradientStyle`, que en el renderer Canvas no produce un gradiente
   * real — así el efecto se ve igual tanto en WebGL como en Canvas.
   */
  private drawAtmosphere(width: number, height: number): void {
    this.add.rectangle(width / 2, height / 2, width, height, COLOR_BG_BASE).setDepth(-20);

    const glow = this.add.graphics().setDepth(-19);
    const centerX = width / 2;
    const centerY = height * 0.38;
    const maxRadius = Math.max(width, height) * 0.62;
    const rings = 14;

    for (let i = rings; i >= 1; i--) {
      const t = i / rings;
      const radius = maxRadius * t;
      const alpha = 0.05 * (1 - t) + 0.015;
      glow.fillStyle(COLOR_BG_GLOW, alpha);
      glow.fillCircle(centerX, centerY, radius);
    }
  }

  /**
   * Dibuja siluetas de cartas de baraja translúcidas con bordes dorados
   * muy tenues, dispersas y rotadas, para dar profundidad al fondo sin
   * competir visualmente con el título ni los botones.
   */
  private drawDecorativeCardSilhouettes(width: number, height: number): void {
    const placements = [
      { xRatio: 0.1, yRatio: 0.18, angle: -18, scale: 1.1 },
      { xRatio: 0.9, yRatio: 0.16, angle: 14, scale: 1.0 },
      { xRatio: 0.06, yRatio: 0.82, angle: 10, scale: 0.9 },
      { xRatio: 0.94, yRatio: 0.8, angle: -12, scale: 1.15 },
      { xRatio: 0.5, yRatio: 0.92, angle: 4, scale: 0.8 },
      { xRatio: 0.22, yRatio: 0.5, angle: -8, scale: 0.7 },
      { xRatio: 0.8, yRatio: 0.52, angle: 9, scale: 0.75 }
    ];

    const cardWidth = 140;
    const cardHeight = 196;

    placements.forEach((p, index) => {
      const x = width * p.xRatio;
      const y = height * p.yRatio;
      const graphic = this.createCardSilhouette(x, y, p.angle, cardWidth * p.scale, cardHeight * p.scale);

      this.decorativeCards.push({
        graphic,
        baseAngle: p.angle,
        // Cada carta oscila a una velocidad y amplitud levemente distinta
        // para que el conjunto no se sienta mecánico/sincronizado.
        swaySpeed: 0.00025 + index * 0.00004,
        swayRange: 1.2 + (index % 3) * 0.4
      });
    });
  }

  private createCardSilhouette(x: number, y: number, angleDeg: number, width: number, height: number): Phaser.GameObjects.Graphics {
    const card = this.add.graphics({ x, y }).setDepth(-15);

    card.fillStyle(0xffffff, 0.02);
    card.fillRoundedRect(-width / 2, -height / 2, width, height, 14);

    card.lineStyle(2, COLOR_GOLD_DIM, 0.15);
    card.strokeRoundedRect(-width / 2, -height / 2, width, height, 14);

    // Un pequeño rombo en la esquina, evocando el índice de una carta real,
    // sin llegar a dibujar un palo reconocible (mantiene el look abstracto).
    card.lineStyle(1.5, COLOR_GOLD_DIM, 0.12);
    const pipSize = width * 0.09;
    const pipX = -width / 2 + pipSize + 10;
    const pipY = -height / 2 + pipSize + 10;
    card.beginPath();
    card.moveTo(pipX, pipY - pipSize);
    card.lineTo(pipX + pipSize, pipY);
    card.lineTo(pipX, pipY + pipSize);
    card.lineTo(pipX - pipSize, pipY);
    card.closePath();
    card.strokePath();

    card.setAngle(angleDeg);
    return card;
  }

  /**
   * Construye el título "DECK OR NO DECK" como tres bloques de texto
   * independientes ("DECK", " OR ", "NO DECK") para poder aplicar un
   * tratamiento tipográfico distinto por palabra, y luego los centra como
   * un único grupo horizontal.
   */
  private createStyledTitle(centerX: number, y: number): Phaser.GameObjects.Container {
    const container = this.add.container(centerX, y);

    const goldStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: '58px',
      fontStyle: 'bold',
      color: COLOR_GOLD_HEX,
      stroke: COLOR_GOLD_STROKE_HEX,
      strokeThickness: 6,
      shadow: { offsetX: 0, offsetY: 0, color: '#ffb703', blur: 20, fill: true }
    };

    const orStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: '30px',
      fontStyle: 'italic',
      color: COLOR_WHITE_HEX,
      stroke: '#000000',
      strokeThickness: 3
    };

    const deckText = this.add.text(0, 0, 'DECK', goldStyle).setOrigin(0, 0.5);
    const orText = this.add.text(0, 2, ' OR ', orStyle).setOrigin(0, 0.5);
    const noDeckText = this.add.text(0, 0, 'NO DECK', goldStyle).setOrigin(0, 0.5);

    // Layout manual en fila: cada texto se posiciona a continuación del
    // anterior, y al final se centra el bloque completo restando la mitad
    // del ancho total — evita depender de un plugin de layout externo.
    let cursor = 0;
    deckText.setX(cursor);
    cursor += deckText.width;
    orText.setX(cursor);
    cursor += orText.width;
    noDeckText.setX(cursor);
    cursor += noDeckText.width;

    const totalWidth = cursor;
    [deckText, orText, noDeckText].forEach(t => t.setX(t.x - totalWidth / 2));

    container.add([deckText, orText, noDeckText]);

    // Respiración sutil de brillo dorado — llamativo sin ser agresivo.
    this.tweens.add({
      targets: [deckText, noDeckText],
      alpha: { from: 1, to: 0.82 },
      duration: 1600,
      ease: 'Sine.easeInOut',
      yoyo: true,
      repeat: -1
    });

    return container;
  }

  /**
   * Subtítulo emotivo en dos líneas: la primera en gris plata (contexto),
   * la segunda en blanco (el "gancho" — la apuesta central del juego),
   * para reforzar visualmente la jerarquía del mensaje.
   */
  private createSubtitle(centerX: number, y: number, availableWidth: number): Phaser.GameObjects.Container {
    const container = this.add.container(centerX, y);
    const wrapWidth = availableWidth * 0.75;

    const line1 = this.add
      .text(0, -14, 'Play your cards. Challenge the banker.', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '16px',
        fontStyle: 'italic',
        color: COLOR_SILVER_HEX,
        align: 'center',
        wordWrap: { width: wrapWidth }
      })
      .setOrigin(0.5);

    const line2 = this.add
      .text(0, 14, 'Risk it all... or walk away?', {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: COLOR_WHITE_HEX,
        align: 'center',
        wordWrap: { width: wrapWidth }
      })
      .setOrigin(0.5);

    container.add([line1, line2]);
    return container;
  }

  /**
   * Botón de menú estilo casino: panel oscuro con borde de color de acento,
   * halo temático que aparece en hover, y una elevación sutil de escala
   * (1.05x) al pasar el cursor — cumple el requisito de animaciones suaves
   * en `pointerover`/`pointerout` vía tweens de Phaser 3.
   */
  private createCasinoButton(x: number, config: CasinoButtonConfig): Phaser.GameObjects.Container {
    const { y, width, height, labelKey, accentColor, onClick } = config;
    const container = this.add.container(x, y);

    // Halo externo, invisible en reposo, que se enciende en hover.
    const glow = this.add.graphics();
    glow.fillStyle(accentColor, 0.35);
    glow.fillRoundedRect(-width / 2 - 8, -height / 2 - 8, width + 16, height + 16, 16);
    glow.setAlpha(0);

    // Panel principal.
    const bg = this.add.graphics();
    bg.fillStyle(0x121218, 0.95);
    bg.fillRoundedRect(-width / 2, -height / 2, width, height, 10);
    bg.lineStyle(2, accentColor, 0.85);
    bg.strokeRoundedRect(-width / 2, -height / 2, width, height, 10);

    // Filo dorado interior muy fino, para reforzar la sensación "premium".
    bg.lineStyle(1, COLOR_GOLD, 0.25);
    bg.strokeRoundedRect(-width / 2 + 4, -height / 2 + 4, width - 8, height - 8, 8);

    const label = new LocalizedText(this, 0, 0, labelKey, {
      fontFamily: 'Georgia, "Times New Roman", serif',
      fontSize: '18px',
      fontStyle: 'bold',
      color: COLOR_WHITE_HEX
    }).setOrigin(0.5);

    container.add([glow, bg, label]);

    // Zona interactiva invisible del tamaño exacto del botón — más simple
    // y explícito que asignarle un hit-area custom a la Graphics.
    const hitZone = this.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add(hitZone);

    hitZone.on('pointerover', () => {
      this.tweens.add({ targets: container, scale: 1.05, duration: 150, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: glow, alpha: 1, duration: 150, ease: 'Cubic.easeOut' });
    });

    hitZone.on('pointerout', () => {
      this.tweens.add({ targets: container, scale: 1, duration: 150, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: glow, alpha: 0, duration: 150, ease: 'Cubic.easeOut' });
    });

    hitZone.on('pointerup', () => {
      // Pequeño "pop" táctil antes de disparar la acción.
      this.tweens.add({
        targets: container,
        scale: 1.1,
        duration: 70,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: onClick
      });
    });

    return container;
  }

  /**
   * Selector ES | EN, esquina superior derecha. Cada botón llama a
   * `languageManager.setLanguage(code)` — el propio LanguageManager valida
   * el código, persiste en localStorage y emite el evento de cambio; TODA
   * la re-renderización de texto (título, monedas, botones) ocurre sola,
   * vía las instancias de LocalizedText ya suscritas — esta escena NO
   * llama a `.setText()` en ningún lado.
   */
  private renderLanguageSelector(): void {
    const { width } = this.cameras.main;
    const baseX = width - 84;
    const y = 34;

    languageManager.getSupportedLanguages().forEach((lang, index) => {
      const x = baseX + index * 56;

      const bg = this.add
        .rectangle(x, y, 46, 30, 0x121218, 0.95)
        .setStrokeStyle(2, COLOR_GOLD_DIM, 0.35)
        .setInteractive({ useHandCursor: true });

      const text = this.add
        .text(x, y, lang.toUpperCase(), {
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#9a9aa2'
        })
        .setOrigin(0.5);

      bg.on('pointerup', () => languageManager.setLanguage(lang));
      bg.on('pointerover', () => {
        if (languageManager.getCurrentLanguage() !== lang) bg.setStrokeStyle(2, COLOR_GOLD, 0.7);
      });
      bg.on('pointerout', () => this.refreshLanguageButtonStyles());

      this.languageButtons.set(lang, { bg, text });
    });

    this.refreshLanguageButtonStyles();

    // Solo el resaltado de qué botón está "activo" es responsabilidad
    // directa de esta escena (LocalizedText no sabe de estilos de botón,
    // solo de texto) — se limpia al detener la escena para no dejar un
    // listener apuntando a rectángulos ya destruidos.
    const unsubscribe = languageManager.onLanguageChanged(() => this.refreshLanguageButtonStyles());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
  }

  private refreshLanguageButtonStyles(): void {
    const active = languageManager.getCurrentLanguage();
    this.languageButtons.forEach(({ bg, text }, lang) => {
      const isActive = lang === active;
      bg.setFillStyle(isActive ? 0x1c1c24 : 0x121218, 0.95);
      bg.setStrokeStyle(2, isActive ? COLOR_GOLD : COLOR_GOLD_DIM, isActive ? 0.9 : 0.35);
      text.setColor(isActive ? COLOR_GOLD_HEX : '#9a9aa2');
    });
  }
}