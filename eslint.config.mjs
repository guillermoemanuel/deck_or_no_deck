// Configuración de ESLint — MÍNIMA a propósito (ver AGENTS.md).
//
// Objetivo: detectar errores mecánicos y desvíos de estilo baratos, NO
// re-hacer el type-checking (eso ya lo hace `npm run typecheck` con
// `strict: true`) ni pelearse con el código existente. Por eso:
//  - Sin reglas "type-aware" (requieren el tsconfig completo en cada
//    corrida: mucho más lento para un retorno marginal sobre lo que ya
//    cubre tsc).
//  - Sin `eslint:recommended` completo: `no-undef` está apagado porque
//    TypeScript ya resuelve ámbitos (window, document, jest, describe…)
//    y encenderlo solo genera ruido con los globals del navegador/jest.
//  - `no-explicit-any` en 'warn': el código base lo usa deliberadamente
//    en los límites con Phaser/CrazyGames; subirlo a 'error' sería un
//    force-fix de estilo, no una mejora.
//
// Para agregar reglas nuevas: agregar acá y dejar `npm run lint` verde
// en el mismo commit que las introduce.

import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'public/**', '*.zip']
  },
  {
    files: ['src/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module'
    },
    plugins: {
      '@typescript-eslint': tsPlugin
    },
    rules: {
      // La regla que más valor aporta acá: imports/variables sin uso.
      // (`noUnusedLocals` de tsc ya cubre el interior de las funciones;
      // esto llega a los argumentos y a los catch, que tsc ignora.)
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_'
        }
      ],

      // Señal temprana de bugs típicos (=== vs == en comparaciones
      // con null/undefined disfrazadas), sin imponer estilo puro.
      eqeqeq: ['error', 'smart'],

      // Reglas core baratas que evitan errores reales:
      'no-unreachable': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-var': 'error',
      'prefer-const': 'error',

      // 'warn' a propósito: los casts a `any` son legítimos en la
      // frontera con Phaser y con el SDK de CrazyGames (ver casts
      // `as unknown as` en infrastructure/ y presentation/).
      '@typescript-eslint/no-explicit-any': 'warn'
    }
  }
];
