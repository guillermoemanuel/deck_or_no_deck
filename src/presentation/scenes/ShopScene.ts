import Phaser from 'phaser';
import { getServices } from '../GameServices';
import { getActiveSessionBridge } from '../ActiveSessionBridge';
import { SESSION_UPGRADE_CATALOG, SessionUpgradeId } from '../../domain/value-objects/SessionUpgradeCatalog';
import { SessionUpgrades } from '../../domain/entities/SessionUpgrades';
import { PurchaseSessionUpgradeUseCase } from '../../application/use-cases/PurchaseSessionUpgradeUseCase';
import { DECK_SETUP_IDS, DeckSetupId, getDeckSetup } from '../../domain/value-objects/DeckSetups';
import languageManager from '../../shared/i18n/LanguageManager';
import { TranslationKey } from '../../shared/i18n/LanguageData';
import { LocalizedText } from '../components/LocalizedText';

interface UpgradeRowRefs {
  readonly levelOrOwnedText: Phaser.GameObjects.Text;
  readonly button: Phaser.GameObjects.Rectangle;
  readonly buttonText: Phaser.GameObjects.Text;
}

interface DeckRowRefs {
  readonly statusText: Phaser.GameObjects.Text;
  readonly button: Phaser.GameObjects.Rectangle;
  readonly buttonText: Phaser.GameObjects.Text;
}

type ShopTab = 'upgrades' | 'decks';

// Layout en 2 columnas de 4 filas (8 upgrades de partida) — evita que el
// catálogo desborde el modal a medida que se agregan nuevas mejoras.
const ROWS_PER_COLUMN = 4;
const ROW_SPACING_Y = 105;
const FIRST_ROW_OFFSET_Y = -190;
const COLUMN_OFFSETS = [
  { textX: -450, buttonX: -90 },
  { textX: 20, buttonX: 380 }
] as const;

