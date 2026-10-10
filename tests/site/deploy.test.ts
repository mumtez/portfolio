import { describe, expect, it } from "vitest";
import { builtFile } from "./built";

describe("Deploy output (dist/ as uploaded to Pages)", () => {
  // Pages ignores this file for Actions deploys; the domain is set in repo
  // settings (docs/deploy.md). It keeps the intended domain on record in the repo.
  it("names aburustum.com as the custom domain", () => {
    expect(builtFile("CNAME").trim()).toBe("aburustum.com");
  });
});
