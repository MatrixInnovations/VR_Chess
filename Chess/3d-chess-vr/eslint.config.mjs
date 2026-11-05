import jsdoc from 'eslint-plugin-jsdoc'
import tsdoc from 'eslint-plugin-tsdoc'
import tseslint from 'typescript-eslint'

/**
 * Non-interactive flat config. `npm run lint` never prompts.
 * TSDoc syntax is required, and exported classes, interfaces, and public
 * methods must have a doc comment.
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'coverage/**',
      'public/**',
      'next-env.d.ts',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    extends: [tseslint.configs.recommended],
    plugins: {
      tsdoc,
      jsdoc,
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      'tsdoc/syntax': 'error',
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: true,
          require: {
            ClassDeclaration: true,
            MethodDefinition: true,
            FunctionDeclaration: false,
            ArrowFunctionExpression: false,
            FunctionExpression: false,
          },
          contexts: ['TSInterfaceDeclaration'],
          checkConstructors: true,
          checkGetters: true,
          checkSetters: false,
        },
      ],
    },
  },
)
