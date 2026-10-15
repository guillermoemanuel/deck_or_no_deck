import Phaser from 'phaser';
import { getServices } from '../GameServices';
import { getActiveSessionBridge } from '../ActiveSessionBridge';
import { findSessionUpgradeDefinition, SessionUpgradeId } from '../../domain/value-objects/SessionUpgradeCatalog';
import { SessionUpgrades } from '../../domain/entities/SessionUpgrades';
import { PurchaseSessionUpgradeUseCase } from '../../application/use-cases/PurchaseSessionUpgradeUseCase';
import { DECK_SETUP_IDS, DeckSetupId, getDeckSetup } from '../../domain/value-objects/DeckSetups';
import { DeckShopEntry } from '../../application/use-cases/ListAvailableDecksUseCase';
import languageManager from '../../shared/i18n/LanguageManager';
import { TranslationKey } from '../../shared/i18n/LanguageData';
import { LocalizedText } from '../components/LocalizedText';
import { DRAG_THRESHOLD_PX, ScrollableList } from '../components/ScrollableList';
import { resolveShopLayout, scrollOffsetToReveal, ShopButtonSpec, ShopLayout, ShopTabLayout, ShopTextSpec } from '../layout/ShopLayout';
import { getMinDesignFontPx } from '../../shared/utils/CompactScreen';
import { SFX } from '../../shared/audio/AudioData';
import { bindUiClick, ClickPointerLike, playUiClick } from '../audio/UiSfx';
import { bindKeys } from '../input/KeyBindings';
import { FocusDirection, FocusItem, nextFocusIndex } from '../input/KeyboardNavigation';

/**
 * Paleta y "chrome" de botones — MISMA convención "Casino de Lujo" que el
 * resto del juego (ver createCasinoButton en MainMenuScene.ts y el panel
 * de HudIconButton.ts): panel carbón + borde de acento + filo dorado
 * interior + halo que se enciende en hover, con el mismo timing de tweens.
 * Antes esta escena usaba Rectangle planos sin borde ni hover — quedaba
 * visualmente desconectada del resto de la UI.
 */
const PANEL_FILL = 0x121218;
const PANEL_FILL_ALPHA = 0.95;
const COLOR_GOLD = 0xffd76a;
const COLOR_GOLD_HEX = '#ffd76a';
const ACCENT_COLOR = 0x00e5ff; // cian — mismo acento que HowToPlayScene/UIScene
const COLOR_BUY = 0x2ecc71; // esmeralda "acción disponible" — mismo tono que el botón DEAL del tutorial
const COLOR_OWNED = 0x3d4450; // slate apagado "ya adquirido/deshabilitado" — mismo tono que HowToPlayScene
const COLOR_DANGER = 0xff4d6d;
const HOVER_SCALE = 1.05;
const PRESS_SCALE = 1.1;
const HOVER_TWEEN_MS = 120;
const PRESS_TWEEN_MS = 70;

// Y (relativo al centro) del aviso de ads del tab Mejoras y del mensaje
// temporal de Mazos en ESCRITORIO — congelados desde el código previo. En
// compacto viven BAJO el área de scroll (ver renderUpgradesTab/
// showTemporaryDeckMessage), porque el hueco entre la tira de pestañas y
// el inicio del scroll no admite una línea extra con fuentes post-piso.
const ADS_NOTICE_OFFSET_Y_DESKTOP = -176;
const DECK_MESSAGE_OFFSET_Y_DESKTOP = -183;
/** Aire bajo el borde inferior del área de scroll para el aviso/mensaje compacto. */
const COMPACT_NOTICE_GAP = 18;
/**
 * Click fantasma (px de diseño): un pointerup que cierra un arrastre sobre
 * un botón NO debe activarlo. Usa el MISMO umbral del ScrollableList
 * (fuente única exportada), pero la escena lo aplica también a la caída
 * vertical del propio pointer como red de seguridad (el componente solo
 * levanta `wasDragging` cuando el arrastre arrancó dentro de su ventana).
 */
const DRAG_CLICK_SLOP_PX = DRAG_THRESHOLD_PX;

/** Refs de un botón-panel genérico (chrome + hitZone), reutilizado por
 * los botones de acción de cada fila (Comprar/Adquirido). El texto es un
 * Text plano porque combina una clave i18n con estado dinámico (precio,
 * nivel) resuelto en refreshUpgradeRow()/refreshDeckRow() — no encaja en
 * LocalizedText, que solo resuelve una clave fija. */
interface ActionButtonRefs {
  readonly container: Phaser.GameObjects.Container;
  readonly bg: Phaser.GameObjects.Graphics;
  readonly glow: Phaser.GameObjects.Graphics;
  readonly text: Phaser.GameObjects.Text;
  readonly hitZone: Phaser.GameObjects.Zone;
  /** Ancho REAL con el que se pintó (150 en Mejoras, 120 en Mazos en
   * escritorio; medido por etiqueta en compacto) — refreshUpgradeRow()/
   * refreshDeckRow() repintan con ESTE valor para que el chrome no cambie
   * de tamaño al refrescarse la fila. */
  readonly width: number;
  /** Alto de la zona táctil (34 en escritorio; ≥44 físicos en compacto). */
  readonly height: number;
}

/** Refs de un botón de pestaña — mismo chrome que ActionButtonRefs, pero
 * con LocalizedText (la etiqueta es una clave i18n fija, "Mejoras"/
 * "Mazos", sin estado dinámico) en vez de Text plano. */
interface TabButtonRefs {
  readonly container: Phaser.GameObjects.Container;
  readonly bg: Phaser.GameObjects.Graphics;
  readonly glow: Phaser.GameObjects.Graphics;
  readonly label: LocalizedText;
  /** Zona interactiva — se re-tamaña en resize si cambia el modo (ver refreshChromeHitAreas). */
  readonly hitZone: Phaser.GameObjects.Zone;
}

interface UpgradeRowRefs {
  readonly levelOrOwnedText: Phaser.GameObjects.Text;
  readonly actionButton: ActionButtonRefs;
}

interface DeckRowRefs {
  readonly statusText: Phaser.GameObjects.Text;
  readonly actionButton: ActionButtonRefs;
}

type ShopTab = 'upgrades' | 'decks';

/** Id de fila navegable por teclado — Mejoras y Mazos comparten UN índice de foco (se reinicia al cambiar de pestaña). */
type ShopFocusRowId = SessionUpgradeId | DeckSetupId;

/**
 * ShopScene: tienda con dos pestañas independientes.
 *
 * - "Mejoras": upgrades de PARTIDA ÚNICA — leen/mutan la GameSession EN
 *   CURSO a través de ActiveSessionBridge, con efecto inmediato y sin
 *   persistencia (se pierden al terminar la partida). Requiere una
 *   partida activa.
 * - "Mazos": colección de mazos temáticos COLECCIONABLES — persistente
 *   (ProgressionManager/localStorage), disponible con o sin partida
 *   activa (se puede comprar desde el menú principal). La SELECCIÓN de
 *   cuál usar vive en DeckSelectionScene; acá solo se compran. Incluye un
 *   contador "obtenidos X/Y" (ver deckCounterText) para que el jugador
 *   vea de un vistazo cuántos de los mazos del catálogo ya tiene.
 *
 * GEOMETRÍA vía `resolveShopLayout` (fuente única, ver ShopLayout.ts):
 * la escena ya NO tiene constantes de grilla propias. En ESCRITORIO el
 * layout devuelve exactamente la geometría anterior (2 columnas de Mejoras,
 * 3 de Mazos, sin scroll) — byte-idéntico. En COMPACTO (pantalla chica,
 * `fontFloor > 0`) pasa a UNA columna con scroll vertical dentro de un
 * `ScrollableList`, fuentes subidas al piso y zonas táctiles ≥44 px.
 *
 * i18n EN VIVO (ejemplo de escena secundaria pedido explícitamente): esta
 * escena se abre con `scene.launch()` SOBRE MainMenuScene, que sigue
 * activa detrás — incluyendo su selector de idioma, que queda fuera del
 * área del modal. Si el jugador cambia de idioma con la Tienda abierta,
 * el texto ESTÁTICO (título, pestañas, leyendas) se actualiza solo vía
 * LocalizedText; el texto DINÁMICO de cada fila (que combina una clave
 * i18n con el estado real de compra) se refresca con una única
 * suscripción propia de la escena — ver `onLanguageChanged` en `create()`.
 */
export class ShopScene extends Phaser.Scene {
  private activeTab: ShopTab = 'upgrades';
  private tabContainer!: Phaser.GameObjects.Container;
  private coinsLabel: LocalizedText | null = null;

  private upgradeRowRefs = new Map<SessionUpgradeId, UpgradeRowRefs>();
  private deckRowRefs = new Map<DeckSetupId, DeckRowRefs>();

  // --- Teclado PC (Fase 4): índice de foco sobre las filas del tab activo.
  // Los refs se destruyen en cada renderActiveTab, así que el índice se
  // reinicia ahí (punto único) y los ids de fila se reconstruyen por
  // pulsación — ver buildShopFocusRows().
  private kbFocusIndex = -1;
  private kbFocusRowIds: ShopFocusRowId[] = [];
  // Desuscripción de bindKeys — se resuelve en el SHUTDOWN de create().
  private unsubscribeKeys: (() => void) | null = null;

  private sessionUpgrades: SessionUpgrades | null = null;
  private purchaseUpgradeUseCase: PurchaseSessionUpgradeUseCase | null = null;

  private upgradesTabRefs!: TabButtonRefs;
  private decksTabRefs!: TabButtonRefs;
  /** Círculo del ✕ — su hit area se re-tamaña si el resize cambia el modo. */
  private closeButtonBg?: Phaser.GameObjects.Arc;

  /** Geometría resuelta (fuente única) — ver resolveLayout(). */
  private layout!: ShopLayout;

  /** Contenedor de scroll (solo modo compacto; null en escritorio). */
  private scrollList: ScrollableList | null = null;

  /** Cache de medición de textos por (fuente|texto) para no crear/destruir
   * un Text de medición en cada fila/repintado. */
  private measureCache = new Map<string, number>();

  /** Badge "Obtenidos X/Y" del tab "Mazos" — null mientras el tab activo
   * es "Mejoras" (destruido junto con el resto de tabContainer al
   * cambiar de pestaña, ver renderActiveTab()). */
  private deckCounterText: Phaser.GameObjects.Text | null = null;
  /** Fondo (pill dorado) del badge — se oculta junto con el texto cuando
   * el mensaje temporal compacto ocuparía su lugar (ver showTemporaryDeckMessage). */
  private deckCounterBg: Phaser.GameObjects.Graphics | null = null;

