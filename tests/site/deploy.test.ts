import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Deploy output (dist/ as uploaded to Pages)", () => {
  it("names aburustum.com as the custom domain", () => {
    const cname = readFileSync(new URL("../../dist/CNAME", import.meta.url), "utf8");
    expect(cname.trim()).toBe("aburustum.com");
  });
});
