import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/**/*.test.ts", "programs/**/*.test.ts", "apps/**/*.test.ts"],
  },
});
