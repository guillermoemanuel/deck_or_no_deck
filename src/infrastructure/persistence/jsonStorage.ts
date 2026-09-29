/**
 * Lectura/escritura JSON tolerante a fallos sobre localStorage. Si el storage
 * no está disponible o lanza (iframes con cookies de terceros bloqueadas,
 * modo privado), nunca rompe el juego: la lectura devuelve `null` y la
 * escritura se ignora (el estado sigue vivo en memoria en cada repositorio).
 */
export function readJson(key: string): unknown | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    console.warn(`[jsonStorage] No se pudo leer "${key}"; se usa memoria.`, error);
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`[jsonStorage] No se pudo guardar "${key}" (solo memoria).`, error);
  }
}

export function removeKey(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`[jsonStorage] No se pudo borrar "${key}".`, error);
  }
}

/** Entero >= 0, o `fallback` si el valor no es un número finito válido. */
export function toCount(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}
