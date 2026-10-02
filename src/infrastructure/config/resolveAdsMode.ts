/**
 * Modo de anuncios efectivo de un build — ADR-007 (decisión 3).
 *
 * Fuente única de los literales válidos: `src/vite-env.d.ts` repite esta
 * unión solo para tipar `import.meta.env.VITE_ADS`; si algún día se agrega
 * un modo, hay que cambiar ambos lugares.
 */
export type AdsMode = 'crazygames' | 'portal' | 'none';

/** Default seguro: sin env (o con basura) el juego se comporta como hoy. */
const DEFAULT_ADS_MODE: AdsMode = 'crazygames';

/**
 * Resuelve el env de build `VITE_ADS` a un modo de ads válido (ADR-007,
 * decisión 3). Nunca lanza: es wiring de arranque del composition root.
 *
 * - `undefined`, vacío o solo espacios → `'crazygames'` (caso normal de
 *   dev/local sin env: default SIN warn — no es un error).
 * - Cualquiera de los 3 valores válidos (tolera espacios alrededor) →
 *   tal cual.
 * - Cualquier otra cosa (typo de deploy, `'true'`, mayúsculas) →
 *   `'crazygames'` (default seguro) + `console.warn` con el valor crudo:
 *   un build desplegado con la env mal escrita no debe caer en silencio a
 *   otro adapter — p. ej. un portal que termina pidiendo el SDK de
 *   CrazyGames por un solo carácter de más. El warn es deliberado (y
 *   testeado en el spec): es la única señal que tiene el deployeur de que
 *   su env no hizo efecto.
 *
 * Por qué default `'crazygames'` y no `'none'`: preservar el
 * comportamiento previo a ADR-007 es el caso que no puede romperse (un
 * build sin env tiene que seguir siendo idéntico al de antes).
 */
export function resolveAdsMode(raw: string | undefined): AdsMode {
  if (raw === undefined) {
    return DEFAULT_ADS_MODE;
  }

  const value = raw.trim();
  if (value === '') {
    return DEFAULT_ADS_MODE;
  }

  // Switch sobre `string` (no sobre la unión): los 3 casos válidos
  // estrechan el tipo a `AdsMode` y el default cubre la basura.
  switch (value) {
    case 'crazygames':
    case 'portal':
    case 'none':
      return value;
    default:
      console.warn(
        `[resolveAdsMode] VITE_ADS="${raw}" no es un modo válido ` +
          `(esperado: crazygames | portal | none) — se usa el default "${DEFAULT_ADS_MODE}".`
      );
      return DEFAULT_ADS_MODE;
  }
}
