import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: {
    sortPackageJson: { sortScripts: true },
  },
  lint: {
    jsPlugins: ["eslint-plugin-perfectionist"],
    rules: {
      "sort-imports": "off",
      "perfectionist/sort-imports": [
        "error",
        {
          customGroups: [
            { groupName: "react", elementNamePattern: "^react(?:/.*)?$", selector: "external" },
            { groupName: "next", elementNamePattern: "^next(?:/.*)?$", selector: "external" },
          ],
          groups: [
            "value-builtin",
            "react",
            "next",
            "value-external",
            "value-internal",
            ["value-parent", "value-sibling", "value-index"],
            "side-effect",
            "unknown",
          ],
          internalPattern: ["^~/.+", "^@/.+", "^~.+", "^@wgw-deploy/.+"],
          newlinesBetween: 1,
          order: "asc",
          type: "alphabetical",
        },
      ],
      "perfectionist/sort-named-imports": [
        "error",
        { groups: ["value-import", "type-import"], order: "asc", type: "natural" },
      ],
    },
    options: { typeAware: true, typeCheck: true },
  },
  run: {
    cache: { scripts: true, tasks: true },
    tasks: {
      format: {
        command: "vp fmt --write",
        input: [
          "**/package.json",
          "**/{src,test}/**/*.{ts,tsx,js,jsx,mjs,cjs}",
          "!**/dist/**/*",
          "!**/node_modules/**/*",
        ],
      },
      lint: {
        command: "vp lint --fix --quiet",
        input: [
          "**/{src,test}/**/*.{ts,tsx,js,jsx,mjs,cjs}",
          "!**/dist/**/*",
          "!**/node_modules/**/*",
        ],
      },
      check: {
        command: "vp check --fix && astro check",
        input: [
          "**/vite.config.ts",
          "**/package.json",
          "**/{src,test}/**/*.{ts,tsx,js,jsx,mjs,cjs}",
          "!**/dist/**/*",
          "!**/node_modules/**/*",
        ],
      },
      bundle: {
        command: "vp run -r bundle",
        input: ["**/*.ts", "!**/dist/**/*", "!**/node_modules/**/*"],
      },
      build: {
        command: "astro build",
        input: [
          "src/**/*.ts",
          "src/**/*.astro",
          "packages/*/{src,test}/**/*.ts",
          "!**/dist/**/*",
          "!**/node_modules/**/*",
        ],
      },
      test: {
        command: "vp test",
        input: ["**/tests?/**/*.ts", "**/*.test.ts", "!**/dist/**/*", "!**/node_modules/**/*"],
      },
    },
  },
});
