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
      globals: globals.browser,
    },
  },
  {
    // Context modules deliberately export both the Provider component and the
    // hook that reads it — the standard React convention, and the one used
    // consistently here. Naming those three hooks keeps Fast Refresh happy
    // without scattering suppression comments, and any *other* accidental
    // non-component export in these files is still reported.
    files: ['src/contexts/*.tsx'],
    rules: {
      'react-refresh/only-export-components': [
        'error',
        {
          allowConstantExport: true,
          allowExportNames: ['useAuth', 'useAuthModal', 'useLanguage'],
        },
      ],
    },
  },
])
