import Phaser from 'phaser';
import { CrazyGamesService } from './infrastructure/services/CrazyGamesService';
import { LocalStorageProgressionRepository } from './infrastructure/persistence/LocalStorageProgressionRepository';
import { ProgressionManager } from './infrastructure/persistence/ProgressionManager';
import { installCompactTextFloor } from './presentation/mobile/CompactTextFloor';
import { LocalStorageOnboardingRepository } from './infrastructure/persistence/LocalStorageOnboardingRepository';
import { LocalStorageRecordsRepository } from './infrastructure/persistence/LocalStorageRecordsRepository';
import { LocalStorageDailyChallengeRepository } from './infrastructure/persistence/LocalStorageDailyChallengeRepository';
import { GameOutcomeRecorder } from './application/records/GameOutcomeRecorder';
import { CryptoRandomProvider } from './infrastructure/services/CryptoRandomProvider';
import { AudioService } from './infrastructure/audio/AudioService';
import { BootScene } from './presentation/scenes/BootScene';
import { PreloadScene } from './presentation/scenes/PreloadScene';
import { MainMenuScene } from './presentation/scenes/MainMenuScene';
import { HowToPlayScene } from './presentation/scenes/HowToPlayScene';
import { DeckSelectionScene } from './presentation/scenes/DeckSelectionScene';
import { GameScene } from './presentation/scenes/GameScene';
import { UIScene } from './presentation/scenes/UIScene';
import { ShopScene } from './presentation/scenes/ShopScene';
import { ResultScene } from './presentation/scenes/ResultScene';
import { GameServices } from './presentation/GameServices';
import { ABANDON_PENALTY_AMOUNT, isGameAbandonGuardActive, deactivateGameAbandonGuard } from './presentation/GameAbandonGuard';
import languageManager from './shared/i18n/LanguageManager';

// --- Composition Root: unica zona del proyecto donde se instancian concretos ---
const crazyGamesService = new CrazyGamesService();
// BUGFIX (SDK v3 "not initialized yet" / Uncaught GeneralError): dispara
// SDK.init() lo antes posible. No hace falta esperar esta llamada acá —
// reportGameplayStart()/showRewardedAd()/etc. esperan internamente esta
// misma Promise antes de tocar `SDK.ad`/`SDK.game` (ver CrazyGamesService.ts).
crazyGamesService.init();

// Auto-detección de idioma (requisito CrazyGames: usar el locale que
// reporta el SDK, con fallback a inglés). `getUserLocale()` ya espera
// internamente a que `init()` termine y resuelve `null` sin lanzar si el
// SDK no está disponible (dev local, otras plataformas, etc.) — acá solo
// hace falta pasarle lo que devuelva a LanguageManager, que decide en
// aislamiento si corresponde aplicarlo (nunca pisa una elección o
// detección previa — ver applyDetectedLocale()). No se espera esta
// Promise: si resuelve después de que MainMenuScene ya dibujó su primer
// frame en DEFAULT_LANGUAGE, el cambio se ve igual, en caliente, gracias
// a LocalizedText/onLanguageChanged.
void crazyGamesService.getUserLocale().then(locale => {
  if (locale) {
    languageManager.applyDetectedLocale(locale);
  }
});

const progressionRepository = new LocalStorageProgressionRepository();
const randomProvider = new CryptoRandomProvider();
// ProgressionManager ahora también depende de IRandomProvider (baraja los
// valores del bono periódico) — ver el comentario en su constructor.
const progressionManager = new ProgressionManager(progressionRepository, randomProvider);

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#0d1117',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // BUGFIX (ads invisibles en pantalla completa): sin esto, el
    // ScaleManager pone en fullscreen SOLO `#game-container` (su
    // `parent` por default). El overlay de anuncios del SDK de
    // CrazyGames (incluido el placeholder "Midgame ad appears here" en
    // modo QA) se inyecta directo en `document.body`, como HERMANO de
    // `#game-container`, no como hijo — y la Fullscreen API nativa solo
    // renderiza el elemento fullscreen y sus descendientes. Resultado:
    // en pantalla completa, el overlay queda técnicamente en el DOM
    // pero visualmente invisible, así que ni el anuncio real ni el
    // placeholder de QA se ven (aunque `showMidgameAd()` sí se resuelva
    // con éxito del lado del SDK). Al apuntar el fullscreen al `<html>`
    // entero, tanto `#game-container` como el overlay de CrazyGames
    // (inyectado en `<body>`) quedan dentro del subárbol que SÍ se
    // muestra.
    fullscreenTarget: document.documentElement
  },
  scene: [BootScene, PreloadScene, MainMenuScene, HowToPlayScene, DeckSelectionScene, GameScene, UIScene, ShopScene, ResultScene]
};

const game = new Phaser.Game(config);

// --- Soporte móvil -----------------------------------------------------------
// Texto nunca menor a ~12 px físicos cuando el juego se ve reducido.
installCompactTextFloor(game);

// Aviso "girá tu dispositivo" (el HTML lo muestra solo en táctiles en vertical);
// acá solo se le pone el texto en el idioma activo y se mantiene al día.
const rotateTitle = document.getElementById('rotate-title');
const rotateHint = document.getElementById('rotate-hint');
const renderRotateOverlayText = (): void => {
  if (rotateTitle) rotateTitle.textContent = languageManager.getText('ROTATE_DEVICE_TITLE');
  if (rotateHint) rotateHint.textContent = languageManager.getText('ROTATE_DEVICE_HINT');
};
renderRotateOverlayText();
languageManager.onLanguageChanged(renderRotateOverlayText);

// iOS informa el tamaño del viewport con retraso tras girar: se vuelve a medir.
const refreshScale = (): void => game.scale.refresh();
window.addEventListener('orientationchange', () => window.setTimeout(refreshScale, 300));
window.visualViewport?.addEventListener('resize', refreshScale);

