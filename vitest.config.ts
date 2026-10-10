import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        // Everything that runs without a build, including checks on the CI workflow.
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "tests/ci/**/*.test.ts"],
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
