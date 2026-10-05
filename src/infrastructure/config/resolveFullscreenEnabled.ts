import type { AdsMode } from './resolveAdsMode';

/**
 * Botón de pantalla completa propio — `VITE_FULLSCREEN`, ADR-008.
 *
 * La escribe la tool `/ads-adapter` junto a `VITE_ADS` en `.env`
 * (par invariante: un modo de ads con su fullscreen coherente). Acá se
 * resuelve el valor crudo a un booleano con la misma rigidez que
 * `resolveAdsMode`.
 *
 * Dos garantías (spec: `resolveFullscreenEnabled.spec.ts`):
 *
 * 1. **Default seguro** — sin env (o con basura) el botón NO se
 *    muestra. `VITE_ADS` default = `'crazygames'` y esa plataforma
 *    PROHÍBE los botones fullscreen propios ("Custom in-game fullscreen
 *    buttons are prohibited"): un build manual sin la tool nunca debe
 *    poder incumplir (fue el P0 CG-PUB-002 de la auditoría de
 *    publicación 2026-10-04 — el JSDoc del componente decía default
 *    `false`, el código tenía `= true` y las 4 escenas heredaban el
 *    botón prohibido).
 * 2. **El modo manda** — en `'crazygames'` el env no puede forzar el
 *    botón: `'true'` se ignora con `console.warn`, que es la única
 *    señal de que `.env` y modo quedaron desincronizados.
 *
 * Igual que `resolveAdsMode`, los literales `'true'`/`'false'` son
 * EXACTOS: espacios alrededor, mayúsculas u otras variantes son typo de
 * deploy → `false` + warn con el valor crudo.
 *
 * @param raw valor crudo de `import.meta.env.VITE_FULLSCREEN`.
 * @param adsMode modo de ads YA resuelto (`VITE_ADS`) — fuente de la
 *   precedencia de la prohibición de CrazyGames.
 */
export function resolveFullscreenEnabled(raw: string | undefined, adsMode: AdsMode): boolean {
  // El modo es la fuente de verdad del cumplimiento: en crazygames el
  // botón propio está prohibido, con o sin env.
  if (adsMode === 'crazygames') {
    if (raw === 'true') {
      console.warn(
        '[resolveFullscreenEnabled] VITE_FULLSCREEN="true" con VITE_ADS="crazygames": ' +
          'la plataforma prohíbe los botones de pantalla completa propios (ADR-008) — ' +
          'se ignora el env y el botón queda desactivado.'
      );
    }
    return false;
  }

  if (raw === undefined) {
    return false;
  }

  // Vacío (incluido `'   '`) → false SIN warn: es dev sin el par de
  // envs, no un typo — mismo contrato que resolveAdsMode.
  const value = raw.trim();
  if (value === '') {
    return false;
  }

  // Espacios alrededor de un literal válido, mayúsculas u otra variante:
  // typo de deploy → apagado + warn con el crudo (la señal que tiene el
  // deployeur de que su env no hizo efecto).
  if (value !== raw || (value !== 'true' && value !== 'false')) {
    console.warn(
      `[resolveFullscreenEnabled] VITE_FULLSCREEN="${raw}" no es un valor válido ` +
        '(esperado: true | false) — el botón de pantalla completa queda desactivado.'
    );
    return false;
  }

  return value === 'true';
}
