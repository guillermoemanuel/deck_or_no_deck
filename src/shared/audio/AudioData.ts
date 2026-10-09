// Manifest central de audio. Un solo lugar para agregar o sacar sonidos:
// - PreloadScene carga TODOS los sfx de AUDIO_MANIFEST.sfx al arrancar.
//   La música NO viene del manifest: se carga por mazo desde
//   DeckSetups.musicGameplay con la clave genérica 'music_gameplay' (la
//   entrada `music` documenta la pista base y su volumen de diseño).
// - AudioService lee AUDIO_MANIFEST.sfx para los volúmenes por clave
//   (el volumen del manifiesto se MULTIPLICA por el global del jugador).
//
// Los archivos van en public/assets/audio/music/ y public/assets/audio/sfx/
// (los cubre el guardián AudioData.spec.ts: clave ↔ archivo físico).
//
// Para agregar un sonido nuevo: sumá una línea acá con su key, su archivo
// y su volumen, y agregá la clave al objeto SFX de abajo — no hace falta
// tocar PreloadScene ni AudioService.

// Definimos la estructura que debe tener cada elemento de audio
export interface AudioTrackConfig {
    key: string;
    file: string;
    volume?: number; // El volumen es opcional
}

// Definimos la estructura global del manifiesto
export interface AudioManifestStructure {
    music: AudioTrackConfig[];
    sfx: AudioTrackConfig[];
}

export const AUDIO_MANIFEST: AudioManifestStructure = {
    music: [
        // Tema instrumental que suena en loop durante toda la partida
        { key: 'music_gameplay', file: 'clasic_gameplay.ogg', volume: 0.45 }
    ],

    sfx: [
        // --- Dar vuelta carta ---
        { key: 'sfx-card-low', file: 'sfx-card-low.mp3', volume: 0.6 },
        { key: 'sfx-card-mid', file: 'sfx-card-mid.mp3', volume: 0.55 },
        { key: 'sfx-card-high', file: 'sfx-card-high.mp3', volume: 0.75 },
        { key: 'sfx-card-jackpot', file: 'sfx-card-jackpot.mp3', volume: 0.85 },
        // Subidos de 0.6 a 0.8 (BUGFIX (bug_volumen_card_offer_bajo): con 0.6
        // el efectivo tras el bugfix del manifiesto era 0.7×0.6=0.42 y quedaba
        // bajo respecto al sonido anterior de 0.7; ahora 0.7×0.8=0.56).
        { key: 'sfx-card-open', file: 'card-open.mp3', volume: 0.8 },
        { key: 'sfx-offer', file: 'offer.mp3', volume: 0.8 },

        // --- Resultado de la ronda ---
        { key: 'sfx-win', file: 'sfx-win.mp3', volume: 0.8 },
        { key: 'sfx-lose', file: 'sfx-lose.mp3', volume: 0.75 },
        { key: 'sfx-record', file: 'sfx-record.mp3', volume: 0.7 },

        // --- Energía y tensión ---
        { key: 'sfx-energy-depleted', file: 'sfx-energy-depleted.mp3', volume: 0.7 },
        { key: 'sfx-heartbeat', file: 'sfx-heartbeat.mp3', volume: 0.5 },
        { key: 'sfx-drumroll', file: 'sfx-drumroll.mp3', volume: 0.7 },

        // --- Acciones de partida ---
        { key: 'sfx-swap', file: 'sfx-swap.mp3', volume: 0.5 },
        { key: 'sfx-deal', file: 'sfx-deal.mp3', volume: 0.7 },
        { key: 'sfx-no-deal', file: 'sfx-no-deal.mp3', volume: 0.6 },
        { key: 'sfx-banker-annoyed', file: 'sfx-banker-annoyed.mp3', volume: 0.55 },

        // --- Interfaz ---
        { key: 'sfx-click', file: 'sfx-click.mp3', volume: 0.4 },
        { key: 'sfx-coins-count', file: 'sfx-coins-count.mp3', volume: 0.55 },
        { key: 'sfx-purchase', file: 'sfx-purchase.mp3', volume: 0.55 },
        { key: 'sfx-bonus-claim', file: 'sfx-bonus-claim.mp3', volume: 0.6 },
        { key: 'sfx-unlock', file: 'sfx-unlock.mp3', volume: 0.65 },
        { key: 'sfx-whoosh', file: 'sfx-whoosh.mp3', volume: 0.4 },

        // --- Consumibles (tienda / revivir) ---
        { key: 'sfx-revive', file: 'sfx-revive.mp3', volume: 0.7 },
    ]
};

/**
 * Claves canónicas de SFX — presentation usa estos símbolos, nunca strings
 * sueltos.
 */
export const SFX = {
    CARD_LOW: 'sfx-card-low',
    CARD_MID: 'sfx-card-mid',
    CARD_HIGH: 'sfx-card-high',
    CARD_JACKPOT: 'sfx-card-jackpot',
    WIN: 'sfx-win',
    LOSE: 'sfx-lose',
    ENERGY_DEPLETED: 'sfx-energy-depleted',
    HEARTBEAT: 'sfx-heartbeat',
    DRUMROLL: 'sfx-drumroll',
    SWAP: 'sfx-swap',
    DEAL: 'sfx-deal',
    NO_DEAL: 'sfx-no-deal',
    BANKER_ANNOYED: 'sfx-banker-annoyed',
    CLICK: 'sfx-click',
    COINS_COUNT: 'sfx-coins-count',
    RECORD: 'sfx-record',
    REVIVE: 'sfx-revive',
    PURCHASE: 'sfx-purchase',
    BONUS_CLAIM: 'sfx-bonus-claim',
    UNLOCK: 'sfx-unlock',
    WHOOSH: 'sfx-whoosh',
    CARD_OPEN: 'sfx-card-open',
    OFFER: 'sfx-offer'
} as const;
