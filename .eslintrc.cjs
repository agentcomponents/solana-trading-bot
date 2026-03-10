module.exports = {
  root: true,
  ignorePatterns: ['*.d.ts', '**/*.d.ts'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    project: './tsconfig.json'
  },
  plugins: ['@typescript-eslint'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'prettier'
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': 'error',
    '@typescript-eslint/explicit-function-return-type': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/strict-boolean-expressions': 'off',
    'no-console': 'error',
    'no-debugger': 'error',
    'complexity': ['error', 10],
    'max-lines-per-function': ['warn', 50]
  },
  overrides: [
    {
      files: ['src/utils/logger.ts'],
      rules: {
        'no-console': 'off'
      }
    },
    {
      files: ['src/db/**/*.ts'],
      rules: {
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-redundant-type-constituents': 'off',
        '@typescript-eslint/no-unsafe-return': 'off',
        'max-lines-per-function': 'off'
      }
    },
    {
      files: ['tests/**/*.test.ts'],
      rules: {
        'max-lines-per-function': 'off',
        '@typescript-eslint/explicit-function-return-type': 'off'
      }
    }
  ]
};
