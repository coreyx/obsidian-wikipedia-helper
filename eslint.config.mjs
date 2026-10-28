// The community plugin rules Obsidian's reviewers use, which include ESLint's and typescript-eslint's
// type-checked recommended sets.
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  { ignores: ["main.js", "node_modules/", "spike/"] },
  ...obsidianmd.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["*.mjs"] },
      },
    },
    rules: {
      // Proper nouns the UI text names, which stay capitalized in sentence case.
      "obsidianmd/ui/sentence-case": ["warn", { ignoreWords: ["Wikipedia", "Wikipedia's"] }],
    },
  },
  {
    // The scratch test and build scripts aren't shipped in the plugin: they may log, and they
    // build DOM fragments from HTML strings the way a paste delivers them.
    files: ["scratch/**", "*.mjs"],
    rules: {
      "no-console": "off",
      "no-undef": "off",
      // The test stands in a Node global for Obsidian's window.
      "obsidianmd/no-global-this": "off",
      // Build scripts run in Node, never on mobile.
      "obsidianmd/no-nodejs-modules": "off",
      "obsidianmd/rule-custom-message": "off",
      "obsidianmd/prefer-create-el": "off",
      "no-unsanitized/property": "off",
      "@microsoft/sdl/no-inner-html": "off",
    },
  },
]);
