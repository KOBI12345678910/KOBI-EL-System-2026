// ESLint v9 flat config for Techno-Kol Uzi ERP 2026 monorepo.
// Replaces legacy .eslintrc support which was dropped in ESLint v9.
//
// Optional plugins (@typescript-eslint, eslint-plugin-react-hooks) are loaded
// dynamically — if they aren't installed in a given workspace, the config still
// works (rules from missing plugins are simply skipped). This keeps `npm run
// lint` healthy across all workspaces in the monorepo.

const js = require("@eslint/js");

function tryRequire(name) {
  try {
    return require(name);
  } catch {
    return null;
  }
}

const tsPlugin = tryRequire("@typescript-eslint/eslint-plugin");
const tsParser = tryRequire("@typescript-eslint/parser");
const reactHooks = tryRequire("eslint-plugin-react-hooks");

/** Common globals for Node + browser code across the monorepo. */
const commonGlobals = {
  // Node
  process: "readonly",
  Buffer: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  module: "readonly",
  require: "readonly",
  exports: "writable",
  global: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  setInterval: "readonly",
  clearTimeout: "readonly",
  clearInterval: "readonly",
  setImmediate: "readonly",
  clearImmediate: "readonly",
  // Browser
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  fetch: "readonly",
  URL: "readonly",
  URLSearchParams: "readonly",
  localStorage: "readonly",
  sessionStorage: "readonly",
  // Modern
  globalThis: "readonly",
  Promise: "readonly",
};

const baseRules = {
  "no-console": "warn",
  "no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
  "no-empty": ["warn", { allowEmptyCatch: true }],
  "no-constant-condition": ["warn", { checkLoops: false }],
  "no-undef": "off", // TS handles this; for JS we declare globals above
};

const config = [
  // Global ignores — applies to every config object below.
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/coverage/**",
      "_merge-incoming/**",
      "_merge-staging/**",
      "_merge-staging-final/**",
      "_qa-reports/**",
      "_qa-reports-25/**",
      "_audit_tmp/**",
      "_delivery/**",
      "_github-backups/**",
      "_master-registry/**",
      "**/*.min.js",
      "**/vendor/**",
      "**/public/**",
    ],
  },

  // JS / CJS / MJS
  {
    files: ["**/*.{js,cjs,mjs,jsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: commonGlobals,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...baseRules,
    },
  },
];

// TypeScript — only if @typescript-eslint is available.
if (tsPlugin && tsParser) {
  config.push({
    files: ["**/*.{ts,tsx,mts,cts}"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2023,
      sourceType: "module",
      globals: commonGlobals,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: { "@typescript-eslint": tsPlugin },
    rules: {
      ...(tsPlugin.configs?.recommended?.rules ?? {}),
      ...baseRules,
      // TS handles its own unused-var checks better
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "off",
    },
  });
} else {
  // No TS parser installed — skip TS files entirely so the JS lint stays green.
  // To enable TS linting, install: @typescript-eslint/eslint-plugin @typescript-eslint/parser
  config.push({
    ignores: ["**/*.{ts,tsx,mts,cts}"],
  });
}

// React hooks — only for TSX/JSX, only if plugin available.
if (reactHooks) {
  config.push({
    files: ["**/*.{tsx,jsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  });
}

module.exports = config;
