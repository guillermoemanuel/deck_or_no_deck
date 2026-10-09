# ADR-015: Manifiesto de audio único en `shared/` + política de reproducción de SFX

**Estado:** Aceptada · **Registrada:** 2026-10-09 · **Unidad:** audio SFX —
21 efectos nuevos sobre una base arreglada (3 commits)

## Contexto

Integrar los 21 SFX nuevos del catálogo (`docs/SFX-MANIFEST.md`) chocaba con tres
problemas de la base de audio:

- **Fuente dual de carga:** `infrastructure/audio/AudioData.ts` declaraba el manifest
  (1 música + 2 claves sfx), pero `PreloadScene` cableaba `this.load.audio(...)` a mano
  con solo `sfx-card-open` y `sfx-offer` — una clave registrada en el manifest podía quedar
  sin cargar y sonar en silencio (o no sonar).
- **Volumen del manifiesto ignorado:** `AudioService` aplicaba solo
  `options.volume ?? sfxVolume`; el `volume` de cada entrada del manifest se declaraba y no
  se usaba (bug `bug_sfx_volumen_ignorado`).
- **Flechas de dependencia:** `presentation` no puede importar `infrastructure` (única
  excepción conocida: `GameServices.ts`, ADR-003), así que los símbolos `SFX.*` no podían
  vivir en `infrastructure/` si la presentación quería usarlos sin violar la regla §2.

Restricciones: la presentación solo habla con audio por el puerto `IAudioService`; los
módulos nuevos de presentación tienen que ser testeables sin Phaser; un fallo de audio
nunca puede romper la partida; CrazyGames exige silenciar durante los ads (ADR-011, intacto).

## Decisión

- **(a) `src/shared/audio/AudioData.ts` como dato puro** (movido desde
  `infrastructure/audio/`): `AUDIO_MANIFEST` con **23 sfx** (los 21 nuevos + `sfx-card-open`
  y `sfx-offer`) y `SFX as const` — **símbolos canónicos** que presentation usa en lugar de
  strings sueltos. `shared/` es consumible por todas las capas, así que la flecha de
  dependencias queda intacta. Fuente única: quien agregue un sonido toca **solo** este
  archivo.
- **(b) Carga desde el manifest:** `PreloadScene` recorre `AUDIO_MANIFEST.sfx` al arrancar
  (**fuente única** — volver a cablear `load.audio` a mano recrea la fuente dual). La música
  sigue aparte: se carga por mazo desde `DeckSetups.musicGameplay`.
- **(c) Volumen del manifiesto se MULTIPLICA:** efecto =
  `(options.volume ?? sfxVolume) × volumenDelManifiesto`. El caller puede atenuar más, nunca
  pisar el volumen de diseño a cero.
- **(d) Anti-apilado <40 ms:** reproducir la MISMA clave dentro de la ventana se descarta
  (reloj **inyectable**, testeable), con `ANTI_STACK_EXEMPT_KEYS = [sfx-coins-count]`
  exento (efectos de larga duración que pueden re-dispararse).
- **(e) Silencio best-effort:** `AudioService.play()` ante una clave ausente avisa una sola
  vez con `warnMissing(key)` usando la carpeta real según familia (sfx/music — el mensaje
  viejo apuntaba a `/public/audio/README.md`, inexistente) y sigue; los consumidores de
  presentación envuelven `play()` en `try/catch` vacío. Se **borró** el `static preload()`
  de `AudioService` (código muerto: sin llamadas y con path erróneo).
- **(f) Política de reproducción en módulos puros de `presentation/audio/`:**
  - `GameplaySfx.ts` — fuente única de constantes (latido 25 %/12 %, 900/650 ms, lose
    900 ms tras `EnergyDepleted`) y `cardSfxKeyForValue(value)` (variantes de carta por
    rango: ≤100 / ≤750 / ≤10000 / jackpot).
  - `HeartbeatLoop.ts` — bucle con `HeartbeatScheduler` inyectado; el primer latido es
    **inmediato** al cruzar el umbral.
  - `GameplaySoundtrack.ts` — consumidor puro de `GameEvent`: deal/no-deal/swap/revive,
    win **sin doble fanfarria** (flag `dealAccepted` — ADR-001), lose retardado 900 ms tras
    `EnergyDepleted` y cancelable por `GameRevived`; `stop()` en el **primer** handler
    `SHUTDOWN` de `GameSceneController`.
  - `UiSfx.bindUiClick(target, audio?)` — punto único del click genérico `SFX.CLICK`
    (interfaz estructural `ClickTarget`, sin Phaser); **sin `audio` no se registra nada**.
  - Todos hablan por el puerto `IAudioService`; el doble de test es
    `presentation/audio/testing/fakeScheduler.ts`.
- **(g) Guardián:** `src/shared/audio/AudioData.spec.ts` valida la paridad
  símbolo ↔ manifest ↔ mp3 físico (`fs.existsSync`, 23 = 23, sin duplicados) — un rename de
  mp3 o una clave agregada a medias rompe el **gate** en vez de degradarse en silencio con
  un `console.warn`.

## Consecuencias

- **Cómo agregar un sonido:** una línea en `AUDIO_MANIFEST.sfx` + su símbolo en `SFX` en
  `src/shared/audio/AudioData.ts`, y el mp3 en la carpeta que corresponda — **no** hay que
  tocar `PreloadScene` ni `AudioService`; si falta el mp3, falla `AudioData.spec`.
- **3 claves cargadas sin uso deliberado** (registrado en `PLAYBOOK.md` §3 para que nadie
  las "conecte" sin decisión): `sfx-drumroll` (la secuencia final dura ~1,11 s < los 1,2 s
  del redoble; el plan prohibía sumar esperas), `sfx-coins-count` (`ResultScene` no tiene
  animación de conteo) y `SFX.CARD_OPEN` (las variantes por valor la reemplazan; el mp3
  sigue cargado).
- **Volumen efectivo de `sfx-card-open`/`sfx-offer` bajó a 0.42 (0.7 × 0.6):** es el efecto
  del bugfix (c) sobre sonidos que antes sonaban solo con el volumen del caller — ajuste de
  mezcla a validar en el smoke de escucha (`docs/testing.md` §5, ítem 12, **pendiente**).
- **El anti-apilado puede descartar repeticiones legítimas** disparadas a <40 ms: si algún
  efecto lo necesita, se agrega a `ANTI_STACK_EXEMPT_KEYS` (decisión explícita).
- **Especificación:** `AudioData.spec` (4), `AudioService.spec` 5 → 9 (+4),
  `GameplaySfx`/`GameplaySoundtrack`/`HeartbeatLoop` (40) y `UiSfx.spec` (4). 4 gates en
  verde por commit (jest selectivo 13 → 40 → 44 · typecheck 0 · lint 0 · `npm test`
  670 tests / 60 suites); reviewer aprobado en los 3 commits.
- **Alcance:** sin cambios de `domain/`/`application/`, sin eventos nuevos, sin i18n, sin
  tocar música ni la política de mute de ADR-011.
