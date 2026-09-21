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
    './src/domain/': {
      branches: 80,
      functions: 85,
      lines: 85
    }
  }
};
