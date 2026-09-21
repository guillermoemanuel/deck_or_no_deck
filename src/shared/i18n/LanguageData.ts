/**
 * LanguageData.ts — fuente de datos ÚNICA del sistema de i18n.
 *
 * Este archivo NO contiene lógica: es un diccionario puro. Toda la
 * lógica (fallback, interpolación, persistencia, eventos) vive en
 * LanguageManager.ts — separación deliberada para que agregar un idioma
 * nuevo sea "agregar datos", nunca "tocar código".
 *
 * ESCALABILIDAD: `SUPPORTED_LANGUAGES` se DERIVA de las keys de
 * `TRANSLATIONS` (no se lista por separado). Esto significa que agregar
 * un idioma nuevo es agregar UN bloque acá abajo — ni LanguageManager, ni
 * ninguna escena de Phaser, necesitan cambiar una sola línea para que ese
 * idioma quede disponible.
 */

// ---------------------------------------------------------------------
// Diccionario centralizado, organizado por sección del juego. Las claves
// son semánticas (qué es el texto, no dónde vive el string en inglés) —
// ningún componente debe tener un string de UI hardcodeado: siempre se
// pide por una de estas claves via languageManager.getText(KEY).
// ---------------------------------------------------------------------
export const TRANSLATIONS = {
  en: {
    // --- Menú Principal ---
    MENU_TITLE: 'DECK OR NO DECK',
    MENU_COINS_LABEL: '💰 {amount}',
    MENU_PLAY_AGAIN_BUTTON: 'PLAY AGAIN',
    MENU_NEW_GAME_BUTTON: 'NEW GAME',
    MENU_SHOP_BUTTON: '🛒 Shop',
    MENU_HOW_TO_PLAY_BUTTON: '❓ How to Play',

    // --- Selección de Carta Secreta / Mazo ---
    DECK_SELECTION_TITLE: 'Choose your Deck',
    DECK_SELECTION_ACCEPT_BUTTON: 'Accept',
    SECRET_CARD_SELECTION_TITLE: '⚡ PICK YOUR SECRET CARD ⚡',
    SECRET_CARD_SELECTION_SUBTITLE: 'Select one of the 13 cards to keep on your pedestal',
    GAME_VALUES_TITLE: 'VALUES\nIN PLAY',
    PEDESTAL_SECRET_CARD_LABEL: 'YOUR\nSECRET CARD',

    // --- Barra de Energía ---
    ENERGY_BAR_LABEL: 'ENERGY: {percent}%',
    ENERGY_PROTECT_LABEL: 'PROTECTS',
    ENERGY_DRAIN_LABEL: 'DRAINS',

    // --- El Banquero ---
    BANKER_OFFER_TITLE: 'The Banker offers:',
    BANKER_OFFER_AMOUNT: '${amount}',
    BANKER_DEAL_BUTTON: 'DEAL',
    BANKER_NO_DEAL_BUTTON: 'NO DEAL',

    // --- Evento de Mitad de Juego ---
    MIDGAME_SWAP_PROMPT: 'Want to swap your Secret Card for one of the remaining ones?',
    MIDGAME_SWAP_ACCEPT: 'Swap',
    MIDGAME_SWAP_DECLINE: 'Keep my card',
    MIDGAME_SWAP_TITLE: '⚡ ¡MIDGAME EVENT! ⚡',

    // --- Tienda ---
    SHOP_TITLE: '🛒 Shop',
    SHOP_TAB_UPGRADES: 'Upgrades',
    SHOP_TAB_DECKS: 'Decks',
    SHOP_BUY_BUTTON: 'Buy {price}',
    SHOP_OWNED_LABEL: 'OWNED',
    SHOP_NO_ACTIVE_SESSION: 'No active game.\nStart playing to access upgrades.',
    SHOP_UPGRADES_CAPTION: 'Consumables: applied to the CURRENT game and lost when it ends.',
    SHOP_DECKS_CAPTION: 'Collectible decks — permanent unlock for all your future games.',
    SHOP_UPGRADE_NOT_PURCHASED: 'Not purchased',
    SHOP_UPGRADE_ACTIVE_THIS_GAME: 'Active this game',
    SHOP_UPGRADE_LEVEL_1_ACTIVE: 'Level 1 active',
    SHOP_UPGRADE_LEVEL_2_ACTIVE: 'Level 2 active',
    SHOP_UPGRADE_REQUIRES_LEVEL_1: 'Requires Level I first',

    UPGRADE_NAME_ENERGY_TANK_1: 'Energy Tank I',
    UPGRADE_DESC_ENERGY_TANK_1: '+25% max energy this game, surplus pre-filled.',
    UPGRADE_NAME_ENERGY_TANK_2: 'Energy Tank II',
    UPGRADE_DESC_ENERGY_TANK_2: '+50% max energy this game (replaces Level I).',
    UPGRADE_NAME_NEGATIVE_CARD_SHIELD: 'Negative Card Shield',
    UPGRADE_DESC_NEGATIVE_CARD_SHIELD: 'Halves the energy drain from dangerous cards this game.',
    UPGRADE_NAME_NEGOTIATOR: 'Negotiator',
    UPGRADE_DESC_NEGOTIATOR: 'The Banker pays a higher offer (+15%) this game.',
    UPGRADE_NAME_DOUBLE_REWARD: 'Double Reward',
    UPGRADE_DESC_DOUBLE_REWARD: 'Enables "Double x2" at the end of this game.',
    UPGRADE_NAME_TRIPLE_REWARD: 'Triple Reward',
    UPGRADE_DESC_TRIPLE_REWARD: 'Enables "Triple x3" at the end of this game.',
    UPGRADE_NAME_REVIVE: 'Second Chance',
    UPGRADE_DESC_REVIVE: 'Enables "Revive" if you run out of energy this game.',
    UPGRADE_NAME_SECRET_SWAP_FINAL: 'Final Swap',
    UPGRADE_DESC_SECRET_SWAP_FINAL: 'At the last board card, lets you swap your Secret Card for it.',

    // --- Modales de Fin de Partida ---
    RESULT_WON_TITLE: '🎉 GAME OVER!\nPrize: {amount}',
    RESULT_LOST_TITLE: '⚡ YOU RAN OUT OF ENERGY ⚡',
    RESULT_SECRET_CARD_REVEAL: 'secret card: {amount}',
    RESULT_DOUBLE_BUTTON: 'Double x2 (Ad)',
    RESULT_TRIPLE_BUTTON: 'Triple x3 (Ad)',
    RESULT_REVIVE_BUTTON: 'Revive (Ad)',
    RESULT_PLAY_AGAIN_BUTTON: 'Play again',
    RESULT_EXIT_BUTTON: 'Go to Menu',

    // --- Tutorial ("Cómo Jugar") ---
    TUTORIAL_TITLE: 'HOW TO PLAY',
    TUTORIAL_STEP_COUNTER: '{current} / {total}',
    TUTORIAL_PREV_BUTTON: '‹ Previous',
    TUTORIAL_NEXT_BUTTON: 'Next ›',
    TUTORIAL_START_BUTTON: "Let's go! ✓",
    TUTORIAL_BACK_TO_MENU: 'Back to Main Menu',
    TUTORIAL_STEP_1_TITLE: '1. The Main Objective',
    TUTORIAL_STEP_1_BODY:
      'Choose your Secret Card at the start. Open the board cards carefully and survive the Banker\u2019s offers to win the big prize.',
    TUTORIAL_STEP_2_TITLE: '2. The Energy Bar',
    TUTORIAL_STEP_2_BODY:
      'Your energy acts as your life. Low-value cards protect it; high-value cards drain it drastically. If it reaches 0%, you can revive by watching a rewarded ad.',
    TUTORIAL_STEP_3_TITLE: '3. The Banker',
    TUTORIAL_STEP_3_BODY:
      'Every 3 opened cards, the Banker will call with an offer based on the odds. Choose "DEAL" to secure your winnings, or "NO DEAL" to keep risking it.',
    TUTORIAL_STEP_4_TITLE: '4. The Midgame Event',
    TUTORIAL_STEP_4_BODY:
      'Once exactly 50% of the board cards are opened, a special event triggers. You can choose to swap your initial Secret Card for one of the remaining ones.',
    TUTORIAL_MIDGAME_PERCENT_LABEL: '{percent}% OF THE BOARD',
    TUTORIAL_STEP_5_TITLE: '5. Shop & Meta-Progress',
    TUTORIAL_STEP_5_BODY:
      'Turn your winnings into persistent coins for the Main Menu shop. Buy permanent upgrades like "Energy Shield" or "Master Negotiator" to grow stronger.',
    TUTORIAL_SHOP_UPGRADES_LABEL: '🛒 PERMANENT UPGRADES',

    // --- Cambio de carta final --- //
    FINAL_CHANGE_SECRET_CARD: '👉 CLICK ON A FACE-DOWN CARD ON THE BOARD.',
    FINAL_CHANGE_PREVIEW_SECRET_CARD: '⚡ PREVIUS SECRET CARD REVEALED ⚡',
    FINAL_CHANGE_PREVIEW_SECRET_CARD_VALUE: 'Your discarded secret card contained:',
    FINAL_CHANGE_NEW_SECRET_CARD: 'Your new secret card is placed face down on the pedestal.',
    FINAL_CHANGE_FINAL_CARD: '🔄 FINAL CARD — Swap your Secret Card for it?',
    FINAL_CHANGE_UPGRATED: 'Tap this notification to switch—or open the letter normally to keep your secret one.',

    // --- Abandonar partida en curso --- //
    GAME_ABANDON_EXIT_TITLE: 'Exit to the menu?',
    GAME_ABANDON_SUBTITLE_PENALIZATION: 'You will lose {amount} points from your balance for abandoning\n the match in progress.',
    GAME_ABANDON_SUBTITLE_GO: 'You will return to the main menu.',
    GAME_ABANDON_CANCEL: 'Cancel',
    GAME_ABANDON_GO: 'Go to Menu'
  },

  es: {
    // --- Menú Principal ---
    MENU_TITLE: 'DECK OR NO DECK',
    MENU_COINS_LABEL: '💰 {amount}',
    MENU_PLAY_AGAIN_BUTTON: 'JUGAR DE NUEVO',
    MENU_NEW_GAME_BUTTON: 'NUEVO JUEGO',
    MENU_SHOP_BUTTON: '🛒 Tienda',
    MENU_HOW_TO_PLAY_BUTTON: '❓ Cómo Jugar',

    // --- Selección de Carta Secreta / Mazo ---
    DECK_SELECTION_TITLE: 'Elegí tu Mazo',
    DECK_SELECTION_ACCEPT_BUTTON: 'Aceptar',
    SECRET_CARD_SELECTION_TITLE: '⚡ ELEGÍ TU CARTA SECRETA ⚡',
    SECRET_CARD_SELECTION_SUBTITLE: 'Selecciona una de las 13 cartas para guardarlas en tu pedestal',
    GAME_VALUES_TITLE: 'VALORES\nEN JUEGO',
    PEDESTAL_SECRET_CARD_LABEL: 'TU CARTA\nSECRETA',

    // --- Barra de Energía ---
    ENERGY_BAR_LABEL: 'ENERGÍA: {percent}%',
    ENERGY_PROTECT_LABEL: 'PROTEGE',
    ENERGY_DRAIN_LABEL: 'DRENA',

    // --- El Banquero ---
    BANKER_OFFER_TITLE: 'El banquero ofrece:',
    BANKER_OFFER_AMOUNT: '${amount}',
    BANKER_DEAL_BUTTON: 'TRATO',
    BANKER_NO_DEAL_BUTTON: 'NO TRATO',

    // --- Evento de Mitad de Juego ---
    MIDGAME_SWAP_PROMPT: '¿Querés cambiar tu Carta Secreta por una de las restantes?',
    MIDGAME_SWAP_ACCEPT: 'Cambiar',
    MIDGAME_SWAP_DECLINE: 'Mantener mi carta',
    MIDGAME_SWAP_TITLE: '⚡ ¡EVENTO DE MITAD DE JUEGO! ⚡',

    // --- Tienda ---
    SHOP_TITLE: '🛒 Tienda',
    SHOP_TAB_UPGRADES: 'Mejoras',
    SHOP_TAB_DECKS: 'Mazos',
    SHOP_BUY_BUTTON: 'Comprar {price}',
    SHOP_OWNED_LABEL: 'COMPRADO',
    SHOP_NO_ACTIVE_SESSION: 'No hay una partida activa.\nEmpezá a jugar para acceder a las mejoras.',
    SHOP_UPGRADES_CAPTION: 'Consumibles: se aplican YA en la partida actual y se pierden al terminarla.',
    SHOP_DECKS_CAPTION: 'Mazos coleccionables — desbloqueo permanente para todas tus partidas.',
    SHOP_UPGRADE_NOT_PURCHASED: 'No comprado',
    SHOP_UPGRADE_ACTIVE_THIS_GAME: 'Activo esta partida',
    SHOP_UPGRADE_LEVEL_1_ACTIVE: 'Nivel 1 activo',
    SHOP_UPGRADE_LEVEL_2_ACTIVE: 'Nivel 2 activo',
    SHOP_UPGRADE_REQUIRES_LEVEL_1: 'Requiere Nivel I primero',

    UPGRADE_NAME_ENERGY_TANK_1: 'Tanque de Energía I',
    UPGRADE_DESC_ENERGY_TANK_1: '+25% de energía máxima en esta partida, con el excedente ya cargado.',
    UPGRADE_NAME_ENERGY_TANK_2: 'Tanque de Energía II',
    UPGRADE_DESC_ENERGY_TANK_2: '+50% de energía máxima en esta partida (reemplaza al nivel I).',
    UPGRADE_NAME_NEGATIVE_CARD_SHIELD: 'Escudo de Carta Negativa',
    UPGRADE_DESC_NEGATIVE_CARD_SHIELD: 'Mitiga a la mitad el drenaje de energía de las cartas peligrosas en esta partida.',
    UPGRADE_NAME_NEGOTIATOR: 'Negociador',
    UPGRADE_DESC_NEGOTIATOR: 'El Banquero paga una oferta mayor (+15%) en esta partida.',
    UPGRADE_NAME_DOUBLE_REWARD: 'Duplicar Premio',
    UPGRADE_DESC_DOUBLE_REWARD: 'Habilita "Duplicar x2" en la pantalla final de esta partida.',
    UPGRADE_NAME_TRIPLE_REWARD: 'Triplicar Premio',
    UPGRADE_DESC_TRIPLE_REWARD: 'Habilita "Triplicar x3" en la pantalla final de esta partida.',
    UPGRADE_NAME_REVIVE: 'Segunda Oportunidad',
    UPGRADE_DESC_REVIVE: 'Habilita "Revivir" si te quedás sin energía en esta partida.',
    UPGRADE_NAME_SECRET_SWAP_FINAL: 'Cambio Final',
    UPGRADE_DESC_SECRET_SWAP_FINAL: 'En la última carta del tablero, permite cambiar tu Carta Secreta por ella.',

    // --- Modales de Fin de Partida ---
    RESULT_WON_TITLE: '🎉 ¡PARTIDA FINALIZADA!\nPremio: {amount}',
    RESULT_LOST_TITLE: '⚡ TE QUEDASTE SIN ENERGÍA ⚡',
    RESULT_SECRET_CARD_REVEAL: 'carta secreta: {amount}',
    RESULT_DOUBLE_BUTTON: 'Duplicar x2 (Ad)',
    RESULT_TRIPLE_BUTTON: 'Triplicar x3 (Ad)',
    RESULT_REVIVE_BUTTON: 'Revivir (Ad)',
    RESULT_PLAY_AGAIN_BUTTON: 'Jugar de nuevo',
    RESULT_EXIT_BUTTON: 'Ir al Menú',

    // --- Tutorial ("Cómo Jugar") ---
    TUTORIAL_TITLE: 'CÓMO JUGAR',
    TUTORIAL_STEP_COUNTER: '{current} / {total}',
    TUTORIAL_PREV_BUTTON: '‹ Anterior',
    TUTORIAL_NEXT_BUTTON: 'Siguiente ›',
    TUTORIAL_START_BUTTON: '¡Comenzar! ✓',
    TUTORIAL_BACK_TO_MENU: 'Volver al Menú Principal',
    TUTORIAL_STEP_1_TITLE: '1. El Objetivo Principal',
    TUTORIAL_STEP_1_BODY:
      'Elige tu Carta Secreta al inicio. Abre las cartas del tablero con cuidado y sobrevive a las ofertas del Banquero para ganar el gran premio.',
    TUTORIAL_STEP_2_TITLE: '2. La Barra de Energía',
    TUTORIAL_STEP_2_BODY:
      'Tu energía actúa como vida. Las cartas de valor bajo la protegen; las cartas altas la drenan drásticamente. Si llega al 0%, podrás revivir viendo un anuncio recompensado.',
    TUTORIAL_STEP_3_TITLE: '3. El Banquero',
    TUTORIAL_STEP_3_BODY:
      'Cada 3 cartas abiertas, el Banquero te llamará con una oferta de compra basada en las probabilidades. Elige "DEAL" para asegurar tus ganancias o "NO DEAL" para seguir arriesgando.',
    TUTORIAL_STEP_4_TITLE: '4. El Evento de Mitad de Juego',
    TUTORIAL_STEP_4_BODY:
      'Al abrirse exactamente el 50% de las cartas del tablero, se activará un evento especial. Podrás decidir si deseas cambiar tu Carta Secreta inicial por una de las cartas restantes.',
    TUTORIAL_MIDGAME_PERCENT_LABEL: '{percent}% DEL TABLERO',
    TUTORIAL_STEP_5_TITLE: '5. Tienda y Meta-Progreso',
    TUTORIAL_STEP_5_BODY:
      'Convierte tus ganancias en monedas persistentes para la tienda del Menú Principal. Compra mejoras permanentes como "Blindaje de energía" o "Negociador maestro" para volverte más fuerte.',
    TUTORIAL_SHOP_UPGRADES_LABEL: '🛒 MEJORAS PERMANENTES',

    // --- Cambio de carta final --- //
    FINAL_CHANGE_SECRET_CARD: '👉 HAZ CLIC EN UNA CARTA CERRADA DEL TABLERO',
    FINAL_CHANGE_PREVIEW_SECRET_CARD: '⚡ CARTA SECRETA ANTERIOR REVELADA ⚡',
    FINAL_CHANGE_PREVIEW_SECRET_CARD_VALUE: 'Tu carta secreta descartada contenía:',
    FINAL_CHANGE_NEW_SECRET_CARD: 'Tu nueva carta secreta queda en el pedestal boca abajo.',
    FINAL_CHANGE_FINAL_CARD: '🔄 ÚLTIMA CARTA — ¿Cambiar tu Carta Secreta por ella?',
    FINAL_CHANGE_UPGRATED: 'Toca este aviso para cambiar — o abrí la carta normalmente para conservar tu secreta.',

    // --- Abandonar partida en curso --- //
    GAME_ABANDON_EXIT_TITLE: 'Salir al Menú?',
    GAME_ABANDON_SUBTITLE_PENALIZATION: 'Perderás {amount} puntos de tu saldo por abandonar la partida en curso.',
    GAME_ABANDON_SUBTITLE_GO: 'Volverás al menú principal.',
    GAME_ABANDON_CANCEL: 'Cancelar',
    GAME_ABANDON_GO: 'Ir al Menú'
  }
  // Para agregar un idioma nuevo (ej. 'pt'): copiar un bloque completo de
  // arriba, traducir cada valor, y listo — SUPPORTED_LANGUAGES y
  // TranslationKey (abajo) lo detectan automáticamente. No hace falta
  // tocar LanguageManager.ts ni ninguna escena.
} as const;

/**
 * Código de idioma soportado — se infiere directamente de las keys de
 * TRANSLATIONS (una fuente de verdad única; nunca puede desincronizarse
 * de lo que realmente hay definido arriba).
 */
export type SupportedLanguage = keyof typeof TRANSLATIONS;

/** Lista de códigos soportados, derivada del diccionario — nunca se edita a mano. */
export const SUPPORTED_LANGUAGES = Object.keys(TRANSLATIONS) as SupportedLanguage[];

/**
 * Idioma por defecto y de fallback. `satisfies` (no una anotación de tipo
 * ancha) preserva el tipo literal 'en', necesario para que
 * `TranslationKey` (abajo) quede atado a este mismo valor sin duplicarlo.
 */
export const DEFAULT_LANGUAGE = 'en' satisfies SupportedLanguage;

/**
 * Unión de TODAS las claves semánticas válidas — se usa para tipar
 * `LanguageManager.getText(key)` en tiempo de compilación (autocompletado
 * y detección de claves inexistentes), tomando como referencia el
 * diccionario del idioma por defecto.
 */
export type TranslationKey = keyof (typeof TRANSLATIONS)[typeof DEFAULT_LANGUAGE];
