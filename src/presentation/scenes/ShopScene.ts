import Phaser from 'phaser';
import { getServices } from '../GameServices';
import { getActiveSessionBridge } from '../ActiveSessionBridge';
import { findSessionUpgradeDefinition, SESSION_UPGRADE_CATALOG, SessionUpgradeId } from '../../domain/value-objects/SessionUpgradeCatalog';
import { SessionUpgrades } from '../../domain/entities/SessionUpgrades';
import { PurchaseSessionUpgradeUseCase } from '../../application/use-cases/PurchaseSessionUpgradeUseCase';
import { DECK_SETUP_IDS, DeckSetupId, getDeckSetup } from '../../domain/value-objects/DeckSetups';
import languageManager from '../../shared/i18n/LanguageManager';
import { TranslationKey } from '../../shared/i18n/LanguageData';
import { LocalizedText } from '../components/LocalizedText';

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

const TAB_WIDTH = 160;
const TAB_HEIGHT = 34;
const ACTION_BUTTON_WIDTH = 150;
const ACTION_BUTTON_HEIGHT = 34;

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
}

/** Refs de un botón de pestaña — mismo chrome que ActionButtonRefs, pero
 * con LocalizedText (la etiqueta es una clave i18n fija, "Mejoras"/
 * "Mazos", sin estado dinámico) en vez de Text plano. */
interface TabButtonRefs {
  readonly container: Phaser.GameObjects.Container;
  readonly bg: Phaser.GameObjects.Graphics;
  readonly glow: Phaser.GameObjects.Graphics;
  readonly label: LocalizedText;
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

// Layout en 2 columnas de 4 filas (8 upgrades de partida) — evita que el
// catálogo desborde el modal a medida que se agregan nuevas mejoras.
const ROWS_PER_COLUMN = 4;

/** Upgrades cuyo uso dispara un rewarded ad al final/durante la partida. */
const REWARDED_AD_UPGRADE_IDS: ReadonlySet<SessionUpgradeId> = new Set<SessionUpgradeId>([
  'double_reward',
  'triple_reward',
  'revive'
]);
// QA de legibilidad (fontSize de la descripción 12px -> 15px): la
// descripción más larga del catálogo ("Mitiga a la mitad el drenaje...",
// 83 caracteres) pasa de 2 a 3 líneas dentro de wordWrap.width=280 a este
// tamaño — 105 alcanzaba para 2 líneas, pero dejaba la 3ra pisando el
// renglón siguiente. Sube a 118 para darle lugar a esa 3ra línea sin
// que el catálogo dé la sensación de estar apretado.
const ROW_SPACING_Y = 118;
const FIRST_ROW_OFFSET_Y = -190;
const COLUMN_OFFSETS = [
  { textX: -450, buttonX: -90 },
  { textX: 20, buttonX: 380 }
] as const;

// Layout de mazos: 2 columnas x 5 filas (10 mazos en el catálogo actual).
const DECK_ROWS_PER_COLUMN = 5;
const DECK_ROW_SPACING_Y = 90;
const DECK_FIRST_ROW_OFFSET_Y = -170;

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

  private sessionUpgrades: SessionUpgrades | null = null;
  private purchaseUpgradeUseCase: PurchaseSessionUpgradeUseCase | null = null;

  private upgradesTabRefs!: TabButtonRefs;
  private decksTabRefs!: TabButtonRefs;

