import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface WorkflowStep {
  run?: string;
  uses?: string;
}

interface Workflow {
  on: { push?: { branches?: string[] } | null; pull_request?: unknown };
  jobs: Record<string, { steps: WorkflowStep[] }>;
}

const path = new URL("../../.github/workflows/ci.yml", import.meta.url);

/** The CI workflow, parsed as GitHub Actions reads it. */
const workflow = (): Workflow => parse(readFileSync(path, "utf8"));

describe("CI workflow", () => {
  it("exists", () => {
    expect(existsSync(path)).toBe(true);
  });

  it("runs on a push to any branch, not just main", () => {
    const { on } = workflow();
    expect(on).toHaveProperty("push");
    expect(on.push?.branches).toBeUndefined();
  });

  it("runs on pull requests", () => {
    expect(workflow().on).toHaveProperty("pull_request");
  });

  it("runs every test, including the format check", () => {
    const steps = Object.values(workflow().jobs).flatMap((job) => job.steps);
    expect(steps.some((step) => step.run === "npm ci")).toBe(true);
    expect(steps.some((step) => step.run === "npm run test:all")).toBe(true);
  });

  it("installs the browsers for the end-to-end tests before running them", () => {
    const steps = Object.values(workflow().jobs).flatMap((job) => job.steps);
    const install = steps.findIndex(
      (step) => step.run === "npx playwright install --with-deps chromium webkit",
    );
    expect(install).toBeGreaterThanOrEqual(0);
    expect(steps.findIndex((step) => step.run === "npm run test:all")).toBeGreaterThan(install);
  });

  it("doesn't deploy", () => {
    const steps = Object.values(workflow().jobs).flatMap((job) => job.steps);
    expect(steps.some((step) => step.uses?.startsWith("actions/deploy-pages@"))).toBe(false);
    expect(steps.some((step) => step.uses?.startsWith("actions/upload-pages-artifact@"))).toBe(
      false,
    );
  });
});