// Sin menú contextual (pulsación larga en móvil / clic derecho) ni zoom por gesto (iOS Safari).
document.addEventListener('contextmenu', event => event.preventDefault());
document.addEventListener('gesturestart', event => event.preventDefault());

// Mejor esfuerzo: al entrar en pantalla completa, fijar horizontal (solo Android/Chrome lo permite).
game.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, () => {
  const orientation = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
  orientation.lock?.('landscape').catch(() => undefined);

  // BUGFIX (fullscreen con barras negras en notebooks): en varios navegadores
  // de escritorio (sobre todo Windows) el 'resize' que sigue a entrar en
  // fullscreen se dispara con el tamaño de VENTANA viejo, antes de que el
  // layout realmente ocupe el monitor entero (ocultar la barra de tareas
  // tarda uno o dos frames más). Sin este refresh demorado, el FIT de
  // Phaser queda calculado contra ese tamaño viejo: el canvas se ve chico
  // y centrado dentro de un rectángulo negro que sí cubre toda la pantalla
  // — como si el botón "no hiciera" fullscreen de verdad, aunque
  // técnicamente sí lo pidió (a diferencia de F11, que el propio navegador
  // sincroniza con su motor de layout sin pasar por este evento). Dos
  // reintentos cortos cubren tanto el caso rápido como el más lento.
  window.setTimeout(refreshScale, 100);
  window.setTimeout(refreshScale, 350);
});

// Mismo remedio al volver a modo ventana, por si el navegador reporta el
// tamaño anterior (el de fullscreen) en el primer resize tras salir.
game.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, () => {
  window.setTimeout(refreshScale, 100);
});

// AUDITORÍA DE AUDIO: AudioService requiere la instancia de Phaser.Game
// (no de una Scene puntual) para poder vivir más allá del ciclo de vida
// de cualquier escena individual — ver el comentario de clase en
// AudioService.ts para el detalle completo de por qué esto es la clave
// del fix de superposición de audio. Por eso se instancia recién acá,
// después de `new Phaser.Game(config)`, y no junto a los demás servicios.
const audioService = new AudioService(game);

// Audio durante anuncios (requisito de CrazyGames): se silencia SOLO cuando
// el SDK confirma que el anuncio empezó (`adStarted`), no al pedirlo — si el
// request termina sin fill, el jugador no debe notar ningún corte de audio.
// Se restaura al estado que tenía el jugador ANTES del anuncio (si había
// silenciado el juego con el botón del HUD, sigue silenciado). Cubre
// rewarded y midgame desde un único lugar, sin lógica por escena.
let mutedBeforeAd: boolean | null = null;
crazyGamesService.onAdLifecycle(phase => {
  if (phase === 'started') {
    if (mutedBeforeAd === null) {
      mutedBeforeAd = audioService.isMuted();
    }
    audioService.setMuted(true);
    return;
  }
  if (mutedBeforeAd !== null) {
    audioService.setMuted(mutedBeforeAd);
    mutedBeforeAd = null;
  }
});

const recordsRepository = new LocalStorageRecordsRepository();
const dailyChallengeRepository = new LocalStorageDailyChallengeRepository();

const services: GameServices = {
  crazyGamesService,
  progressionManager,
  randomProvider,
  audioService,
  onboardingRepository: new LocalStorageOnboardingRepository(),
  recordsRepository,
  dailyChallengeRepository,
  outcomeRecorder: new GameOutcomeRecorder(recordsRepository, dailyChallengeRepository, progressionManager)
};

game.registry.set('services', services);

window.addEventListener('beforeunload', () => {
  // BUGFIX (gameplayStart/Stop mal ubicados): reportGameplayStart() ya
  // NO se llama acá arriba al cargar el script — se movió al entrar a
  // GameScene (ver create() en GameScene.ts), que es cuando el jugador
  // realmente entra en un estado jugable. Ese mismo lugar ya se encarga
  // del reportGameplayStop() simétrico en su SHUTDOWN (reinicio de
  // partida o salida al menú) — PERO ninguno de esos dos casos cubre
  // cerrar la pestaña/recargar a mitad de una partida, porque el
  // SHUTDOWN de Phaser nunca llega a dispararse ahí (el navegador
  // descarta la página entera antes). Esta es la red de seguridad para
  // ESE caso puntual — solo se dispara si GameScene seguía activa en ese
  // instante, para no mandar un Stop "huérfano" (sin su Start
  // correspondiente) si el jugador cierra la pestaña estando en el menú,
  // la tienda o el tutorial.
  if (game.scene.isActive('GameScene')) {
    crazyGamesService.reportGameplayStop();
  }
  // Sistema Anti-Cheat (abandono forzado): si el jugador cierra la
  // pestaña, recarga o navega fuera mientras `GameAbandonGuard` indica una
  // partida REALMENTE en curso (ver GameAbandonGuard.ts para el ciclo de
  // vida completo del flag), se aplica la misma penalización de -5000 que
  // el botón "Salir al Menú" de UIScene aplicaría voluntariamente — así el
  // jugador no puede evitarla cerrando el navegador en vez de usar la UI.
  //
  // `applyLossPenalty` es síncrono (escribe directo a localStorage vía el
  // repositorio), lo cual es indispensable acá: 'beforeunload' no espera
  // por trabajo asíncrono, así que cualquier lógica basada en Promises no
  // llegaría a completarse antes de que la página se descargue.
  if (isGameAbandonGuardActive(game.registry)) {
    progressionManager.applyLossPenalty(ABANDON_PENALTY_AMOUNT);
    deactivateGameAbandonGuard(game.registry);
  }
});