import Phaser from 'phaser';
import languageManager from '../../shared/i18n/LanguageManager';
import { TranslationKey } from '../../shared/i18n/LanguageData';
import { getServices } from '../GameServices';
import { SoundFullscreenControls } from '../components/SoundFullscreenControls';
import { IAudioService } from '../../domain/ports/IAudioService';
import { SFX } from '../../shared/audio/AudioData';
import { bindUiClick } from '../audio/UiSfx';

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
  /** Dibuja la ilustración del paso combinando imágenes REALES del juego
   * (assets/) con acentos vectoriales de apoyo (bordes, halos, flechas) —
   * ver el comentario de ASSETS más abajo para el detalle de qué textura
   * usa cada paso y por qué. */
  readonly draw: (gfx: Phaser.GameObjects.Graphics, container: Phaser.GameObjects.Container, cx: number, cy: number) => void;
}

// QA de legibilidad (fontSize del cuerpo de cada paso 14px -> 17px, ver
// renderStep() más abajo): el modal se agranda un poco en ambos ejes
// para darle más presupuesto real al párrafo de cada paso —
// MODAL_WIDTH más ancho ensancha el wordWrap (menos líneas por párrafo),
// MODAL_HEIGHT más alto da más aire entre el título y los botones de
// navegación. Ambos siguen entrando cómodos en el lienzo de 1280x720
// (620x620 de margen combinado sobrante), y como el resto del archivo
// posiciona todo en relación a estas dos constantes (nunca con números
// sueltos), el resto del layout — botones, cierre, puntos de paginación —
// se reacomoda solo.
const MODAL_WIDTH = 780;
const MODAL_HEIGHT = 580;
/** Y del título de cada paso (independiente de la altura de su
 * ilustración — ver TUTORIAL_SLIDES, cada `draw()` se ancla a
 * illustrationCenterY=-60 sin importar dónde arranca el título). */
const STEP_TITLE_Y = 112;
/** Y del BORDE SUPERIOR del párrafo del cuerpo (origin (0.5,0) — ver
 * renderStep()) — 26px debajo de STEP_TITLE_Y, suficiente para el título
 * de una sola línea a 20px. Presupuesto disponible hasta los botones de
 * navegación (MODAL_HEIGHT/2 - 44): a 17px + lineSpacing 4 (~24.4px por
 * línea), caben 3 líneas completas con margen — ver el acortado de
 * TUTORIAL_STEP_6/7_BODY en LanguageData.ts, el único paso que llegaba a
 * necesitar más de 3 líneas antes de ese ajuste. */
const STEP_BODY_Y = 138;
const ACCENT_COLOR = 0x00e5ff;
const DANGER_COLOR = 0xff4d6d;
const SAFE_COLOR = 0x4dd0ff;
const GOLD_COLOR = 0xf1c40f;
const GOLD_HEX = '#ffd76a';

/**
 * Vitrina de los 10 mazos temáticos (Paso 7) — se lista acá, como
 * strings sueltos, EN VEZ DE importar `DECK_SETUPS`/`DeckSetupId` desde
 * `domain/value-objects/DeckSetups.ts`. Es una decisión deliberada: esta
 * escena es contenido estático de tutorial, desacoplado a propósito de
 * `domain/`/`application/` (ver el docstring de la clase) — así un
 * refactor futuro de la lógica real de mazos nunca puede romper la
 * pantalla de instrucciones. El costo es la duplicación de esta lista de
 * 10 ids (idéntica a `DECK_SETUP_IDS`), un precio aceptable por mantener
 * el tutorial 100% aislado de la capa de dominio.
 */
const DECK_SHOWCASE_THEMES: readonly string[] = [
  'basic',
  'cyberpunk',
  'medieval',
  'tarot',
  'vegas',
  'ww2',
  'dracula',
  'glacier',
  'egypt',
  'ovni'
];

/** Prefijo de las texturas de miniatura cargadas en preload() (ver más abajo) — namespaced para no colisionar con las keys reales `card-front`/`shop-cardback-*`/etc. que cargan otras escenas. */
const DECK_THUMB_KEY_PREFIX = 'tutorial-deck-front-';

/**
 * Ilustraciones fijas del mazo "Básico" (Pasos 1 a 5): esta escena
 * NO reutiliza las keys genéricas 'card-back'/'banker-portrait'/
 * 'energy-bar-bg'/'energy-bar-fill' que carga PreloadScene, porque esas
 * SIEMPRE reflejan el mazo actualmente EQUIPADO por el jugador (ver
 * PreloadScene.preload() — se recargan bajo la misma key cada vez que
 * cambia la selección en DeckSelectionScene). Si el jugador tiene, por
 * ejemplo, "Bunker WW2" equipado, esas texturas mostrarían WW2 en pleno
 * tutorial. Para que el tutorial se vea SIEMPRE igual — con el mazo
 * "Básico" como ejemplo neutral, sin importar qué mazo esté activo — se
 * precargan estos 4 archivos puntuales del tema 'basic' bajo keys
 * propias de esta escena (ver preload() más abajo). Los nombres de
 * archivo son literales locales (no un import de `DeckSetups.ts`), por
 * el mismo motivo de desacoplamiento de domain/ explicado más arriba.
 */
