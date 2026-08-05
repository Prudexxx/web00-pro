import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

describe("web00-catalog-validate workflow", () => {
  it("PHASE 2.2 real JSON mutation passes the required web00-catalog-validate workflow commands", async () => {
    const projectRoot = join(process.cwd(), "..");
    const workflow = await readFile(join(projectRoot, ".github", "workflows", "catalog-pr.yml"), "utf8");
    const pullRequestBlock = workflow.match(/on:\r?\n\s+pull_request:[\s\S]*?\r?\n\r?\npermissions:/)?.[0] ?? "";
    const strictCommandBlock = workflow.match(/name:\s+Validate, generate, and check Pages catalog[\s\S]*?run:\s+\|([\s\S]*?)(?:\r?\n\s+- name:|\r?\n*$)/)?.[1] ?? "";

    expect(pullRequestBlock).not.toMatch(/\r?\n\s+paths:/);
    expect(workflow).toMatch(/\bweb00-catalog-validate:\r?\n/);
    expect(workflow).toMatch(/\r?\n\s+name:\s+web00-catalog-validate\r?\n/);
    expect(workflow).toMatch(/startsWith\(github\.head_ref,\s*'catalog\/publish\/'\)/);
    expect(workflow).toMatch(/Non-catalog PR/);
    expect(workflow).toMatch(/Reject changes outside catalog publication scope/);
    expect(strictCommandBlock).toMatch(/node scripts\/build-pages-catalog\.mjs\r?\n/);
    expect(strictCommandBlock).toMatch(/node scripts\/build-pages-catalog\.mjs --check/);

    const sandbox = await createCatalogWorkflowSandbox(projectRoot);
    try {
      const cardPath = join(sandbox, "catalog", "cards", "site-custom.json");
      const card = JSON.parse(await readFile(cardPath, "utf8"));
      card.title = `${card.title} Phase 2.2`;
      await writeFile(cardPath, `${JSON.stringify(card, null, 2)}\n`, "utf8");

      const checkBeforeGenerate = await runNode(["scripts/build-pages-catalog.mjs", "--check"], sandbox);
      expect(checkBeforeGenerate.exitCode).toBe(1);
      expect(checkBeforeGenerate.combined).toContain("assets/js/data.js is not up to date");

      const workflowCommands = normalizeWorkflowCommands(strictCommandBlock);
      const workflowResult = await runShell(workflowCommands.join("\n"), sandbox);
      expect(workflowResult.exitCode).toBe(0);
      expect(workflowResult.combined).toContain("Pages catalog generated:");
      expect(workflowResult.combined).toContain("Pages catalog OK:");
    } finally {
      await rm(sandbox, { force: true, recursive: true });
    }
  }, 20_000);
});

async function createCatalogWorkflowSandbox(projectRoot) {
  const sandbox = await mkdtemp(join(tmpdir(), "web00-catalog-pr-"));
  await cp(join(projectRoot, "catalog"), join(sandbox, "catalog"), { recursive: true });
  await cp(join(projectRoot, "scripts"), join(sandbox, "scripts"), { recursive: true });
  await cp(join(projectRoot, "assets", "js"), join(sandbox, "assets", "js"), { recursive: true });
  await cp(join(projectRoot, "tests", "frontend"), join(sandbox, "tests", "frontend"), { recursive: true });
  return sandbox;
}

function normalizeWorkflowCommands(block) {
  return block
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s{10}/, ""))
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && line.trim() !== "set -euo pipefail" && !line.trim().endsWith("\\"));
}

function runNode(args, cwd) {
  return runProcess(process.execPath, args, cwd);
}

function runShell(script, cwd) {
  const isWindows = process.platform === "win32";
  return runProcess(
    isWindows ? "cmd.exe" : "bash",
    isWindows ? ["/d", "/s", "/c", script.replace(/\n/g, " && ")] : ["-lc", script],
    cwd
  );
}

function runProcess(command, args, cwd) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env },
      shell: false
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (exitCode) => {
      resolve({
        combined: `${stdout}${stderr}`,
        exitCode
      });
    });
  });
}
