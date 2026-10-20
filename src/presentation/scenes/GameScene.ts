import Phaser from 'phaser';
import { CardView } from '../components/CardView';
import { OnboardingCoach } from '../components/OnboardingCoach';
import { OnboardingFlow, OnboardingAction } from '../../application/onboarding/OnboardingFlow';
import { EnergyBarView } from '../components/EnergyBarView';
import { GameSceneController } from '../controllers/GameSceneController';
import { OpenCardUseCase } from '../../application/use-cases/OpenCardUseCase';
import { ResolveDealUseCase } from '../../application/use-cases/ResolveDealUseCase';
import { SwapSecretCardUseCase } from '../../application/use-cases/SwapSecretCardUseCase';
import { ReviveWithAdUseCase } from '../../application/use-cases/ReviveWithAdUseCase';
import { PurchaseSessionUpgradeUseCase } from '../../application/use-cases/PurchaseSessionUpgradeUseCase';
import { SwapFinalSecretCardUseCase } from '../../application/use-cases/SwapFinalSecretCardUseCase';
import { SimpleEventEmitter } from '../../shared/utils/EventEmitter';
import { GameEvent } from '../../domain/events/GameEvents';
import { createGameSessionWithSelection } from '../../application/factories/GameSessionFactory';
import { getServices } from '../GameServices';
import { setActiveSessionBridge, clearActiveSessionBridge } from '../ActiveSessionBridge';
import { activateGameAbandonGuard, deactivateGameAbandonGuard } from '../GameAbandonGuard';
import { ParticleManager } from '../components/ParticleManager';
import { PayoutBoardView } from '../components/PayoutBoardView';
import { CASE_VALUES } from '../../domain/value-objects/CaseValues';
import { createDailyBankerRandom, generateDailyBoardValues, getUtcDateKey } from '../../domain/value-objects/DailyBoard';
import { consumeGameMode } from '../GameMode';
import { setPenaltyFreeSession } from '../GameAbandonGuard';
import { createPenaltyFreeProgression } from '../PenaltyFreeProgression';
import { GameResultTracker } from '../../application/records/GameResultTracker';
import { FirstRoundDealStreakTracker } from '../../application/records/FirstRoundDealStreakTracker';
import { RecordFirstRoundDealOutcomeUseCase } from '../../application/use-cases/RecordFirstRoundDealOutcomeUseCase';
import { FirstRoundDealStreak } from '../../domain/value-objects/FirstRoundDealStreak';
import { LocalizedText } from '../components/LocalizedText';
import { IAudioService } from '../../domain/ports/IAudioService';
import { getDeckSetup } from '../../domain/value-objects/DeckSetups';
import { Card } from '../../domain/entities/Card';
import { SpotlightSweepEffect } from '../effects/deck-celebrations/SpotlightSweepEffect';
import { getDeckCelebrationEffect } from '../effects/deck-celebrations/DeckCelebrationEffectRegistry';
import {
  CardPositionSource,
  hasCardPositionSource,
  getGameObjectGlobalPosition
} from '../effects/deck-celebrations/DeckCelebrationEffect';
import { bindKeys } from '../input/KeyBindings';
import { FocusDirection, FocusItem, nextFocusIndex } from '../input/KeyboardNavigation';

/**
 * GameScene: Escena principal del juego.
 *
 * Flujo de partida AAA:
 * 1. Fase Inicial: El jugador elige libremente su Carta Secreta entre 13 cartas iniciales.
 * 2. Transición fluida: La carta elegida viaja al pedestal y las 12 restantes se ordenan en el tablero 4x3.
 * 3. Layout responsivo sin solapamiento con la barra de energía HUD.
 * 4. Gestión de clímax final y eventos de mitad de juego secuenciados.
 */
export class GameScene extends Phaser.Scene implements CardPositionSource {
  private controller: GameSceneController | null = null;
  private particleManager!: ParticleManager;
  private selectionBanner: Phaser.GameObjects.Container | null = null;
  // Clean Architecture: la escena solo conoce el PUERTO (IAudioService),
  // nunca la clase concreta de infraestructura. La instancia real la
  // provee el Composition Root (main.ts) vía GameServices/registry — ver
  // getServices() más abajo.
  private audioService!: IAudioService;
  // Estrategia SIEMPRE reproducida al revelar la carta de mayor valor,
  // sin importar el mazo activo — ver playTopValueCardCelebration() y el
  // comentario de clase en SpotlightSweepEffect. Instancia única y
  // reutilizable: la estrategia no guarda estado propio entre reproducciones.
  private readonly spotlightEffect = new SpotlightSweepEffect();
  // Fecha (UTC, `YYYY-MM-DD`) del Desafío Diario si esta partida es una, o
  // `null` en una partida normal. Se decide UNA vez en create() (ver
  // consumeGameMode) y de ahí se deriva tanto el tablero como si esta
  // partida queda exenta de la penalización por derrota/abandono.
  private dailyDateKey: string | null = null;

  // --- Teclado PC (Fase 3 — partida) ---------------------------------------
  // Cartas navegables con flechas en la fase actual: primero las 13 de la
  // selección de carta secreta, y tras elegir, las 12 del tablero en orden
  // row-major. Fuera de esas fases queda vacío y el foco es inerte.
  private kbFocusViews: CardView[] = [];
  private kbFocusIndex = -1;
  // Desuscripción de bindKeys — se resuelve en el SHUTDOWN de create().
  private unsubscribeKeys: (() => void) | null = null;

  constructor() {
    super({ key: 'GameScene' });
  }

  getController(): GameSceneController | null {
    return this.controller;
  }

