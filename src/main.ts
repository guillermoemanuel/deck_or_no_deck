import Phaser from 'phaser';
import { CrazyGamesService } from './infrastructure/services/CrazyGamesService';
import { OwnRewardedAdService } from './infrastructure/services/OwnRewardedAdService';
import { resolveAdsMode } from './infrastructure/config/resolveAdsMode';
import { AdOverlayScene, presentAdOverlay } from './presentation/scenes/AdOverlayScene';
import { LocalStorageProgressionRepository } from './infrastructure/persistence/LocalStorageProgressionRepository';
import { ProgressionManager } from './infrastructure/persistence/ProgressionManager';
import { installCompactTextFloor } from './presentation/mobile/CompactTextFloor';
import { LocalStorageOnboardingRepository } from './infrastructure/persistence/LocalStorageOnboardingRepository';
import { LocalStorageRecordsRepository } from './infrastructure/persistence/LocalStorageRecordsRepository';
import { LocalStorageDailyChallengeRepository } from './infrastructure/persistence/LocalStorageDailyChallengeRepository';
import { GameOutcomeRecorder } from './application/records/GameOutcomeRecorder';
import { ListAvailableUpgradesUseCase } from './application/use-cases/ListAvailableUpgradesUseCase';
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
import { isGameAbandonGuardActive, deactivateGameAbandonGuard } from './presentation/GameAbandonGuard';
import { ICrazyGamesService } from './domain/ports/ICrazyGamesService';
import { LOSS_PENALTY_AMOUNT } from './domain/value-objects/GamePenalties';
import languageManager from './shared/i18n/LanguageManager';

// --- Composition Root: unica zona del proyecto donde se instancian concretos ---

// ADR-007 (decisión 3): el adapter de anuncios lo decide el env de build
// VITE_ADS. Sin env (dev local) o con cualquier valor inválido manda el
// default 'crazygames' — el comportamiento previo al ADR queda intacto.
const adsMode = resolveAdsMode(import.meta.env.VITE_ADS);

/**
 * Firma común de los dos adapters de ads (ADR-007): el puerto
 * `ICrazyGamesService` + `init()`. Las dos clases concretas declaran
 * `init()` con firmas distintas (`CrazyGamesService.init(): void` y
 * `OwnRewardedAdService.init(): Promise<void>`), y esta intersección
 * acepta las dos SIN tocar ninguna clase: `void` es asignable a
 * `Promise<void> | void` y `Promise<void>` también. Con este tipo, los 5
 * usos del servicio en este archivo (getUserLocale(), onAdLifecycle del
 * audio, GameServices.crazyGamesService, ListAvailableUpgradesUseCase y
 * reportGameplayStop() en beforeunload) quedan escritos una sola vez para
 * los 3 modos, sin ramificar según el adapter.
 */
type AdService = ICrazyGamesService & { init(): Promise<void> | void };

// Selección de adapter (ADR-007):
//  - 'crazygames' → adapter real del SDK (idéntico al de siempre; cambia
//    solo de dónde sale el script — ver loadCrazyGamesSdk() más abajo).
//  - 'none' → el MISMO CrazyGamesService pero sin cargar el script →
//    `sdk_unavailable` permanente → filas de ads ocultas: la degradación
//    actual, ahora disponible como modo explícito (gratis, ADR-007).
//  - 'portal' → adapter propio; acá se le inyecta el presenter del overlay
//    (presentation/), porque infrastructure NO puede importar
//    presentation (regla de dependencias — mismo patrón de inversión que
//    GameServices, ADR-003).
// Cierre perezoso sobre `game`: esa constante se crea MÁS ABAJO en este
// archivo, pero el cierre no se ejecuta en el arranque — solo cuando el
// jugador pide un anuncio, siempre durante la partida y por lo tanto con
// `game` ya inicializada (nada del orden de boot se mueve por esto).
const crazyGamesService: AdService =
  adsMode === 'portal'
    ? new OwnRewardedAdService(type => presentAdOverlay(game, type))
    : new CrazyGamesService();

// Arranque de los ads (ADR-007): script → init() → locale.
//
// Gate ESTÁTICO del script — espejo deliberado de `resolveAdsMode()`: la
// fuente única del ADAPTER sigue siendo `adsMode`, pero una llamada a
// función no es plegable por el bundler, mientras que un `===` sobre el
// env SÍ lo es (Vite lo reemplaza en build time). Así, el string
// `sdk.crazygames.com` se elimina por completo del bundle en los builds
// 'portal'/'none' (gate de build de ADR-007) sin cambiar el
// comportamiento: para todo valor que NO sea 'portal' ni 'none'
// (ausente/vacío/inválido → 'crazygames'), los dos predicados coinciden.
// Si agregás un modo nuevo a `AdsMode`, decidí acá si ese build pide el
// script del SDK.
const mayLoadCrazyGamesSdk =
  import.meta.env.VITE_ADS !== 'portal' && import.meta.env.VITE_ADS !== 'none';