const BASIC_DECK_ASSET_FILES = {
  cardBack: 'card-back-basic',
  bankerPortrait: 'presentador-portrait',
  energyBarBg: 'basic-energy-bar-bg',
  energyBarFill: 'basic-energy-bar-fill'
} as const;

/** Keys de textura (namespaced 'tutorial-basic-*') bajo las que se cargan los 4 archivos de BASIC_DECK_ASSET_FILES — ver preload(). */
const TUTORIAL_BASIC_CARD_BACK_KEY = 'tutorial-basic-card-back';
const TUTORIAL_BASIC_PORTRAIT_KEY = 'tutorial-basic-banker-portrait';
const TUTORIAL_BASIC_ENERGY_BG_KEY = 'tutorial-basic-energy-bar-bg';
const TUTORIAL_BASIC_ENERGY_FILL_KEY = 'tutorial-basic-energy-bar-fill';

/**
 * HowToPlayScene: tutorial interactivo navegable (formato carrusel de
 * pasos con Anterior/Siguiente + indicador "X / Y" + puntos de paginación
 * cliqueables), accesible desde MainMenuScene. Desacoplada del estado
 * real de partida — solo consume TUTORIAL_SLIDES (datos estáticos
 * locales) y no importa nada de domain/ ni application/ (ver
 * DECK_SHOWCASE_THEMES arriba para la única excepción deliberada:
 * strings, no lógica).
 *
 * ASSETS REALES: a diferencia de la versión anterior (100% Graphics),
 * cada paso ilustra la regla con una textura real del juego. Los Pasos 1
 * a 5 usan SIEMPRE el mazo "Básico" como ejemplo — fijo, sin importar
 * qué mazo tenga equipado el jugador (ver BASIC_DECK_ASSET_FILES arriba
 * para el porqué) — mientras que los íconos del HUD (deck-independientes)
 * y la vitrina del Paso 7 (los 10 mazos a propósito) sí usan sus propias
 * texturas reales:
 *   - Paso 1 (objetivo): TUTORIAL_BASIC_CARD_BACK_KEY (carta secreta + tablero).
 *   - Paso 2 (energía): TUTORIAL_BASIC_ENERGY_BG_KEY / TUTORIAL_BASIC_ENERGY_FILL_KEY.
 *   - Paso 3 (banquero): TUTORIAL_BASIC_PORTRAIT_KEY.
 *   - Paso 4 (midgame swap): TUTORIAL_BASIC_CARD_BACK_KEY (carta vieja/nueva).
 *   - Paso 5 (tienda/mejoras): 'hud-shop' (ícono del HUD, no depende del mazo).
 *   - Paso 6 (bono 12hs, NUEVO): 'hud-bonus' (ídem, ícono del HUD).
 *   - Paso 7 (10 mazos, NUEVO): las 10 miniaturas `card-front-<id>.png`
 *     bajo assets/cards/ — acá SÍ se muestran los 10 mazos reales a
 *     propósito (es justamente la vitrina de la tienda), precargadas en
 *     preload() bajo la key `tutorial-deck-front-<id>`.
 *
 * i18n: como todo el contenido (título, indicador de paso, ilustraciones,
 * botones) se reconstruye por completo en cada `renderStep()`/`create()`
 * — nunca queda un Text "vivo" mientras el idioma podría cambiar (el
 * selector de idioma solo existe en MainMenuScene, jamás junto con esta
 * escena) — alcanza con leer `languageManager.getText()` en el momento de
 * crear cada texto. No hace falta LocalizedText acá; ver MainMenuScene y
 * ShopScene para el patrón de actualización EN VIVO cuando sí aplica.
 */
