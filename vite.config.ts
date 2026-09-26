import { defineConfig, UserConfig } from 'vite';

const config: UserConfig = {
  base: './',
  build: {
    // esbuild (el minificador que Vite ya trae incluido, no requiere
    // instalar nada) en vez de terser: terser saca un puñado de KB
    // extra de más chico, pero es sensiblemente más lento para buildear
    // y, sobre todo, HOY NO es una dependencia de este proyecto
    // (revisar package.json) — activarlo sin agregarlo a
    // devDependencies rompe `vite build` directamente con un error de
    // módulo no encontrado. Si más adelante se quiere exprimir cada KB
    // extra, agregar `terser` como devDependency y cambiar este valor
    // a 'terser' es la única modificación necesaria acá.
    minify: 'esbuild',

    // Vite avisa (no es un error, solo una advertencia en consola) si
    // un chunk individual supera este límite tras minificar. El default
    // es 500 kB. Un motor de juego completo como Phaser 3 minificado
    // ronda ese orden de magnitud por sí solo incluso ya aislado en su
    // propio chunk — así que este número NO se sube para "esconder" el
    // peso del código propio (ese sigue vigilado, separado en sus
    // propios chunks más chicos vía manualChunks), se sube apenas lo
    // necesario para dejar de marcar como sospechoso algo que es
    // inherente a la librería, no un descuido de bundling. Ajustar este
    // valor exacto después de correr `vite build` una vez y mirar el
    // tamaño real reportado para `phaser-vendor`.
    chunkSizeWarningLimit: 750,

    rollupOptions: {
      output: {
        /**
         * Code splitting manual. Recibe el path absoluto del módulo que
         * Rollup está por asignar a un chunk, y devuelve el NOMBRE del
         * chunk destino (o `undefined` para dejar que Rollup decida
         * automáticamente).
         */
        manualChunks(id: string): string | undefined {
          // Phaser aislado en su propio chunk "vendor" — es la pieza
          // central de este fix: separa el motor (pesado, estable)
          // del código de juego (liviano, cambia seguido).
          if (id.includes('node_modules/phaser')) {
            return 'phaser-vendor';
          }

          // Cualquier otra dependencia de terceros (hoy no hay ninguna
          // más además de Phaser en `dependencies`, pero esto cubre a
          // la que se agregue después) va a un vendor genérico,
          // separado igual del código propio.
          if (id.includes('node_modules')) {
            return 'vendor';
          }

          // Sin retorno explícito para el resto (todo lo que vive en
          // src/): Rollup arma automáticamente el/los chunk(s) del
          // código propio según su propio análisis de dependencias — no
          // hace falta (ni conviene) microgestionar manualmente cada
          // escena o componente acá adentro.
          return undefined;
        }
      }
    }
  }
};

// `defineConfig` es el punto de entrada recomendado por Vite (habilita
// autocompletado del editor y, si hiciera falta más adelante, las formas
// de config condicional/por-modo) — envuelve al objeto ya tipado arriba
// como `UserConfig`, que es quien realmente valida la forma completa de
// la configuración.
export default defineConfig(config);