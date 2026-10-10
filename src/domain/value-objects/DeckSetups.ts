/**
 * Identificador de cada mazo temático. Union cerrada a propósito — agregar
 * un mazo nuevo implica agregarlo acá Y a DECK_SETUPS (el chequeo de
 * integridad al final de este archivo lo garantiza en tiempo de carga).
 */
export type DeckSetupId = 'basic' | 'cyberpunk' | 'medieval' | 'tarot' | 'vegas' | 'ww2' | 'dracula' | 'egypt' | 'ovni' | 'glacier' | 'chessmaster';

/**
 * Configuración de un mazo temático coleccionable. Estructura pensada
 * para escalar: los campos actuales cubren lo visual imprescindible
 * (fondo, reverso, frente, precio) y la música de gameplay propia; los
 * comentados abajo son PLACEHOLDERS explícitos para la siguiente ronda
 * de temas (sfx de flip y color de acento) — se agregan como campos
 * opcionales para no romper los mazos ya definidos el día que se sumen.
 */
export interface IDeckConfig {
  readonly id: DeckSetupId;
  readonly name: string;

  /** Nombre de archivo (sin extensión) bajo assets/ui/background/. */
  readonly background: string;
  /** Nombre de archivo (sin extensión) bajo assets/cards/ (versión gameplay, 120x168). */
  readonly cardBack: string;
  /** Nombre de archivo (sin extensión) bajo assets/cards/ (versión gameplay, 120x168). */
  readonly cardFront: string;
  /** Costo en monedas persistentes. 0 = desbloqueado por defecto (solo 'basic'). */
  readonly price: number;
  //**Color de titulos */
  readonly titleColor: string;
  //** Imagen del banquero en el juego para cada escenario */
  readonly portrait: string;
  //** Imagenes de barra de energía para cada escenario */
  readonly energyBarBg: string;
  readonly energyBarFill: string;
  /**
   * Música de gameplay de este mazo: nombre de archivo (sin extensión)
   * bajo assets/audio/music/. PreloadScene lo carga en cada recarga de
   * mazo bajo la clave genérica 'music_gameplay' (mismo patrón que
   * 'card-back': GameScene no necesita saber qué tema está activo) y
   * GameScene la reproduce con playMusic() como hasta ahora.
   */
  readonly musicGameplay: string;
  //**Color numeros de carta */
  readonly numberColor: string;
  //**Color resplandor de carta */
  readonly glowBorder: number;

  /**
   * Marca al mazo OCULTO de la tienda (carta "?") hasta que el jugador sea
   * dueño de todos los demás mazos base del catálogo (los que NO declaran
   * este flag). Solo 'chessmaster' lo declara. El catálogo acá solo expresa
   * el dato: la regla de visibilidad vive en application
   * (ListAvailableDecksUseCase) y la de compra en PurchaseDeckUseCase,
   * que rechaza con 'locked_prerequisite' ANTES de cobrar.
   */
  readonly requiresAllBaseDecks?: true;

  // --- Extensibilidad futura (placeholders — aún no implementados) ---
  // readonly sfxFlipKey?: string;   // clave de audio para el sonido de flip de carta de este tema
  // readonly accentColor?: string;  // color hex para marcos/foco de botones acorde a la estética
}

const DECK_PRICE = 20000;

