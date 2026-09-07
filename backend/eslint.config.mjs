// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import sonarjs from 'eslint-plugin-sonarjs';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Draconian complexity / size limits: a poor fit for a human author but a good
// automatic net against agent over-code (speculative abstractions, giant
// functions, deep nesting, copy-paste). All `warn` + a monotone --max-warnings
// ceiling in the lint:check script; a rule flips to `error` only once its count
// hits 0. See docs/adr/0005-lint-complexity-budget.md.
const slopBudget = {
  complexity: ['warn', 10],
  'max-depth': ['warn', 4],
  'max-nested-callbacks': ['warn', 3],
  'max-params': ['warn', 4],
  'max-lines-per-function': [
    'warn',
    { max: 80, skipBlankLines: true, skipComments: true },
  ],
  'max-lines': ['warn', { max: 300, skipBlankLines: true, skipComments: true }],
  'sonarjs/cognitive-complexity': ['warn', 15],
  'sonarjs/no-identical-functions': 'warn',
  'sonarjs/no-duplicate-string': ['warn', { threshold: 4 }],
};

export default tseslint.config(
  {
    ignores: ['eslint.config.mjs'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      sourceType: 'commonjs',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    rules: {
      // `any` is the most common way an agent silences a type it should model.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      "prettier/prettier": ["error", { endOfLine: "auto" }],
    },
  },
  {
    // Register the sonarjs plugin only; extending sonarjs.configs.recommended
    // would enable ~50 rules and blow up the baseline.
    plugins: { sonarjs },
    rules: slopBudget,
  },
  {
    // Tests legitimately repeat literals and run long.
    files: ['**/*.spec.ts', 'test/**/*.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      // describe > describe > it > mock callback is idiomatic, not slop.
      'max-nested-callbacks': 'off',
      'sonarjs/no-duplicate-string': 'off',
    },
  },
);
