// Manifest central de audio. Un solo lugar para agregar o sacar sonidos:
// - BootScene lo lee para precargar todo.
// - AudioManager lo lee para saber si una key es música o efecto.
//
// Los archivos van en /public/audio/... (ver public/audio/README.md para
// el detalle exacto de nombres y formatos recomendados).
//
// Para agregar un sonido nuevo: sumá una línea acá con su key, su archivo,
// y listo — no hace falta tocar BootScene ni AudioManager.

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
        { key: 'music_gameplay', file: 'clasic_gameplay.mp3', volume: 0.45 }
    ],

    sfx: [
        // --- Dar vuelta carta ---
        { key: 'sfx-card-open', file: 'card-open.mp3', volume: 0.6 },
        { key: 'sfx-offer', file: 'offer.mp3', volume: 0.6 },  
    ]
};

