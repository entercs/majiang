module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'miniprogram/services/**/*.js',
    'miniprogram/utils/**/*.js',
  ],
  coverageThreshold: {
    'miniprogram/services/scoreService.js': {
      lines: 100,
      branches: 100,
      functions: 100,
      statements: 100,
    },
  },
};