  /** Badge "Obtenidos X/Y" del tab "Mazos" — null mientras el tab activo
   * es "Mejoras" (destruido junto con el resto de tabContainer al
   * cambiar de pestaña, ver renderActiveTab()). */
  private deckCounterText: Phaser.GameObjects.Text | null = null;

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
    // el modal de "Salir al Menú" y el del bono periódico en UIScene: así
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
    // que tenía antes.
    const modalX = width / 2 - 470;
    const modalY = height / 2 - 300;
    const modalBg = this.add.graphics();
    modalBg.fillStyle(PANEL_FILL, 0.97).fillRoundedRect(modalX, modalY, 940, 600, 18);
    modalBg.lineStyle(3, ACCENT_COLOR, 0.9).strokeRoundedRect(modalX, modalY, 940, 600, 18);
    modalBg.lineStyle(8, ACCENT_COLOR, 0.15).strokeRoundedRect(modalX - 4, modalY - 4, 948, 608, 20);
    // Filo dorado interior muy fino, misma convención "premium" que createCasinoButton().
    modalBg.lineStyle(1, COLOR_GOLD, 0.2).strokeRoundedRect(modalX + 5, modalY + 5, 930, 590, 14);

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
    // en tiempo real). Se desuscribe al detener la escena — mismo patrón
    // ya usado en MainMenuScene y en ProgressionManager.onEvent.
    const unsubscribe = languageManager.onLanguageChanged(() => this.refreshAllRows());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
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

  /** Zona interactiva + tweens de hover/press/click — misma "sensación táctil" que createCasinoButton()/HudIconButton en el resto del juego. */
  private attachButtonInteractions(container: Phaser.GameObjects.Container, glow: Phaser.GameObjects.Graphics, width: number, height: number, onClick: () => void): Phaser.GameObjects.Zone {
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
    hitZone.on('pointerup', () => {
      this.tweens.add({ targets: container, scale: PRESS_SCALE, duration: PRESS_TWEEN_MS, yoyo: true, ease: 'Quad.easeOut', onComplete: onClick });
    });

    return hitZone;
  }

  /** Botón de acción de fila (Comprar $X / Adquirido) — texto plano, ver ActionButtonRefs. */
  private createActionButton(x: number, y: number, initialLabel: string, onClick: () => void): ActionButtonRefs {
    const container = this.add.container(x, y);
    const glow = this.add.graphics().setAlpha(0);
    const bg = this.add.graphics();
    const text = this.add
      .text(0, 0, initialLabel, {
        // QA de legibilidad: se queda en 15px (no 16, como el resto de
        // los textos "13px->16px" de esta pantalla) a propósito — este
        // botón mide 150px de ancho y el label más largo posible,
        // "Comprar $20.000" (el mazo más caro del catálogo, ver
        // DECK_PRICE en DeckSetups.ts), ya casi lo llena a 16px. 15px
        // sigue muy por encima del piso de legibilidad (9.4px reales
        // @800x450) sin arriesgar que el precio se salga del botón —
        // sobre todo en la columna derecha, donde el botón ya está
        // cerca del borde del modal (ver COLUMN_OFFSETS).
        fontSize: '15px',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        color: '#ffffff'
      })
      .setOrigin(0.5);
    container.add([glow, bg, text]);

    const hitZone = this.attachButtonInteractions(container, glow, ACTION_BUTTON_WIDTH, ACTION_BUTTON_HEIGHT, onClick);

    return { container, bg, glow, text, hitZone };
  }

