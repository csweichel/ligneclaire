import js from "@eslint/js";
import tseslint from "typescript-eslint";

const nodeImports = [
  "child_process",
  "fs",
  "http",
  "https",
  "net",
  "node:child_process",
  "node:fs",
  "node:http",
  "node:https",
  "node:net",
];

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "apps/**/dist/**",
      "node_modules/**",
      "programs/generated/**",
      "eslint.config.mjs",
      "templates/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "no-eval": "error",
      "no-new-func": "error",
    },
  },
  {
    files: ["programs/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: nodeImports,
        },
      ],
    },
  }
);
