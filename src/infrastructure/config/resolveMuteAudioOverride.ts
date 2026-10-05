/**
 * CG-MON-002 (ADR-011): override local de `muteAudio` por URL.
 *
 * La doc de CrazyGames (sdk/game, Game Settings) dice: *"Locally you can
 * use `?muteAudio=true` to force this to true"* — pero ese comportamiento
 * depende de que el SDK esté cargado y lo lea. Implementarlo también acá
 * garantiza que el override funcione en TODOS los modos (incluso
 * `portal`/`none`, sin SDK) y sirve para `?muteAudio=false` (negar el
 * mute de la plataforma en local, cosa que la URL del SDK no ofrece).
 *
 * El parámetro GANA sobre el valor del SDK: si está presente, no se
 * suscribe al listener de la plataforma (ver main.ts).
 *
 * @param search `window.location.search` (con el `?` inicial).
 * @returns `true`/`false` si el parámetro fuerza un valor; `null` si no
 *   está presente o el valor no es válido (manda el setting del SDK).
 */
export function resolveMuteAudioOverride(search: string): boolean | null {
  const raw = new URLSearchParams(search).get('muteAudio');
  if (raw === null) {
    return null;
  }
  if (raw === 'true') {
    return true;
  }
  if (raw === 'false') {
    return false;
  }
  console.warn(
    `[resolveMuteAudioOverride] muteAudio="${raw}" no es un valor válido ` +
      '(esperado "true" o "false") — manda el setting del SDK.'
  );
  return null;
}
