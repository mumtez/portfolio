import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          include: ["src/**/*.test.ts"],
          environment: "node",
        },
      },
      {
        test: {
          name: "site",
          include: ["tests/site/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
