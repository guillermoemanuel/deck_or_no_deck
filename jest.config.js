/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.spec.ts'],
  collectCoverageFrom: [
    'src/domain/**/*.ts',
    'src/application/**/*.ts',
    'src/infrastructure/persistence/ProgressionManager.ts',
    '!src/**/*.spec.ts',
    '!src/**/testing/**'
  ],
  coverageThreshold: {
    // Umbrales por capa, fijados el 2026-09-30 (Fase 4) contra lo medido ese día:
    //   domain      -> 92.2 stmts / 81.5 branches / 94.5 funcs / 92.0 lines
    //   application -> 93.4 stmts / 88.6 branches / 95.5 funcs / 93.3 lines
    // El margen es de ~4 puntos en stmts/funcs/lines y de ~1.5 en branches
    // (el más justo: DeckManager y GameStateMachine tienen ramas sin cubrir).
    // Objetivo: que código nuevo sin test rompa el gate, sin volver frágil
    // el `npm run test:coverage` ante un refactor legítimo.
    // Si bajás un umbral en vez de subir la cobertura, dejá la justificación
    // en docs/LOG.md — no lo hagas en silencio.
    './src/domain/': {
      statements: 88,
      branches: 80,
      functions: 90,
      lines: 88
    },
    './src/application/': {
      statements: 88,
      branches: 82,
      functions: 90,
      lines: 88
    }
  }
};