  private createCloseButton(x: number, y: number): void {
    const bg = this.add.circle(0, 0, 16, PANEL_FILL, 0.95).setStrokeStyle(2, COLOR_DANGER, 0.8).setInteractive({ useHandCursor: true });
    const label = this.add.text(0, 0, '✕', { fontSize: '16px', fontFamily: 'Arial, sans-serif', color: '#ffffff' }).setOrigin(0.5);

    bg.on('pointerover', () => bg.setFillStyle(0x6e2a2a, 0.95));
    bg.on('pointerout', () => bg.setFillStyle(PANEL_FILL, 0.95));
    bg.on('pointerup', () => this.scene.stop());

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

    this.attachButtonInteractions(container, glow, TAB_WIDTH, TAB_HEIGHT, onClick);

    return { container, bg, glow, label };
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
      this.paintButtonChrome(refs.bg, refs.glow, TAB_WIDTH, TAB_HEIGHT, active ? ACCENT_COLOR : COLOR_OWNED);
      refs.label.setColor(active ? '#ffffff' : '#8b949e');
      refs.container.setAlpha(active ? 1 : 0.85);
    });
  }

  private renderActiveTab(): void {
    this.tabContainer.removeAll(true); // destruye el contenido del tab anterior
    this.upgradeRowRefs.clear();
    this.deckRowRefs.clear();
    // El badge de contador vive dentro de tabContainer — removeAll(true)
    // ya lo destruyó si el tab anterior era "Mazos"; se limpia la
    // referencia acá para no dejar un puntero a un GameObject destruido
    // (se recrea en renderDecksTab() si corresponde).
    this.deckCounterText = null;

    if (this.activeTab === 'upgrades') {
      this.renderUpgradesTab();
    } else {
      this.renderDecksTab();
    }
  }

  /** Vuelve a resolver el texto de TODAS las filas del tab activo tras un cambio de idioma. */
  private refreshAllRows(): void {
    this.upgradeRowRefs.forEach((_refs, id) => this.refreshUpgradeRow(id));
    this.deckRowRefs.forEach((_refs, id) => this.refreshDeckRow(id));
  }

  // ------------------------------------------------------------------
  // Pestaña "Mejoras" (upgrades de partida única — sin cambios de fondo,
  // solo se movió el contenido a this.tabContainer para convivir con tabs)
  // ------------------------------------------------------------------

  private renderUpgradesTab(): void {
    const { width, height } = this.cameras.main;

    if (!this.sessionUpgrades || !this.purchaseUpgradeUseCase) {
      this.tabContainer.add(
        new LocalizedText(
          this,
          width / 2,
          height / 2,
          'SHOP_NO_ACTIVE_SESSION',
          { fontSize: '17px', fontFamily: 'Arial, sans-serif', color: '#8b949e', align: 'center' }
        ).setOrigin(0.5)
      );
      return;
    }

    this.tabContainer.add(
      new LocalizedText(this, width / 2, height / 2 - 200, 'SHOP_UPGRADES_CAPTION', {
        fontSize: '15px',
        fontFamily: 'Arial, sans-serif',
        color: '#8b949e'
      }).setOrigin(0.5)
    );

    // Upgrades que dependen de un rewarded ad (Duplicar/Triplicar/Revivir):
    // si hoy no se puede mostrar un rewarded (Basic Launch con ads
    // deshabilitados, adblock, SDK ausente, sin fill reciente), NO se
    // ofrecen — el jugador pagaría monedas por algo que no puede usar, y
    // QA rechaza botones de rewarded sin efecto. Reaparecen solos cuando
    // vuelve a haber anuncios (ver ICrazyGamesService.isRewardedAdAvailable).
    const rewardedAdsUsable = getServices(this).crazyGamesService.isRewardedAdAvailable();
    const visibleUpgrades = SESSION_UPGRADE_CATALOG.filter(
      u => rewardedAdsUsable || !REWARDED_AD_UPGRADE_IDS.has(u.id)
    );

    visibleUpgrades.forEach((definition, index) => {
      const column = Math.floor(index / ROWS_PER_COLUMN);
      const row = index % ROWS_PER_COLUMN;
      const y = height / 2 + FIRST_ROW_OFFSET_Y + 30 + row * ROW_SPACING_Y;
      const { textX, buttonX } = COLUMN_OFFSETS[column];
      this.renderUpgradeRow(definition.id, textX, buttonX, y);
    });
  }

  private renderUpgradeRow(upgradeId: SessionUpgradeId, textOffsetX: number, buttonOffsetX: number, y: number): void {
    const definition = SESSION_UPGRADE_CATALOG.find(u => u.id === upgradeId)!;
    const cx = this.cameras.main.centerX;
    const textX = cx + textOffsetX;
    const buttonX = cx + buttonOffsetX;

    this.tabContainer.add(
      new LocalizedText(this, textX, y, definition.name as TranslationKey, {
        fontSize: '17px',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        color: '#ffffff'
      })
    );
    this.tabContainer.add(
      new LocalizedText(this, textX, y + 18, definition.description as TranslationKey, {
        fontSize: '15px',
        fontFamily: 'Arial, sans-serif',
        color: '#8b949e',
        // QA de legibilidad: 280 en vez de 260 — aprovecha el espacio
        // horizontal real disponible antes del botón de la fila (ver
        // COLUMN_OFFSETS, ~285px libres en ambas columnas), aunque no
        // alcanza para evitar una 3ra línea en la descripción más larga
        // del catálogo — de ahí el ROW_SPACING_Y más alto de arriba.
        wordWrap: { width: 280 }
      })
    );

    // QA de legibilidad: y+78 (no y+58) — dejando lugar para que la
    // descripción de arriba ocupe hasta 3 líneas a 15px sin pisarlo (ver
    // el comentario de ROW_SPACING_Y más arriba).
    const levelOrOwnedText = this.add.text(textX, y + 78, '', {
      fontSize: '15px',
      fontFamily: 'Arial, sans-serif',
      color: '#58a6ff'
    });
    this.tabContainer.add(levelOrOwnedText);

    const actionButton = this.createActionButton(buttonX, y + 18, '', () => this.attemptPurchaseUpgrade(upgradeId, actionButton.text));
    this.tabContainer.add(actionButton.container);

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
        this.showConflictMessage(upgradeId, result.conflictsWith);
      }
      return;
    }

    this.refreshUpgradeRow(upgradeId);
    // Comprar uno de los dos puede dejar al OTRO no-comprable (ver
    // isApplicable/findOwnedConflict) — se refresca también su fila para
    // que el botón del que queda bloqueado se dibuje ya deshabilitado,
    // en vez de esperar a la próxima vez que se repinte solo.
    const definition = findSessionUpgradeDefinition(upgradeId);
    definition?.conflictsWith?.forEach(id => this.refreshUpgradeRow(id));
  }

  /** Reemplaza brevemente la línea de estado de la fila por un mensaje claro de conflicto, y la repone. */
  private showConflictMessage(upgradeId: SessionUpgradeId, conflictsWith: SessionUpgradeId): void {
    const refs = this.upgradeRowRefs.get(upgradeId);
    if (!refs) return;

    const otherName = findSessionUpgradeDefinition(conflictsWith)?.name;
    const message = languageManager.getText('SHOP_UPGRADE_CONFLICT', {
      other: otherName ? languageManager.getText(otherName as TranslationKey) : ''
    });

    const originalText = refs.levelOrOwnedText.text;
    const originalColor = refs.levelOrOwnedText.style.color;
    refs.levelOrOwnedText.setText(message).setColor('#e74c3c');
    this.time.delayedCall(2200, () => {
      // Si mientras tanto se compró/cambió de fila, no pisar el estado nuevo.
      if (refs.levelOrOwnedText.text === message) {
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
    this.paintButtonChrome(refs.actionButton.bg, refs.actionButton.glow, ACTION_BUTTON_WIDTH, ACTION_BUTTON_HEIGHT, status.owned ? COLOR_OWNED : COLOR_BUY);

    if (status.owned) {
      refs.actionButton.hitZone.disableInteractive();
    } else {
      refs.actionButton.hitZone.setInteractive({ useHandCursor: true });
    }
  }

  private upgradeStatusFor(
    upgradeId: SessionUpgradeId,
    upgrades: SessionUpgrades
  ): { statusLabel: string; buttonLabel: string; owned: boolean } {
    const definition = SESSION_UPGRADE_CATALOG.find(u => u.id === upgradeId)!;
    const cost = languageManager.getText('SHOP_BUY_BUTTON', { price: `$${definition.cost.toLocaleString()}` });
    const ownedLabel = languageManager.getText('SHOP_OWNED_LABEL');
    const notPurchased = languageManager.getText('SHOP_UPGRADE_NOT_PURCHASED');
    const activeThisGame = languageManager.getText('SHOP_UPGRADE_ACTIVE_THIS_GAME');

    switch (upgradeId) {
      case 'energy_tank_1': {
        const owned = upgrades.getEnergyTankLevel() >= 1;
        return {
          statusLabel: owned ? languageManager.getText('SHOP_UPGRADE_LEVEL_1_ACTIVE') : notPurchased,
          buttonLabel: owned ? ownedLabel : cost,
          owned
        };
      }
      case 'energy_tank_2': {
        const owned = upgrades.getEnergyTankLevel() >= 2;
        const locked = upgrades.getEnergyTankLevel() < 1;
        return {
          statusLabel: owned
            ? languageManager.getText('SHOP_UPGRADE_LEVEL_2_ACTIVE')
            : locked
              ? languageManager.getText('SHOP_UPGRADE_REQUIRES_LEVEL_1')
              : notPurchased,
          buttonLabel: owned ? ownedLabel : cost,
          owned: owned || locked
        };
      }
      case 'negative_card_shield':
        return {
          statusLabel: upgrades.hasNegativeCardShield() ? activeThisGame : notPurchased,
          buttonLabel: upgrades.hasNegativeCardShield() ? ownedLabel : cost,
          owned: upgrades.hasNegativeCardShield()
        };
      case 'negotiator':
        return {
          statusLabel: upgrades.hasNegotiator() ? activeThisGame : notPurchased,
          buttonLabel: upgrades.hasNegotiator() ? ownedLabel : cost,
          owned: upgrades.hasNegotiator()
        };
      case 'double_reward':
        return {
          statusLabel: upgrades.hasDoubleReward() ? activeThisGame : notPurchased,
          buttonLabel: upgrades.hasDoubleReward() ? ownedLabel : cost,
          owned: upgrades.hasDoubleReward()
        };
      case 'triple_reward':
        return {
          statusLabel: upgrades.hasTripleReward() ? activeThisGame : notPurchased,
          buttonLabel: upgrades.hasTripleReward() ? ownedLabel : cost,
          owned: upgrades.hasTripleReward()
        };
      case 'revive':
        return {
          statusLabel: upgrades.hasRevive() ? activeThisGame : notPurchased,
          buttonLabel: upgrades.hasRevive() ? ownedLabel : cost,
          owned: upgrades.hasRevive()
        };
      case 'secret_swap_final':
        return {
          statusLabel: upgrades.hasSecretSwapFinal() ? activeThisGame : notPurchased,
          buttonLabel: upgrades.hasSecretSwapFinal() ? ownedLabel : cost,
          owned: upgrades.hasSecretSwapFinal()
        };
    }
  }

  // ------------------------------------------------------------------
  // Pestaña "Mazos" (colección persistente — requirement_upgrade_store)
  // ------------------------------------------------------------------

  private renderDecksTab(): void {
    const { width, height } = this.cameras.main;

    this.tabContainer.add(
      new LocalizedText(this, width / 2, height / 2 - 199, 'SHOP_DECKS_CAPTION', {
        fontSize: '15px',
        fontFamily: 'Arial, sans-serif',
        color: '#8b949e'
      }).setOrigin(0.5)
    );

    // Badge "Obtenidos X/Y" — de un vistazo, cuántos de los N mazos del
    // catálogo ya tiene el jugador. Mismo chrome dorado que el filo
    // interior de los botones, para que se lea como parte de la misma
    // familia visual y no como un elemento suelto.
    const counterY = height / 2 + 275;
    // QA de legibilidad (fontSize 12px -> 15px): a 130px "Obtenidos
    // 10/10" (el texto más largo posible, catálogo completo en español)
    // ya prácticamente llenaba el badge sin margen. Se ensancha a 160 —
    // es un elemento standalone centrado en `width / 2`, sin ningún
    // vecino con el que competir por espacio, así que no hay riesgo de
    // colisión al agrandarlo (a diferencia de los botones de fila, que
    // sí están apretados contra la grilla — ver createActionButton()).
    const counterWidth = 160;
    const counterHeight = 26;
    const counterBg = this.add.graphics();
    counterBg.fillStyle(PANEL_FILL, 0.9).fillRoundedRect(width / 2 - counterWidth / 2, counterY - counterHeight / 2, counterWidth, counterHeight, counterHeight / 2);
    counterBg.lineStyle(2, COLOR_GOLD, 0.7).strokeRoundedRect(width / 2 - counterWidth / 2, counterY - counterHeight / 2, counterWidth, counterHeight, counterHeight / 2);
    this.tabContainer.add(counterBg);

    this.deckCounterText = this.add
      .text(width / 2, counterY, '', { fontSize: '15px', fontFamily: 'Arial, sans-serif', fontStyle: 'bold', color: COLOR_GOLD_HEX })
      .setOrigin(0.5);
    this.tabContainer.add(this.deckCounterText);
    this.updateDeckCounter();

    DECK_SETUP_IDS.forEach((deckId, index) => {
      const column = Math.floor(index / DECK_ROWS_PER_COLUMN);
      const row = index % DECK_ROWS_PER_COLUMN;
      const y = height / 2 + DECK_FIRST_ROW_OFFSET_Y + 30 + row * DECK_ROW_SPACING_Y;
      const { textX, buttonX } = COLUMN_OFFSETS[column];
      this.renderDeckRow(deckId, textX, buttonX, y);
    });
  }

  /** Actualiza el badge "Obtenidos X/Y" — llamado al pintar el tab y cada vez que una fila se refresca (compra exitosa o cambio de idioma), así nunca queda desactualizado tras comprar un mazo. No-op si el tab activo no es "Mazos" (badge destruido, ver renderActiveTab()). */
  private updateDeckCounter(): void {
    if (!this.deckCounterText) return;
    const services = getServices(this);
    const ownedCount = services.progressionManager.getOwnedDeckIds().length;
    this.deckCounterText.setText(languageManager.getText('SHOP_DECKS_OWNED_COUNTER', { owned: ownedCount, total: DECK_SETUP_IDS.length }));
  }

  private renderDeckRow(deckId: DeckSetupId, textOffsetX: number, buttonOffsetX: number, y: number): void {
    // NOTA i18n: `definition.name` (nombre del mazo) también viene del
    // catálogo de dominio en español fijo — mismo caso que las mejoras,
    // señalado arriba en renderUpgradeRow().
    const definition = getDeckSetup(deckId);
    const cx = this.cameras.main.centerX;
    const textX = cx + textOffsetX;
    const buttonX = cx + buttonOffsetX;

    this.tabContainer.add(
      this.add
        .image(textX, y, `shop-cardback-${deckId}`)
        .setDisplaySize(46, 64)
        .setOrigin(0, 0.5)
    );

    this.tabContainer.add(
      this.add.text(textX + 60, y - 20, definition.name, {
        fontSize: '17px',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        color: '#ffffff'
      })
    );

    const statusText = this.add.text(textX + 60, y + 2, '', {
      fontSize: '15px',
      fontFamily: 'Arial, sans-serif',
      color: '#58a6ff'
    });
    this.tabContainer.add(statusText);

    const actionButton = this.createActionButton(buttonX, y, '', () => this.attemptPurchaseDeck(deckId, actionButton.text));
    this.tabContainer.add(actionButton.container);

    this.deckRowRefs.set(deckId, { statusText, actionButton });
    this.refreshDeckRow(deckId);
  }

  private attemptPurchaseDeck(deckId: DeckSetupId, buttonText: Phaser.GameObjects.Text): void {
    const services = getServices(this);
    const result = services.progressionManager.purchaseDeck(deckId);

    if (!result.success) {
      this.flashError(buttonText);
      return;
    }

    this.refreshDeckRow(deckId);
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
    this.paintButtonChrome(refs.actionButton.bg, refs.actionButton.glow, ACTION_BUTTON_WIDTH, ACTION_BUTTON_HEIGHT, owned ? COLOR_OWNED : COLOR_BUY);

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
    this.time.delayedCall(400, () => buttonText.setColor(originalColor));
  }
}