// Orden CRÍTICO: el chequeo `window.CrazyGames?.SDK` de
// CrazyGamesService.init() ocurre UNA vez, en el momento de la llamada, y
// no se reintenta — si init() corriera antes de que el script termine de
// cargar, el servicio quedaria "sin SDK" para toda la sesión (ready=false
// → sdk_unavailable permanente, aunque el SDK aparezca un segundo
// después). Por eso, en modo 'crazygames' se ESPERA a loadCrazyGamesSdk()
// y recién entonces se llama init(); en 'portal'/'none' no hay script
// externo que esperar, así que el arranque sigue siendo síncrono como
// siempre.
//
// Si el script FALLA (red caída, dominio bloqueado por una extensión),
// loadCrazyGamesSdk() resuelve igual con un warn: no se bloquea el juego —
// init() degrada a sdk_unavailable → ListAvailableUpgradesUseCase oculta
// Duplicar/Triplicar/Revivir y el consumo reembolsa (ADR-006), exactamente
// la misma degradación del modo 'none'.
const bootAds = (): void => {
  // BUGFIX (SDK v3 "not initialized yet" / Uncaught GeneralError): dispara
  // SDK.init() lo antes posible dados los constraint de arriba — en modo
  // crazygames "lo antes posible" es apenas cargado el script; en
  // portal/none, en esta misma línea. No hace falta esperar esta llamada
  // acá: reportGameplayStart()/showRewardedAd()/etc. esperan internamente
  // esta misma Promise antes de tocar `SDK.ad`/`SDK.game`
  // (ver CrazyGamesService.ts).
  crazyGamesService.init();

  // Auto-detección de idioma (requisito CrazyGames: usar el locale que
  // reporta el SDK, con fallback a inglés). `getUserLocale()` ya espera
  // internamente a que `init()` termine y resuelve `null` sin lanzar si el
  // SDK no está disponible (dev local, portal sin SDK, modo 'none') — acá
  // solo hace falta pasarle lo que devuelva a LanguageManager, que decide
  // en aislamiento si corresponde aplicarlo (nunca pisa una elección o
  // detección previa — ver applyDetectedLocale()). No se espera esta
  // Promise: si resuelve después de que MainMenuScene ya dibujó su primer
  // frame en DEFAULT_LANGUAGE, el cambio se ve igual, en caliente, gracias
  // a LocalizedText/onLanguageChanged.
  void crazyGamesService.getUserLocale().then(locale => {
    if (locale) {
      languageManager.applyDetectedLocale(locale);
    }
  });
};

if (mayLoadCrazyGamesSdk) {
  // El resto del archivo sigue corriendo sincrónicamente (juego, audio,
  // anti-cheat) mientras carga el script: solo init()/locale se diferencian.
  void loadCrazyGamesSdk().then(bootAds);
} else {
  bootAds();
}

/**
 * Inyecta el tag del SDK de CrazyGames — antes un `<script>` fijo en
 * index.html (línea 29) que se descargaba en TODOS los builds; el ADR-007
 * mandó sacarlo de ahí y cargarlo dinámicamente, SOLO en modo
 * 'crazygames' (un build 'portal'/'none' jamás pide sdk.crazygames.com).
 *
 * La promise NUNCA rechaza: en `error` (red caída, dominio bloqueado)
 * resuelve con un warn y deja el camino de degradación en manos de
 * `CrazyGamesService.init()` (`sdk_unavailable`), sin frenar el arranque
 * del juego.
 */
function loadCrazyGamesSdk(): Promise<void> {
  return new Promise<void>(resolve => {
    if (window.CrazyGames?.SDK) {
      // El SDK ya está en la página (carga previa, tag duplicado a mano):
      // no se inyecta un segundo <script>.
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => {
      console.warn(
        '[main] No se pudo cargar el SDK de CrazyGames — el juego continúa sin anuncios de la plataforma (sdk_unavailable).'
      );
      resolve();
    });
    document.head.appendChild(script);
  });
}

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
  scene: [
    BootScene,
    PreloadScene,
    MainMenuScene,
    HowToPlayScene,
    DeckSelectionScene,
    GameScene,
    UIScene,
    ShopScene,
    ResultScene,
    // Última de la lista = se dibuja arriba de todo (era la posición que le
    // daba el registro en runtime del presenter). Arranca dormida: solo se
    // activa con `game.scene.start()`. ADR-007 enmienda 2026-10-04: estar
    // en el boot elimina la carrera add/start con la cola de Phaser
    // ("Scene key not found" + watchdog de 15 s en el primer ad).
    AdOverlayScene
  ]
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
const refreshScale = (): void => {game.scale.refresh()};
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
  outcomeRecorder: new GameOutcomeRecorder(recordsRepository, dailyChallengeRepository, progressionManager),
  listAvailableUpgrades: new ListAvailableUpgradesUseCase(crazyGamesService)
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
    progressionManager.applyLossPenalty(LOSS_PENALTY_AMOUNT);
    deactivateGameAbandonGuard(game.registry);
  }
});