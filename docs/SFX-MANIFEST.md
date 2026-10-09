# Efectos de sonido de Deck or No Deck

Generados por código (síntesis con numpy/scipy, sin muestras de terceros: no requieren atribución ni licencias externas).
Mono, 44,1 kHz, MP3 112 kbps, nivel de volumen igualado entre archivos (~-19 dBFS RMS). Total: ~322 KB.

Copiar la carpeta `sfx/` a `public/assets/audio/sfx/` (junto a `card-open.mp3` y `offer.mp3`).

## Catálogo

| Clave | Archivo | Volumen sugerido | Duración | Cuándo usarlo |
|---|---|---|---|---|
| `sfx-card-low` | `sfx-card-low.mp3` | 0.6 | 0.50 s | CardOpened (valor bajo: 1-250) |
| `sfx-card-mid` | `sfx-card-mid.mp3` | 0.55 | 0.25 s | CardOpened (valor medio: 500-1000) |
| `sfx-card-high` | `sfx-card-high.mp3` | 0.75 | 0.70 s | CardOpened (valor alto: 5000-10000, drena energía) |
| `sfx-card-jackpot` | `sfx-card-jackpot.mp3` | 0.85 | 1.90 s | CardOpened (25000) / revelar carta gigante |
| `sfx-win` | `sfx-win.mp3` | 0.8 | 2.00 s | GameWon |
| `sfx-lose` | `sfx-lose.mp3` | 0.75 | 2.00 s | GameLost |
| `sfx-energy-depleted` | `sfx-energy-depleted.mp3` | 0.7 | 1.30 s | EnergyDepleted |
| `sfx-heartbeat` | `sfx-heartbeat.mp3` | 0.5 | 0.90 s | Energía baja (reproducir en bucle ~cada 0,9 s) |
| `sfx-drumroll` | `sfx-drumroll.mp3` | 0.7 | 1.90 s | Redoble antes de LastCardRevealed — **sin uso deliberado** (ver Notas) |
| `sfx-swap` | `sfx-swap.mp3` | 0.5 | 0.70 s | SecretCardSwapped / FinalSecretCardSwapped |
| `sfx-deal` | `sfx-deal.mp3` | 0.7 | 1.00 s | DealAccepted (ka-ching) |
| `sfx-no-deal` | `sfx-no-deal.mp3` | 0.6 | 0.35 s | DealRejected |
| `sfx-banker-annoyed` | `sfx-banker-annoyed.mp3` | 0.55 | 0.80 s | Aviso de la regla anti-farmeo (banquero 'cansado') |
| `sfx-click` | `sfx-click.mp3` | 0.4 | 0.09 s | Clic de botones y menús |
| `sfx-coins-count` | `sfx-coins-count.mp3` | 0.55 | 1.20 s | Conteo de monedas en ResultScene — **sin uso deliberado** (ver Notas) |
| `sfx-record` | `sfx-record.mp3` | 0.7 | 1.60 s | Récord superado |
| `sfx-revive` | `sfx-revive.mp3` | 0.7 | 1.40 s | GameRevived |
| `sfx-purchase` | `sfx-purchase.mp3` | 0.55 | 0.50 s | Compra de mejora o mazo (tienda) |
| `sfx-bonus-claim` | `sfx-bonus-claim.mp3` | 0.6 | 1.00 s | Reclamar bono periódico / desafío diario |
| `sfx-unlock` | `sfx-unlock.mp3` | 0.65 | 1.60 s | Desbloqueo de mazo |
| `sfx-whoosh` | `sfx-whoosh.mp3` | 0.4 | 0.45 s | Transición de escena (hoy: solo salir del tutorial) |

## Variación de `CardOpened` según el valor de la carta

Alineado con la tabla de energía (las cartas bajas restauran, las altas drenan):

- 1, 5, 10, 25, 50, 100 → `sfx-card-low`
- 250, 500, 750 → `sfx-card-mid`
- 1000, 5000, 10000 → `sfx-card-high`
- 25000 → `sfx-card-jackpot`

