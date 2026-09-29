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
    BANKER_OFFER_COUNTDOWN_SINGULAR: "Banker's offer in {count} card",
    BANKER_OFFER_COUNTDOWN_PLURAL: "Banker's offer in {count} cards",
    BANKER_OFFER_READY: 'Banker offer ready!',
    BANKER_OFFER_COUNTDOWN_ZERO: 'No more offers',

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
    SHOP_DECKS_OWNED_COUNTER: 'Owned {owned}/{total}',
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
    TUTORIAL_STEP_6_TITLE: '6. The 12-Hour Bonus',
    // QA de legibilidad (HowToPlayScene: fontSize del cuerpo 14px -> 17px):
    // este texto era el más largo de los 7 pasos del tutorial (216
    // caracteres) — con la fuente más grande necesitaba 4-5 líneas y
    // pisaba el título de arriba. Se acortó a un tamaño consistente con
    // el resto de los pasos (~160 caracteres), sin perder ningún dato
    // del mecanismo (cada 12hs, ícono de Bono, carta boca abajo, espera
    // de otras 12hs si se deja vencer).
    TUTORIAL_STEP_6_BODY:
      'Every 12 hours you get a free bonus: tap the Bonus icon, pick a face-down card, and add coins instantly. Miss the window and you\u2019ll wait a full 12 hours again.',
    TUTORIAL_BONUS_CAPTION: 'Every 12 hours',
    TUTORIAL_STEP_7_TITLE: '7. Shop: 10 Themed Decks',
    // QA de legibilidad: mismo motivo que TUTORIAL_STEP_6_BODY de arriba
    // — acortado sin perder los 3 datos clave (10 mazos coleccionables,
    // reskin completo, efecto especial en la carta de 25.000).
    TUTORIAL_STEP_7_BODY:
      'The shop offers 10 collectible decks. Each one reskins the board, the cards and the Banker, and triggers a special effect when you reveal the 25,000-point card.',
    TUTORIAL_DECKS_CAPTION: '10 collectible decks',
    TUTORIAL_DECKS_EFFECT_CAPTION: 'Special effect on the 25,000 card!',

    // --- Cambio de carta final --- //
    FINAL_CHANGE_SECRET_CARD: '👉 CLICK ON A FACE-DOWN CARD ON THE BOARD.',
    FINAL_CHANGE_PREVIEW_SECRET_CARD: '⚡ PREVIOUS SECRET CARD REVEALED ⚡',
    FINAL_CHANGE_PREVIEW_SECRET_CARD_VALUE: 'Your discarded secret card contained:',
    FINAL_CHANGE_NEW_SECRET_CARD: 'Your new secret card is placed face down on the pedestal.',
    FINAL_CHANGE_FINAL_CARD: '🔄 FINAL CARD — Swap your Secret Card for it?',
    FINAL_CHANGE_UPGRATED: 'Tap this notification to switch—or open the letter normally to keep your secret one.',

    // --- Abandonar partida en curso --- //
    GAME_ABANDON_EXIT_TITLE: 'Exit to the menu?',
    // QA de legibilidad (ver UIScene.showExitConfirmationModal): se saca
    // el '\n' manual — ahora el wordWrap: {width:400} de la propia
    // LocalizedText reparte las líneas, igual que en la versión en
    // español (que nunca tuvo un salto manual).
    GAME_ABANDON_SUBTITLE_PENALIZATION: 'You will lose {amount} points from your balance for abandoning the match in progress.',
    GAME_ABANDON_SUBTITLE_GO: 'You will return to the main menu.',
    GAME_ABANDON_CANCEL: 'Cancel',
    GAME_ABANDON_GO: 'Go to Menu',

    //Rewarded Ads
    RESULT_AD_LOADING: 'loading ad...',
    RESULT_AD_FAILED: 'The ad was not completed. Try again.',
    RESULT_AD_UNAVAILABLE: 'Ads are not available at this time.',
    RESULT_AD_BONUS: '¡BONUS!\n+${amount}',
    RESULT_AD_ALREADY_CLAIMED: 'You have already claimed your bonus.',

    // --- HUD (renglones de botones-ícono: Bono/Tienda/Salir arriba, Sonido/Pantalla Completa abajo) ---
    HUD_BONUS: 'Bonus',
    HUD_SHOP: 'Shop',
    HUD_EXIT: 'Exit',
    HUD_FULLSCREEN: 'Full Screen',
    HUD_WINDOWED: 'Windowed',
    HUD_SOUND_ON: 'Sound On',
    HUD_SOUND_OFF: 'Sound Off',

    // --- Onboarding in-game (consejos contextuales; la guía completa sigue en "Cómo jugar") ---
    ONBOARDING_OPEN_CARD_TITLE: '👆 Open a card',
    ONBOARDING_OPEN_CARD_BODY:
      'Tap any card on the board to reveal its prize. Your Secret Card is the one on the pedestal.',
    ONBOARDING_ENERGY_TITLE: '⚡ Watch your energy',
    ONBOARDING_ENERGY_BODY:
      'Low-value cards protect your energy; high-value cards drain it. If it reaches 0%, you lose.',
    ONBOARDING_BANKER_TITLE: '🤝 The Banker is calling',
    ONBOARDING_BANKER_BODY:
      'DEAL to take the offer and win now, or NO DEAL to keep playing for your Secret Card.',
    ONBOARDING_MORE_INFO: '📖 More rules in “How to Play” on the main menu.',
    ONBOARDING_SKIP: 'Skip tips ✕',
    MENU_PLAY_BUTTON: 'PLAY',
    ROTATE_DEVICE_TITLE: 'Rotate your device',
    ROTATE_DEVICE_HINT: 'Deck or No Deck is played in landscape mode.',
    NEW_GAME_CONFIRM_TITLE: '⚠ Start over from zero?',
    NEW_GAME_CONFIRM_BODY:
      'You will permanently lose your {coins} coins, every deck you unlocked, and your personal stats and best scores. This cannot be undone.',
    NEW_GAME_CONFIRM_CANCEL: 'Keep my progress',
    NEW_GAME_CONFIRM_ACCEPT: 'Delete and start over',

    // --- Desafío Diario y Récords (Menú Principal) ---
    DAILY_CHALLENGE_TITLE: '📅 Daily Challenge',
    DAILY_CHALLENGE_AVAILABLE: 'Reward: {reward} coins · Streak: {streak}',
    DAILY_CHALLENGE_COMPLETED: 'Completed! Come back in {time}',
    DAILY_CHALLENGE_USED: 'In progress. Finish it or come back in {time}',
    STATS_LINE: '🏆 {games} games · {winRate}% wins · Best: {bestPayout}',
    SHOP_UPGRADE_CONFLICT: 'Already active: {other}. Only one reward multiplier per game.',
    RESULT_NEW_RECORD: '🏆 New personal best!',
    RESULT_DAILY_REWARD: '📅 Daily Challenge: +{reward} coins (streak: {streak})',
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
    BANKER_OFFER_COUNTDOWN_SINGULAR: 'Oferta del banquero en {count} carta',
    BANKER_OFFER_COUNTDOWN_PLURAL: 'Oferta del banquero en {count} cartas',
    BANKER_OFFER_READY: '¡Oferta del banquero lista!',
    BANKER_OFFER_COUNTDOWN_ZERO: 'No hay más ofertas',

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
    SHOP_DECKS_OWNED_COUNTER: 'Obtenidos {owned}/{total}',
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
    TUTORIAL_STEP_6_TITLE: '6. El Bono de 12 Horas',
    // QA de legibilidad — ver el comentario en el bloque `en` de arriba:
    // era el texto más largo del tutorial (257 caracteres) y con la
    // fuente más grande pisaba el título. Acortado sin perder ningún
    // dato del mecanismo.
    TUTORIAL_STEP_6_BODY:
      'Cada 12 horas tenés un bono gratis: tocá el ícono de Bono, elegí una carta boca abajo y sumá monedas al instante. Si dejás pasar la ventana, esperás otras 12 horas completas.',
    TUTORIAL_BONUS_CAPTION: 'Cada 12 horas',
    TUTORIAL_STEP_7_TITLE: '7. Tienda: 10 Mazos Temáticos',
    // QA de legibilidad — mismo motivo, sin perder los 3 datos clave.
    TUTORIAL_STEP_7_BODY:
      'La tienda ofrece 10 mazos coleccionables. Cada uno cambia la estética del tablero, las cartas y el Banquero, y dispara un efecto especial al revelar la carta de 25.000 puntos.',
    TUTORIAL_DECKS_CAPTION: '10 mazos coleccionables',
    TUTORIAL_DECKS_EFFECT_CAPTION: '¡Efecto especial en la carta de 25.000!',

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
    GAME_ABANDON_GO: 'Ir al Menú',

    // Flujo de Rewarded Ads
    RESULT_AD_LOADING: 'cargando anuncio...',
    RESULT_AD_FAILED: 'El anuncio no se completó. Intentá de nuevo.',
    RESULT_AD_UNAVAILABLE: 'Los anuncios no están disponibles en este momento.',
    RESULT_AD_BONUS: '¡BONO!\n+${amount}',
    RESULT_AD_ALREADY_CLAIMED: 'Ya reclamaste tu bono.',

    // --- HUD (renglones de botones-ícono: Bono/Tienda/Salir arriba, Sonido/Pantalla Completa abajo) ---
    HUD_BONUS: 'Bono',
    HUD_SHOP: 'Tienda',
    HUD_EXIT: 'Salir',
    HUD_FULLSCREEN: 'Pantalla Completa',
    HUD_WINDOWED: 'Modo Ventana',
    HUD_SOUND_ON: 'Sonido Activado',
    HUD_SOUND_OFF: 'Sonido Silenciado',

    // --- Onboarding in-game (consejos contextuales; la guía completa sigue en "Cómo jugar") ---
    ONBOARDING_OPEN_CARD_TITLE: '👆 Abrí una carta',
    ONBOARDING_OPEN_CARD_BODY:
      'Tocá cualquier carta del tablero para revelar su premio. Tu Carta Secreta es la del pedestal.',
    ONBOARDING_ENERGY_TITLE: '⚡ Cuidá tu energía',
    ONBOARDING_ENERGY_BODY:
      'Las cartas de poco valor protegen tu energía; las de mucho valor la drenan. Si llega a 0%, perdés.',
    ONBOARDING_BANKER_TITLE: '🤝 Llama el Banquero',
    ONBOARDING_BANKER_BODY:
      'DEAL para aceptar la oferta y ganar ya, o NO DEAL para seguir jugando por tu Carta Secreta.',
    ONBOARDING_MORE_INFO: '📖 Más reglas en «Cómo Jugar», en el menú principal.',
    ONBOARDING_SKIP: 'Omitir consejos ✕',
    MENU_PLAY_BUTTON: 'JUGAR',
    ROTATE_DEVICE_TITLE: 'Girá tu dispositivo',
    ROTATE_DEVICE_HINT: 'Deck or No Deck se juega en horizontal.',
    NEW_GAME_CONFIRM_TITLE: '⚠ ¿Empezar de cero?',
    NEW_GAME_CONFIRM_BODY:
      'Vas a perder para siempre tus {coins} monedas, todos los mazos que desbloqueaste y tus estadísticas y mejores puntajes. Esta acción no se puede deshacer.',
    NEW_GAME_CONFIRM_CANCEL: 'Conservar mi progreso',
    NEW_GAME_CONFIRM_ACCEPT: 'Borrar y empezar',

    // --- Desafío Diario y Récords (Menú Principal) ---
    DAILY_CHALLENGE_TITLE: '📅 Desafío Diario',
    DAILY_CHALLENGE_AVAILABLE: 'Recompensa: {reward} monedas · Racha: {streak}',
    DAILY_CHALLENGE_COMPLETED: '¡Completado! Volvé en {time}',
    DAILY_CHALLENGE_USED: 'En curso. Terminalo o volvé en {time}',
    STATS_LINE: '🏆 {games} partidas · {winRate}% victorias · Mejor: {bestPayout}',
    SHOP_UPGRADE_CONFLICT: 'Ya tenés activo: {other}. Solo un multiplicador de premio por partida.',
    RESULT_NEW_RECORD: '🏆 ¡Nuevo récord personal!',
    RESULT_DAILY_REWARD: '📅 Desafío Diario: +{reward} monedas (racha: {streak})',
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