const TUTORIAL_SLIDES: readonly TutorialSlide[] = [
  {
    titleKey: 'TUTORIAL_STEP_1_TITLE',
    bodyKey: 'TUTORIAL_STEP_1_BODY',
    draw: (gfx, container, cx, cy) => {
      const scene = container.scene;

      // Carta Secreta real (reverso fijo del mazo "Básico" — ver
      // TUTORIAL_BASIC_CARD_BACK_KEY) destacada, centrada y elevada — el
      // marco dorado + la ★ son el único acento vectorial, la carta en sí
      // es la textura real.
      const cardW = 70;
      const cardH = 98;
      const secretCardY = cy - 70;
      const secretCard = scene.add.image(cx, secretCardY, TUTORIAL_BASIC_CARD_BACK_KEY).setDisplaySize(cardW, cardH);
      gfx.lineStyle(3, GOLD_COLOR, 1).strokeRoundedRect(cx - cardW / 2, secretCardY - cardH / 2, cardW, cardH, 8);
      const star = scene.add.text(cx, secretCardY, '★', { fontSize: '26px', color: '#f1c40f' }).setOrigin(0.5);

      // Grupo de cartas cerradas del tablero, en abanico debajo — mismas
      // posiciones que la versión anterior, ahora con la textura real.
      const boardY = cy + 60;
      const positions = [-135, -85, -35, 15, 65, 115];
      const boardCards = positions.map(offsetX =>
        scene.add.image(cx + offsetX, boardY, TUTORIAL_BASIC_CARD_BACK_KEY).setDisplaySize(44, 62)
      );
      positions.forEach(offsetX => {
        gfx.lineStyle(2, ACCENT_COLOR, 0.7).strokeRoundedRect(cx + offsetX - 22, boardY - 31, 44, 62, 6);
      });

      container.add([secretCard, star, ...boardCards]);
    }
  },
  {
    titleKey: 'TUTORIAL_STEP_2_TITLE',
    bodyKey: 'TUTORIAL_STEP_2_BODY',
    draw: (gfx, container, cx, cy) => {
      const scene = container.scene;

      // Barra de energía REAL, fija al tema "Básico" (ver
      // TUTORIAL_BASIC_ENERGY_BG_KEY/TUTORIAL_BASIC_ENERGY_FILL_KEY —
      // mismo motivo que la carta del Paso 1: cada mazo tiene su propia
      // barra, ver EnergyBarView.ts / DeckSetups.ts) escalada a un ancho
      // fijo de exhibición, preservando la relación de aspecto nativa de
      // cada asset (400x30 el marco, 400x10 el relleno) para no
      // distorsionarlos.
      const displayWidth = 340;
      const bg = scene.add.image(cx, cy, TUTORIAL_BASIC_ENERGY_BG_KEY).setOrigin(0.5, 0.5);
      const bgScale = displayWidth / bg.width;
      bg.setDisplaySize(displayWidth, bg.height * bgScale);

      const fillPercent = 0.62; // mismo split ilustrativo "protege/drena" que la versión anterior
      const fillLeftX = cx - displayWidth / 2;
      const fill = scene.add.image(fillLeftX, cy, TUTORIAL_BASIC_ENERGY_FILL_KEY).setOrigin(0, 0.5);
      const fillScale = displayWidth / fill.width;
      fill.setDisplaySize(displayWidth * fillPercent, fill.height * fillScale);
      fill.setTint(SAFE_COLOR); // celeste "protegido" — mismo criterio que el segmento SAFE_COLOR de la versión anterior

      // El asset de relleno es un único color sólido pensado para tint
      // dinámico en runtime (ver EnergyBarView.ts) — no existe un
      // segundo asset "de peligro", así que el segmento restante (38%)
      // se resalta con un overlay semitransparente sobre la barra real,
      // en vez de inventar una textura extra.
      gfx.fillStyle(DANGER_COLOR, 0.5).fillRoundedRect(
        fillLeftX + displayWidth * fillPercent,
        cy - (fill.height * fillScale) / 2,
        displayWidth * (1 - fillPercent),
        fill.height * fillScale,
        3
      );

      const labelY = cy + (bg.height * bgScale) / 2 + 26;
      const safeLabel = scene.add
        .text(fillLeftX + displayWidth * (fillPercent / 2), labelY, languageManager.getText('ENERGY_PROTECT_LABEL'), {
          fontSize: '16px',
          fontFamily: 'Arial, sans-serif',
          color: '#4dd0ff',
          fontStyle: 'bold'
        })
        .setOrigin(0.5);
      const dangerLabel = scene.add
        .text(
          fillLeftX + displayWidth * fillPercent + (displayWidth * (1 - fillPercent)) / 2,
          labelY,
          languageManager.getText('ENERGY_DRAIN_LABEL'),
          { fontSize: '16px', fontFamily: 'Arial, sans-serif', color: '#ff4d6d', fontStyle: 'bold' }
        )
        .setOrigin(0.5);

      container.add([bg, fill, safeLabel, dangerLabel]);
    }
  },
  {
    titleKey: 'TUTORIAL_STEP_3_TITLE',
    bodyKey: 'TUTORIAL_STEP_3_BODY',
    draw: (gfx, container, cx, cy) => {
      const scene = container.scene;

      // Retrato REAL del Banquero, fijo al tema "Básico" (ver
      // TUTORIAL_BASIC_PORTRAIT_KEY — cada mazo tiene su propio
      // presentador, ver DeckSetups.ts/PreloadScene.ts) enmarcado —
      // reemplaza la silueta de "teléfono neón" dibujada a mano de la
      // versión anterior.
      const portraitY = cy - 45;
      const frameSize = 108;
      gfx.lineStyle(3, GOLD_COLOR, 1).strokeRoundedRect(cx - frameSize / 2, portraitY - frameSize / 2, frameSize, frameSize, 16);
      const portrait = scene.add.image(cx, portraitY, TUTORIAL_BASIC_PORTRAIT_KEY).setDisplaySize(frameSize - 14, frameSize - 14);

      // Botones DEAL / NO DEAL — sin asset propio en el juego real (son
      // botones de texto también en GameScene), se mantienen como
      // Graphics + Text, mismo tratamiento visual que antes.
      const btnY = cy + 70;
      gfx.lineStyle(2, 0x2ecc71, 1).strokeRoundedRect(cx - 130, btnY - 20, 110, 44, 10);
      gfx.lineStyle(2, DANGER_COLOR, 1).strokeRoundedRect(cx + 20, btnY - 20, 110, 44, 10);

      const dealText = scene.add
        .text(cx - 75, btnY, languageManager.getText('BANKER_DEAL_BUTTON'), {
          fontSize: '16px',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          color: '#2ecc71'
        })
        .setOrigin(0.5);
      const noDealText = scene.add
        .text(cx + 75, btnY, languageManager.getText('BANKER_NO_DEAL_BUTTON'), {
          fontSize: '17px',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          color: '#ff4d6d'
        })
        .setOrigin(0.5);

      // Línea corta de la regla anti-farmeo (ADR-014): va en la banda
      // vacía entre los botones de ejemplo (terminan ~y=34) y el cuerpo
      // del paso (STEP_BODY_Y=138), con el mismo estilo gris de los
      // captions del paso 6.
      const cappedCaption = scene.add
        .text(cx, btnY + 56, languageManager.getText('TUTORIAL_BANKER_CAPPED_CAPTION'), {
          fontSize: '16px',
          fontFamily: 'Arial, sans-serif',
          color: '#8b949e',
          align: 'center',
          wordWrap: { width: 620 }
        })
        .setOrigin(0.5);

      container.add([portrait, dealText, noDealText, cappedCaption]);
    }
  },
  {
    titleKey: 'TUTORIAL_STEP_4_TITLE',
    bodyKey: 'TUTORIAL_STEP_4_BODY',
    draw: (gfx, container, cx, cy) => {
      const scene = container.scene;
      const cardW = 64;
      const cardH = 90;

      // Carta Secreta descartada (izquierda) y carta candidata del
      // tablero (derecha) — ambas con la textura real fija al tema
      // "Básico" (TUTORIAL_BASIC_CARD_BACK_KEY, mismo motivo que el Paso
      // 1), el intercambio en sí se sigue comunicando con las flechas
      // curvas (no existe un asset propio para esa animación conceptual).
      const oldCard = scene.add.image(cx - 120, cy, TUTORIAL_BASIC_CARD_BACK_KEY).setDisplaySize(cardW, cardH);
      gfx.lineStyle(3, GOLD_COLOR, 1).strokeRoundedRect(cx - 120 - cardW / 2, cy - cardH / 2, cardW, cardH, 8);
      const newCard = scene.add.image(cx + 120, cy, TUTORIAL_BASIC_CARD_BACK_KEY).setDisplaySize(cardW, cardH);
      gfx.lineStyle(3, ACCENT_COLOR, 1).strokeRoundedRect(cx + 120 - cardW / 2, cy - cardH / 2, cardW, cardH, 8);

      gfx.lineStyle(3, 0xffffff, 0.9);
      gfx.beginPath();
      gfx.arc(cx, cy, 95, Phaser.Math.DegToRad(200), Phaser.Math.DegToRad(340), false);
      gfx.strokePath();
      gfx.beginPath();
      gfx.arc(cx, cy, 95, Phaser.Math.DegToRad(20), Phaser.Math.DegToRad(160), false);
      gfx.strokePath();

      gfx.fillStyle(0xffffff, 1);
      gfx.fillTriangle(cx + 92, cy - 35, cx + 80, cy - 42, cx + 80, cy - 22);
      gfx.fillTriangle(cx - 92, cy + 35, cx - 80, cy + 42, cx - 80, cy + 22);

      const percentText = scene.add
        .text(cx, cy + 80, languageManager.getText('TUTORIAL_MIDGAME_PERCENT_LABEL', { percent: 50 }), {
          fontSize: '16px',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          color: '#ffd166'
        })
        .setOrigin(0.5);

      container.add([oldCard, newCard, percentText]);
    }
  },
  {
    titleKey: 'TUTORIAL_STEP_5_TITLE',
    bodyKey: 'TUTORIAL_STEP_5_BODY',
    draw: (gfx, container, cx, cy) => {
      const scene = container.scene;

      // Ícono REAL de Tienda del HUD ('hud-shop', ver PreloadScene.ts) —
      // reemplaza el cofre + monedas dibujados a mano.
      const iconY = cy + 10;
      const iconSize = 96;
      gfx.fillStyle(0x121218, 0.92).fillRoundedRect(cx - iconSize / 2 - 12, iconY - iconSize / 2 - 12, iconSize + 24, iconSize + 24, 18);
      gfx.lineStyle(3, GOLD_COLOR, 0.9).strokeRoundedRect(cx - iconSize / 2 - 12, iconY - iconSize / 2 - 12, iconSize + 24, iconSize + 24, 18);
      const shopIcon = scene.add.image(cx, iconY, 'hud-shop');
      const shopScale = iconSize / Math.max(shopIcon.width, shopIcon.height);
      shopIcon.setDisplaySize(shopIcon.width * shopScale, shopIcon.height * shopScale);

      const shopText = scene.add
        .text(cx, iconY + iconSize / 2 + 34, languageManager.getText('TUTORIAL_SHOP_UPGRADES_LABEL'), {
          fontSize: '16px',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          color: '#f1c40f'
        })
        .setOrigin(0.5);

      container.add([shopIcon, shopText]);
    }
  },
  // --- Paso NUEVO: Bono gratuito cada 12 horas ---
  {
    titleKey: 'TUTORIAL_STEP_6_TITLE',
    bodyKey: 'TUTORIAL_STEP_6_BODY',
    draw: (gfx, container, cx, cy) => {
      const scene = container.scene;

      // Ícono REAL de Bono del HUD ('hud-bonus', ver PreloadScene.ts) —
      // el MISMO ícono que el jugador toca en partida (ver UIScene.ts),
      // con un halo dorado como único acento vectorial.
      const iconY = cy + 10;
      const iconSize = 104;
      gfx.fillStyle(GOLD_COLOR, 0.18).fillCircle(cx, iconY, iconSize / 2 + 22);
      gfx.lineStyle(2, GOLD_COLOR, 0.55).strokeCircle(cx, iconY, iconSize / 2 + 22);
      const bonusIcon = scene.add.image(cx, iconY, 'hud-bonus');
      const bonusScale = iconSize / Math.max(bonusIcon.width, bonusIcon.height);
      bonusIcon.setDisplaySize(bonusIcon.width * bonusScale, bonusIcon.height * bonusScale);

      // Reutiliza HUD_BONUS ("Bono"/"Bonus") — la MISMA clave que ya usa
      // el botón real del HUD (ver UIScene.refreshBonusButton()) — en vez
      // de duplicar una traducción equivalente en el diccionario.
      const bonusLabel = scene.add
        .text(cx, iconY + iconSize / 2 + 28, languageManager.getText('HUD_BONUS'), {
          fontSize: '16px',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          color: GOLD_HEX
        })
        .setOrigin(0.5);
      const captionLabel = scene.add
        .text(cx, iconY + iconSize / 2 + 52, languageManager.getText('TUTORIAL_BONUS_CAPTION'), {
          fontSize: '16px',
          fontFamily: 'Arial, sans-serif',
          color: '#8b949e'
        })
        .setOrigin(0.5);

      container.add([bonusIcon, bonusLabel, captionLabel]);
    }
  },
  // --- Paso NUEVO: Tienda — 10 mazos temáticos + efecto especial (25.000) ---
  {
    titleKey: 'TUTORIAL_STEP_7_TITLE',
    bodyKey: 'TUTORIAL_STEP_7_BODY',
    draw: (gfx, container, cx, cy) => {
      const scene = container.scene;

      // Vitrina de miniaturas REALES de los 10 mazos ('card-front-<id>',
      // precargadas en preload() bajo DECK_THUMB_KEY_PREFIX) en grilla
      // 5x2 — cada una es el frente de carta real de ese mazo.
      const cols = 5;
      const thumbW = 44;
      const thumbH = 62;
      const gapX = 8;
      const gapY = 10;
      const rowCount = Math.ceil(DECK_SHOWCASE_THEMES.length / cols);
      const gridW = cols * thumbW + (cols - 1) * gapX;
      const gridH = rowCount * thumbH + (rowCount - 1) * gapY;
      const startX = cx - gridW / 2 + thumbW / 2;
      const startY = cy - gridH / 2 + thumbH / 2 - 6;

      const thumbs: Phaser.GameObjects.Image[] = DECK_SHOWCASE_THEMES.map((themeId, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = startX + col * (thumbW + gapX);
        const y = startY + row * (thumbH + gapY);
        const thumb = scene.add.image(x, y, `${DECK_THUMB_KEY_PREFIX}${themeId}`).setDisplaySize(thumbW, thumbH);
        gfx.lineStyle(1, ACCENT_COLOR, 0.5).strokeRoundedRect(x - thumbW / 2, y - thumbH / 2, thumbW, thumbH, 4);
        return thumb;
      });

      // Resalta la primera miniatura con un halo dorado — referencia
      // visual directa al efecto especial único que dispara CADA mazo al
      // revelar su carta de mayor valor (25.000 puntos, ver
      // DeckCelebrationEffectRegistry.ts).
      const highlighted = thumbs[0];
      gfx.lineStyle(2, GOLD_COLOR, 0.9).strokeRoundedRect(
        highlighted.x - thumbW / 2 - 3,
        highlighted.y - thumbH / 2 - 3,
        thumbW + 6,
        thumbH + 6,
        6
      );
      gfx.fillStyle(GOLD_COLOR, 0.22).fillCircle(highlighted.x, highlighted.y, thumbW * 0.85);

      const captionY = startY + gridH / 2 + 24;
      const decksCaption = scene.add
        .text(cx, captionY, languageManager.getText('TUTORIAL_DECKS_CAPTION'), {
          fontSize: '16px',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          color: '#e6edf3'
        })
        .setOrigin(0.5);
      const effectCaption = scene.add
        .text(cx, captionY + 20, languageManager.getText('TUTORIAL_DECKS_EFFECT_CAPTION'), {
          fontSize: '15px',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          color: GOLD_HEX
        })
        .setOrigin(0.5);

      container.add([...thumbs, decksCaption, effectCaption]);
    }
  }
];

