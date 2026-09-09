import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // Test files and test helpers.
    //
    // `react-refresh/only-export-components` exists to protect hot-module
    // reloading in the dev server, which never loads these. A helper that
    // exports both a wrapper component and a fixture is the right shape for a
    // test utility, and contorting it to satisfy a rule that cannot apply here
    // would make it worse for no benefit.
    files: ['**/*.test.{ts,tsx}', 'src/test/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    // Playwright's fixture callback receives a function named `use`, and
    // `react-hooks/rules-of-hooks` reads any call to `use(...)` as React's
    // `use` hook. It is not one — there is no React in these files at all —
    // so the rule reports `e2e/harness.ts` as broken on every run.
    //
    // Scoped to `e2e/` rather than silenced at the call site: a permanently
    // red error trains people to skim past lint output, and an inline
    // disable would have to be re-added by whoever writes the next fixture.
    files: ['e2e/**/*.ts'],
    rules: {
      'react-hooks/rules-of-hooks': 'off',
    },
  },
])
