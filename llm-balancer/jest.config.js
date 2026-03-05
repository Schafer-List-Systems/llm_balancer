module.exports = {
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  testEnvironment: 'node',
  rootDir: './',
  testMatch: [
    '**/tests/unit/*.test.js',
    '**/tests/integration/*.test.js',
    '**/tests/e2e/*.test.js'
  ],
};