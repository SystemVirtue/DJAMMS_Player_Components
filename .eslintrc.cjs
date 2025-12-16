module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
    node: true
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended'
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs', 'node_modules', 'electron/dist'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true
    }
  },
  plugins: ['react-refresh', '@typescript-eslint'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    'no-console': ['error', { allow: ['warn', 'error'] }], // Prevent console.log, allow console.warn/error
    '@typescript-eslint/no-explicit-any': 'warn',
    'react/react-in-jsx-scope': 'off' // Not needed in React 17+
  },
  settings: {
    react: {
      version: 'detect'
    }
  }
};

