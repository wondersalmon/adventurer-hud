module.exports = {
  extends: ["stylelint-config-standard"],
  ignoreFiles: ["dist/**", "node_modules/**"],
  rules: {
    "alpha-value-notation": "number",
    "color-function-notation": "modern",
    "custom-property-pattern": null,
    "no-descending-specificity": null,
    "selector-class-pattern": null,
    // Prettier removes blank lines between keyframe steps. Keep nested blocks
    // compatible across Stylelint versions; top-level rule spacing stays checked.
    "rule-empty-line-before": [
      "always-multi-line",
      { except: ["first-nested"], ignore: ["after-comment", "inside-block"] }
    ]
  }
};
