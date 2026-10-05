import Phaser from 'phaser';
import { getServices } from '../GameServices';
import { getDeckSetup, DeckSetupId } from '../../domain/value-objects/DeckSetups';
import { PreloadSceneData } from './PreloadScene';
import { LocalizedText } from '../components/LocalizedText';
import { TranslationKey } from '../../shared/i18n/LanguageData';
import { SoundFullscreenControls } from '../components/SoundFullscreenControls';

/** Misma paleta "Casino de Lujo" que MainMenuScene.ts — mismos valores hex,
 * para que ambas escenas se sientan parte del mismo producto. */
const COLOR_GOLD = 0xffd76a;
//const COLOR_GOLD_DIM = 0xd4af37;
const COLOR_AMBIENT_GLOW = 0x241b3a; // mismo violeta/carbón ambiental del menú principal
const COLOR_WHITE_HEX = '#ffffff';

// BUGFIX (dimensionamiento inconsistente de las cartas de vista previa):
// tamaño fijo único, usado tanto al crear las imágenes como al recalcular
// su escala en cada cambio de textura, y también por el halo dorado
// (drawPreviewCardGlow) para que nunca quede desalineado del tamaño real
// de la carta. Un solo lugar de verdad en vez de "161"/"220" repetidos.
const PREVIEW_CARD_WIDTH = 161;
const PREVIEW_CARD_HEIGHT = 220;

/**
 * DeckSelectionScene: paso obligatorio antes de la selección de Carta
 * Secreta cuando el jugador posee más de un mazo (ver
 * requirement_scene_flow_and_selection — la bifurcación vive en
 * MainMenuScene.hasMoreThanBasicDeck()).
 *
 * Todas las imágenes que esta escena necesita se precargan DINÁMICAMENTE
 * en preload() según la colección real del jugador (ProgressionManager) —
 * nunca se listan mazos hardcodeados, así que agregar un mazo nuevo al
 * catálogo (DeckSetups.ts) no requiere tocar esta escena.
 */
export class DeckSelectionScene extends Phaser.Scene {
  private ownedDeckIds: DeckSetupId[] = [];
  private previewDeckId!: DeckSetupId;

  private previewBg!: Phaser.GameObjects.Image;
  private previewCardBack!: Phaser.GameObjects.Image;
  private previewCardFront!: Phaser.GameObjects.Image;
  private previewGlowBack!: Phaser.GameObjects.Graphics;
  private previewGlowFront!: Phaser.GameObjects.Graphics;
  private previewNameText!: Phaser.GameObjects.Text;
  private previewContainer!: Phaser.GameObjects.Container;
  private gridButtons = new Map<DeckSetupId, Phaser.GameObjects.Rectangle>();
  private gridThumbs = new Map<DeckSetupId, Phaser.GameObjects.Image>();
  // Controles persistentes de Sonido/Pantalla Completa (mismo componente
  // que UIScene/GameScene/MainMenuScene/HowToPlayScene, ver
  // SoundFullscreenControls.ts).
  private hudControls!: SoundFullscreenControls;

  // BUGFIX (superposición grilla/botón "Aceptar"): antes `baseY` se
  // calculaba por separado en renderDeckGrid() y en applyPreviewFocus()
  // (mismo valor, pero duplicado — un cambio en uno sin el otro los
  // desincroniza). Ahora es un único método, y su valor se sube lo
  // suficiente para que ni siquiera la miniatura elevada/agrandada al
  // seleccionarse (scale 1.15, -20px) invada el botón de abajo.
  private getDeckGridBaseY(): number {
    return this.cameras.main.height - 160;
  }

  constructor() {
    super({ key: 'DeckSelectionScene' });
  }

