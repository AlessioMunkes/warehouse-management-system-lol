import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'node_modules', 'coverage', 'build', 'public', 'vite.config.js',  'src/components/ui/**', 'src/hooks/use-mobile.js']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    rules: {
      // Twelve components across four authors set a loading flag at the
      // top of a data-loading effect. Reworking them is a behavioural
      // change each owner should make deliberately, so this stays
      // visible as a warning rather than failing CI. Raise it back to
      // 'error' once those effects are reworked.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
