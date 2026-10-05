# ADR-011: `muteAudio` de la plataforma con prioridad sobre el toggle in-game (capa `platformMuted`)

**Estado:** Aceptada · **Registrada:** 2026-10-04 · **Unidad:** B2 (Sprint B de la
auditoría de publicación 2026-10-04)

## Contexto

Hallazgo **CG-MON-002** (P1) de la auditoría de publicación 2026-10-04: la palabra
`muteAudio` tenía **0 matches en `src/`** — el juego ignoraba por completo que el
jugador pudo silenciarlo desde la **UI de la plataforma** de CrazyGames, y `game.settings`
ni siquiera estaba tipado en el `declare global` del SDK.

Requisito oficial (https://docs.crazygames.com/sdk/game/, sección *Game Settings*):
leer `game.settings.muteAudio`, registrarse en `addSettingsChangeListener` y — cita
textual —

> *"This setting should take priority over your in-game audio settings. So, for example,
> if you also offer an 'Audio On/Off' toggle in game, be sure this doesn't enable the
> audio back if it is disabled in the SDK settings."*

Es decir: **no alcanza con escuchar el setting una vez** — el toggle in-game no puede
re-encender el audio mientras la plataforma lo tenga silenciado. La misma doc
documenta `?muteAudio=true` como override local de testing.

El repo ya tenía el silencio durante anuncios (ciclo `onAdLifecycle` en `main.ts`, ADR-010)
y el pref del jugador (`AudioService.muted`), pero **no existía la tercera fuente**:
el silencio impuesto por la plataforma.

## Decisión

- **`src/infrastructure/audio/AudioService.ts` — capa `platformMuted` SEPARADA del pref
  del jugador (`muted`):**
  - `setPlatformMuted(muted)` nuevo método **concreto** — NO se agregó al puerto
    `IAudioService` (solo lo consume `main.ts`, el composition root; así la capa no
    contamina el contrato que usan aplicación/presentación).
  - **Fuente única de estado audible:** `private applyMute()` →
    `sound.mute = muted || platformMuted`; `isMuted()` devuelve el **efectivo**
    (`muted || platformMuted`) y todo lo que pregunta por "¿está silenciado?" (`play()`
    incluido) pasa por ahí.
  - `toggleMuted()` apunta al efectivo (`setMuted(!isMuted())`): con la plataforma
    silenciando, el click del jugador queda registrado como intención **"que suene"**
    (pref = `false`) y suena apenas la plataforma libere — **jamás re-enciende contra
    el mute de la plataforma**, cumpliendo la cita oficial.
  - `playMusic` **sin cambios deliberados**: la capa NO toca `this.muted`, así que la
    música nace a volumen normal y el mixer global la silencia — al liberar la
    plataforma suena bien sin reiniciar la pista.
- **Puerto `src/domain/ports/ICrazyGamesService.ts` — `onMuteAudioChange(listener)`**
  que devuelve la función de baja, con contrato en el JSDoc: notifica el valor
  **INICIAL** (si ya se conoció) y cada cambio, **sin importar el orden** entre
  `init()` y la suscripción; los adapters sin plataforma **nunca notifican**. Los 3
  implementadores: `CrazyGamesService` (real), `OwnRewardedAdService` (stub que nunca
  notifica — portal no tiene SDK), `FakeCrazyGamesService` (Set de suscriptores +
  `emitMuteAudioChange()` para specs).
- **`CrazyGamesService` (infra):** `declare global` tipa
  `game.settings?: { muteAudio?: boolean }` y `game.addSettingsChangeListener?`;
  campos `muteAudio` / `muteAudioKnown` / `muteAudioListeners`; `bindMuteAudioSetting()`
  corre en `init().then()` (lee el setting inicial **y** registra el listener del SDK);
  `noteMuteAudio()` solo notifica si cambió o si es la primera vez que se conoce
  (`muteAudioKnown` resuelve la carrera init↔suscripción). Sin SDK → nunca notifica.
- **Nuevo `src/infrastructure/config/resolveMuteAudioOverride.ts`** (patrón de
  `resolveFullscreenEnabled`, ADR-008): `resolveMuteAudioOverride(window.location.search)`
  → `true`/`false` si `?muteAudio=` está presente y es válido, `null` si no está (manda
  el SDK) o si el valor es inválido (con `console.warn`). Soporta `?muteAudio=false`
  además del `true` documentado — útil para **negar** el mute de plataforma en local y
  probar en modos sin SDK.
- **`main.ts` (wiring, inmediatamente después de `new AudioService(game)`):**

  ```ts
  const muteAudioOverride = resolveMuteAudioOverride(window.location.search);
  if (muteAudioOverride !== null) audioService.setPlatformMuted(muteAudioOverride);
  else crazyGamesService.onMuteAudioChange(muted => audioService.setPlatformMuted(muted));
  ```

  El **override gana y se saltea la suscripción**; el cable funciona en los 3 modos de
  `VITE_ADS` (en `portal`/`none` el stub nunca notifica y manda la URL o el default).

## Consecuencias

- **El botón del HUD refleja el estado EFECTIVO** (`isMuted()`), no el pref crudo: con
  la plataforma mutada aparece apagado y su click no lo enciende — solo deja el pref
  del jugador en "que suene" para cuando se libere.
- **`setPlatformMuted` es solo concreto** (fuera del puerto `IAudioService`): si alguna
  escena/application llegara a necesitarlo, hay que decidir primero si sube al puerto —
  hoy nadie fuera de `main.ts` lo llama.
- **Borde conocido y aceptado:** el mute de anuncios de `main.ts` captura
  `audioService.isMuted()` (**EFECTIVO**) y lo restaura con `setMuted()` (**PREF**).
  Si ocurre un ad mientras la plataforma tiene `muteAudio=true`, el pref del jugador
  queda en `true` y tras liberar la plataforma seguiría silenciado hasta un click del
  jugador. Raro (requiere plataforma mutada durante un ad) y **recuperable con 1 click**;
  no se tocó el flujo de mute-de-ads en esta unidad para no ampliar el diff.
- **Specs red→verde:** nuevos `AudioService.spec.ts` (5 tests: silencio de plataforma
  sin tocar el pref + liberación devuelve el control; toggle NO re-enciende mientras la
  plataforma silencia pero su intención queda; liberada la plataforma manda el pref del
  jugador; `play()` no arranca con plataforma en silencio; regresión del toggle sin
  plataforma — mock mínimo de phaser, patrón del repo en node) y
  `resolveMuteAudioOverride.spec.ts` (4 tests: ausente → `null`, `true`, `false`,
  inválidos → `null` + warn); `CrazyGamesService.spec.ts` gana el describe de
  muteAudio (+4: inicial leído al iniciar notificando a suscriptor previo, suscriptor
  tardío recibe inicial + cambios, baja deja de notificar, sin SDK nunca notifica y la
  baja es segura) con `installFakeSdk` extendido con `game.settings` +
  `addSettingsChangeListener` + `emitMuteAudio()`. Suite: **48 suites / 540 tests**
  (base B1: 46/527).
- **Cerrado (smoke 2026-10-05):** smoke manual **APROBADO 2026-10-05** — `?muteAudio=true`
  → juego totalmentemente mudo desde el arranque y el botón del HUD **no** re-enciende;
  `?muteAudio=false` / sin parámetro → sonido normal (música a volumen correcto). Detalle
  en `docs/testing.md` y `docs/LOG.md`.