Hoy `CardView.ts` elige la clave con `cardSfxKeyForValue(value)`
(`src/presentation/audio/GameplaySfx.ts`) para todos los reveals — la clave genérica
`sfx-card-open` queda **sin uso deliberado** (`SFX.CARD_OPEN`, ver `PLAYBOOK.md` §3).

## Entradas de `AUDIO_MANIFEST.sfx` (`src/shared/audio/AudioData.ts`)

```ts
        { key: 'sfx-card-low', file: 'sfx-card-low.mp3', volume: 0.6 },
        { key: 'sfx-card-mid', file: 'sfx-card-mid.mp3', volume: 0.55 },
        { key: 'sfx-card-high', file: 'sfx-card-high.mp3', volume: 0.75 },
        { key: 'sfx-card-jackpot', file: 'sfx-card-jackpot.mp3', volume: 0.85 },
        { key: 'sfx-card-open', file: 'card-open.mp3', volume: 0.8 },
        { key: 'sfx-offer', file: 'offer.mp3', volume: 0.8 },
        { key: 'sfx-win', file: 'sfx-win.mp3', volume: 0.8 },
        { key: 'sfx-lose', file: 'sfx-lose.mp3', volume: 0.75 },
        { key: 'sfx-energy-depleted', file: 'sfx-energy-depleted.mp3', volume: 0.7 },
        { key: 'sfx-heartbeat', file: 'sfx-heartbeat.mp3', volume: 0.5 },
        { key: 'sfx-drumroll', file: 'sfx-drumroll.mp3', volume: 0.7 },
        { key: 'sfx-swap', file: 'sfx-swap.mp3', volume: 0.5 },
        { key: 'sfx-deal', file: 'sfx-deal.mp3', volume: 0.7 },
        { key: 'sfx-no-deal', file: 'sfx-no-deal.mp3', volume: 0.6 },
        { key: 'sfx-banker-annoyed', file: 'sfx-banker-annoyed.mp3', volume: 0.55 },
        { key: 'sfx-click', file: 'sfx-click.mp3', volume: 0.4 },
        { key: 'sfx-coins-count', file: 'sfx-coins-count.mp3', volume: 0.55 },
        { key: 'sfx-record', file: 'sfx-record.mp3', volume: 0.7 },
        { key: 'sfx-revive', file: 'sfx-revive.mp3', volume: 0.7 },
        { key: 'sfx-purchase', file: 'sfx-purchase.mp3', volume: 0.55 },
        { key: 'sfx-bonus-claim', file: 'sfx-bonus-claim.mp3', volume: 0.6 },
        { key: 'sfx-unlock', file: 'sfx-unlock.mp3', volume: 0.65 },
        { key: 'sfx-whoosh', file: 'sfx-whoosh.mp3', volume: 0.4 },
```

## Cómo agregar un sonido

Sumá la entrada en `AUDIO_MANIFEST.sfx` (`src/shared/audio/AudioData.ts`) y su
símbolo en el objeto `SFX`. **No** agregues líneas `this.load.audio(...)` a mano
en `PreloadScene`: esa escena recorre el manifest solo — cablear la carga a mano
era justamente la fuente dual que hacía que una clave registrada no sonara.

## Notas

- El manifest vigente tiene **23 claves**: las 21 de este catálogo + `sfx-card-open` y
  `sfx-offer` (preexistentes). **Sin uso deliberado** (no "conectar" sin decisión, ver
  `PLAYBOOK.md` §3 y ADR-015): `sfx-drumroll`, `sfx-coins-count` y `SFX.CARD_OPEN`.
- `sfx-heartbeat` dura 0,9 s: dispararlo con un temporizador mientras la energía esté baja (el MP3 añade un pequeño relleno, así que un bucle nativo no queda perfecto).
- Silenciar todo el audio mientras corre un anuncio, como exige CrazyGames.
- Son sonidos sintéticos funcionales. Los parámetros están en `tools/synth.py` (frecuencias, duraciones, envolventes) y se regeneran con `python3 synth.py && python3 encode.py` (requiere numpy, scipy y ffmpeg).
