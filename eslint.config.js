import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  {
    files: ["scripts/**/*.js", "tools/**/*.mjs", "tests/**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        CONFIG: "readonly",
        Hooks: "readonly",
        canvas: "readonly",
        foundry: "readonly",
        game: "readonly",
        ui: "readonly"
      }
    },
    rules: {
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
  }
];