  /**
   * Implementación de CardPositionSource: calcula la posición real en pantalla
   * de una carta (coordenadas globales del canvas), sea del tablero general o
   * la Carta Secreta en el pedestal. Si la partida finalizó y ResultScene está
   * activa, redirige a la posición de la Carta Secreta en la pantalla de victoria.
   */
  getCardScreenPosition(cardId: string): { x: number; y: number } | null {
    if (this.scene.isActive('ResultScene')) {
      const resultScene = this.scene.get('ResultScene');
      if (resultScene && hasCardPositionSource(resultScene)) {
        const resultPos = resultScene.getCardScreenPosition(cardId);
        if (resultPos) return resultPos;
      }
    }

    if (!this.controller) {
      return null;
    }

    const boardCard = this.controller.getCardView(cardId);
    if (boardCard) {
      return getGameObjectGlobalPosition(boardCard);
    }

    const secretCard = this.controller.getSecretCardView();
    if (
      secretCard &&
      (secretCard.getCardId() === cardId ||
        this.controller.isSecretCard(cardId) ||
        !this.controller.hasBoardCard(cardId))
    ) {
      return getGameObjectGlobalPosition(secretCard);
    }

    return null;
  }

  create(): void {
    const services = getServices(this);

    // BUGFIX (gameplayStart/Stop mal ubicados): antes se llamaba
    // reportGameplayStart() UNA sola vez, al cargar el script entero
    // (ver main.ts), mucho antes de que existiera el menú, la selección
    // de mazo o esta escena — CrazyGames documenta que este evento "debe
    // dispararse cuando el jugador entra en un estado jugable, excluyendo
    // menús y pasos de carga adicionales", y además lo usan para medir el
    // tamaño de descarga inicial real. Acá, al entrar a GameScene (el
    // jugador ya está eligiendo su carta secreta — eso es gameplay real,
    // no un menú), es el punto correcto. El cierre simétrico
    // (reportGameplayStop) está en el SHUTDOWN de más abajo — se dispara
    // tanto al reiniciar una partida (ResultScene.restartGame() →
    // scene.restart()) como al salir al menú (UIScene.exitToMainMenu()),
    // cubriendo ambas transiciones sin tocar esas dos escenas.
    services.crazyGamesService.reportGameplayStart();

    this.particleManager = new ParticleManager(this);
    // BUGFIX (bug_fix_audio_lifecycle): ya NO se crea `new AudioManager(this)`
    // por escena — se reutiliza la ÚNICA instancia de AudioService que vive
    // en el Composition Root. Esto es lo que permite que ResultScene (u otra
    // escena cualquiera) pueda detener efectivamente la música que arrancó
    // acá, porque ambas hablan con el mismo objeto.
    this.audioService = services.audioService;
    const { width, height } = this.cameras.main;

    //background
    const backdrop = this.add.image(width / 2, height / 2, 'backdrop');
    backdrop.setDisplaySize(width, height).setAlpha(0.68).setDepth(-10);
    this.add.rectangle(width / 2, height / 2, width, height, 0x061018, 0.34).setDepth(-9);

    //Energy Bar
    const energyBar = new EnergyBarView(this, 490, 32);
    energyBar.setPercentage(50);
    
    // Pedestal para la Carta Secreta en el lateral derecho
    const pedestalX = width - 155;
    const pedestalY = height / 2 + 25;
    this.createSecretCardPedestal(pedestalX, pedestalY);

    // Un resumen de la partida ANTERIOR no debe filtrarse a esta ResultScene
    // (p. ej. "Jugar de nuevo" reinicia esta misma escena con `scene.restart()`).
    this.registry.remove('lastGameSummary');

    // Desafío Diario: MainMenuScene deja el pedido en el registry (ver
    // GameMode.ts) antes de entrar acá; `consumeGameMode` lo retira y, si el
    // pedido quedó "viejo" (la partida se demoró hasta pasada la medianoche
    // UTC), cae sola a partida normal para no completar el día equivocado.
    const todayKey = getUtcDateKey(Date.now());
    const mode = consumeGameMode(this.registry, todayKey);
    this.dailyDateKey = mode.mode === 'daily' ? mode.dateKey : null;

    // Generar los 13 valores monetarios de la partida: el mismo tablero para
    // todo el mundo si es el Desafío Diario de hoy, o al azar en partida normal.
    const values =
      this.dailyDateKey !== null ? generateDailyBoardValues(this.dailyDateKey) : services.randomProvider.generateBoardValues();

    if (this.dailyDateKey !== null) {
      services.outcomeRecorder.startDaily(this.dailyDateKey);
    }
    // Decisión de diseño: el Desafío Diario NO castiga con la penalización de
    // -1000 monedas por derrota ni por abandonar (cerrar la pestaña) — ver
    // PenaltyFreeProgression.ts y GameAbandonGuard.setPenaltyFreeSession.
    // Sí paga su recompensa igual si se pierde: es una invitación diaria a
    // volver, no un desafío punitivo. Las partidas NORMALES no cambian.
    setPenaltyFreeSession(this.registry, this.dailyDateKey !== null);

    //Color del numero de posicion del reverso
    const numberColor = getDeckSetup(services.progressionManager.getSelectedDeckId()).numberColor;

    //Color GlowBorder Selección de Carta
    const glowBorderSelect = getDeckSetup(services.progressionManager.getSelectedDeckId()).glowBorder;

    // Teclado PC (Fase 3): Phaser REUSA la MISMA instancia de la escena en
    // cada restart/start (SceneManager.start → sys.shutdown + sys.start
    // sobre el mismo objeto), de modo que `controller` seguía apuntando a la
    // partida ANTERIOR con su estado `cardsLocked = true` de fin de partida
    // — sin anularlo, los guards de flechas/Enter del teclado (areCardsLocked
    // / isSwapModalOpen) bloquearían la selección de la carta secreta apenas
    // se reinicia. En la Fase 1 todavía no existe controller: este reset
    // devuelve la escena al mismo estado que la primera partida.
    this.controller = null;

    // Iniciar Fase 1: Selección de carta secreta por el jugador
    this.startSecretCardSelectionPhase(values, pedestalX, pedestalY, energyBar, numberColor, glowBorderSelect);

    //Musica de fondo
    this.playMusic('music_gameplay');

    // --- Teclado PC (Fase 3 — partida) -------------------------------------
    // Las 4 flechas se capturan para que no scrolleen la página del browser
    // (el canvas es fijo 1280×720 y no hay scroll propio que perder — mismo
    // criterio que la captura de ↑/↓ de MainMenuScene).
    this.input.keyboard?.addCapture(['UP', 'DOWN', 'LEFT', 'RIGHT']);
    // Los handlers van como MISMA referencia (el objeto literal se crea una
    // sola vez acá) para que el unsubscribe de SHUTDOWN desenganche de verdad
    // (AGENTS §5 — bindKeys registra/`off` los pares exactos).
    this.unsubscribeKeys = bindKeys(this.input.keyboard, {
      UP: (event?: KeyboardEvent) => this.handleFocusArrow(event, 'up'),
      DOWN: (event?: KeyboardEvent) => this.handleFocusArrow(event, 'down'),
      LEFT: (event?: KeyboardEvent) => this.handleFocusArrow(event, 'left'),
      RIGHT: (event?: KeyboardEvent) => this.handleFocusArrow(event, 'right'),
      ENTER: (event?: KeyboardEvent) => this.activateFocusedCard(event),
      // Fase 5 (teclado PC): ESC = NO TRATO cuando la oferta del banquero
      // está en pantalla, o declinar el intercambio cuando SwapEventModal
      // está abierto (Fase 7g-2); sin nada de eso es no-op, ver
      // handleOfferEscapeKey. Baja del teclado: NO hace falta nada extra —
      // el unsubscribeKeys de SHUTDOWN recorre TODO este objeto literal con
      // las mismas referencias.
      ESC: (event?: KeyboardEvent) => this.handleOfferEscapeKey(event)
    });

    // BUGFIX (bug_fix_audio_lifecycle) — requisito (a): red de seguridad a
    // nivel de ciclo de vida de Phaser. Sin importar la vía por la que esta
    // escena se cierre (salida al menú, reinicio de partida, o cualquier
    // transición futura que alguien agregue y se olvide de tocar audio),
    // garantizamos que la BGM de ESTA partida no quede sonando "huérfana".
    // Se usa `once` + SHUTDOWN (no DESTROY): SHUTDOWN se dispara tanto al
    // detener la escena como al reiniciarla (scene.restart()), que es
    // exactamente cuando puede haber una pista vieja para limpiar; DESTROY
    // solo ocurre si la escena se remueve del Scene Manager por completo,
    // lo cual no pasa en este juego.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      // Teclado PC (Fase 3): desuscripción con la MISMA referencia (`?.`
      // guarda contra un plugin de teclado que ya no existe, mismo criterio
      // que los `off` del resto de la escena) + quita de la captura de
      // flechas.
      this.unsubscribeKeys?.();
      this.unsubscribeKeys = null;
      // `removeCapture` es GLOBAL a nivel juego (documentado en el
      // KeyboardManager de Phaser): bajar ↑/↓/←/→ acá también le afecta al
      // menú, pero MainMenuScene re-agrega SU captura de ↑/↓ al recrearse y,
      // en todas las salidas a menú, el stop de GameScene se cola ANTES del
      // start de MainMenuScene (ver UIScene.exitToMainMenu y
      // ResultScene.exitToMainMenu), así que nunca se pierde.
      this.input.keyboard?.removeCapture(['UP', 'DOWN', 'LEFT', 'RIGHT']);
      // B1 (review): NO clearKbFocus() acá — el DisplayList destruye los
      // game objects ANTES que este handler (se registra en el START), y
      // setKeyboardFocus(false) sobre una CardView destruida toca
      // this.scene === undefined → TypeError que ABORTA el resto de la
      // limpieza de SHUTDOWN (música, puente de sesión, guard de abandono).
      // El glow muere con los objetos: basta resetear el estado (igual que
      // MainMenuScene limpia focusEntries sin resaltar nada).
      this.kbFocusViews = [];
      this.kbFocusIndex = -1;
      this.audioService.stopMusic(0);
      // Cierre simétrico de reportGameplayStart() (ver arriba) — se
      // dispara sin importar POR QUÉ se cierra esta escena (reinicio de
      // partida o salida al menú), mismo criterio "red de seguridad de
      // ciclo de vida" que ya se aplicaba acá para la música.
      services.crazyGamesService.reportGameplayStop();
    });
  }

  private startSecretCardSelectionPhase(
    values: number[],
    pedestalX: number,
    pedestalY: number,
    energyBar: EnergyBarView,
    numberColor: string,
    glowBorderSelect: number
  ): void {
    const { width } = this.cameras.main;

    // Banner de instrucción inicial — QA de legibilidad (fontSize del
    // subtítulo 13px -> 16px): a 580px, "Selecciona una de las 13
    // cartas para guardarlas en tu pedestal" (la variante más larga)
    // quedaba con muy poco margen o directamente se salía del fondo.
    // Se ensancha a 680px; sigue centrado y entra cómodo en el canvas de
    // 1280 de ancho.
    const bannerBg = this.add
      .rectangle(0, 0, 680, 52, 0x0a0f1d, 0.95)
      .setStrokeStyle(2, 0xffaa00);

    const bannerTitle = new LocalizedText(this, 0, -10, 'SECRET_CARD_SELECTION_TITLE', {
      fontSize: '18px',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      color: '#ffcc00'
    }).setOrigin(0.5);

    const bannerSub = new LocalizedText(this, 0, 12, 'SECRET_CARD_SELECTION_SUBTITLE', {
      fontSize: '16px',
      fontFamily: 'Arial, sans-serif',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.selectionBanner = this.add.container(width / 2, 105, [bannerBg, bannerTitle, bannerSub]);

    // Renderizar las 13 cartas repartidas para que el jugador elija
    const initialViews: CardView[] = [];
    const cols = 7;
    const startX = (width - 250 - (cols * 105)) / 2 + 60;

    values.forEach((_, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = startX + col * 108;
      const y = 230 + row * 160;

      const view = new CardView(this, x, y, `card_${index}`, this.audioService, this.particleManager, index + 1, numberColor, glowBorderSelect);
      // BUGFIX (bug_card_focus): setBaseScale() en vez de setScale() directo
      // — registra 0.82 como la escala "de reposo" real de esta carta, para
      // que el hover (CardView.setupInteractivity) sepa a qué valor volver
      // exactamente al quitar el foco, en vez de saltar a un 1.0 fijo.
      view.setBaseScale(0.82);
      initialViews.push(view);

      view.once('card-clicked', () => {
        // Remover el listener de selección de TODAS las cartas de inmediato
        initialViews.forEach(v => v.removeAllListeners('card-clicked'));
        this.onSecretCardChosen(index, initialViews, values, pedestalX, pedestalY, energyBar);
      });
    });

    // Teclado PC (Fase 3): mientras dura la elección, ↑/↓/←/→ navegan estas
    // 13 cartas. `initialViews` es local a este método — el estado de foco
    // guarda su propia COPIA para no depender del alcance de la closure. El
    // índice arranca en -1 (ENTER queda inerte hasta la primera flecha);
    // clearKbFocus() del SHUTDOWN garantiza el -1 en cada reingreso.
    this.kbFocusViews = [...initialViews];
  }

  private onSecretCardChosen(
    chosenIndex: number,
    initialViews: CardView[],
    values: number[],
    pedestalX: number,
    pedestalY: number,
    energyBar: EnergyBarView
  ): void {
    const services = getServices(this);
    const eventBus = new SimpleEventEmitter<GameEvent>();

    // Ocultar banner de selección
    if (this.selectionBanner) {
      this.selectionBanner.destroy();
      this.selectionBanner = null;
    }

    const chosenCardView = initialViews[chosenIndex];

    // Desactivar interactividad y asegurar que ningún listener previo quede activo
    initialViews.forEach(v => {
      v.removeAllListeners('card-clicked');
      v.setLocked(true);
    });

    // Animación de la carta elegida viajando hacia el pedestal
    this.tweens.add({
      targets: chosenCardView,
      x: pedestalX,
      y: pedestalY,
      scale: 0.9,
      duration: 500,
      ease: 'Cubic.easeInOut',
      onComplete: () => {
        chosenCardView.setLocked(true);
        // BUGFIX (bug_card_focus): registra 0.9 como escala de reposo del
        // pedestal — sin esto, el primer hover sobre la carta secreta la
        // dejaba fija en 1.0 (más grande que el resto del layout) al salir.
        chosenCardView.setBaseScale(0.9);
        this.particleManager.emitVictoryBurst(pedestalX, pedestalY);
      }
    });

    // Crear la sesión de juego en el Dominio con la elección del jugador.
    // Ruido de la oferta del Banquero (ADR-013): generador FRESCO por
    // sesión — en el Desafío Diario todos reciben las mismas muestras
    // (misma fecha → misma secuencia), en partida normal muestras nuevas
    // del crypto provider. Nunca Math.random() en el dominio.
    const offerRandom =
      this.dailyDateKey !== null
        ? createDailyBankerRandom(this.dailyDateKey)
        : () => services.randomProvider.nextFloat();
    // Regla anti-farmeo (ADR-014): en partida normal se lee el estado
    // persistido para que la factory sorteé el cap de la 1ª ronda si está
    // activo (y consuma UNA muestra extra solo en ese caso). El Desafío
    // Diario queda EXCLUIDO: recibe INACTIVE aunque el jugador esté
    // topado, así la secuencia de ruido sigue siendo idéntica entre todos.
    const firstRoundDealStreak =
      this.dailyDateKey !== null ? FirstRoundDealStreak.INACTIVE : services.progressionManager.getFirstRoundDealStreak();
    const session = createGameSessionWithSelection(values, chosenIndex, offerRandom, firstRoundDealStreak);

    // En el Desafío Diario, TODOS los use-cases que tocan monedas/penalidades
    // reciben esta versión "sin castigo" en vez del servicio real (ver
    // createPenaltyFreeProgression) — sigue pagando premios y upgrades
    // normalmente, solo `applyLossPenalty()` queda anulado.
    const progressionForSession =
      this.dailyDateKey !== null ? createPenaltyFreeProgression(services.progressionManager) : services.progressionManager;

    // Use cases
    const openCardUseCase = new OpenCardUseCase(session, eventBus, progressionForSession);
    const resolveDealUseCase = new ResolveDealUseCase(session, progressionForSession, eventBus);
    const swapSecretCardUseCase = new SwapSecretCardUseCase(session, eventBus);
    // `progressionForSession` (no `services.progressionManager` directo):
    // necesario para el caso límite de "victoria inmediata al revivir" con
    // el tablero ya vacío (ver ReviveWithAdUseCase/GameSession), que
    // acredita el premio — en el Desafío Diario eso debe pasar por la
    // versión sin penalización, igual que el resto de los use-cases de
    // esta partida.
    const reviveWithAdUseCase = new ReviveWithAdUseCase(session, services.crazyGamesService, eventBus, progressionForSession);
    const swapFinalSecretCardUseCase = new SwapFinalSecretCardUseCase(session, progressionForSession, eventBus);
    // services.crazyGamesService: la compra consulta el puerto de ads —
    // si la mejora depende de un rewarded y hoy no hay, se rechaza sin
    // cobrar (ads_unavailable) en vez de vender algo que no se puede usar.
    const purchaseSessionUpgradeUseCase = new PurchaseSessionUpgradeUseCase(session, progressionForSession, eventBus, services.crazyGamesService);

    // Suscripción INDEPENDIENTE de GameSceneController.handleEvent(): el
    // festejo de "carta de mayor valor revelada" es puramente cosmético y
    // no participa de la orquestación de estado de la partida (ofertas,
    // energía, transición a ResultScene, etc.), así que no tiene por qué
    // vivir en ese switch central — SimpleEventEmitter admite múltiples
    // suscriptores independientes sin que se pisen entre sí.
    const unsubscribeTopValueCelebration = eventBus.subscribe(event => {
      if (event.type === 'TopValueCardRevealed') {
        this.playTopValueCardCelebration(event.card);
      }
    });

    // Puente para que ShopScene (una escena distinta, superpuesta) pueda
    // leer/comprar los upgrades de ESTA partida sin que GameSceneController
    // ni GameSession dependan de Phaser — ver ActiveSessionBridge.
    setActiveSessionBridge(this, { session, purchaseSessionUpgradeUseCase });

    // Sistema Anti-Cheat / penalización por abandono: la GameSession real
    // recién nace ahora (arriba), así que es acá — no antes, durante la
    // sola selección de las 13 cartas — donde empieza a existir algo que
    // abandonar. Ver GameAbandonGuard.ts para el ciclo de vida completo
    // (quién lo desactiva al resolverse la partida y quién lo reactiva
    // tras un revive).
    activateGameAbandonGuard(this.registry);

    // Distribuir las 12 cartas restantes en el tablero de 4x3 con espacio vertical generoso
    const { width } = this.cameras.main;
    const boardCols = 4;
    const cardWidth = 110;
    const cardHeight = 154;
    const gapX = 35;
    const gapY = 22;

    const totalGridWidth = boardCols * cardWidth + (boardCols - 1) * gapX;
    const boardStartX = (width - totalGridWidth) / 2 - 85;
    const boardStartY = 190; // Margen superior suficiente (evita solaparse con el HUD superior, y=32)

    const boardCardViews = new Map<string, CardView>();
    let boardIndex = 0;

    initialViews.forEach((view, idx) => {
      if (idx === chosenIndex) return;

      const cardId = `card_${idx}`;
      const col = boardIndex % boardCols;
      const row = Math.floor(boardIndex / boardCols);
      const targetX = boardStartX + col * (cardWidth + gapX);
      const targetY = boardStartY + row * (cardHeight + gapY);

      // Desplazamiento fluido hacia su posición final en el tablero
      this.tweens.add({
        targets: view,
        x: targetX,
        y: targetY,
        scale: 0.88,
        duration: 450,
        ease: 'Cubic.easeOut',
        onComplete: () => {
          view.setLocked(false);
          // BUGFIX (bug_card_focus): registra 0.88 como escala de reposo de
          // esta carta ya ubicada en el tablero — necesario porque el tween
          // de arriba anima `scale` directamente (Phaser tween del propio
          // Container), sin pasar por setBaseScale(); si no lo hacemos aquí,
          // el hover seguiría usando initialScale = 1 (valor por defecto) y
          // la carta quedaría agrandada tras el primer hover.
          view.setBaseScale(0.88);
        }
      });

      boardCardViews.set(cardId, view);
      boardIndex++;
    });

    // Teclado PC (Fase 3): la elección terminó — el foco sale de la grilla
    // de selección (apaga cualquier highlight encendido y deja el índice en
    // -1) y pasa a las 12 cartas del tablero. La copia de `boardCardViews`
    // (que además es local a este método) preserva el orden de inserción,
    // es decir el orden row-major recién armado; la carta secreta del
    // pedestal queda FUERA del foco porque es locked y no es navegable.
    this.clearKbFocus();
    this.kbFocusViews = [...boardCardViews.values()];

    // Panel lateral "Valores en juego": ayuda de memoria con los 13 montos
    // posibles en orden descendente, que se van marcando a medida que se
    // revelan (abrir carta, intercambio de mitad de juego, o carta secreta
    // final). Ubicado en la columna izquierda, libre de superposiciones
    // tanto con el tablero (arranca en boardStartX ~282) como con la barra
    // de energía (ahora centrada arriba, ver bug_energy_bar_layout).
    const payoutBoard = new PayoutBoardView(this, 95, 175, CASE_VALUES);

    // Onboarding contextual: consejos breves en el momento exacto en que
    // hacen falta (abrir carta → energía → banquero). Solo se muestran la
    // primera vez y se pueden omitir; la guía completa sigue disponible en
    // "Cómo jugar" desde el menú.
    const unsubscribeOnboarding = this.setupOnboarding(eventBus);
    const unsubscribeOutcomeRecording = this.setupOutcomeRecording(eventBus);

     // Contador inicial (REQ transparencia de mecánicas): recién ACÁ existe
    // una GameSession real — antes de esto (fase de elegir la Carta
    // Secreta) no hay "próxima oferta" de la que hablar todavía. Se
    // deriva del dominio (nunca se hardcodea "3" acá) para que, si algún
    // día cambia el intervalo de ofertas en Banker.ts, esto no quede
    // desactualizado.
    energyBar.setBankerOfferCountdown(session.getCardsUntilNextBankerOffer());

    // Iniciar el controlador con la carta secreta en el pedestal
    this.controller = new GameSceneController(
      this,
      boardCardViews,
      chosenCardView,
      energyBar,
      openCardUseCase,
      resolveDealUseCase,
      swapSecretCardUseCase,
      reviveWithAdUseCase,
      session,
      swapFinalSecretCardUseCase,
      eventBus,
      this.particleManager,
      payoutBoard,
      this.audioService
    );

    // Al terminar la escena (nueva partida, o salida al menú), el puente
    // hacia esta sesión deja de ser válido — evita que ShopScene intente
    // operar sobre una GameSession ya descartada. Se desactiva también el
    // guard de abandono como red de seguridad simétrica: aunque los 3
    // eventos terminales ya lo desactivan explícitamente (ver
    // GameAbandonGuard.ts), esto evita que quede en `true` de forma
    // huérfana si la escena se cierra por cualquier otra vía futura.
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      clearActiveSessionBridge(this);
      deactivateGameAbandonGuard(this.registry);
      unsubscribeTopValueCelebration();
      unsubscribeOnboarding();
      unsubscribeOutcomeRecording();
    });
  }

  /**
   * Teclado PC (Fase 3): navega el foco con ↑/↓/←/→ sobre las cartas de la
   * fase actual usando el núcleo puro de KeyboardNavigation (sin sonido al
   * mover). La geometría sale de las MISMAS vistas (v.x/v.y), así que la
   * grilla de selección y el tablero 4x3 navegan sin layout propio.
   *
   * El auto-repeat del sistema operativo re-emite `keydown` cada ~30 ms con
   * una tecla mantenida — sin ignorar `repeat` el foco saltaría en tromba y
   * acumularía tweens; solo se navega en la pulsación inicial.
   */
  private handleFocusArrow(event: KeyboardEvent | undefined, direction: FocusDirection): void {
    if (event?.repeat) return;
    // Fase 7g: con el panel del banquero en pantalla las flechas navegan
    // DEAL / NO DEAL (posicionamiento absoluto con foco inicial NO TRATO) —
    // se intercepta ANTES del guard de swap/locked porque durante la oferta
    // areCardsLocked es true y las flechas caerían inertes. Durante el
    // delay de 1800 ms previo al panel isBankerOfferOpen es false → cae al
    // guard normal, que es el comportamiento correcto.
    if (this.controller?.isBankerOfferOpen()) {
      this.controller.moveBankerOfferFocus(direction);
      return;
    }
    // Modal de intercambio abierto (Fase 7g-2): las flechas navegan
    // Mantener / Cambiar DENTRO del propio modal — misma razón que la rama
    // de oferta de arriba: se intercepta ANTES del guard de swap/locked
    // porque ese guard es true justamente cuando ESTE modal está en pantalla
    // (y con las cartas bloqueadas), y las flechas caerían inertes.
    if (this.controller?.isSwapModalOpen()) {
      this.controller.moveSwapModalFocus(direction);
      return;
    }
    // Modal de intercambio abierto o ventana del banquero/endurecimiento en
    // pantalla: el tablero está fuera de servicio y el modal maneja sus
    // propios controles. Sin controller (fase de selección de la carta
    // secreta) no aplica: ahí todavía no existe tablero que bloquear.
    if (this.controller && (this.controller.isSwapModalOpen() || this.controller.areCardsLocked())) return;
    if (this.hasActiveOverlayScene()) return;

    const previousIndex = this.kbFocusIndex;
    this.kbFocusIndex = nextFocusIndex(this.kbFocusItems(), this.kbFocusIndex, direction);
    // Sin cambio de índice (borde del tablero, o sin cartas habilitadas):
    // no se toca ningún resaltado.
    if (this.kbFocusIndex === previousIndex) return;
    if (previousIndex >= 0) this.kbFocusViews[previousIndex]?.setKeyboardFocus(false);
    this.kbFocusViews[this.kbFocusIndex]?.setKeyboardFocus(true);
  }

  /**
   * Teclado PC (Fase 3): ENTER activa la carta enfocada emitiendo el MISMO
   * 'card-clicked' del pointerup de CardView — así el handler del controller
   * (bindCardClicks) decide la rama (apertura o selección de swap) y el
   * listener `once` de la fase de selección recibe el emit sin cambios.
   */
  private activateFocusedCard(event?: KeyboardEvent): void {
    if (event?.repeat) return;
    // Fase 5 (teclado PC): con ResultScene/ads/tienda encima NADA de la
    // partida responde al teclado — ni cartas ni el TRATO del banquero.
    // El guard de overlay va PRIMERO como defensa en profundidad: hoy el
    // panel no coexiste con un overlay (se destruye al aceptar/rechazar y
    // la tienda/anuncios pausan GameScene), pero el orden no debe depender
    // de que eso siga siendo cierto.
    if (this.hasActiveOverlayScene()) return;
    // Mientras el panel del banquero está en pantalla ENTER activa el
    // botón ENFOCADO (Fase 7g: foco inicial NO TRATO, flechas para
    // reposicionar; ENTER sin mover las flechas rechaza, que es la
    // acción segura) — se intercepta ANTES del guard de swap/locked
    // porque durante la oferta areCardsLocked es true y ENTER caería
    // siendo inerte. Durante el delay de 1800 ms previo al panel el
    // panel todavía no existe (isBankerOfferOpen false) → cae al
    // guard normal de locked → inerte, que es el comportamiento correcto.
    if (this.controller?.isBankerOfferOpen()) {
      this.controller.activateBankerOfferFocus();
      return;
    }
    // Modal de intercambio abierto (Fase 7g-2): ENTER activa el botón
    // enfocado (foco inicial "Mantener"; con sonido de click, paridad con el
    // ratón) — se intercepta ANTES del guard de swap/locked por la misma
    // razón que las flechas: ese guard es true justamente con este modal en
    // pantalla y ENTER caería inerte.
    if (this.controller?.isSwapModalOpen()) {
      this.controller.activateSwapModal();
      return;
    }
    if (this.controller && (this.controller.isSwapModalOpen() || this.controller.areCardsLocked())) return;
    if (this.kbFocusIndex < 0) return; // nada enfocado → ENTER inerte
    const view = this.kbFocusViews[this.kbFocusIndex];
    // Carta revelada o bloqueada: ENTER no debe reabrirla ni colarse por
    // encima de un estado que el puntero ni siquiera podría clickear.
    if (!view || view.isCardOpen() || view.isLocked()) return;
    view.emit('card-clicked', view.getCardId());
  }

  /**
   * Fase 5 (teclado PC): ESC = NO TRATO — rechaza la oferta del banquero
   * con la MISMA cadena que el click de ratón sobre NO DEAL, pero SOLO si
   * el panel está en pantalla.
   *
   * Fase 7g-2: con el modal de intercambio abierto, ESC declina el cambio
   * (Mantener) por la MISMA cadena que su botón, también SIN sonido (la rama
   * va ANTES del guard de oferta para que funcione aunque hoy no coexistan
   * ambos modales). Sin oferta ni modal de intercambio, ESC en la partida es
   * no-op (no se inventa una salida a menú ni un menú nuevo).
   *
   * Colisión con UIScene verificada como SEGURO (causa raíz): todo modal que
   * UIScene cierra con ESC (modal de salida / bono periódico) o la tienda
   * PAUSA GameScene — con la escena pausada su plugin de teclado no emite
   * keydown (KeyboardPlugin.isActive exige scene.sys.canInput()) — y con
   * solo el panel del banquero abierto UIScene cae en su propio no-op de
   * ESC (ídem con el modal de intercambio: es un objeto de GameScene, no
   * una escena overlay, así que UIScene sigue en su no-op 4 y este handler
   * recibe el keydown igual). ResultScene/ads se cubren con
   * hasActiveOverlayScene, igual que el resto de los handlers de este
   * teclado. Sin sfx: paridad silenciosa con el ratón (ver
   * BankerOfferPanel.acceptFromKeyboard y SwapEventModal.declineFromKeyboard).
   */
  private handleOfferEscapeKey(event?: KeyboardEvent): void {
    if (event?.repeat) return;
    if (this.hasActiveOverlayScene()) return;
    // Modal de intercambio abierto (Fase 7g-2): ESC = declinar en silencio
    // (Mantener) — MISMA cadena que el botón del propio modal, sin sonido.
    // Va ANTES del guard de oferta para que funcione aunque hoy no exista
    // ninguna oferta en pantalla.
    if (this.controller?.isSwapModalOpen()) {
      this.controller.declineSwapFromKeyboard();
      return;
    }
    if (this.controller?.isBankerOfferOpen()) {
      this.controller.keyboardRejectOffer();
    }
  }

  /**
   * Teclado PC (Fase 3): items de foco armados al vuelo para
   * KeyboardNavigation — la posición la pone la vista (la geometría vive en
   * las vistas, no en la escena) y una carta revelada o bloqueada no es
   * candidata de movimiento.
   */
  private kbFocusItems(): FocusItem[] {
    return this.kbFocusViews.map(view => ({
      x: view.x,
      y: view.y,
      enabled: !view.isCardOpen() && !view.isLocked()
    }));
  }

  /**
   * Teclado PC (Fase 3): apaga el highlight de cualquier carta enfocada y
   * deja el índice en -1 (flechas/ENTER inertes hasta que una fase vuelva a
   * poblar kbFocusViews). setKeyboardFocus(false) sobre una carta ya
   * revelada es no-op — lo maneja el propio CardView.
   */
  private clearKbFocus(): void {
    this.kbFocusViews.forEach(view => view.setKeyboardFocus(false));
    this.kbFocusIndex = -1;
  }

  /**
   * Teclado PC (Fase 3): ¿hay un overlay de OTRA escena encima de la
   * partida? Mismo criterio que UIScene.hasActiveOverlayScene. Defensivo:
   * los overlays que pausan GameScene (ShopScene, los de anuncio) ya no
   * emiten keydown — KeyboardPlugin.isActive() exige scene.sys.canInput() —
   * pero el chequeo es barato y cubre los que se superponen SIN pausar, como
   * ResultScene, que se abre con scene.launch sobre la partida todavía
   * RUNNING.
   */
  private hasActiveOverlayScene(): boolean {
    return (
      this.scene.isActive('ShopScene') ||
      this.scene.isActive('ResultScene') ||
      this.scene.isActive('AdOverlayScene') ||
      this.scene.isActive('AdBlockerScene')
    );
  }

  /**
   * Orquesta el momento de celebración al revelar la carta de mayor valor
   * (REQ 25000). Reproduce SIEMPRE el reflector genérico (SpotlightSweepEffect),
   * y ADEMÁS resuelve + reproduce la estrategia propia del mazo activo —
   * vía `getDeckCelebrationEffect()`, sin ningún `switch`/`if` acá.
   *
   * GRASP Polymorphism / Strategy: GameScene ya no sabe CÓMO festeja cada
   * mazo, solo sabe pedirle a la estrategia resuelta que se reproduzca.
   * Cada efecto vive en su propio archivo bajo
   * `presentation/effects/deck-celebrations/` — agregar o mejorar el de
   * un mazo nunca requiere tocar este método.
   *
   * Nótese que `deckId` NO viaja en el evento de dominio — se resuelve
   * ACÁ, en presentación, vía GameServices (mismo patrón ya usado para
   * `numberColor`/`glowBorderSelect` más arriba en create()). El dominio
   * (OpenCardUseCase) no tiene por qué saber qué mazo visual está activo.
   */
  /**
   * Conecta OnboardingFlow (decide QUÉ consejo y CUÁNDO) con OnboardingCoach
   * (lo dibuja). Devuelve la función de limpieza para el SHUTDOWN de la escena.
   */
  /**
   * Registra el resultado FINAL de la partida (ganada o perdida) en
   * récords + Desafío Diario. Usa `GameResultTracker` (ver ese archivo)
   * para no contar una derrota de la que el jugador se salvó con "Revivir":
   * una derrota queda pendiente hasta `flush()` (SHUTDOWN de esta escena) o
   * hasta que 'GameRevived' la cancele. Una victoria siempre se reporta al
   * toque — es lo que permite a ResultScene mostrar "Nuevo récord" o la
   * recompensa diaria en la MISMA pantalla que anuncia el premio.
   *
   * Límite conocido: si el Desafío Diario se PIERDE sin revivir, la
   * recompensa igual se acredita (ver el comentario en create()), pero
   * recién al cerrar esta escena — demasiado tarde para mostrarla en la
   * pantalla de "Perdiste". Las monedas llegan igual, solo sin el aviso.
   */
  private setupOutcomeRecording(eventBus: SimpleEventEmitter<GameEvent>): () => void {
    const services = getServices(this);
    const dailyDateKey = this.dailyDateKey;

    const tracker = new GameResultTracker(result => {
      const summary = services.outcomeRecorder.record(result, dailyDateKey);
      this.registry.set('lastGameSummary', summary);
    });

    // Regla anti-farmeo (ADR-014): segundo tracker puro sobre los MISMOS
    // eventos que GameResultTracker (una sola suscripción, un solo flush).
    // El use case decide la exclusión del Desafío Diario (pasa `isDaily`)
    // y delega la transición de estado en FirstRoundDealStreak; si no hay
    // nada que guardar, no escribe storage.
    const recordFirstRoundDeal = new RecordFirstRoundDealOutcomeUseCase(services.progressionManager);
    const streakTracker = new FirstRoundDealStreakTracker(outcome =>
      recordFirstRoundDeal.execute(outcome, dailyDateKey !== null)
    );

    const unsubscribe = eventBus.subscribe(event => {
      tracker.onGameEvent(event);
      streakTracker.onGameEvent(event);
    });
    return () => {
      tracker.flush();
      streakTracker.flush();
      unsubscribe();
    };
  }

  private setupOnboarding(eventBus: SimpleEventEmitter<GameEvent>): () => void {
    const flow = new OnboardingFlow(getServices(this).onboardingRepository);
    if (!flow.isActive()) {
      return () => undefined;
    }

    const coach = new OnboardingCoach(this);
    let disposed = false;

    // El panel del banquero aparece 1800 ms después de 'BankerOfferMade'
    // (ver GameSceneController); el consejo espera a que esté en pantalla.
    const BANKER_PANEL_DELAY_MS = 1900;
    let pendingBankerHint: Phaser.Time.TimerEvent | null = null;

    const apply = (action: OnboardingAction): void => {
      if (disposed) {
        return;
      }
      if (action.kind === 'hide') {
        pendingBankerHint?.remove(false);
        pendingBankerHint = null;
        coach.hide();
        return;
      }
      if (action.kind !== 'show') {
        return;
      }
      if (action.hint === 'banker_offer') {
        coach.hide();
        pendingBankerHint = this.time.delayedCall(BANKER_PANEL_DELAY_MS, () => {
          pendingBankerHint = null;
          if (!disposed && flow.getCurrentHint() === 'banker_offer') {
            coach.show('banker_offer');
          }
        });
        return;
      }
      coach.show(action.hint);
    };

    coach.onSkip(() => apply(flow.skipAll()));

    const unsubscribeEvents = eventBus.subscribe(event => apply(flow.onGameEvent(event)));

    // Las cartas tardan ~450 ms en acomodarse en el tablero (tween de
    // onSecretCardChosen): el primer consejo espera a que se puedan abrir.
    const BOARD_SETTLE_DELAY_MS = 700;
    const boardReadyTimer = this.time.delayedCall(BOARD_SETTLE_DELAY_MS, () => apply(flow.onBoardReady()));

    return () => {
      disposed = true;
      boardReadyTimer.remove(false);
      pendingBankerHint?.remove(false);
      unsubscribeEvents();
      coach.destroy();
    };
  }

  private playTopValueCardCelebration(card: Card): void {
    const deckId = getServices(this).progressionManager.getSelectedDeckId();
    this.spotlightEffect.play(this, card);
    getDeckCelebrationEffect(deckId).play(this, card);
  }

  private createSecretCardPedestal(x: number, y: number): void {
    this.add
      .rectangle(x, y, 140, 192, 0x141824, 0.9)
      .setStrokeStyle(2, 0xffaa00, 0.8);

    this.add
      .rectangle(x, y, 148, 200, 0xffaa00, 0)
      .setStrokeStyle(1, 0xffd700, 0.3);

    new LocalizedText(this, x, y - 115, 'PEDESTAL_SECRET_CARD_LABEL', {
      fontSize: '16px',
      fontFamily: 'Arial, sans-serif',
      fontStyle: 'bold',
      color: '#ffcc00',
      align: 'center'
    }).setOrigin(0.5);
  }

  private playMusic(song: string): void {
    this.audioService.playMusic(song);
  }
}