// Layout de mazos: 2 columnas x 3 filas (6 mazos en el catálogo actual).
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
 *   cuál usar vive en DeckSelectionScene; acá solo se compran.
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

  private upgradeRowRefs = new Map<SessionUpgradeId, UpgradeRowRefs>();
  private deckRowRefs = new Map<DeckSetupId, DeckRowRefs>();

  private sessionUpgrades: SessionUpgrades | null = null;
  private purchaseUpgradeUseCase: PurchaseSessionUpgradeUseCase | null = null;

  private upgradesTabBtn!: Phaser.GameObjects.Container;
  private decksTabBtn!: Phaser.GameObjects.Container;
  private upgradesTabLabel!: Phaser.GameObjects.Text;
  private decksTabLabel!: Phaser.GameObjects.Text;

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
    this.add
      .rectangle(width / 2, height / 2, 940, 600, 0x0d1117, 0.97)
      .setStrokeStyle(2, 0x30363d);

    new LocalizedText(this, width / 2, height / 2 - 270, 'SHOP_TITLE', {
      fontSize: '20px',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.add
      .text(width / 2 + 440, height / 2 - 270, '✕', { fontSize: '24px', color: '#ffffff' })
      .setInteractive({ useHandCursor: true })
      .on('pointerup', () => this.scene.stop());

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

  private renderTabButtons(): void {
    const cx = this.cameras.main.centerX;
    const y = this.cameras.main.centerY - 232;

    const upgrades = this.createTabButton(cx - 100, y, 'SHOP_TAB_UPGRADES', () => this.switchTab('upgrades'));
    const decks = this.createTabButton(cx + 100, y, 'SHOP_TAB_DECKS', () => this.switchTab('decks'));
    this.upgradesTabBtn = upgrades.container;
    this.decksTabBtn = decks.container;
    this.upgradesTabLabel = upgrades.label;
    this.decksTabLabel = decks.label;
    this.highlightActiveTabButton();
  }

  private createTabButton(
    x: number,
    y: number,
    labelKey: TranslationKey,
    onClick: () => void
  ): { container: Phaser.GameObjects.Container; label: Phaser.GameObjects.Text } {
    const bg = this.add.rectangle(0, 0, 160, 34, 0x21262d).setStrokeStyle(1, 0x30363d).setInteractive({ useHandCursor: true });
    const label = new LocalizedText(this, 0, 0, labelKey, {
      fontSize: '13px',
      fontFamily: 'Arial, sans-serif',
      color: '#8b949e'
    }).setOrigin(0.5);
    bg.on('pointerup', onClick);
    const container = this.add.container(x, y, [bg, label]);
    return { container, label };
  }

  private switchTab(tab: ShopTab): void {
    if (this.activeTab === tab) return;
    this.activeTab = tab;
    this.highlightActiveTabButton();
    this.renderActiveTab();
  }

  private highlightActiveTabButton(): void {
    [
      { btn: this.upgradesTabBtn, label: this.upgradesTabLabel, active: this.activeTab === 'upgrades' },
      { btn: this.decksTabBtn, label: this.decksTabLabel, active: this.activeTab === 'decks' }
    ].forEach(({ btn, label, active }) => {
      if (!btn) return;
      const bg = btn.list[0] as Phaser.GameObjects.Rectangle;
      bg.setFillStyle(active ? 0x30363d : 0x21262d);
      label.setColor(active ? '#ffffff' : '#8b949e');
    });
  }

  private renderActiveTab(): void {
    this.tabContainer.removeAll(true); // destruye el contenido del tab anterior
    this.upgradeRowRefs.clear();
    this.deckRowRefs.clear();

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
          { fontSize: '15px', fontFamily: 'Arial, sans-serif', color: '#8b949e', align: 'center' }
        ).setOrigin(0.5)
      );
      return;
    }

    this.tabContainer.add(
      new LocalizedText(this, width / 2, height / 2 - 200, 'SHOP_UPGRADES_CAPTION', {
        fontSize: '12px',
        fontFamily: 'Arial, sans-serif',
        color: '#8b949e'
      }).setOrigin(0.5)
    );

    SESSION_UPGRADE_CATALOG.forEach((definition, index) => {
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
        fontSize: '14px',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        color: '#ffffff'
      })
    );
    this.tabContainer.add(
      new LocalizedText(this, textX, y + 18, definition.description as TranslationKey, {
        fontSize: '11px',
        fontFamily: 'Arial, sans-serif',
        color: '#8b949e',
        wordWrap: { width: 260 }
      })
    );

    const levelOrOwnedText = this.add.text(textX, y + 58, '', {
      fontSize: '11px',
      fontFamily: 'Arial, sans-serif',
      color: '#58a6ff'
    });
    this.tabContainer.add(levelOrOwnedText);

    const button = this.add.rectangle(buttonX, y + 18, 150, 34, 0x238636).setInteractive({ useHandCursor: true });
    const buttonText = this.add
      .text(buttonX, y + 18, '', { fontSize: '12px', fontFamily: 'Arial, sans-serif' })
      .setOrigin(0.5);
    this.tabContainer.add(button);
    this.tabContainer.add(buttonText);

    button.on('pointerup', () => this.attemptPurchaseUpgrade(upgradeId, buttonText));

    this.upgradeRowRefs.set(upgradeId, { levelOrOwnedText, button, buttonText });
    this.refreshUpgradeRow(upgradeId);
  }

  private attemptPurchaseUpgrade(upgradeId: SessionUpgradeId, buttonText: Phaser.GameObjects.Text): void {
    if (!this.purchaseUpgradeUseCase) return;

    const result = this.purchaseUpgradeUseCase.execute(upgradeId);

    if (!result.success) {
      this.flashError(buttonText);
      return;
    }

    this.refreshUpgradeRow(upgradeId);
  }

  private refreshUpgradeRow(upgradeId: SessionUpgradeId): void {
    const refs = this.upgradeRowRefs.get(upgradeId);
    if (!refs || !this.sessionUpgrades) return;

    const status = this.upgradeStatusFor(upgradeId, this.sessionUpgrades);

    refs.levelOrOwnedText.setText(status.statusLabel);
    refs.buttonText.setText(status.buttonLabel);
    refs.button.setFillStyle(status.owned ? 0x30363d : 0x238636);

    if (status.owned) {
      refs.button.disableInteractive();
    } else {
      refs.button.setInteractive({ useHandCursor: true });
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
      new LocalizedText(this, width / 2, height / 2 - 200, 'SHOP_DECKS_CAPTION', {
        fontSize: '12px',
        fontFamily: 'Arial, sans-serif',
        color: '#8b949e'
      }).setOrigin(0.5)
    );

    DECK_SETUP_IDS.forEach((deckId, index) => {
      const column = Math.floor(index / DECK_ROWS_PER_COLUMN);
      const row = index % DECK_ROWS_PER_COLUMN;
      const y = height / 2 + DECK_FIRST_ROW_OFFSET_Y + 30 + row * DECK_ROW_SPACING_Y;
      const { textX, buttonX } = COLUMN_OFFSETS[column];
      this.renderDeckRow(deckId, textX, buttonX, y);
    });
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
        fontSize: '14px',
        fontFamily: 'Arial, sans-serif',
        fontStyle: 'bold',
        color: '#ffffff'
      })
    );

    const statusText = this.add.text(textX + 60, y + 2, '', {
      fontSize: '11px',
      fontFamily: 'Arial, sans-serif',
      color: '#58a6ff'
    });
    this.tabContainer.add(statusText);

    const button = this.add.rectangle(buttonX, y, 150, 34, 0x238636).setInteractive({ useHandCursor: true });
    const buttonText = this.add.text(buttonX, y, '', { fontSize: '12px', fontFamily: 'Arial, sans-serif' }).setOrigin(0.5);
    this.tabContainer.add(button);
    this.tabContainer.add(buttonText);

    button.on('pointerup', () => this.attemptPurchaseDeck(deckId, buttonText));

    this.deckRowRefs.set(deckId, { statusText, button, buttonText });
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
    refs.buttonText.setText(owned ? ownedLabel : languageManager.getText('SHOP_BUY_BUTTON', { price: priceText }));
    refs.button.setFillStyle(owned ? 0x30363d : 0x238636);

    if (owned) {
      refs.button.disableInteractive();
    } else {
      refs.button.setInteractive({ useHandCursor: true });
    }
  }

  private flashError(buttonText: Phaser.GameObjects.Text): void {
    const originalColor = buttonText.style.color;
    buttonText.setColor('#e74c3c');
    this.time.delayedCall(400, () => buttonText.setColor(originalColor));
  }
}
