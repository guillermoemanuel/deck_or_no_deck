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
 * - Un valor válido tiene que ser EXACTAMENTE uno de los 3 literales:
 *   cualquier desviación, INCLUIDOS espacios alrededor
 *   (`'  portal  '`, `' none '`), es un typo de deploy → `'crazygames'`
 *   (default seguro) + `console.warn` con el valor crudo.
 * - Cualquier otra cosa (typo de deploy, `'true'`, mayúsculas) → lo mismo:
 *   `'crazygames'` + `console.warn`. Un build desplegado con la env mal
 *   escrita no debe caer en silencio a otro adapter — p. ej. un portal que
 *   termina pidiendo el SDK de CrazyGames por un solo carácter de más. El
 *   warn es deliberado (y testeado en el spec): es la única señal que tiene
 *   el deployeur de que su env no hizo efecto.
 *
 * Por qué NO se toleran espacios (revisión del diff ADR-007): `main.ts`
 * decide la carga del script del SDK con un espejo plegable por el bundler
 * — `import.meta.env.VITE_ADS !== 'portal' && !== 'none'`, un `===` EXACTO
 * porque una llamada a función no es plegable. Si este predicado
 * tolerara espacios, los dos divergirían: `VITE_ADS=" none "` resolvería
 * adapter `'none'` pero el script de CrazyGames se cargaría igual (ads
 * vivos en un build que ADR-007 promete sin ads) y `VITE_ADS=" portal "`
 * incluiría la URL del SDK en el bundle. Con esta regla los dos
 * predicados coinciden POR CONSTRUCCIÓN y `main.ts` no necesita cambiar.
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
  // Vacío (incluido `'   '`) → default SIN warn: es el caso normal de
  // dev/local sin env, no un typo. Se evalúa ANTES del chequeo de espacios
  // para preservar ese contrato de "vacío sin warn".
  if (value === '') {
    return DEFAULT_ADS_MODE;
  }

  // Cualquier desviación del literal crudo (espacios alrededor) es inválida
  // — ver JSDoc: es la condición que hace equivalente el gate plegable de
  // main.ts por construcción.
  if (value !== raw) {
    return warnInvalid(raw);
  }

  // Switch sobre `string` (no sobre la unión): los 3 casos válidos
  // estrechan el tipo a `AdsMode` y el default cubre la basura.
  switch (value) {
    case 'crazygames':
    case 'portal':
    case 'none':
      return value;
    default:
      return warnInvalid(raw);
  }
}

/** Señal única (y testeada) de que la env no hizo efecto: default seguro + warn con el valor crudo. */
function warnInvalid(raw: string): AdsMode {
  console.warn(
    `[resolveAdsMode] VITE_ADS="${raw}" no es un modo válido ` +
      `(esperado: crazygames | portal | none) — se usa el default "${DEFAULT_ADS_MODE}".`
  );
  return DEFAULT_ADS_MODE;
}