export const DECK_SETUPS: Readonly<Record<DeckSetupId, IDeckConfig>> = {
  basic: {
    id: 'basic',
    name: 'TV Show',
    background: 'basic-backdrop',
    cardBack: 'card-back-basic',
    cardFront: 'card-front-basic',
    titleColor: '#cdb897',
    portrait: 'presentador-portrait',
    energyBarBg: 'basic-energy-bar-bg',
    energyBarFill: 'basic-energy-bar-fill',
    musicGameplay: 'clasic_gameplay',
    numberColor: '#f39c12',
    glowBorder: 0x00e5ff,
    price: 0
  },
  cyberpunk: {
    id: 'cyberpunk',
    name: 'Neon Cyberpunk',
    background: 'cyberpunk-backdrop',
    cardBack: 'card-back-cyberpunk',
    cardFront: 'card-front-cyberpunk',
    titleColor: '#5f307b',
    portrait: 'hacker-portrait',
    energyBarBg: 'cyberpunk-energy-bar-bg',
    energyBarFill: 'cyberpunk-energy-bar-fill',
    musicGameplay: 'cyberpunk_gameplay',
    numberColor: '#00e5ff',
    glowBorder: 0x00e5ff,
    price: DECK_PRICE
  },
  medieval: {
    id: 'medieval',
    name: 'Medieval',
    background: 'medieval-backdrop',
    cardBack: 'card-back-medieval',
    cardFront: 'card-front-medieval',
    titleColor: '#e0d7c6',
    portrait: 'rey-portrait',
    energyBarBg: 'medieval-energy-bar-bg',
    energyBarFill: 'medieval-energy-bar-fill',
    musicGameplay: 'medieval_gameplay',
    numberColor: '#e27519',
    glowBorder: 0xe27519,
    price: DECK_PRICE
  },
  tarot: {
    id: 'tarot',
    name: 'Tarot of Marseilles',
    background: 'tarot-backdrop',
    cardBack: 'card-back-tarot',
    cardFront: 'card-front-tarot',
    titleColor: '#c4a473',
    portrait: 'tarotista-portrait',
    energyBarBg: 'tarot-energy-bar-bg',
    energyBarFill: 'tarot-energy-bar-fill',
    musicGameplay: 'tarot_gameplay',
    numberColor: '#e0b84a',
    glowBorder: 0xffffff,
    price: DECK_PRICE
  },
  vegas: {
    id: 'vegas',
    name: 'Las Vegas VIP',
    background: 'vegas-backdrop',
    cardBack: 'card-back-vegas',
    cardFront: 'card-front-vegas',
    titleColor: '#ff69b4',
    portrait: 'crupier-portrait',
    energyBarBg: 'vegas-energy-bar-bg',
    energyBarFill: 'vegas-energy-bar-fill',
    musicGameplay: 'vegas_gameplay',
    numberColor: '#d72d3f',
    glowBorder: 0xff69b4,
    price: DECK_PRICE
  },
  ww2: {
    id: 'ww2',
    name: 'Bunker WW2',
    background: 'ww2-backdrop',
    cardBack: 'card-back-ww2',
    cardFront: 'card-front-ww2',
    titleColor: '#6c757c',
    portrait: 'oficial-portrait',
    energyBarBg: 'ww2-energy-bar-bg',
    energyBarFill: 'ww2-energy-bar-fill',
    musicGameplay: 'ww2_gameplay',
    numberColor: '#cbcbcb',
    glowBorder: 0xffffff,
    price: DECK_PRICE
  },
  dracula: {
    id: 'dracula',
    name: 'Castle of Terror',
    background: 'dracula-backdrop',
    cardBack: 'card-back-dracula',
    cardFront: 'card-front-dracula',
    titleColor: '#7c1110',
    portrait: 'dracula-portrait',
    energyBarBg: 'dracula-energy-bar-bg',
    energyBarFill: 'dracula-energy-bar-fill',
    musicGameplay: 'dracula_gameplay',
    numberColor: '#e63946',
    glowBorder: 0xad174d,
    price: DECK_PRICE
  },
  glacier: {
    id: 'glacier',
    name: 'Glacier',
    background: 'glacier-backdrop',
    cardBack: 'card-back-glacier',
    cardFront: 'card-front-glacier',
    titleColor: '#ffffff',
    portrait: 'esquimal-portrait',
    energyBarBg: 'glacier-energy-bar-bg',
    energyBarFill: 'glacier-energy-bar-fill',
    musicGameplay: 'glacier_gameplay',
    numberColor: '#e3f3f9',
    glowBorder: 0x00e5ff,
    price: DECK_PRICE
  },
  egypt: {
    id: 'egypt',
    name: 'Ancient Egypt',
    background: 'egypt-backdrop',
    cardBack: 'card-back-egypt',
    cardFront: 'card-front-egypt',
    titleColor: '#382064',
    portrait: 'faraona-portrait',
    energyBarBg: 'egypt-energy-bar-bg',
    energyBarFill: 'egypt-energy-bar-fill',
    musicGameplay: 'egypt_gameplay',
    numberColor: '#1d3eb1',
    glowBorder: 0xf4a22b,
    price: DECK_PRICE
  },
  ovni: {
    id: 'ovni',
    name: 'UFO experience',
    background: 'ovni-backdrop',
    cardBack: 'card-back-ovni',
    cardFront: 'card-front-ovni',
    titleColor: '#8dc7aa',
    portrait: 'alien-portrait',
    energyBarBg: 'ovni-energy-bar-bg',
    energyBarFill: 'ovni-energy-bar-fill',
    musicGameplay: 'ovni_gameplay',
    numberColor: '#e5771a',
    glowBorder: 0x00e5ff,
    price: DECK_PRICE
  },
  chessmaster: {
    id: 'chessmaster',
    name: 'chess master room',
    background: 'chessmaster-backdrop',
    cardBack: 'card-back-chess',
    cardFront: 'card-front-chess',
    titleColor: '#BBC2CC',
    portrait: 'chessmaster-portrait',
    energyBarBg: 'chess-energy-bar-bg',
    energyBarFill: 'chess-energy-bar-fill',
    musicGameplay: 'chess_gameplay',
    numberColor: '#BBC2CC',
    glowBorder: 0xBBC2CC,
    price: 30000,
    requiresAllBaseDecks: true
  }
} as const;

export const DECK_SETUP_IDS: readonly DeckSetupId[] = Object.keys(DECK_SETUPS) as DeckSetupId[];

export const DEFAULT_DECK_ID: DeckSetupId = 'basic';

export function getDeckSetup(id: DeckSetupId): IDeckConfig {
  const setup = DECK_SETUPS[id];
  if (!setup) {
    throw new Error(`Unknown deck setup id: "${id}"`);
  }
  return setup;
}

export function isDeckSetupId(value: string): value is DeckSetupId {
  return (DECK_SETUP_IDS as readonly string[]).includes(value);
}

// Verificación de integridad en tiempo de carga: cada key del record debe
// coincidir con su propio `id` — evita copy-paste errors al agregar un
// mazo nuevo (ej. la key 'vegas' apuntando a un objeto con id: 'medieval').
for (const key of DECK_SETUP_IDS) {
  if (DECK_SETUPS[key].id !== key) {
    throw new Error(`DECK_SETUPS["${key}"].id ("${DECK_SETUPS[key].id}") no coincide con su propia key`);
  }
}
if (DECK_SETUPS[DEFAULT_DECK_ID].price !== 0) {
  throw new Error(`El mazo por defecto ("${DEFAULT_DECK_ID}") debe tener price: 0`);
}