  /** Última lista resuelta por ListAvailableDecksUseCase al pintar el tab
   * "Mazos" — se guarda para detectar, tras una compra, si cambió la
   * visibilidad de alguna fila (completar los 10 mazos base REVELA la
   * carta "?" de chessmaster y obliga a reconstruir el tab). */
  private deckEntries: DeckShopEntry[] = [];

  // Bound una sola vez en create() para poder hacer `off()` con la MISMA
  // referencia en SHUTDOWN — pasar una arrow function nueva a `off()` no
  // desengancharía nada (los listeners de ScaleManager NO mueren con la
  // escena; patrón de UIScene.handleScaleResize).
  private readonly handleScaleResize = (): void => {
    // Guard contra destrucción: el ScaleManager vive a nivel Game y puede
    // disparar resize cuando la escena ya no está activa.
    if (!this.sys || !this.sys.isActive()) return;
    // El piso de fuente (y por lo tanto el modo) puede cambiar con la
    // escala — se re-resuelve y se repinta la pestaña activa. El chrome
    // DIBUJADO está congelado en escritorio en ambos modos (visualHeight/
    // visualRadius), así que no se repinta; solo se re-tamañan las zonas
    // táctiles (pestañas y ✕) si el modo cambió.
    const previousMode = this.layout.mode;
    this.layout = this.resolveLayout();
    if (this.layout.mode !== previousMode) {
      this.refreshChromeHitAreas();
    }
    this.renderActiveTab();
  };

  /**
   * Re-tamaña las zonas interactivas del chrome estático (tira de pestañas
   * y ✕) al nuevo modo — el chrome dibujado no cambia (congelado), pero la
   * táctil sí: 34/r16 en escritorio, ≥44 físicos en compacto. Se hace con
   * `setInteractive` de nuevo sobre la MISMA zona (Phaser reemplaza el hit
   * area sin duplicar listeners, que viven en el GameObject).
   */
  private refreshChromeHitAreas(): void {
    const { width, height } = this.layout.tabButton;
    [this.upgradesTabRefs, this.decksTabRefs].forEach(refs => {
      refs.hitZone.setSize(width, height).setInteractive({ useHandCursor: true });
    });
    this.closeButtonBg?.setInteractive(
      new Phaser.Geom.Circle(0, 0, this.layout.closeButton.radius),
      Phaser.Geom.Circle.Contains
    );
  }

  constructor() {
    super({ key: 'ShopScene' });
  }

  preload(): void {
    // Miniaturas propias por mazo para la pestaña "Mazos" — 'card-back'
    // (clave genérica) es la del mazo ACTIVO, no serviría para distinguir
    // cada fila del catálogo entre sí.
    DECK_SETUP_IDS.forEach(deckId => {
      const { cardBack } = getDeckSetup(deckId);
      this.load.image(`shop-cardback-${deckId}`, `assets/cards/${cardBack}.png`);
    });
  }

