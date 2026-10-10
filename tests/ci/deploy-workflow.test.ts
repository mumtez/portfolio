import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

interface WorkflowStep {
  run?: string;
  uses?: string;
  with?: { path?: string };
}

interface Workflow {
  on: { push: { branches: string[] } };
  jobs: {
    build: { steps: WorkflowStep[] };
    deploy: { needs: string; environment: { name: string }; steps: WorkflowStep[] };
  };
}

/** The Pages deploy workflow, parsed as GitHub Actions reads it. */
const workflow: Workflow = parse(
  readFileSync(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8"),
);

const usesAction = (name: string) => (step: WorkflowStep) =>
  step.uses?.startsWith(`${name}@`) ?? false;

describe("Deploy workflow", () => {
  it("runs on every push to main", () => {
    expect(workflow.on.push.branches).toEqual(["main"]);
  });

  it("runs every test before uploading the built site", () => {
    const steps = workflow.jobs.build.steps;
    const tests = steps.findIndex((step) => step.run === "npm run test:all");
    const upload = steps.findIndex(usesAction("actions/upload-pages-artifact"));
    expect(tests).toBeGreaterThanOrEqual(0);
    expect(upload).toBeGreaterThan(tests);
    expect(steps[upload].with?.path).toBe("dist");
  });

  it("deploys to Pages only after the tested build succeeds", () => {
    const deploy = workflow.jobs.deploy;
    expect(deploy.needs).toBe("build");
    expect(deploy.environment.name).toBe("github-pages");
    expect(deploy.steps.some(usesAction("actions/deploy-pages"))).toBe(true);
  });
});
