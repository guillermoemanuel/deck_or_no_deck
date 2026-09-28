import Phaser from 'phaser';
import { CrazyGamesService } from './infrastructure/services/CrazyGamesService';
import { LocalStorageProgressionRepository } from './infrastructure/persistence/LocalStorageProgressionRepository';
import { ProgressionManager } from './infrastructure/persistence/ProgressionManager';
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

// AUDITORÍA DE AUDIO: AudioService requiere la instancia de Phaser.Game
// (no de una Scene puntual) para poder vivir más allá del ciclo de vida
// de cualquier escena individual — ver el comentario de clase en
// AudioService.ts para el detalle completo de por qué esto es la clave
// del fix de superposición de audio. Por eso se instancia recién acá,
// después de `new Phaser.Game(config)`, y no junto a los demás servicios.
const audioService = new AudioService(game);

const services: GameServices = {
  crazyGamesService,
  progressionManager,
  randomProvider,
  audioService
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