/// <reference types="vite/client" />

/**
 * Env de build de Vite accesible como `import.meta.env` (ADR-007).
 *
 * Este archivo es un script global a propósito (sin imports/exports): las
 * interfaces se fusionan con las que declara `vite/client` en lugar de
 * ocultarlas (`ImportMetaEnv` de Vite trae `BASE_URL`/`MODE`/`DEV`/… y el
 * índice `[key: string]: any`).
 *
 * Tipos de arranque — sin lógica: la validación real de `VITE_ADS` vive en
 * `resolveAdsMode.ts` (fuente única del comportamiento, con su spec).
 */
interface ImportMetaEnv {
  /**
   * Selecciona el adapter de anuncios en build time (ADR-007, decisión 3):
   * `'crazygames'` (default — SDK de CrazyGames, carga dinámica desde
   * `main.ts`), `'portal'` (overlay propio con countdown) o `'none'`
   * (CrazyGamesService sin script → `sdk_unavailable` → filas de ads
   * ocultas). Cualquier otro valor se resuelve a `'crazygames'` (default
   * seguro) con warn — ver `resolveAdsMode()`.
   */
  readonly VITE_ADS?: 'crazygames' | 'portal' | 'none';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
