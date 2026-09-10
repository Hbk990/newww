// eslint-config-next v16 ships flat config arrays, so they spread in directly.
// Pinned to ESLint 9: the plugin bundled inside eslint-config-next still calls
// context.getFilename(), which ESLint 10 removed, despite the package declaring
// a peer range of >=9.
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const config = [
  ...coreWebVitals,
  ...typescript,
  { ignores: [".next/**", "node_modules/**", "drizzle/**"] },
];

export default config;