  create(): void {
    const bridge = getActiveSessionBridge(this);
    this.sessionUpgrades = bridge ? bridge.session.getSessionUpgrades() : null;
    this.purchaseUpgradeUseCase = bridge ? bridge.purchaseSessionUpgradeUseCase : null;
    // Sin partida activa, "Mejoras" no tiene nada que mostrar — arrancar
    // directo en "Mazos" evita un tab inicial vacío/inútil (ej. al entrar
    // desde el menú principal, antes de jugar).
    this.activeTab = bridge ? 'upgrades' : 'decks';

    // Geometría resuelta (fuente única) ANTES de dibujar el panel — todos
    // los rectángulos/posiciones de abajo salen del layout.
    this.layout = this.resolveLayout();

    const { width, height } = this.cameras.main;

    // Backdrop bloqueador: sin esto, esta escena se abre con `scene.launch()`
    // ENCIMA de MainMenuScene o de GameScene+UIScene (ver el comentario de
    // la clase) que siguen activas y reciben clicks — un jugador podía
    // tocar "sin querer" un botón del menú o del HUD a través del hueco
    // fuera del panel de la Tienda. El rectángulo cubre TODA la pantalla y
    // es interactivo (sin handler propio): eso alcanza para que Phaser lo
    // trate como el objeto "de encima" y no despache el click a lo que hay
    // detrás — no cierra la Tienda al tocarlo, solo bloquea.
    this.add.rectangle(width / 2, height / 2, width, height, 0x000000, 0.6).setInteractive();

    // Si se abrió desde el HUD durante una partida (GameScene+UIScene
    // activas), se pausa GameScene mientras se compra — mismo criterio que
    // el modal de "Salir al Menú" y del bono periódico en UIScene: así
    // ninguna animación, timer del banquero ni input del tablero avanza
    // mientras el jugador está en la Tienda. Se reanuda en SHUTDOWN, sin
    // importar por qué vía se cierra esta escena (✕, `scene.stop()`, etc.).
    if (this.scene.isActive('GameScene')) {
      this.scene.pause('GameScene');
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.scene.isPaused('GameScene')) {
        this.scene.resume('GameScene');
      }
    });

    // Panel principal — mismo tratamiento "Casino de Lujo" que el modal
    // de HowToPlayScene (panel carbón + borde de acento + resplandor
    // exterior sutil) en vez del Rectangle plano de un solo color/borde
    // que tenía antes. Ancho/alto desde el layout (940×600 en escritorio).
    const panel = this.layout.panel;
    const modalX = width / 2 - panel.width / 2;
    const modalY = height / 2 - panel.height / 2;
    const modalBg = this.add.graphics();
    modalBg.fillStyle(PANEL_FILL, 0.97).fillRoundedRect(modalX, modalY, panel.width, panel.height, 18);
    modalBg.lineStyle(3, ACCENT_COLOR, 0.9).strokeRoundedRect(modalX, modalY, panel.width, panel.height, 18);
    modalBg.lineStyle(8, ACCENT_COLOR, 0.15).strokeRoundedRect(modalX - 4, modalY - 4, panel.width + 8, panel.height + 8, 20);
    // Filo dorado interior muy fino, misma convención "premium" que createCasinoButton().
    modalBg.lineStyle(1, COLOR_GOLD, 0.2).strokeRoundedRect(modalX + 5, modalY + 5, panel.width - 10, panel.height - 10, 14);

    new LocalizedText(this, width / 2, height / 2 - 270, 'SHOP_TITLE', {
      fontSize: '20px',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);

    // Saldo de monedas, visible mientras se compra: antes de esto, la
    // única forma de ver el saldo era cerrar la Tienda y volver al Menú
    // Principal. Mismo lado (izquierda) y misma fila que el título/✕
    // (espejo del ✕ a la derecha), y con LIVE UPDATE vía
    // progressionManager.onEvent('CoinsChanged') — a diferencia del
    // contador de MainMenuScene (que se arma una sola vez porque esa
    // escena se reconstruye entera cada vez que se vuelve a ella), acá el
    // jugador puede comprar varias cosas SIN cerrar esta pantalla, así
    // que un valor estático quedaría desactualizado tras la primera compra.
    this.coinsLabel = new LocalizedText(
      this,
      modalX + 90,
      height / 2 - 270,
      'MENU_COINS_LABEL',
      {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: COLOR_GOLD_HEX
      },
      { amount: getServices(this).progressionManager.getCoins().toLocaleString() }
    ).setOrigin(0, 0.5);

    const unsubscribeCoins = getServices(this).progressionManager.onEvent(event => {
      if (event.type === 'CoinsChanged') {
        this.coinsLabel?.setParams({ amount: event.newTotal.toLocaleString() });
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribeCoins);

    this.createCloseButton(width / 2 + 440, height / 2 - 270);

    this.renderTabButtons();

    this.tabContainer = this.add.container(0, 0);
    this.renderActiveTab();

    // Único punto de suscripción de la escena: refresca el contenido
    // DINÁMICO (filas de upgrades/mazos, que ya viven fuera de
    // LocalizedText porque combinan una clave i18n con estado de compra
    // en tiempo real). Se desusubre al detener la escena — mismo patrón
    // ya usado en MainMenuScene y en ProgressionManager.onEvent. En modo
    // compacto se RE PINTA la pestaña entera (no solo refreshAllRows)
    // porque el apilado vertical de cada celda depende de la cantidad de
    // líneas, que cambia con el idioma.
    const unsubscribe = languageManager.onLanguageChanged(() => {
      if (this.layout.mode === 'compact') {
        this.renderActiveTab();
      } else {
        this.refreshAllRows();
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);

    // --- Teclado PC (Fase 4 — tienda) -------------------------------------
    // Sin addCapture/removeCapture: ↑/↓/←/→ ya están capturadas por la
    // escena de atrás (MainMenuScene sigue RUNNING debajo del modal, y en
    // partida la captura de GameScene persiste aunque su escena esté
    // pausada — las capturas de Phaser son GLOBALES y no se tocan al
    // pausar) — bajarlas acá le robaría las flechas a esa escena. Los
    // handlers van como MISMA referencia (el objeto literal se crea una
    // sola vez acá) para que el unsubscribe de SHUTDOWN desenganche de
    // verdad (AGENTS §5 — bindKeys registra/`off` los pares exactos).
    this.unsubscribeKeys = bindKeys(this.input.keyboard, {
      UP: (event?: KeyboardEvent) => this.moveShopFocus(event, 'up'),
      DOWN: (event?: KeyboardEvent) => this.moveShopFocus(event, 'down'),
      LEFT: (event?: KeyboardEvent) => this.moveShopFocusLeft(event),
      RIGHT: (event?: KeyboardEvent) => this.moveShopFocusRight(event),
      ENTER: (event?: KeyboardEvent) => this.activateShopFocus(event),
      ESC: (event?: KeyboardEvent) => this.handleEscapeKey(event)
    });

    // Resize del ScaleManager (pantalla chica → piso de fuente puede
    // cambiar y con él el modo desktop/compacto) — patrón de
    // UIScene.handleScaleResize: se desuscribe en SHUTDOWN porque los
    // listeners de this.scale NO mueren con la escena.
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleResize);
      // Teclado PC (Fase 4): apagar el resaltado ANTES de destruir el
      // scroll list — en modo compacto las filas viven en
      // scrollList.contentContainer y destroy() las mata con
      // container.destroy(true) (mismo orden que respeta renderActiveTab
      // y el patrón B1 de la Fase 3: no tocar objetos ya destruidos).
      // `resetKeyboardFocus()` deja kbFocusIndex en -1.
      this.resetKeyboardFocus();
      // El ScrollableList vive fuera de tabContainer (sus filas no pasan
      // por removeAll) — se destruye explícito también al apagar la escena.
      this.destroyScrollList();
      // Desuscripción con la MISMA referencia (AGENTS §5).
      this.unsubscribeKeys?.();
      this.unsubscribeKeys = null;
    });
  }

  // ------------------------------------------------------------------
  // Geometría (fuente única: resolveShopLayout) + medición de textos
  // ------------------------------------------------------------------

  private resolveLayout(): ShopLayout {
    const displayScale = this.scale.displayScale.x;
    const fontFloor = getMinDesignFontPx(displayScale);
    return resolveShopLayout({ fontFloor, displayScale, measure: this.measureTextWidth });
  }

  /**
   * Medidor de ancho de texto inyectado al layout. Usa un Text TEMPORAL
   * oculto (creado/destruido on-demand y cacheado por fuente|texto): la
   * única forma de conocer el ancho RENDERIZADO de una cadena es medir un
   * Text real (Phaser lo rasteriza vía canvas y reporta `.width`) — el
   * estático `Text.MeasureText` devuelve métricas de la FUENTE
   * (ascent/descent/lineHeight), no el ancho de un string concreto.
   */
  private measureTextWidth = (text: string, fontPx: number): number => {
    const key = `${fontPx}|${text}`;
    const cached = this.measureCache.get(key);
    if (cached !== undefined) return cached;
    const probe = this.make.text(
      { x: 0, y: 0, text, style: { fontSize: `${fontPx}px`, fontFamily: 'Arial, sans-serif' } },
      false
    );
    const width = probe.width;
    probe.destroy();
    this.measureCache.set(key, width);
    return width;
  };

  /** Container al que se agregan las filas: tabContainer en escritorio,
   * el contenido scrolleable del ScrollableList en compacto. */
  private rowParent(): Phaser.GameObjects.Container {
    return this.layout.mode === 'compact' && this.scrollList ? this.scrollList.contentContainer : this.tabContainer;
  }

  private createScrollList(): void {
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;
    const scroll = this.layout.scroll;
    // El contenedor vive en el centro del panel (coords de fila relativas
    // al centro) y la ventana visible se desplaza a `windowOffsetY` (= el
    // centro del área de scroll respecto del centro del panel).
    this.scrollList = new ScrollableList(this, {
      x: cx,
      y: cy,
      width: this.layout.content.width,
      height: scroll.height,
      windowOffsetY: scroll.top + scroll.height / 2
    });
  }

  private destroyScrollList(): void {
    if (this.scrollList) {
      this.scrollList.destroy();
      this.scrollList = null;
    }
  }

  /**
   * Anti click-fantasma: true si este pointerup NO representa un click
   * real (cerró un arrastre de scroll sobre el botón). El
   * ScrollableList levanta `wasDragging` al arrastrar dentro de su
   * ventana; además se chequea la caída vertical del propio pointer como
   * red de seguridad. En ESCRITORIO no hay lista ⇒ siempre false ⇒
   * comportamiento idéntico al histórico.
   */
  private isDragAbortedClick(pointer: ClickPointerLike): boolean {
    const list = this.scrollList;
    if (!list) return false;
    if (Math.abs(pointer.downY - pointer.y) > DRAG_CLICK_SLOP_PX) return true;
    return list.wasDragging();
  }

  /**
   * Variante LIGERA del anti click-fantasma: solo el flag del
   * ScrollableList, sin la red de caída vertical del pointer. Para los
   * controles que viven FUERA de la ventana de scroll — pestañas y ✕ —
   * donde un "fling" que arrancó en la lista y termina arriba no debe
   * cambiar de pestaña ni cerrar la Tienda; pero un ✕ tocado con el dedo
   * que tiembla sí debe responder (su down nunca estuvo en la lista ⇒ el
   * flag está apagado). Escritorio: sin lista ⇒ siempre false ⇒
   * comportamiento idéntico al histórico.
   */
  private releasedAfterScrollDrag(): boolean {
    return this.scrollList ? this.scrollList.wasDragging() : false;
  }

  /** Estilo de texto derivado de un ShopTextSpec. `includeMaxLines` es
   * false solo para la descripción de Mejoras en escritorio (el código
   * previo no pasaba maxLines ahí — se conserva byte-idéntico). */
  private textStyleFromSpec(spec: ShopTextSpec, color: string, fontStyle?: string, includeMaxLines = true): Phaser.Types.GameObjects.Text.TextStyle {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontSize: `${spec.fontSize}px`,
      fontFamily: 'Arial, sans-serif',
      color
    };
    if (fontStyle) style.fontStyle = fontStyle;
    if (spec.wrapWidth > 0) style.wordWrap = { width: spec.wrapWidth };
    if (includeMaxLines && spec.maxLines > 0) style.maxLines = spec.maxLines;
    return style;
  }

  // ------------------------------------------------------------------
  // Chrome de botones compartido ("Casino de Lujo": panel + borde +
  // filo dorado + halo en hover) — ver createCasinoButton en
  // MainMenuScene.ts, mismo lenguaje visual aplicado acá a las pestañas
  // y a los botones de acción de cada fila.
  // ------------------------------------------------------------------

  /** (Re)dibuja el panel + halo de un botón con el color de acento dado — separado de la creación para poder repintar en caliente (cambio de estado Comprar -> Adquirido, o tab activo/inactivo) sin recrear el GameObject. */
  private paintButtonChrome(bg: Phaser.GameObjects.Graphics, glow: Phaser.GameObjects.Graphics, width: number, height: number, accentColor: number): void {
    const radius = Math.min(10, height / 2);

    bg.clear();
    bg.fillStyle(PANEL_FILL, PANEL_FILL_ALPHA).fillRoundedRect(-width / 2, -height / 2, width, height, radius);
    bg.lineStyle(2, accentColor, 0.85).strokeRoundedRect(-width / 2, -height / 2, width, height, radius);
    bg.lineStyle(1, COLOR_GOLD, 0.25).strokeRoundedRect(-width / 2 + 3, -height / 2 + 3, width - 6, height - 6, Math.max(radius - 2, 0));

    glow.clear();
    glow.fillStyle(accentColor, 0.35).fillRoundedRect(-width / 2 - 6, -height / 2 - 6, width + 12, height + 12, radius + 2);
  }

  /** Zona interactiva + tweens de hover/press/click — misma "sensación táctil" que createCasinoButton()/HudIconButton en el resto del juego. `dragGuard` (opcional) suprime el click y su sonido cuando el pointerup cierra un arrastre (click fantasma). */
  private attachButtonInteractions(
    container: Phaser.GameObjects.Container,
    glow: Phaser.GameObjects.Graphics,
    width: number,
    height: number,
    onClick: () => void,
    dragGuard?: (pointer: ClickPointerLike) => boolean
  ): Phaser.GameObjects.Zone {
    const hitZone = this.add.zone(0, 0, width, height).setOrigin(0.5).setInteractive({ useHandCursor: true });
    container.add(hitZone);

    hitZone.on('pointerover', () => {
      this.tweens.add({ targets: container, scale: HOVER_SCALE, duration: HOVER_TWEEN_MS, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: glow, alpha: 1, duration: HOVER_TWEEN_MS, ease: 'Cubic.easeOut' });
    });
    hitZone.on('pointerout', () => {
      this.tweens.add({ targets: container, scale: 1, duration: HOVER_TWEEN_MS, ease: 'Cubic.easeOut' });
      this.tweens.add({ targets: glow, alpha: 0, duration: HOVER_TWEEN_MS, ease: 'Cubic.easeOut' });
    });
    hitZone.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      // Click fantasma: si el pointerup cierra un arrastre sobre este
      // botón, NO se dispara la acción (ni el tween de press).
      if (dragGuard && dragGuard(pointer)) return;
      this.tweens.add({ targets: container, scale: PRESS_SCALE, duration: PRESS_TWEEN_MS, yoyo: true, ease: 'Quad.easeOut', onComplete: onClick });
    });
    // Punto único del click genérico de UI de tienda para botones de
    // acción (Comprar) y pestañas — el ✕ tiene su propia zona en
    // createCloseButton y se bindea ahí. El MISMO guard suprime el sonido
    // en un click fantasma.
    bindUiClick(hitZone, getServices(this).audioService, dragGuard ? pointer => !dragGuard(pointer) : undefined);

    return hitZone;
  }

  /** Botón de acción de fila (Comprar $X / Adquirido) — texto plano, ver ActionButtonRefs. El ancho/fuente/altura salen del ShopButtonSpec de la pestaña (fijo en escritorio, medido y con zona táctil ≥44 físicos en compacto). */
  private createActionButton(
    x: number,
    y: number,
    initialLabel: string,
    onClick: () => void,
    button: ShopButtonSpec
  ): ActionButtonRefs {
    const width = button.widthFor(initialLabel);
    const height = button.height;
    const container = this.add.container(x, y);
    const glow = this.add.graphics().setAlpha(0);
    const bg = this.add.graphics();
    const text = this.add
      .text(0, 0, initialLabel, {
        fontSize: `${button.fontPx}px`,
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        color: '#ffffff'
      })
      .setOrigin(0.5);
    container.add([glow, bg, text]);

    const hitZone = this.attachButtonInteractions(container, glow, width, height, onClick, pointer => this.isDragAbortedClick(pointer));

    return { container, bg, glow, text, hitZone, width, height };
  }

  private createCloseButton(x: number, y: number): void {
    // Chrome dibujado CONGELADO en escritorio (r=16) en ambos modos; la
    // ZONA táctil crece en compacto a ≥44 físicos (radio desde el layout)
    // — si el círculo dibujado creciera con la táctil, en compacto taparía
    // el borde superior del panel y rozaría el título (MINOR de review).
    const visualRadius = this.layout.closeButton.visualRadius;
    const touchRadius = this.layout.closeButton.radius;
    const bg = this.add
      .circle(0, 0, visualRadius, PANEL_FILL, 0.95)
      .setStrokeStyle(2, COLOR_DANGER, 0.8)
      // Hit area circular del radio TÁCTIL (mayor que el dibujado) — el
      // jugador toca un círculo invisible más grande sin cambiar el look.
      .setInteractive(new Phaser.Geom.Circle(0, 0, touchRadius), Phaser.Geom.Circle.Contains);
    const label = this.add.text(0, 0, '✕', { fontSize: `${Math.max(16, visualRadius)}px`, fontFamily: 'Arial, sans-serif', color: '#ffffff' }).setOrigin(0.5);

    bg.on('pointerover', () => bg.setFillStyle(0x6e2a2a, 0.95));
    bg.on('pointerout', () => bg.setFillStyle(PANEL_FILL, 0.95));
    // Anti click-fantasma: un arrastre de scroll que termina sobre el ✕ no
    // debe cerrar la Tienda (ver releasedAfterScrollDrag).
    bg.on('pointerup', () => {
      if (this.releasedAfterScrollDrag()) return;
      this.scene.stop();
    });
    // El ✕ no pasa por attachButtonInteractions (tiene su propia zona
    // circular) — se le registra el click genérico directamente acá.
    bindUiClick(bg, getServices(this).audioService, () => !this.releasedAfterScrollDrag());

    // Ref para re-tamañar la hit area en resize si cambia el modo.
    this.closeButtonBg = bg;

    this.add.container(x, y, [bg, label]);
  }

  // ------------------------------------------------------------------
  // Pestañas
  // ------------------------------------------------------------------

  private renderTabButtons(): void {
    const cx = this.cameras.main.centerX;
    const y = this.cameras.main.centerY - 232;

    this.upgradesTabRefs = this.createTabButton(cx - 100, y, 'SHOP_TAB_UPGRADES', () => this.switchTab('upgrades'));
    this.decksTabRefs = this.createTabButton(cx + 100, y, 'SHOP_TAB_DECKS', () => this.switchTab('decks'));
    this.highlightActiveTabButton();
  }

  private createTabButton(x: number, y: number, labelKey: TranslationKey, onClick: () => void): TabButtonRefs {
    const container = this.add.container(x, y);
    const glow = this.add.graphics().setAlpha(0);
    const bg = this.add.graphics();
    const label = new LocalizedText(this, 0, 0, labelKey, {
      fontSize: '16px',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      color: '#8b949e'
    }).setOrigin(0.5);
    container.add([glow, bg, label]);

    // Anti click-fantasma (variante ligera): un arrastre de scroll que
    // termina sobre una pestaña no debe cambiar de pestaña.
    const hitZone = this.attachButtonInteractions(container, glow, this.layout.tabButton.width, this.layout.tabButton.height, onClick, () => this.releasedAfterScrollDrag());

    return { container, bg, glow, label, hitZone };
  }

  private switchTab(tab: ShopTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.highlightActiveTabButton();
    this.renderActiveTab();
  }

  private highlightActiveTabButton(): void {
    [
      { refs: this.upgradesTabRefs, active: this.activeTab === 'upgrades' },
      { refs: this.decksTabRefs, active: this.activeTab === 'decks' }
    ].forEach(({ refs, active }) => {
      if (!refs) return;
      // Chrome dibujado con la ALTURA visual congelada (34) en ambos modos;
      // la zona táctil de attachButtonInteractions usa la altura real
      // (mayor en compacto). Si se pintara con la táctil, en compacto la
      // tira invadiría el título (MINOR de review).
      this.paintButtonChrome(refs.bg, refs.glow, this.layout.tabButton.width, this.layout.tabButton.visualHeight, active ? ACCENT_COLOR : COLOR_OWNED);
      refs.label.setColor(active ? '#ffffff' : '#8b949e');
      refs.container.setAlpha(active ? 1 : 0.85);
    });
  }

  private renderActiveTab(): void {
    // Teclado PC (Fase 4): el índice de foco apunta a refs que se destruyen
    // abajo — se reinicia ANTES de destruir, así ninguna pulsación posterior
    // resalta ni activa una fila vieja. Punto único de reset: cambiar de
    // pestaña, resize (modo), cambio de idioma en compacto y la
    // reconstrucción por revelado del mazo "?" pasan todos por acá.
    this.resetKeyboardFocus();

    // Destruir el scrollList ANTES de vaciar tabContainer: sus filas viven dentro
    // del contenido scrolleable (fuera de tabContainer), así que no las
    // limpia el removeAll — se destruyen acá para no dejar GameObjects
    // huérfanos ni listeners de input del componente.
    this.destroyScrollList();
    this.tabContainer.removeAll(true); // destruye el contenido del tab anterior
    this.upgradeRowRefs.clear();
    this.deckRowRefs.clear();
    // El badge de contador vive dentro de tabContainer — removeAll(true)
    // ya lo destruyó si el tab anterior era "Mazos"; se limpia la
    // referencia acá para no dejar un puntero a un GameObject destruido
    // (se recrea en renderDecksTab() si corresponde).
    this.deckCounterText = null;
    this.deckCounterBg = null;

    // Modo compacto: UNA columna con scroll vertical.
    if (this.layout.mode === 'compact') {
      this.createScrollList();
    }

    if (this.activeTab === 'upgrades') {
      this.renderUpgradesTab();
    } else {
      this.renderDecksTab();
    }
  }

  /** Vuelve a resolver el texto de TODAS las filas del tab activo tras un cambio de idioma (solo escritorio — en compacto se re-pinta la pestaña entera). */
  private refreshAllRows(): void {
    this.upgradeRowRefs.forEach((_refs, id) => this.refreshUpgradeRow(id));
    this.deckRowRefs.forEach((_refs, id) => this.refreshDeckRow(id));
  }

  // ------------------------------------------------------------------
  // Teclado PC (Fase 4 — tienda): ↑↓ navegan las filas del tab activo,
  // ←/→ cambian de pestaña, ENTER activa la fila y ESC cierra. El núcleo
  // geométrico es puro (`../input/KeyboardNavigation`, misma regla que
  // MainMenuScene); acá solo vive el wiring y la resolución de refs.
  // ------------------------------------------------------------------

  /**
   * ¿Es esta escena la de PRIMER PLANO? Phaser emite `keydown-<KEY>` en
   * TODA escena RUNNING (no filtra la que está arriba) y la Tienda se abre
   * con `scene.launch()` ENCIMA de MainMenuScene o de GameScene+UIScene sin
   * pausarlas — sin esta guarda, las teclas actuarían sobre los botones
   * ocultos detrás del modal (ENTER en el menú lanzaría una partida con la
   * tienda todavía abierta). Mismo fix que MainMenuScene.isForeground.
   */
  private isForeground(): boolean {
    // `this.scene.manager` (SceneManager) en vez de `this.scene.getScenes`:
    // la versión de Phaser del repo no expone getScenes en ScenePlugin.
    const active = this.scene.manager.getScenes(true);
    return active[active.length - 1] === this;
  }

  /**
   * Items de foco + ids de fila del tab ACTUAL, construidos AL VUELO por
   * pulsación: `renderActiveTab` destruye y re-crea los refs en cada
   * repintado, así que no se cachean (un índice viejo apuntaría a
   * GameObjects muertos — por eso también se reinician en renderActiveTab).
   *
   * El orden replica EXACTAMENTE el del render (listAvailableUpgrades /
   * deckEntries con su índice de cellPositionFor) y las coordenadas salen
   * de la MISMA fórmula de renderUpgradeRow/renderDeckRow (centro del
   * botón de acción: `dx + buttonXFor(label, column)` en X,
   * `dy + rowOffsetY(row) + buttonOffsetY` en Y; dx/dy = 0 en compacto,
   * centro de la cámara en escritorio) — así `nextFocusIndex` elige la
   * celda VECINA real y no una posición inventada.
   */
  private buildShopFocusRows(): { items: FocusItem[]; ids: ShopFocusRowId[] } {
    const items: FocusItem[] = [];
    const ids: ShopFocusRowId[] = [];
    const compact = this.layout.mode === 'compact';
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;
    const dx = compact ? 0 : cx;
    const dy = compact ? 0 : cy;

    if (this.activeTab === 'upgrades') {
      const upgrades = this.sessionUpgrades;
      // Sin partida activa el tab pinta solo el mensaje "sin sesión": 0 items
      // ⇒ ↑↓/Enter quedan inertes solos (nextFocusIndex sobre lista vacía
      // devuelve -1). ←/→ y ESC siguen funcionando (no dependen de los refs).
      if (!upgrades) return { items, ids };
      const tab = this.layout.upgrades;
      getServices(this).listAvailableUpgrades.execute().forEach((definition, index) => {
        const status = this.upgradeStatusFor(definition.id, upgrades);
        const { column, row } = tab.cellPositionFor(index);
        // Position REAL del botón cuando ya hay refs (misma fórmula en la
        // práctica): refreshUpgradeRow solo cambia el texto sin reposicionar,
        // así que tras una compra con el ratón la etiqueta crecida puede
        // desfasar `buttonXFor(label actual)` del centro PINTADO (review
        // Fase 4, MINOR-3). Sin refs (nunca renderizada) → fórmula del render.
        const refs = this.resolveRowActionButton(definition.id);
        items.push({
          x: refs ? refs.container.x : dx + tab.buttonXFor(status.buttonLabel, column),
          y: refs ? refs.container.y : dy + tab.rowOffsetY(row) + (tab.buttonOffsetY ?? 0),
          enabled: !status.buttonDisabled
        });
        ids.push(definition.id);
      });
      return { items, ids };
    }

    const tab = this.layout.decks;
    const ownedIds = getServices(this).progressionManager.getOwnedDeckIds();
    this.deckEntries.forEach((entry, index) => {
      const { column, row } = tab.cellPositionFor(index);
      const anchorY = tab.rowOffsetY(row);
      if (!entry.revealed) {
        // Carta "?" — fila inerte POR CONSTRUCCIÓN (sin botón, ver
        // renderMysteryDeckRow): deshabilitada para que el foco la salte,
        // pero SÍ ocupa índice — así los ids quedan alineados con la grilla.
        const thumb = tab.thumb!;
        items.push({
          x: dx + tab.columns[column].textX + thumb.width / 2,
          y: dy + anchorY,
          enabled: false
        });
        ids.push(entry.deckId);
        return;
      }
      const owned = ownedIds.includes(entry.deckId);
      const priceText = `$${getDeckSetup(entry.deckId).price.toLocaleString()}`;
      const buttonLabel = owned
        ? languageManager.getText('SHOP_OWNED_LABEL')
        : languageManager.getText('SHOP_BUY_BUTTON', { price: priceText });
      // Position REAL del botón cuando hay refs (ver upgrades): refleja el
      // centro pintado aunque refreshDeckRow haya cambiado el label sin
      // reposicionar.
      const refs = this.resolveRowActionButton(entry.deckId);
      items.push({
        x: refs ? refs.container.x : dx + tab.buttonXFor(buttonLabel, column),
        y: refs ? refs.container.y : dy + anchorY + (tab.buttonOffsetY ?? 0),
        enabled: !owned
      });
      ids.push(entry.deckId);
    });

    return { items, ids };
  }

  /**
   * Teclado PC (Fase 4): navega el foco entre las filas del tab activo con
   * el núcleo puro `nextFocusIndex` (candidato HABILITADO más cercano del
   * lado pedido). SIN sonido al mover — mismo criterio que MainMenuScene.
   *
   * El auto-repeat del SO re-emite `keydown` cada ~30 ms con la tecla
   * mantenida — sin ignorar `repeat` el foco saltaría en tromba y
   * acumularía tweens; solo se navega en la pulsación inicial.
   */
  private moveShopFocus(event: KeyboardEvent | undefined, direction: FocusDirection): void {
    if (event?.repeat) return;
    if (!this.isForeground()) return;

    const previousIds = this.kbFocusRowIds;
    const rows = this.buildShopFocusRows();
    const previousIndex = this.kbFocusIndex;
    const nextIndex = nextFocusIndex(rows.items, previousIndex, direction);
    // Sin cambio de índice (borde de la grilla, o sin items habilitados):
    // no se toca ningún resaltado.
    if (nextIndex === previousIndex) return;

    // Apagar el resaltado anterior con los ids de ESA misma lista: solo
    // pueden pertenecer al tab activo, porque cambiar de pestaña resetea el
    // índice (handleTabKey / renderActiveTab).
    this.setFocusedHighlight(previousIds, previousIndex, false);
    this.kbFocusIndex = nextIndex;
    this.kbFocusRowIds = rows.ids;
    if (nextIndex >= 0) {
      this.setFocusedHighlight(rows.ids, nextIndex, true);
      this.revealFocusedRow(nextIndex, rows.ids);
    }
  }

  /**
   * Teclado PC (Fase 7): ← navega espacialmente a la columna de la izqda
   * dentro de la grilla actual (mismo criterio `nextFocusIndex` geométrico
   * que usa ↑/↓). Si no hay candidato (borde izquierdo de la grilla), cae
   * al cambio de pestaña al tab 'upgrades' — paridad con el comportamiento
   * anterior pero preservando la navegación inter-columna primero.
   */
  private moveShopFocusLeft(event?: KeyboardEvent): void {
    if (event?.repeat) return;
    if (!this.isForeground()) return;

    const previousIds = this.kbFocusRowIds;
    const rows = this.buildShopFocusRows();
    const previousIndex = this.kbFocusIndex;
    // Intenta moverse espacialmente dentro de la grilla actual.
    // nextFocusIndex devuelve el mismo índice si no hay candidato a la izqda.
    const nextIndex = nextFocusIndex(rows.items, previousIndex, 'left');
    if (nextIndex !== previousIndex) {
      // Candidato encontrado: actualiza foco y revela fila.
      this.setFocusedHighlight(previousIds, previousIndex, false);
      this.kbFocusIndex = nextIndex;
      this.kbFocusRowIds = rows.ids;
      if (nextIndex >= 0) {
        this.setFocusedHighlight(rows.ids, nextIndex, true);
        this.revealFocusedRow(nextIndex, rows.ids);
      }
      return;
    }
    // Sin candidato a la izqda: cambio de pestaña al tab 'upgrades'.
    this.handleTabKey(event, 'upgrades');
  }

  /**
   * Teclado PC (Fase 7): → navega espacialmente a la columna de la drcha
   * dentro de la grilla actual (mismo criterio `nextFocusIndex` geométrico
   * que usa ↑/↓). Si no hay candidato (borde derecho de la grilla), cae
   * al cambio de pestaña al tab 'decks' — paridad con el comportamiento
   * anterior pero preservando la navegación inter-columna primero.
   */
  private moveShopFocusRight(event?: KeyboardEvent): void {
    if (event?.repeat) return;
    if (!this.isForeground()) return;

    const previousIds = this.kbFocusRowIds;
    const rows = this.buildShopFocusRows();
    const previousIndex = this.kbFocusIndex;
    // Intenta moverse espacialmente dentro de la grilla actual.
    // nextFocusIndex devuelve el mismo índice si no hay candidato a la drcha.
    const nextIndex = nextFocusIndex(rows.items, previousIndex, 'right');
    if (nextIndex !== previousIndex) {
      // Candidato encontrado: actualiza foco y revela fila.
      this.setFocusedHighlight(previousIds, previousIndex, false);
      this.kbFocusIndex = nextIndex;
      this.kbFocusRowIds = rows.ids;
      if (nextIndex >= 0) {
        this.setFocusedHighlight(rows.ids, nextIndex, true);
        this.revealFocusedRow(nextIndex, rows.ids);
      }
      return;
    }
    // Sin candidato a la drcha: cambio de pestaña al tab 'decks'.
    this.handleTabKey(event, 'decks');
  }

  /**
   * Teclado PC (Fase 4): ← = pestaña Mejoras, → = pestaña Mazos — MISMO
   * camino que el click sobre la pestaña (sonido + switchTab, que ya es
   * no-op si es la pestaña activa). El foco se reinicia acá también para el
   * caso no-op: si la pestaña NO cambia, no hay renderActiveTab que lo haga
   * y el resaltado de una fila seguiría encendido con índice huérfano.
   */
  private handleTabKey(event: KeyboardEvent | undefined, tab: ShopTab): void {
    if (event?.repeat) return;
    if (!this.isForeground()) return;
    playUiClick(getServices(this).audioService);
    this.resetKeyboardFocus();
    this.switchTab(tab);
  }

  /**
   * Teclado PC (Fase 4): ENTER activa la fila enfocada invocando el MISMO
   * método que el callback del click del ratón (attemptPurchaseUpgrade /
   * attemptPurchaseDeck, que reciben id + el Text del botón — ver los
   * closures de renderUpgradeRow/renderDeckRow). NO se emite un pointerup
   * sintético: el dragGuard de los botones revienta con `pointer` undefined
   * (mismo motivo que MainMenuScene.activateFocusedItem).
   *
   * La fila se re-resuelve contra el ESTADO ACTUAL (no contra un flag
   * cacheado): una compra con el ratón puede haber deshabilitado la fila
   * enfocada sin re-render, y en ese caso el botón es inerte y SILENCIOSO —
   * paridad exacta con el click del ratón (hitZone disableInteractive).
   */
  private activateShopFocus(event?: KeyboardEvent): void {
    if (event?.repeat) return;
    if (!this.isForeground()) return;
    if (this.kbFocusIndex < 0) return; // nada enfocado → ENTER inerte
    const rows = this.buildShopFocusRows();
    const item: FocusItem | undefined = rows.items[this.kbFocusIndex];
    const id: ShopFocusRowId | undefined = rows.ids[this.kbFocusIndex];
    if (item === undefined || id === undefined) return;
    if (!item.enabled) return;
    // Paridad con el clip de scroll (review Fase 4): si la rueda/drag del
    // ratón dejó la fila enfocada FUERA de la ventana, el ratón no podría
    // clickearla (setVisible(false)) — ENTER tampoco. Al volver a mover
    // ↑/↓, revealFocusedRow la trae de vuelta a la ventana.
    if (!this.isFocusedRowInViewport(this.kbFocusIndex)) return;
    const refs = this.resolveRowActionButton(id);
    if (!refs) return;
    playUiClick(getServices(this).audioService);
    if (this.activeTab === 'upgrades') {
      this.attemptPurchaseUpgrade(id as SessionUpgradeId, refs.text);
    } else {
      this.attemptPurchaseDeck(id as DeckSetupId, refs.text);
    }
  }

  /**
   * Teclado PC (Fase 4): ESC cierra la Tienda por el MISMO camino que el ✕
   * (`this.scene.stop()`, createCloseButton). El sonido va ANTES con
   * PARIDAD al ✕: el ✕ sí suena (bindUiClick en su zona), y acá ESC ES el
   * botón de cierre de ESTA escena — el ESC de UIScene (que cierra la
   * Tienda desde FUERA cuando el foco está en partida) sigue siendo
   * silencioso. Si ambos handlers corren en la misma pulsación, la doble
   * parada es un no-op: SceneManager.stop ignora una escena cuyo status ya
   * es SHUTDOWN.
   */
  private handleEscapeKey(event?: KeyboardEvent): void {
    if (event?.repeat) return;
    if (!this.isForeground()) return;
    playUiClick(getServices(this).audioService);
    this.scene.stop();
  }

  /** Refs del botón de acción de la fila `id` según el tab activo — null si la fila no existe (p. ej. la carta "?"). */
  private resolveRowActionButton(id: ShopFocusRowId): ActionButtonRefs | null {
    if (this.activeTab === 'upgrades') {
      return this.upgradeRowRefs.get(id as SessionUpgradeId)?.actionButton ?? null;
    }
    return this.deckRowRefs.get(id as DeckSetupId)?.actionButton ?? null;
  }

  /**
   * Teclado PC (Fase 4): ¿la fila `index` cae dentro de la ventana de
   * scroll (solo importa en modo compacto)? Paridad con el hit-test del
   * ratón: `syncInputToWindow` deja `setVisible(false)` a las filas
   * fuera de la ventana y el puntero no puede clickearlas — si el jugador
   * scrollea con la rueda/drag DESPUÉS de enfocar, ENTER debe quedar
   * inerte en vez de activar una fila que no se ve (review Fase 4,
   * MINOR-2). Compara el CENTRO de la fila (rowOffsetY, mismo espacio de
   * contenido que la ventana `scroll.top + offset`) — el ratón sí puede
   * clickear lo poco que quede visible de una fila cortada por el borde.
   * Sin scrollList (escritorio) → siempre visible.
   */
  private isFocusedRowInViewport(index: number): boolean {
    const list = this.scrollList;
    if (!list) return true;
    const tab = this.activeTab === 'upgrades' ? this.layout.upgrades : this.layout.decks;
    const { row } = tab.cellPositionFor(index);
    const rowY = tab.rowOffsetY(row);
    const windowTop = this.layout.scroll.top + list.getOffset();
    const windowBottom = windowTop + this.layout.scroll.height;
    return rowY >= windowTop && rowY <= windowBottom;
  }

  /**
   * Resaltado del foco de teclado con el MISMO efecto visual que el hover
   * del ratón (pointerover/pointerout de attachButtonInteractions: mismo
   * tween de scale 1.05 + glow α1, misma duración) — el foco se ve idéntico
   * a pasar el cursor.
   */
  private setRowButtonFocus(refs: ActionButtonRefs, on: boolean): void {
    this.tweens.add({ targets: refs.container, scale: on ? HOVER_SCALE : 1, duration: HOVER_TWEEN_MS, ease: 'Cubic.easeOut' });
    this.tweens.add({ targets: refs.glow, alpha: on ? 1 : 0, duration: HOVER_TWEEN_MS, ease: 'Cubic.easeOut' });
  }

  /** Apaga el resaltado de la fila `index` si existe (los ids vacíos o el índice -1 son no-op). */
  private setFocusedHighlight(ids: readonly ShopFocusRowId[], index: number, on: boolean): void {
    const id: ShopFocusRowId | undefined = ids[index];
    if (id === undefined) return;
    const refs = this.resolveRowActionButton(id);
    if (refs) this.setRowButtonFocus(refs, on);
  }

  /**
   * Scroll-into-view (solo MODO COMPACTO — en escritorio no hay scrollList):
   * si la fila enfocada queda fuera de la ventana, `syncInputToWindow` la
   * deja `setVisible(false)` y el foco quedaría INVISIBLE. El offset se
   * ajusta con la fuente única `scrollOffsetToReveal` (mueve lo mínimo y
   * delega el rango en clampScrollOffset); setOffset re-clampa y re-valida
   * el clip de input igual que tras una rueda/drag.
   */
  private revealFocusedRow(index: number, ids: readonly ShopFocusRowId[]): void {
    const list = this.scrollList;
    if (!list || index < 0 || index >= ids.length) return;
    const tab = this.activeTab === 'upgrades' ? this.layout.upgrades : this.layout.decks;
    const { row } = tab.cellPositionFor(index);
    const rowY = tab.rowOffsetY(row);
    // Semialtura de la celda derivada de la geometría REAL (sin constantes
    // nuevas): rowSpacing cubre el contenido de la fila (centrado en
    // rowOffsetY y acotado al alto de celda, garantía del peor caso del
    // layout) MÁS el aire entre filas — con el paso completo la celda
    // entera cae dentro de la ventana, sin duplicar el aire del layout.
    const halfRow = tab.rowSpacing / 2;
    const nextOffset = scrollOffsetToReveal(
      list.getOffset(),
      rowY,
      halfRow,
      this.layout.scroll,
      tab.maxScrollFor(ids.length)
    );
    list.setOffset(nextOffset);
  }

  /**
   * Reinicia el foco de teclado: apaga el resaltado si quedó encendido y
   * deja el índice en -1 (los ids quedan vacíos). Punto único llamado por
   * renderActiveTab (ANTES de destruir los refs), handleTabKey y el
   * SHUTDOWN de create().
   *
   * No se agrega ningún tween nuevo (los objetivos pueden estar a punto de
   * morir): se matan los pendientes y se normaliza scale/glow al reposo —
   * así un tween de hover a medio camino no sigue escribiendo sobre el
   * container destruido, y en el caso sin re-render (misma pestaña) el
   * botón no queda clavado encendido.
   */
  private resetKeyboardFocus(): void {
    if (this.kbFocusIndex >= 0) {
      const id: ShopFocusRowId | undefined = this.kbFocusRowIds[this.kbFocusIndex];
      if (id !== undefined) {
        const refs = this.resolveRowActionButton(id);
        if (refs) {
          this.tweens.killTweensOf(refs.container);
          this.tweens.killTweensOf(refs.glow);
          refs.container.setScale(1);
          refs.glow.setAlpha(0);
        }
      }
    }
    this.kbFocusIndex = -1;
    this.kbFocusRowIds = [];
  }

  // ------------------------------------------------------------------
  // Pestaña "Mejoras" (upgrades de partida única — sin cambios de fondo,
  // solo se movió el contenido a this.tabContainer para convivir con tabs)
  // ------------------------------------------------------------------

  private renderUpgradesTab(): void {
    const tab = this.layout.upgrades;
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;
    const compact = this.layout.mode === 'compact';

    if (!this.sessionUpgrades || !this.purchaseUpgradeUseCase) {
      this.tabContainer.add(
        new LocalizedText(
          this,
          cx,
          cy,
          'SHOP_NO_ACTIVE_SESSION',
          { fontSize: '17px', fontFamily: 'Arial, sans-serif', color: '#8b949e', align: 'center' }
        ).setOrigin(0.5)
      );
      return;
    }

    // Caption: solo escritorio (en compacto captionY es null — la pestaña
    // activa ya nombra la sección y el hueco no admite la línea extra).
    if (tab.captionY !== null) {
      this.tabContainer.add(
        new LocalizedText(this, cx, cy + tab.captionY, 'SHOP_UPGRADES_CAPTION', {
          fontSize: '15px',
          fontFamily: 'Arial, sans-serif',
          color: '#8b949e'
        }).setOrigin(0.5)
      );
    }

    // CG-MON-006: cuando el filtro de abajo OCULTA filas por un motivo
    // permanente (adblock / ads_disabled), la tienda lo dice INLINE —
    // sin este aviso, el jugador veía 5 filas y no entendía por qué
    // faltaban Duplicar/Triplicar/Revivir (popup: descartado por la
    // auditoría). La política de "¿corresponde?" vive en el use-case;
    // acá solo se dibuja: UNA línea centrada. En escritorio va bajo el
    // caption (h/2-176); en compacto, BAJO el área de scroll (hoy la
    // primera fila llega casi al borde superior del scroll, así que no
    // hay lugar arriba sin pisarla) — ver COMPACT_NOTICE_GAP.
    const avisoAds = getServices(this).listAvailableUpgrades.adsNotice();
    if (avisoAds !== null) {
      const noticeY = compact
        ? cy + this.layout.scroll.top + this.layout.scroll.height + COMPACT_NOTICE_GAP
        : cy + ADS_NOTICE_OFFSET_Y_DESKTOP;
      this.tabContainer.add(
        new LocalizedText(
          this,
          cx,
          noticeY,
          avisoAds === 'adblock' ? 'SHOP_ADS_HIDDEN_ADBLOCK' : 'SHOP_ADS_HIDDEN_DISABLED',
          { fontSize: '15px', fontFamily: 'Arial, sans-serif', color: '#ffd166' }
        ).setOrigin(0.5)
      );
    }

    // Qué muestra la tienda lo decide la APLICACIÓN, no la escena:
    // ListAvailableUpgradesUseCase oculta hoy Duplicar/Triplicar/Revivir
    // si no se puede mostrar un rewarded ad (el porqué está ahí, en su
    // JSDoc). La lista de cuáles dependen de ads vive en el catálogo
    // (SessionUpgradeDefinition.requiresRewardedAd).
    const visibleUpgrades = getServices(this).listAvailableUpgrades.execute();

    const parent = this.rowParent();
    visibleUpgrades.forEach((definition, index) => {
      this.renderUpgradeRow(definition.id, index, tab, parent);
    });

    // Altura total del contenido (base del scroll) — solo compacto.
    if (compact) {
      this.scrollList?.setContentHeight(tab.contentHeightFor(visibleUpgrades.length));
    }
  }

  private renderUpgradeRow(upgradeId: SessionUpgradeId, index: number, tab: ShopTabLayout, parent: Phaser.GameObjects.Container): void {
    const definition = findSessionUpgradeDefinition(upgradeId)!;
    const { column, row } = tab.cellPositionFor(index);
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;
    const compact = this.layout.mode === 'compact';
    // En escritorio las coords son absolutas (sobre tabContainer en 0,0);
    // en compacto son relativas al centro del panel (el contenedor del
    // scrollList vive ahí).
    const dx = compact ? 0 : cx;
    const dy = compact ? 0 : cy;

    const status = this.upgradeStatusFor(upgradeId, this.sessionUpgrades!);
    const textX = dx + tab.textXFor(column);
    const buttonX = dx + tab.buttonXFor(status.buttonLabel, column);
    const anchorY = tab.rowOffsetY(row); // ± centro del panel

    const nameStyle = this.textStyleFromSpec(tab.name, '#ffffff', tab.name.bold ? 'bold' : undefined);

    let nameY: number;
    let descY = 0;
    let statusY: number;

    if (compact) {
      // Apilado vertical nombre→descripción→estado, centrado en la celda.
      const descKey = definition.description as TranslationKey;
      const descText = languageManager.getText(descKey);
      const nameLines = tab.linesFor(languageManager.getText(definition.name as TranslationKey), tab.name);
      const descLines = tab.description ? tab.linesFor(descText, tab.description) : 0;
      const nameLH = this.layout.lineHeightFor(tab.name.fontSize);
      const descLH = tab.description ? this.layout.lineHeightFor(tab.description.fontSize) : 0;
      const statusLH = this.layout.lineHeightFor(tab.status.fontSize);
      const gap = tab.blockGap;
      const totalH = nameLines * nameLH + descLines * descLH + statusLH + gap * 2;
      let cursor = dy + anchorY - totalH / 2;
      nameY = cursor;
      cursor += nameLines * nameLH + gap;
      descY = cursor;
      cursor += descLines * descLH + gap;
      statusY = cursor;
    } else {
      nameY = dy + anchorY;
      descY = nameY + tab.descriptionOffsetY!;
      statusY = nameY + tab.statusOffsetY!;
    }

    parent.add(new LocalizedText(this, textX, nameY, definition.name as TranslationKey, nameStyle));

    if (tab.description) {
      // maxLines solo en compacto: el código de escritorio no lo pasaba
      // (se conserva byte-idéntico — ninguna descripción excede 3 líneas).
      const descStyle = this.textStyleFromSpec(tab.description, '#8b949e', undefined, compact);
      parent.add(new LocalizedText(this, textX, descY, definition.description as TranslationKey, descStyle));
    }

    // QA de legibilidad: y+78 (no y+58) en escritorio — dejando lugar para
    // que la descripción de arriba ocupe hasta 3 líneas a 15px sin pisarlo.
    const levelOrOwnedText = this.add.text(textX, statusY, '', {
      fontSize: `${tab.status.fontSize}px`,
      fontFamily: 'Arial, sans-serif',
      color: '#58a6ff'
    });
    parent.add(levelOrOwnedText);

    const buttonY = dy + anchorY + tab.buttonOffsetY!;
    const actionButton = this.createActionButton(
      buttonX,
      buttonY,
      status.buttonLabel,
      () => this.attemptPurchaseUpgrade(upgradeId, actionButton.text),
      tab.button
    );
    parent.add(actionButton.container);

    this.upgradeRowRefs.set(upgradeId, { levelOrOwnedText, actionButton });
    this.refreshUpgradeRow(upgradeId);
  }

  private attemptPurchaseUpgrade(upgradeId: SessionUpgradeId, buttonText: Phaser.GameObjects.Text): void {
    if (!this.purchaseUpgradeUseCase) return;

    const result = this.purchaseUpgradeUseCase.execute(upgradeId);

    if (!result.success) {
      this.flashError(buttonText);
      // "Duplicar"/"Triplicar" son mutuamente excluyentes (ver
      // SessionUpgradeCatalog.conflictsWith): a diferencia de las demás
      // fallas silenciosas (fondos insuficientes, ya se ve en el botón),
      // esta amerita un mensaje explícito — sin él, un click sobre un
      // botón que sigue diciendo "Comprar $X" y no pasa nada es confuso.
      if (result.reason === 'conflicting_upgrade') {
        const otherName = findSessionUpgradeDefinition(result.conflictsWith)?.name;
        this.showTemporaryRowMessage(
          upgradeId,
          languageManager.getText('SHOP_UPGRADE_CONFLICT', {
            other: otherName ? languageManager.getText(otherName as TranslationKey) : ''
          })
        );
      } else if (result.reason === 'ads_unavailable') {
        // Mismo motivo que el conflicto: el use-case garantiza que no
        // cobra, pero el botón sigue diciendo "Comprar $X" — sin este
        // mensaje el click parece no haber hecho nada.
        this.showTemporaryRowMessage(upgradeId, languageManager.getText('SHOP_UPGRADE_ADS_UNAVAILABLE'));
      }
      return;
    }

    this.refreshUpgradeRow(upgradeId);
    // Éxito real de la compra de mejora (el use-case ya acreditó el
    // efecto) — feedback sonoro de compra.
    try {
      getServices(this).audioService.play(SFX.PURCHASE);
    } catch {
      // Audio best-effort: nunca rompe la compra.
    }
    // Comprar uno de los dos puede dejar al OTRO no-comprable (ver
    // isApplicable/findOwnedConflict) — se refresca también su fila para
    // que el botón del que queda bloqueado se dibuje ya deshabilitado,
    // en vez de esperar a la próxima vez que se repinte solo.
    const definition = findSessionUpgradeDefinition(upgradeId);
    definition?.conflictsWith?.forEach(id => this.refreshUpgradeRow(id));
  }

  /**
   * Reemplaza brevemente la línea de estado de la fila por `message` (en
   * rojo) y la repone a los 2200 ms. Compartido por los dos motivos de
   * fallo que merecen mensaje explícito (conflicto, anuncios no
   * disponibles); el texto lo arma cada caller.
   */
  private showTemporaryRowMessage(upgradeId: SessionUpgradeId, message: string): void {
    const refs = this.upgradeRowRefs.get(upgradeId);
    if (!refs) return;

    const originalText = refs.levelOrOwnedText.text;
    const originalColor = refs.levelOrOwnedText.style.color;
    refs.levelOrOwnedText.setText(message).setColor('#e74c3c');
    this.time.delayedCall(2200, () => {
      // Si mientras tanto se compró/cambió de fila, no pisar el estado
      // nuevo; y si el re-render (resize/idioma en compacto) destruyó el
      // texto, no operar sobre un Text destruido (canvas devuelto al pool).
      if (refs.levelOrOwnedText.scene && refs.levelOrOwnedText.text === message) {
        refs.levelOrOwnedText.setText(originalText).setColor(originalColor);
      }
    });
  }

  private refreshUpgradeRow(upgradeId: SessionUpgradeId): void {
    const refs = this.upgradeRowRefs.get(upgradeId);
    if (!refs || !this.sessionUpgrades) return;

    const status = this.upgradeStatusFor(upgradeId, this.sessionUpgrades);

    refs.levelOrOwnedText.setText(status.statusLabel);
    refs.actionButton.text.setText(status.buttonLabel);
    this.paintButtonChrome(refs.actionButton.bg, refs.actionButton.glow, refs.actionButton.width, refs.actionButton.height, status.buttonDisabled ? COLOR_OWNED : COLOR_BUY);

    if (status.buttonDisabled) {
      refs.actionButton.hitZone.disableInteractive();
    } else {
      refs.actionButton.hitZone.setInteractive({ useHandCursor: true });
    }
  }

  /**
   * Texto de estado/botón de una fila de mejora, derivado del estado de
   * dominio `SessionUpgrades.getState()` — antes había un switch de 8
   * casos que repetía a mano la lógica de "¿lo tengo?/¿está bloqueado?"
   * que ya vive en el dominio (isOwned/canPurchase), con el riesgo de
   * que las dos versiones diverjan.
   *
   * `buttonDisabled`: en 'locked' el botón muestra el costo pero queda
   * INERTE (el caller lo deja sin interactividad) — solo 'available'
   * habilita la compra.
   */
  private upgradeStatusFor(
    upgradeId: SessionUpgradeId,
    upgrades: SessionUpgrades
  ): { statusLabel: string; buttonLabel: string; buttonDisabled: boolean } {
    const definition = findSessionUpgradeDefinition(upgradeId)!;
    const cost = languageManager.getText('SHOP_BUY_BUTTON', { price: `$${definition.cost.toLocaleString()}` });
    const ownedLabel = languageManager.getText('SHOP_OWNED_LABEL');

    switch (upgrades.getState(upgradeId)) {
      case 'acquired':
        return {
          statusLabel: languageManager.getText(this.acquiredLabelKeyFor(upgradeId)),
          buttonLabel: ownedLabel,
          buttonDisabled: true
        };
      case 'locked':
        // Solo energy_tank_2 sin energy_tank_1 llega acá: la etiqueta
        // pide el prerequisito y el botón muestra el costo pero no
        // responde al click (buttonDisabled → disableInteractive).
        return {
          statusLabel: languageManager.getText('SHOP_UPGRADE_REQUIRES_LEVEL_1'),
          buttonLabel: cost,
          buttonDisabled: true
        };
      case 'available':
        return {
          statusLabel: languageManager.getText('SHOP_UPGRADE_NOT_PURCHASED'),
          buttonLabel: cost,
          buttonDisabled: false
        };
    }
  }

  /**
   * Clave i18n de la etiqueta "activo" al adquirir una mejora — única
   * parte del texto que depende del id, y es presentación (i18n), no
   * regla de negocio: por eso vive acá y no en el dominio.
   */
  private acquiredLabelKeyFor(upgradeId: SessionUpgradeId): TranslationKey {
    switch (upgradeId) {
      case 'energy_tank_1':
        return 'SHOP_UPGRADE_LEVEL_1_ACTIVE';
      case 'energy_tank_2':
        return 'SHOP_UPGRADE_LEVEL_2_ACTIVE';
      case 'double_reward':
      case 'triple_reward':
      case 'revive':
      case 'secret_swap_final':
      case 'negative_card_shield':
      case 'negotiator':
        return 'SHOP_UPGRADE_ACTIVE_THIS_GAME';
    }
  }

  // ------------------------------------------------------------------
  // Pestaña "Mazos" (colección persistente — requirement_upgrade_store)
  // ------------------------------------------------------------------

  private renderDecksTab(): void {
    const tab = this.layout.decks;
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;
    const compact = this.layout.mode === 'compact';

    // Caption: solo escritorio (compact lo omite, ver renderUpgradesTab).
    if (tab.captionY !== null) {
      this.tabContainer.add(
        new LocalizedText(this, cx, cy + tab.captionY, 'SHOP_DECKS_CAPTION', {
          fontSize: '15px',
          fontFamily: 'Arial, sans-serif',
          color: '#8b949e'
        }).setOrigin(0.5)
      );
    }

    // Qué filas dibuja (y con qué visibilidad) lo decide la APLICACIÓN,
    // no la escena — mismo criterio que listAvailableUpgrades en el tab de
    // Mejoras: ListAvailableDecksUseCase devuelve chessmaster con
    // `revealed: false` hasta poseer los demás mazos base. Se guarda la
    // lista para poder compararla contra la de después de una compra
    // (ver attemptPurchaseDeck()).
    this.deckEntries = getServices(this).listAvailableDecks.execute();

    // Badge "Obtenidos X/Y" — de un vistazo, cuántos de los N mazos del
    // catálogo ya tiene el jugador. Mismo chrome dorado que el filo
    // interior de los botones, para que se lea como parte de la misma
    // familia visual y no como un elemento suelto. Vive en tabContainer
    // (NO scrollea) y en compacto queda bajo el área de scroll (cy+275).
    const counterY = cy + 275;
    const counterWidth = 160;
    const counterHeight = 26;
    const counterBg = this.add.graphics();
    counterBg.fillStyle(PANEL_FILL, 0.9).fillRoundedRect(cx - counterWidth / 2, counterY - counterHeight / 2, counterWidth, counterHeight, counterHeight / 2);
    counterBg.lineStyle(2, COLOR_GOLD, 0.7).strokeRoundedRect(cx - counterWidth / 2, counterY - counterHeight / 2, counterWidth, counterHeight, counterHeight / 2);
    this.tabContainer.add(counterBg);
    this.deckCounterBg = counterBg;

    this.deckCounterText = this.add
      .text(cx, counterY, '', { fontSize: '15px', fontFamily: 'Arial, sans-serif', fontStyle: 'bold', color: COLOR_GOLD_HEX })
      .setOrigin(0.5);
    this.tabContainer.add(this.deckCounterText);
    this.updateDeckCounter();
    const parent = this.rowParent();
    // Escritorio: 3 columnas con la posición leída por ÍNDICE dentro de la
    // FILA (fila-major): las 3 primeras filas se llenen de a 3 y las 11
    // entradas terminan en 4 filas (3+3+3+2). Compacto: 1 columna con
    // scroll (cellPositionFor devuelve columna 0, fila = índice).
    this.deckEntries.forEach((entry, index) => {
      const { column, row } = tab.cellPositionFor(index);
      if (entry.revealed) {
        this.renderDeckRow(entry.deckId, index, tab, parent);
      } else {
        this.renderMysteryDeckRow(column, row, tab, parent);
      }
    });

    // Altura total del contenido (base del scroll) — solo compacto.
    if (compact) {
      this.scrollList?.setContentHeight(tab.contentHeightFor(this.deckEntries.length));
    }
  }

  /**
   * Carta misteriosa "?" — fila de un mazo que todavía no se reveló
   * (chessmaster hasta poseer los 10 mazos base, ver
   * ListAvailableDecksUseCase). NO se crean nombre, estado ni botón, así
   * que la fila es inerte POR CONSTRUCCIÓN: no hay zona interactiva, no
   * hay click y por lo tanto no hay sonido (el patrón de
   * refreshDeckRow() — hitZone existente con disableInteractive() — no
   * aplica acá porque no existe hitZone).
   *
   * El "?" es un glifo PUNTUARIO (no una cadena localizable, por eso no
   * lleva clave i18n): glifo Georgia bold dorado sobre rect redondeada
   * oscura con el mismo chrome de paintButtonChrome (PANEL_FILL +
   * COLOR_GOLD), y con el mismo tamaño que ocupa la miniatura real para
   * que la fila quede alineada con las demás.
   */
  private renderMysteryDeckRow(column: number, row: number, tab: ShopTabLayout, parent: Phaser.GameObjects.Container): void {
    const { width: thumbW, height: thumbH } = tab.thumb!;
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;
    const compact = this.layout.mode === 'compact';
    const dx = compact ? 0 : cx;
    const dy = compact ? 0 : cy;

    // MISMO textX que ocuparía la miniatura real de ESA columna (no el de
    // la columna 0): la "?" vive en el centro de la fila/columna que le
    // tocó en la grilla, igual que las demás.
    const cardCenterX = dx + tab.columns[column].textX + thumbW / 2;
    const cardCenterY = dy + tab.rowOffsetY(row);

    const card = this.add.graphics().setPosition(cardCenterX, cardCenterY);
    card.fillStyle(PANEL_FILL, PANEL_FILL_ALPHA).fillRoundedRect(-thumbW / 2, -thumbH / 2, thumbW, thumbH, 6);
    card.lineStyle(2, COLOR_GOLD, 0.85).strokeRoundedRect(-thumbW / 2, -thumbH / 2, thumbW, thumbH, 6);
    card.lineStyle(1, COLOR_GOLD, 0.25).strokeRoundedRect(-thumbW / 2 + 3, -thumbH / 2 + 3, thumbW - 6, thumbH - 6, 4);
    parent.add(card);

    parent.add(
      this.add
        .text(cardCenterX, cardCenterY, '?', {
          fontSize: '34px',
          fontFamily: 'Georgia, "Times New Roman", serif',
          fontStyle: 'bold',
          color: COLOR_GOLD_HEX
        })
        .setOrigin(0.5)
    );
  }

  /**
   * Mensaje temporal (2.6 s) explicando el único fallo de compra que la
   * propia fila no puede contar: la carta "?" no tiene estado donde
   * mostrarse. En escritorio vive sobre el hueco del caption (h/2-183,
   * congelado tras la revisión de code-review: en h/2 - 176 pisaba 4-5 px
   * la tarjeta de la columna central). En compacto el caption no existe y
   * el hueco arriba lo ocupa la tira de pestañas — se dibuja BAJO el área
   * de scroll (mismo hueco que el aviso de ads del tab Mejoras).
   */
  private showTemporaryDeckMessage(message: string): void {
    const { width } = this.cameras.main;
    const cy = this.cameras.main.centerY;
    const compact = this.layout.mode === 'compact';
    const messageY = compact
      ? cy + this.layout.scroll.top + this.layout.scroll.height + COMPACT_NOTICE_GAP
      : cy + DECK_MESSAGE_OFFSET_Y_DESKTOP;
    const messageText = this.add
      .text(width / 2, messageY, message, {
        fontSize: '15px',
        fontFamily: 'Arial, sans-serif',
        color: '#e74c3c'
      })
      .setOrigin(0.5);
    this.tabContainer.add(messageText);

    // En compacto el mensaje cae EN el mismo hueco que ocupa el badge
    // "Obtenidos X/Y" (cy+275): se oculta el badge mientras dure para que
    // no queden dos textos superpuestos, y se repone después.
    const counterBg = this.deckCounterBg;
    const counterText = this.deckCounterText;
    if (compact && counterBg && counterText) {
      counterBg.setVisible(false);
      counterText.setVisible(false);
    }

    this.time.delayedCall(2600, () => {
      // Si mientras tanto se cambió de pestaña (renderActiveTab() ya
      // destruyó todo el contenido), no destruir dos veces.
      if (messageText.scene) {
        messageText.destroy();
      }
      if (compact && counterBg && counterText && counterBg.scene && counterText.scene) {
        counterBg.setVisible(true);
        counterText.setVisible(true);
      }
    });
  }

  /** Actualiza el badge "Obtenidos X/Y" — llamado al pintar el tab y cada vez que una fila se refresca (compra exitosa o cambio de idioma), así nunca queda desactualizado tras comprar un mazo. No-op si el tab activo no es "Mazos" (badge destruido, ver renderActiveTab()). */
  private updateDeckCounter(): void {
    if (!this.deckCounterText) return;
    const services = getServices(this);
    const ownedCount = services.progressionManager.getOwnedDeckIds().length;
    // El DENOMINADOR son solo las entradas REVELADAS: 10 mientras chessmaster
    // siga oculto y 11 una vez revelado (los poseídos siempre están
    // revelados, así que el numerador nunca puede superar al denominador).
    const revealedTotal = this.deckEntries.filter(entry => entry.revealed).length;
    this.deckCounterText.setText(languageManager.getText('SHOP_DECKS_OWNED_COUNTER', { owned: ownedCount, total: revealedTotal }));
  }

  private renderDeckRow(deckId: DeckSetupId, index: number, tab: ShopTabLayout, parent: Phaser.GameObjects.Container): void {
    // NOTA i18n: `definition.name` (nombre del mazo) también viene del
    // catálogo de dominio en español fijo — mismo caso que las mejoras,
    // señalado arriba en renderUpgradeRow().
    const definition = getDeckSetup(deckId);
    const { column, row } = tab.cellPositionFor(index);
    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;
    const compact = this.layout.mode === 'compact';
    const dx = compact ? 0 : cx;
    const dy = compact ? 0 : cy;

    const services = getServices(this);
    const owned = services.progressionManager.getOwnedDeckIds().includes(deckId);
    const ownedLabel = languageManager.getText('SHOP_OWNED_LABEL');
    const priceText = `$${definition.price.toLocaleString()}`;
    const buttonLabel = owned ? ownedLabel : languageManager.getText('SHOP_BUY_BUTTON', { price: priceText });

    const thumbW = tab.thumb!.width;
    const thumbH = tab.thumb!.height;
    const thumbX = dx + tab.columns[column].textX;
    const textX = dx + tab.textXFor(column);
    const anchorY = tab.rowOffsetY(row); // ± centro (/thumb vertical)

    // Miniatura a la izquierda de la celda.
    parent.add(
      this.add
        .image(thumbX, dy + anchorY, `shop-cardback-${deckId}`)
        .setDisplaySize(thumbW, thumbH)
        .setOrigin(0, 0.5)
    );

    const nameStyle = this.textStyleFromSpec(tab.name, '#ffffff', tab.name.bold ? 'bold' : undefined);

    let nameY: number;
    let statusY: number;
    // Nombre: en escritorio origin (0, 0.5) (así 1 y 2 líneas quedan igual
    // de centradas respecto de la miniatura); en compacto origin (0, 0)
    // porque el apilado fluye desde el borde superior de la celda.
    const nameOriginY = compact ? 0 : 0.5;

    if (compact) {
      // Apilado vertical nombre→estado, centrado en la celda (sin bajar de
      // la miniatura: el alto de fila ya la contempla).
      const nameLines = tab.linesFor(definition.name, tab.name);
      const nameLH = this.layout.lineHeightFor(tab.name.fontSize);
      const statusLH = this.layout.lineHeightFor(tab.status.fontSize);
      const gap = tab.blockGap;
      const totalH = nameLines * nameLH + statusLH + gap;
      let cursor = dy + anchorY - totalH / 2;
      nameY = cursor;
      cursor += nameLines * nameLH + gap;
      statusY = cursor;
    } else {
      // Escritorio: nombre en y-14 (origin 0.5, así 1 y 2 líneas quedan
      // igual de centradas respecto de la miniatura) y estado en y+8.
      nameY = dy + anchorY + tab.nameOffsetY!;
      statusY = dy + anchorY + tab.statusOffsetY!;
    }

    // Nombre + estado a la derecha de la miniatura (ver textXFor).
    parent.add(
      this.add.text(textX, nameY, definition.name, nameStyle).setOrigin(0, nameOriginY)
    );

    const statusText = this.add.text(textX, statusY, '', {
      fontSize: `${tab.status.fontSize}px`,
      fontFamily: 'Arial, sans-serif',
      color: '#58a6ff'
    });
    parent.add(statusText);

    const actionButton = this.createActionButton(
      dx + tab.buttonXFor(buttonLabel, column),
      dy + anchorY + tab.buttonOffsetY!,
      buttonLabel,
      () => this.attemptPurchaseDeck(deckId, actionButton.text),
      tab.button
    );
    parent.add(actionButton.container);

    this.deckRowRefs.set(deckId, { statusText, actionButton });
    this.refreshDeckRow(deckId);
  }

  private attemptPurchaseDeck(deckId: DeckSetupId, buttonText: Phaser.GameObjects.Text): void {
    const services = getServices(this);
    // La compra pasa por el use-case (NO por progressionManager directo):
    // además de delegar el cobro, ahí vive el rechazo del mazo oculto
    // 'chessmaster', siempre ANTES de descontar un peso.
    const result = services.purchaseDeck.execute(deckId);

    if (!result.success) {
      this.flashError(buttonText);
      // 'insufficient_coins' y 'already_owned' se leen en el propio botón
      // (precio / COMPRADO) y ya tenían solo el flash. 'locked_prerequisite'
      // no: la fila bloqueada es la carta "?" y NO tiene botón ni estado
      // donde explicarse, así que se cuenta en el hueco bajo el caption.
      // (Defensivo: hoy esa fila es inerte y este motivo no debería
      // alcanzarse — pero si algo llega acá, el click no queda sin
      // respuesta.)
      if (result.reason === 'locked_prerequisite') {
        this.showTemporaryDeckMessage(languageManager.getText('SHOP_DECK_LOCKED'));
      }
      return;
    }

    // Éxito: re-evaluar la VISIBILIDAD de las filas, porque comprar el
    // décimo mazo base REVELA la carta "?" de chessmaster (de 10 filas
    // visibles a 11, con posiciones nuevas). Si cambió alguna entrada se
    // reconstruye el tab completo con el mecanismo que ya usa la escena
    // (renderActiveTab, el mismo de cambiar de pestaña); si no cambió
    // nada, alcanza con refrescar la fila como siempre.
    const freshEntries = services.listAvailableDecks.execute();
    const revealChanged = freshEntries.some((entry, index) => entry.revealed !== this.deckEntries[index]?.revealed);
    this.deckEntries = freshEntries;

    if (revealChanged) {
      this.renderActiveTab();
    } else {
      this.refreshDeckRow(deckId);
    }

    // Éxito real de la compra de mazo (purchaseDeck devolvió success) —
    // "desbloqueo" de contenido nuevo, distinto del PURCHASE de mejoras.
    try {
      services.audioService.play(SFX.UNLOCK);
    } catch {
      // Audio best-effort: nunca rompe la compra.
    }
  }

  private refreshDeckRow(deckId: DeckSetupId): void {
    const refs = this.deckRowRefs.get(deckId);
    if (!refs) return;

    const services = getServices(this);
    const definition = getDeckSetup(deckId);
    const owned = services.progressionManager.getOwnedDeckIds().includes(deckId);
    const ownedLabel = languageManager.getText('SHOP_OWNED_LABEL');
    const priceText = `$${definition.price.toLocaleString()}`;

    refs.statusText.setText(owned ? ownedLabel : priceText);
    refs.actionButton.text.setText(owned ? ownedLabel : languageManager.getText('SHOP_BUY_BUTTON', { price: priceText }));
    this.paintButtonChrome(refs.actionButton.bg, refs.actionButton.glow, refs.actionButton.width, refs.actionButton.height, owned ? COLOR_OWNED : COLOR_BUY);

    if (owned) {
      refs.actionButton.hitZone.disableInteractive();
    } else {
      refs.actionButton.hitZone.setInteractive({ useHandCursor: true });
    }

    this.updateDeckCounter();
  }

  private flashError(buttonText: Phaser.GameObjects.Text): void {
    const originalColor = buttonText.style.color;
    buttonText.setColor('#e74c3c');
    this.time.delayedCall(400, () => {
      // Guard .scene: un re-render (resize/idioma) puede destruir el texto
      // durante los 400 ms — no restaurar color sobre un Text destruido.
      if (buttonText.scene) {
        buttonText.setColor(originalColor);
      }
    });
  }
}
