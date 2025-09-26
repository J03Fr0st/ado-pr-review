module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: [
    '**/tests/unit/**/*.test.ts',
    '**/tests/integration/**/*.test.ts'
  ],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/tests/unit/BackgroundSyncService.test.ts',
    '/tests/unit/CacheManager.test.ts',
    '/tests/unit/IntegrationService.test.ts',
    '/tests/unit/PullRequestService.test.ts',
    '/tests/unit/StateManager.test.ts',
    '/tests/unit/WorkflowService.test.ts',
    '/tests/unit/extension.test.ts',
    '/tests/unit/CommentService.test.ts'
  ],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 30000,
  verbose: true
};