// eslint-config-next v16 ships flat config arrays, so they spread in directly.
// Pinned to ESLint 9: the plugin bundled inside eslint-config-next still calls
// context.getFilename(), which ESLint 10 removed, despite the package declaring
// a peer range of >=9.
import jsxA11y from "eslint-plugin-jsx-a11y";
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  ...coreWebVitals,
  ...typescript,
  /*
   * The full accessibility rule set, not the six rules Next enables.
   *
   * eslint-config-next turns on `alt-text` and a handful of aria checks. The
   * rules that matter for this codebase are the ones it leaves off —
   * `label-has-associated-control` and `click-events-have-key-events` — because
   * the admin is built out of hand-rolled controls rather than a component
   * library that got them right for us.
   */
  {
    files: ["**/*.{jsx,tsx}"],
    /*
     * The rules only — spreading `jsxA11y.flatConfigs.recommended` whole fails
     * with 'Cannot redefine plugin "jsx-a11y"', because eslint-config-next has
     * already registered the plugin under that name. Borrowing its rule list
     * and leaving the registration alone is the same result without the clash.
     */
    rules: {
      ...jsxA11y.flatConfigs.recommended.rules,
      /*
       * A <label> that wraps its control is the pattern this codebase uses,
       * and it is the accessible one — no id/htmlFor pair to get out of step.
       * The rule only looks two levels deep for the label's text by default,
       * which misses `<label><input/><span><span>Text</span></span></label>`.
       */
      "jsx-a11y/label-has-associated-control": ["error", { depth: 4 }],
    },
  },
  { ignores: [".next/**", "node_modules/**", "drizzle/**", "playwright-report/**", "test-results/**"] },
];

export default config;
