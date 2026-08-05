import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Catalog PR validation workflow", () => {
  it("runs as a required check for every PR while strict catalog validation is limited to catalog/publish branches", async () => {
    const workflow = await readFile(join(process.cwd(), "..", ".github", "workflows", "catalog-pr.yml"), "utf8");
    const pullRequestBlock = workflow.match(/on:\r?\n\s+pull_request:[\s\S]*?\r?\n\r?\npermissions:/)?.[0] ?? "";

    expect(pullRequestBlock).not.toMatch(/\r?\n\s+paths:/);
    expect(workflow).toMatch(/startsWith\(github\.head_ref,\s*'catalog\/publish\/'\)/);
    expect(workflow).toMatch(/Non-catalog PR/);
    expect(workflow).toMatch(/Reject changes outside catalog publication scope/);
    expect(workflow).toMatch(/node scripts\/build-pages-catalog\.mjs --check/);
  });
});