  preload(): void {
    const services = getServices(this);
    this.ownedDeckIds = services.progressionManager.getOwnedDeckIds();

    this.ownedDeckIds.forEach(deckId => {
      const setup = getDeckSetup(deckId);
      // Miniatura de grilla: reutiliza el asset de gameplay (120x168) —
      // liviano, ya existe, y es fiel al aspecto real en partida.
      this.load.image(`grid-${deckId}`, `assets/cards/${setup.cardBack}.png`);
      // Vista previa en alta calidad — ruta dedicada, según lo pedido.
      this.load.image(`preview-back-${deckId}`, `assets/ui/show-cards/${setup.cardBack}.webp`);
      this.load.image(`preview-front-${deckId}`, `assets/ui/show-cards/${setup.cardFront}.webp`);
      this.load.image(`preview-bg-${deckId}`, `assets/ui/background/${setup.background}.webp`);
    });
  }

  create(): void {
    const services = getServices(this);
    const { width, height } = this.cameras.main;

    // Arranca mostrando el mazo actualmente seleccionado (si sigue
    // poseído; si no, el primero de la colección como fallback seguro).
    const currentSelection = services.progressionManager.getSelectedDeckId();
    this.previewDeckId = this.ownedDeckIds.includes(currentSelection)
      ? currentSelection
      : this.ownedDeckIds[0];

    // Fondo base mientras se resuelve la vista previa (evita un frame en negro)
    this.previewBg = this.add.image(width / 2, height / 2, `preview-bg-${this.previewDeckId}`).setAlpha(0.55);

    // Respiración ambiental de fondo: variación muy leve de escala del
    // backdrop + un "sheen" violeta separado que pulsa en alpha (ver
    // startBackgroundBreathing() para el detalle de por qué el pulso de
    // alpha vive en una capa aparte y no en previewBg.alpha directamente).
    this.startBackgroundBreathing();

    this.add
      .rectangle(width / 2, height / 2, width, height, 0x000000, 0.35)
      .setDepth(1);

    new LocalizedText(this, width / 2, 50, 'DECK_SELECTION_TITLE', {
      fontSize: '32px',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      color: '#be9d13',
      stroke: '#000000',
      strokeThickness: 5
    }).setOrigin(0.5).setDepth(2);

    // --- Vista previa central (frente + reverso a gran tamaño) ---
    this.previewContainer = this.add.container(width / 2, height / 2 - 100).setDepth(2);

    // Halo dorado detrás de cada carta — ver startPreviewGlowAnimation()
    // para el pulso continuo que las hace destacar sobre el escenario.
    this.previewGlowBack = this.add.graphics();
    this.previewGlowFront = this.add.graphics();
    this.drawPreviewCardGlow(this.previewGlowBack, -140, 0);
    this.drawPreviewCardGlow(this.previewGlowFront, 140, 0);

    // BUGFIX: la imagen se crea SIN pasar por `.setDisplaySize()` acá —
    // el tamaño se fija exclusivamente a través de `setPreviewCardTexture()`
    // (mismo método que usa `applyPreviewFocus()` al cambiar de mazo), así
    // hay un único código responsable de dimensionar estas cartas, sin
    // importar si es la primera vez que se muestran o la vigésima vez que
    // se cambia de mazo.
    this.previewCardBack = this.add.image(-140, 0, `preview-back-${this.previewDeckId}`);
    this.previewCardFront = this.add.image(140, 0, `preview-front-${this.previewDeckId}`);
    this.setPreviewCardTexture(this.previewCardBack, `preview-back-${this.previewDeckId}`);
    this.setPreviewCardTexture(this.previewCardFront, `preview-front-${this.previewDeckId}`);

    // Orden de inserción = orden de dibujo: el halo de cada carta va
    // inmediatamente antes de su imagen, para quedar visualmente "detrás".
    this.previewContainer.add([this.previewGlowBack, this.previewCardBack, this.previewGlowFront, this.previewCardFront]);

    this.startPreviewGlowAnimation();

    this.previewNameText = this.add
      .text(width / 2, height - 290, getDeckSetup(this.previewDeckId).name, {
        fontSize: '24px',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        color: getDeckSetup(this.previewDeckId).titleColor,
        stroke: '#000000',
        strokeThickness: 4
      })
      .setOrigin(0.5)
      .setDepth(2);

    // --- Grilla horizontal de mazos poseídos ---
    this.renderDeckGrid();

    // --- Botón Aceptar ---
    this.renderAcceptButton(services);

    this.applyPreviewFocus(this.previewDeckId, true);

    // Sonido/Pantalla Completa — esquina inferior derecha, igual que en
    // GameScene (ver UIScene.ts), MainMenuScene y HowToPlayScene: el
    // botón "Aceptar" queda centrado (width/2, height-30), así que no
    // compite con esta esquina.
    this.hudControls = new SoundFullscreenControls(this, services.audioService, services.fullscreenEnabled);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.hudControls.destroy());
  }

  /**
   * BUGFIX (dimensionamiento inconsistente de las cartas de vista previa):
   * `.setDisplaySize(w, h)` NO fija un tamaño "permanente" — internamente
   * calcula `scaleX = w / this.width` y `scaleY = h / this.height` usando
   * el ancho/alto NATIVO de la textura activa EN ESE INSTANTE, y guarda
   * ese scale.
   *
   * `.setTexture(key)` cambia la textura activa y actualiza `this.width`/
   * `this.height` al tamaño nativo del NUEVO asset, pero no toca el scale
   * en absoluto: lo deja exactamente como estaba.
   *
   * Resultado del bug: si el mazo A trae un `preview-front` de, digamos,
   * 300x400px y el mazo B trae uno de 512x682px, el scale calculado para
   * A (161/300 ≈ 0.537) queda "pegado" al sprite. Al hacer
   * `setTexture('preview-front-B')`, el sprite pasa a tener
   * width=512/height=682 pero SIGUE con el scale de A, así que su tamaño
   * final en pantalla es 512*0.537 ≈ 275px — completamente distinto a los
   * 161px esperados, aunque el código original sí llamaba a
   * `setDisplaySize(161, 220)` al crear el sprite por primera vez.
   *
   * La solución: cada vez que cambia la textura de una carta de vista
   * previa, se recalcula el scale INMEDIATAMENTE DESPUÉS, llamando de
   * nuevo a `.setDisplaySize(PREVIEW_CARD_WIDTH, PREVIEW_CARD_HEIGHT)` —
   * esta vez contra las dimensiones nativas del asset que realmente quedó
   * activo. Así, sin importar la resolución o relación de aspecto de cada
   * imagen fuente, el resultado en pantalla es siempre 161x220 exactos.
   */
  private setPreviewCardTexture(image: Phaser.GameObjects.Image, textureKey: string): void {
    image.setTexture(textureKey);
    image.setDisplaySize(PREVIEW_CARD_WIDTH, PREVIEW_CARD_HEIGHT);
  }

  /**
   * Animación de "respiración" del fondo: el backdrop (`previewBg`) escala
   * suavemente entre 1.0 y 1.02 en loop infinito, dando sensación de vida
   * sin distraer.
   *
   * La variación de "nitidez/alpha" pedida NO se aplica sobre
   * `previewBg.alpha` directamente: ese valor ya es propiedad de
   * `applyPreviewFocus()` (fade out/in al cambiar de mazo, 0.35 → 0.55).
   * Si dos tweens infinitos escribieran la misma propiedad al mismo
   * tiempo, se pisarían entre sí y el fade de cambio de mazo se vería
   * entrecortado. En su lugar, el matiz de "nitidez" se logra con una capa
   * de "sheen" violeta independiente (mismo tono ambiental que
   * MainMenuScene) cuyo alpha respira en el mismo ciclo — el resultado
   * percibido es el mismo (el escenario "vive"), sin interferir con la
   * lógica de selección de mazo existente.
   */
  private startBackgroundBreathing(): void {
    const { width, height } = this.cameras.main;

    this.tweens.add({
      targets: this.previewBg,
      scaleX: 1.02,
      scaleY: 1.02,
      duration: 3600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    const sheen = this.add.graphics().setDepth(1.5);
    sheen.fillStyle(COLOR_AMBIENT_GLOW, 1);
    sheen.fillRect(0, 0, width, height);
    sheen.setAlpha(0.04);

    this.tweens.add({
      targets: sheen,
      alpha: { from: 0.04, to: 0.12 },
      duration: 3600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  /** Dibuja el halo dorado translúcido detrás de una carta de la vista previa. */
  private drawPreviewCardGlow(graphic: Phaser.GameObjects.Graphics, x: number, y: number): void {
    const width = PREVIEW_CARD_WIDTH + 26;
    const height = PREVIEW_CARD_HEIGHT + 26;

    graphic.fillStyle(COLOR_GOLD, 0.16);
    graphic.fillRoundedRect(x - width / 2, y - height / 2, width, height, 18);
    graphic.lineStyle(2, COLOR_GOLD, 0.55);
    graphic.strokeRoundedRect(x - width / 2, y - height / 2, width, height, 18);
  }

  /**
   * Destello continuo sobre las cartas de la vista previa: el halo de cada
   * carta pulsa suavemente su alpha en loop infinito (`yoyo`, `repeat: -1`),
   * con un ligero desfase entre reverso y frente para que el brillo se
   * sienta como un shimmer y no como un parpadeo sincronizado.
   */
  private startPreviewGlowAnimation(): void {
    this.tweens.add({
      targets: this.previewGlowBack,
      alpha: { from: 0.5, to: 1 },
      duration: 1500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.tweens.add({
      targets: this.previewGlowFront,
      alpha: { from: 0.5, to: 1 },
      duration: 1500,
      delay: 250,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  private renderDeckGrid(): void {
    const { width } = this.cameras.main;
    const spacing = 100;
    const startX = width / 2 - ((this.ownedDeckIds.length - 1) * spacing) / 2;
    const baseY = this.getDeckGridBaseY();

    this.ownedDeckIds.forEach((deckId, index) => {
      const x = startX + index * spacing;

      const highlight = this.add
        .rectangle(x, baseY, 80, 110, 0x000000, 0)
        .setStrokeStyle(3, 0xffd166, 0)
        .setDepth(2);

      const thumb = this.add
        .image(x, baseY, `grid-${deckId}`)
        .setDisplaySize(70, 98)
        .setInteractive({ useHandCursor: true })
        .setDepth(3);

      thumb.on('pointerover', () => {
        if (deckId !== this.previewDeckId) {
          this.tweens.add({ targets: thumb, y: baseY - 15, scale: 1.08, duration: 120 });
        }
      });
      thumb.on('pointerout', () => {
        if (deckId !== this.previewDeckId) {
          this.tweens.add({ targets: thumb, y: baseY, scale: 1, duration: 120 });
        }
      });
      thumb.on('pointerup', () => this.applyPreviewFocus(deckId, false));

      this.gridButtons.set(deckId, highlight);
      this.gridThumbs.set(deckId, thumb);
    });
  }

  /**
   * Selecciona un mazo para VISTA PREVIA (todavía no lo guarda — eso pasa
   * recién al pulsar "Aceptar"). Aplica los efectos pedidos: fade out del
   * contenido anterior, swap de texturas, y fade-in con un pequeño bounce
   * de las cartas + resplandor en la miniatura elegida de la grilla.
   */
  private applyPreviewFocus(deckId: DeckSetupId, immediate: boolean): void {
    this.previewDeckId = deckId;
    const setup = getDeckSetup(deckId);
    const baseY = this.getDeckGridBaseY();

    // Resplandor: solo la miniatura activa mantiene el borde dorado.
    this.gridButtons.forEach((highlight, id) => {
      highlight.setStrokeStyle(3, 0xffd166, id === deckId ? 1 : 0);
    });

    // Elevación y destacado del mazo seleccionado
    this.gridThumbs.forEach((thumb, id) => {
      const isSelected = id === deckId;
      const targetY = isSelected ? baseY - 20 : baseY;
      const targetScale = isSelected ? 1.15 : 1;

      if (immediate) {
        thumb.setY(targetY);
        thumb.setScale(targetScale);
      } else {
        this.tweens.add({
          targets: thumb,
          y: targetY,
          scale: targetScale,
          duration: 200,
          ease: 'Cubic.easeOut'
        });
      }
    });

    const applyNewTextures = () => {
      this.previewBg.setTexture(`preview-bg-${deckId}`);
      // BUGFIX: antes era `this.previewCardBack.setTexture(...)` /
      // `this.previewCardFront.setTexture(...)` directo — cambiaba la
      // textura pero dejaba el scale viejo intacto (ver el comentario de
      // `setPreviewCardTexture()` para el detalle). Ahora se recalcula el
      // tamaño en cada cambio de mazo, así todas las cartas se ven
      // siempre exactamente iguales sin importar la resolución nativa de
      // cada asset.
      this.setPreviewCardTexture(this.previewCardBack, `preview-back-${deckId}`);
      this.setPreviewCardTexture(this.previewCardFront, `preview-front-${deckId}`);
      this.previewNameText.setText(setup.name);
      this.previewNameText.setColor(setup.titleColor);

      // Efecto "bounce" de entrada en las cartas + fade-in del conjunto.
      this.previewContainer.setScale(0.85).setAlpha(0);
      this.previewNameText.setAlpha(0);
      this.previewBg.setAlpha(0.35);

      this.tweens.add({
        targets: this.previewContainer,
        alpha: 1,
        scale: 1,
        duration: 320,
        ease: 'Back.easeOut'
      });
      this.tweens.add({ targets: this.previewNameText, alpha: 1, duration: 280, delay: 80 });
      this.tweens.add({ targets: this.previewBg, alpha: 0.55, duration: 300 });
    };

    if (immediate) {
      applyNewTextures();
      return;
    }

    // Fade-out breve del contenido anterior antes de swapear texturas.
    this.tweens.add({
      targets: [this.previewContainer, this.previewNameText],
      alpha: 0,
      scale: 0.92,
      duration: 150,
      ease: 'Cubic.easeIn',
      onComplete: applyNewTextures
    });
  }

  private renderAcceptButton(services: ReturnType<typeof getServices>): void {
    const { width, height } = this.cameras.main;

    // Mismo lenguaje visual que los botones de MainMenuScene: panel oscuro
    // con borde de acento dorado, filo interior fino, halo que se enciende
    // en hover, y elevación de escala 1.05x — ver createCasinoButton().
    this.createCasinoButton(width / 2, height - 30, 220, 52, 'DECK_SELECTION_ACCEPT_BUTTON', 0x2ea043, () => {
      services.progressionManager.selectDeck(this.previewDeckId);
      // Se relanza PreloadScene para cargar las texturas GENÉRICAS
      // ('card-back'/'card-front'/'backdrop') del mazo recién elegido —
      // ver el comentario en PreloadScene.preload() sobre por qué hace
      // falta repetir la precarga acá y no ir directo a GameScene.
      this.scene.start('PreloadScene', { nextScene: 'GameScene' } satisfies PreloadSceneData);
    });
  }

  /**
   * Botón estilo "Casino de Lujo": panel oscuro + borde de acento + halo
   * de hover + microinteracción de escala — idéntico en construcción al
   * helper homónimo de MainMenuScene, para que ambas escenas compartan
   * exactamente la misma línea estética.
   */
  private createCasinoButton(
    x: number,
    y: number,
    width: number,
    height: number,
    labelKey: TranslationKey,
    accentColor: number,
    onClick: () => void
  ): Phaser.GameObjects.Container {
    const container = this.add.container(x, y).setDepth(3);

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

    // Zona interactiva invisible del tamaño exacto del botón.
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
}