export class HowToPlayScene extends Phaser.Scene {
  private currentStep = 0;
  private isTransitioning = false;

  private modalContainer!: Phaser.GameObjects.Container;
  private contentContainer!: Phaser.GameObjects.Container;
  private stepIndicatorText!: Phaser.GameObjects.Text;
  // Puntos de paginación tipo carrusel (uno por paso, cliqueables para
  // saltar directo) — se guardan como referencias para poder actualizar
  // cuál está "activo" en cada renderStep(), sin recrearlos.
  private stepDots: Phaser.GameObjects.Arc[] = [];

  private prevButton!: Phaser.GameObjects.Container;
  private nextButton!: Phaser.GameObjects.Container;
  private nextButtonLabel!: Phaser.GameObjects.Text;
  // Controles persistentes de Sonido/Pantalla Completa (mismo componente
  // que UIScene/GameScene/MainMenuScene, ver SoundFullscreenControls.ts).
  private hudControls!: SoundFullscreenControls;

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
    this.stepDots = [];
  }

  /**
   * Esta escena precarga sus propias texturas en vez de reutilizar las
   * keys genéricas de PreloadScene ('card-back'/'banker-portrait'/
   * 'energy-bar-bg'/'energy-bar-fill'), por dos motivos distintos:
   *
   * 1. Pasos 1-5 (mazo "Básico" fijo): esas keys genéricas SIEMPRE
   *    reflejan el mazo EQUIPADO por el jugador (PreloadScene las
   *    recarga bajo la misma key en cada cambio de selección), así que
   *    si se reutilizaran acá, el tutorial mostraría WW2, Vegas, etc.
   *    según lo que el jugador tenga puesto — inconsistente entre
   *    partidas. Se piden explícitamente los 4 archivos del tema
   *    'basic' (ver BASIC_DECK_ASSET_FILES) bajo keys propias, así el
   *    ejemplo del tutorial es siempre el mismo sin importar el mazo
   *    activo.
   * 2. Paso 7 ("10 Mazos Temáticos"): necesita las miniaturas REALES de
   *    los 10 mazos a la vez — y solo el mazo activo está garantizado en
   *    el TextureManager en este punto — así que se piden aparte.
   *
   * ('hud-shop'/'hud-bonus'/'hud-exit' sí son deck-independientes y ya
   * están cargados por PreloadScene antes de llegar acá — BootScene →
   * PreloadScene → MainMenuScene → "¿Cómo Jugar?" — así que esos NO se
   * vuelven a pedir, evitando una descarga de red redundante.)
   */
  preload(): void {
    this.load.image(TUTORIAL_BASIC_CARD_BACK_KEY, `assets/cards/${BASIC_DECK_ASSET_FILES.cardBack}.png`);
    this.load.image(TUTORIAL_BASIC_PORTRAIT_KEY, `assets/ui/portrait/${BASIC_DECK_ASSET_FILES.bankerPortrait}.webp`);
    this.load.image(TUTORIAL_BASIC_ENERGY_BG_KEY, `assets/ui/energy-bar/${BASIC_DECK_ASSET_FILES.energyBarBg}.webp`);
    this.load.image(TUTORIAL_BASIC_ENERGY_FILL_KEY, `assets/ui/energy-bar/${BASIC_DECK_ASSET_FILES.energyBarFill}.webp`);

    DECK_SHOWCASE_THEMES.forEach(themeId => {
      this.load.image(`${DECK_THUMB_KEY_PREFIX}${themeId}`, `assets/cards/card-front-${themeId}.png`);
    });
  }

  create(): void {
    const { width, height } = this.cameras.main;
    // Arriba de todo (antes de crear cualquier botón): servicios en scope
    // para pasarle `audioService` a createCloseButton/createStepDots/
    // createNavButton/createBackToMenuButton — declararlo a mitad de
    // create() (como estaba) dejaría los binds iniciales en TDZ.
    const services = getServices(this);

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
    this.modalContainer.add(this.createCloseButton(services.audioService));

    // Indicador de paso ("2 / 7")
    this.stepIndicatorText = this.add
      .text(0, -MODAL_HEIGHT / 2 + 66, '', {
        fontSize: '16px',
        fontFamily: 'Arial, sans-serif',
        color: '#8b949e'
      })
      .setOrigin(0.5);
    this.modalContainer.add(this.stepIndicatorText);

    // Puntos de paginación tipo carrusel, debajo del indicador "X / Y" —
    // formato "tarjetas navegables" pedido: cada punto también permite
    // saltar directo a ese paso, no solo avanzar de a uno.
    this.modalContainer.add(this.createStepDots(services.audioService));

    // Contenedor de contenido: se vacía y repuebla en cada cambio de paso
    // (mismo patrón ya usado en ShopScene para alternar pestañas) — así
    // los tweens de transición animan un único contenedor, prolijo.
    this.contentContainer = this.add.container(0, 0);
    this.modalContainer.add(this.contentContainer);

    // Navegación Prev / Next + "Volver al Menú"
    this.prevButton = this.createNavButton(
      -MODAL_WIDTH / 2 + 90,
      MODAL_HEIGHT / 2 - 44,
      languageManager.getText('TUTORIAL_PREV_BUTTON'),
      () => this.goToStep(this.currentStep - 1),
      services.audioService
    );
    this.nextButton = this.createNavButton(
      MODAL_WIDTH / 2 - 90,
      MODAL_HEIGHT / 2 - 44,
      languageManager.getText('TUTORIAL_NEXT_BUTTON'),
      () => this.handleNextPressed(),
      services.audioService
    );
    this.nextButtonLabel = this.nextButton.getAt(1) as Phaser.GameObjects.Text;
    this.modalContainer.add([this.prevButton, this.nextButton]);
    this.modalContainer.add(this.createBackToMenuButton(services.audioService));

    // Entrada del modal: fade + pequeño scale-in
    this.modalContainer.setAlpha(0).setScale(0.9);
    this.tweens.add({ targets: this.modalContainer, alpha: 1, scale: 1, duration: 280, ease: 'Back.easeOut' });

    this.renderStep(0, 'none');

    // Sonido/Pantalla Completa — esquina inferior derecha, igual que en
    // GameScene (ver UIScene.ts) y en MainMenuScene, para poder cambiar
    // el tamaño de pantalla o silenciar/activar el audio también desde
    // el tutorial.
    this.hudControls = new SoundFullscreenControls(this, services.audioService, services.fullscreenEnabled);

    // Limpieza al apagar la escena: además de `hudControls` (sus propios
    // listeners del ScaleManager viven a nivel Game, ver
    // SoundFullscreenControls.destroy()), se detiene cualquier tween en
    // vuelo sobre los contenedores de esta escena — evita que un
    // onComplete (ej. `exitToMainMenu()`) dispare sobre una escena ya
    // detenida si el jugador la cierra por otra vía a mitad de una
    // transición. El resto de los listeners (botones, dots, hitZones) son
    // propios de GameObjects de ESTA escena: Phaser los destruye en
    // cascada junto con ellos al hacer SHUTDOWN, sin necesitar un `off()`
    // manual acá (mismo criterio que MainMenuScene/ShopScene).
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.tweens.killTweensOf(this.modalContainer);
      this.tweens.killTweensOf(this.contentContainer);
      this.hudControls.destroy();
    });
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
    if (targetStep === this.currentStep) return;

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
        .text(0, STEP_TITLE_Y, languageManager.getText(slide.titleKey), {
          fontSize: '20px',
          fontFamily: 'Arial, sans-serif',
          fontStyle: 'bold',
          color: '#ffd166'
        })
        .setOrigin(0.5)
    );

    // QA de legibilidad: origin (0.5, 0) — TOP-anchorado, no centrado.
    // Con el cuerpo a 17px, el texto más largo de los 7 pasos puede
    // ocupar hasta 3 líneas (ver el acortado de TUTORIAL_STEP_6/7_BODY
    // en LanguageData.ts); un origin centrado haría crecer el bloque
    // simétricamente HACIA ARRIBA también, pisando el título de arriba.
    // Anclado por arriba, un párrafo más largo sólo se extiende hacia
    // abajo, hacia los botones de navegación — dirección predecible y
    // fácil de acotar con STEP_BODY_Y.
    this.contentContainer.add(
      this.add
        .text(0, STEP_BODY_Y, languageManager.getText(slide.bodyKey), {
          fontSize: '17px',
          fontFamily: 'Arial, sans-serif',
          color: '#e6edf3',
          align: 'center',
          wordWrap: { width: MODAL_WIDTH - 120 },
          lineSpacing: 4
        })
        .setOrigin(0.5, 0)
    );

    this.stepIndicatorText.setText(
      languageManager.getText('TUTORIAL_STEP_COUNTER', { current: stepIndex + 1, total: TUTORIAL_SLIDES.length })
    );
    this.updateNavButtonsVisibility();
    this.updateStepDots();

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

  /** Resalta el punto correspondiente al paso actual (dorado + un poco
   * más grande) y atenúa el resto — se llama desde renderStep() en cada
   * cambio de paso, sea por Anterior/Siguiente o por click directo en un
   * punto. */
  private updateStepDots(): void {
    this.stepDots.forEach((dot, index) => {
      const isActive = index === this.currentStep;
      dot.setFillStyle(isActive ? GOLD_COLOR : 0x3d4450, 1);
      dot.setScale(isActive ? 1.3 : 1);
    });
  }

  // ------------------------------------------------------------------
  // Construcción de botones (Graphics + Text, sin imágenes externas)
  // ------------------------------------------------------------------

  private createNavButton(
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    audio: IAudioService
  ): Phaser.GameObjects.Container {
    const bg = this.add
      .rectangle(0, 0, 150, 44, 0x21262d)
      .setStrokeStyle(2, ACCENT_COLOR, 0.8)
      .setInteractive({ useHandCursor: true });
    const text = this.add
      .text(0, 0, label, { fontSize: '17px', fontFamily: 'Arial, sans-serif', fontStyle: 'bold', color: '#ffffff' })
      .setOrigin(0.5);

    bg.on('pointerover', () => bg.setFillStyle(0x2d333b));
    bg.on('pointerout', () => bg.setFillStyle(0x21262d));
    bg.on('pointerup', onClick);
    // Click genérico de UI (punto único: UiSfx.bindUiClick).
    bindUiClick(bg, audio);

    return this.add.container(x, y, [bg, text]);
  }

  private createCloseButton(audio: IAudioService): Phaser.GameObjects.Container {
    const x = MODAL_WIDTH / 2 - 30;
    const y = -MODAL_HEIGHT / 2 + 30;

    const bg = this.add.circle(0, 0, 16, 0x21262d).setStrokeStyle(2, DANGER_COLOR, 0.8).setInteractive({ useHandCursor: true });
    const label = this.add
      .text(0, 0, '✕', { fontSize: '16px', fontFamily: 'Arial, sans-serif', color: '#ffffff' })
      .setOrigin(0.5);

    bg.on('pointerover', () => bg.setFillStyle(0x6e2a2a));
    bg.on('pointerout', () => bg.setFillStyle(0x21262d));
    bg.on('pointerup', () => this.exitToMainMenu());
    // Click genérico de UI (punto único: UiSfx.bindUiClick).
    bindUiClick(bg, audio);

    return this.add.container(x, y, [bg, label]);
  }

  /** Fila de puntos de paginación (uno por TUTORIAL_SLIDES), centrada
   * bajo el indicador "X / Y" — formato carrusel: cada punto es
   * cliqueable para saltar directo a ese paso, además de servir como
   * indicador visual pasivo de posición/progreso. */
  private createStepDots(audio: IAudioService): Phaser.GameObjects.Container {
    const spacing = 16;
    const totalWidth = (TUTORIAL_SLIDES.length - 1) * spacing;
    const startX = -totalWidth / 2;

    this.stepDots = TUTORIAL_SLIDES.map((_, index) => {
      const dot = this.add.circle(startX + index * spacing, 0, 4, 0x3d4450, 1).setInteractive({ useHandCursor: true });
      dot.on('pointerup', () => this.goToStep(index));
      // Click genérico de UI de cada punto (punto único: UiSfx.bindUiClick).
      bindUiClick(dot, audio);
      return dot;
    });

    return this.add.container(0, -MODAL_HEIGHT / 2 + 92, this.stepDots);
  }

  /**
   * "Volver al Menú": pill-button de altura 44px (piso táctil móvil
   * estándar del proyecto, ver MIN_TOUCH_SIZE en HudIconButton.ts) con el
   * ícono REAL de Salir del HUD ('hud-exit') — antes era solo texto
   * pequeño con un hit-area transparente de 34px de alto, poco fiable en
   * dispositivos móviles; ahora es un botón visible completo, coherente
   * con el resto de la UI "Casino de Lujo" del juego.
   */
  private createBackToMenuButton(audio: IAudioService): Phaser.GameObjects.Container {
    const width = 220;
    const height = 44;
    const y = MODAL_HEIGHT / 2 - 40;

    const bg = this.add
      .rectangle(0, 0, width, height, 0x14161c, 0.92)
      .setStrokeStyle(2, 0x3d4450, 0.9)
      .setInteractive({ useHandCursor: true });
    const icon = this.add.image(-width / 2 + 28, 0, 'hud-exit').setDisplaySize(20, 20);
    const text = this.add
      .text(8, 0, languageManager.getText('TUTORIAL_BACK_TO_MENU'), {
        fontSize: '17px',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        color: '#c9d1d9'
      })
      .setOrigin(0.5);

    bg.on('pointerover', () => {
      bg.setFillStyle(0x1c2028, 0.95);
      bg.setStrokeStyle(2, ACCENT_COLOR, 0.9);
      text.setColor('#ffffff');
    });
    bg.on('pointerout', () => {
      bg.setFillStyle(0x14161c, 0.92);
      bg.setStrokeStyle(2, 0x3d4450, 0.9);
      text.setColor('#c9d1d9');
    });
    bg.on('pointerup', () => this.exitToMainMenu());
    // Click genérico de UI (punto único: UiSfx.bindUiClick).
    bindUiClick(bg, audio);

    return this.add.container(0, y, [bg, icon, text]);
  }

  // ------------------------------------------------------------------
  // Salida
  // ------------------------------------------------------------------

  private exitToMainMenu(): void {
    if (this.isTransitioning) return;
    this.isTransitioning = true;

    // Única transición ANIMADA del juego (el resto son cortes secos):
    // el whoosh acompaña el fade de salida. Va después del guard para no
    // sonar en un click bloqueado, y antes del tween a propósito.
    try {
      getServices(this).audioService.play(SFX.WHOOSH);
    } catch {
      // Audio best-effort: nunca rompe la transición.
    }

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