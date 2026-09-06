import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import autoImports from './.wxt/eslint-auto-imports.mjs';

// §31 Rule 15 — TypeScript strict, no unchecked `any`.
// §6.5 — forbid dangerous runtime primitives (eval, new Function, remote code).
export default tseslint.config(
  {
    ignores: [
      '.wxt/**',
      '.output/**',
      'coverage/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'stats*.html',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['eslint.config.js', '*.config.js'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
  },
  autoImports,
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-globals': ['error', 'event', 'name'],
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "NewExpression[callee.name='Function'], CallExpression[callee.name='Function']",
          message: '§6.5 — new Function / Function() is forbidden.',
        },
        {
          selector:
            "CallExpression[callee.object.name='document'][callee.property.name='write']",
          message: 'document.write corrupts host pages — use DOM APIs.',
        },
        {
          selector:
            'AssignmentExpression[left.property.name=/^(inner|outer)HTML$/]',
          message:
            '§6.5 / §14.6 — no innerHTML/outerHTML. Build DOM with createElement + textContent; clear with replaceChildren().',
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message:
            '§6.5 — insertAdjacentHTML is an injection sink. Use DOM APIs.',
        },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: '§14.6 — never render model/page-derived HTML.',
        },
      ],
    },
  },
  {
    files: [
      'tests/**/*.{ts,tsx}',
      'e2e/**/*.ts',
      '*.config.ts',
      'scripts/**/*.ts',
    ],
    rules: {
      'no-empty-pattern': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
      '@typescript-eslint/no-implied-eval': 'off',
      '@typescript-eslint/require-await': 'off',
      '@typescript-eslint/unbound-method': 'off',
      'no-implied-eval': 'off',
      'no-new-func': 'off',
      'no-restricted-syntax': 'off',
    },
  },
  {
    // The flat config imports an untyped generated .mjs helper.
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);
