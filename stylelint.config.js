export default {
  extends: ["stylelint-config-standard"],
  ignoreFiles: ["dist/**", "node_modules/**"],
  rules: {
    "alpha-value-notation": "number",
    "color-function-notation": "modern",
    "custom-property-pattern": null,
    "no-descending-specificity": null,
    "selector-class-pattern": null
  }
};
