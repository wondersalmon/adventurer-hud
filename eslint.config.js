import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  {
    files: [
      "scripts/**/*.js",
      "tools/**/*.mjs",
      "tests/**/*.mjs",
      "test-ui/**/*.mjs",
      "playwright.config.mjs"
    ],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {}
    },
    rules: {
      "no-undef": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-constant-binary-expression": "error",
      "no-duplicate-imports": "error",
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_"
        }
      ],
      "no-var": "error",
      "prefer-const": "error"
    }
  },
  {
    files: ["scripts/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        CONFIG: "readonly",
        Hooks: "readonly",
        canvas: "readonly",
        foundry: "readonly",
        fromUuid: "readonly",
        game: "readonly",
        ui: "readonly"
      }
    }
  },
  {
    files: ["tools/**/*.mjs", "playwright.config.mjs"],
    languageOptions: { globals: globals.node }
  },
  {
    // Tests host Node fixtures and serialized browser callbacks.
    files: ["tests/**/*.mjs", "test-ui/**/*.mjs"],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        __adventurerHud: "readonly",
        CONFIG: "readonly",
        Hooks: "readonly",
        canvas: "readonly",
        foundry: "readonly",
        game: "readonly",
        ui: "readonly"
      }
    }
  }
];
