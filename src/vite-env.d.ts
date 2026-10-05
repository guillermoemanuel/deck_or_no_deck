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

  /**
   * Muestra el botón de pantalla completa **propio** del juego (ADR-008):
   * literales `'true'` | `'false'`. La escribe la tool `/ads-adapter`
   * junto a `VITE_ADS` (crazygames → `false`: la plataforma prohíbe el
   * botón propio; portal/none → `true`). Si falta, el botón NO se
   * muestra (default seguro) — ver `resolveFullscreenEnabled()`.
   */
  readonly VITE_FULLSCREEN?: 'true' | 'false';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
