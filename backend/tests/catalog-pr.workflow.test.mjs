import { spawn } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

describe("web00-catalog-validate workflow", () => {
  it("PHASE 2.3 real CREATE / UPDATE / DELETE mutations pass the full required web00-catalog-validate workflow commands", async () => {
    const projectRoot = join(process.cwd(), "..");
    const workflow = await readFile(join(projectRoot, ".github", "workflows", "catalog-pr.yml"), "utf8");
    const pullRequestBlock = workflow.match(/on:\r?\n\s+pull_request:[\s\S]*?\r?\n\r?\npermissions:/)?.[0] ?? "";
    const strictScopeBlock = workflow.match(/name:\s+Reject changes outside catalog publication scope[\s\S]*?run:\s+\|([\s\S]*?)(?:\r?\n\s+- name:|\r?\n*$)/)?.[1] ?? "";
    const strictCommandBlock = workflow.match(/name:\s+Validate, generate, and check Pages catalog[\s\S]*?run:\s+\|([\s\S]*?)(?:\r?\n\s+- name:|\r?\n*$)/)?.[1] ?? "";
    const strictTestBlock = workflow.match(/name:\s+Run mutable catalog PR tests[\s\S]*?run:\s+\|([\s\S]*?)(?:\r?\n\s+- name:|\r?\n*$)/)?.[1] ?? "";

    expect(pullRequestBlock).not.toMatch(/\r?\n\s+paths:/);
    expect(workflow).toMatch(/\bweb00-catalog-validate:\r?\n/);
    expect(workflow).toMatch(/\r?\n\s+name:\s+web00-catalog-validate\r?\n/);
    expect(workflow).toMatch(/startsWith\(github\.head_ref,\s*'catalog\/publish\/'\)/);
    expect(workflow).toMatch(/Non-catalog PR/);
    expect(workflow).toMatch(/Reject changes outside catalog publication scope/);
    expect(strictScopeBlock).toMatch(/catalog\/cards\/\[\^\/\]\+\\\.json/);
    expect(strictScopeBlock).toMatch(/assets\/js\/data\\\.js/);
    expect(strictScopeBlock).not.toMatch(/scripts\/build-pages-catalog|pages-catalog-pr-validation|catalog-api-client|catalog-source-policy/);
    expect(strictCommandBlock).toMatch(/node scripts\/build-pages-catalog\.mjs\r?\n/);
    expect(strictCommandBlock).toMatch(/node scripts\/build-pages-catalog\.mjs --check/);
    expect(strictTestBlock).toMatch(/node --test/);

    for (const mutation of ["create", "update", "delete"]) {
      const sandbox = await createCatalogWorkflowSandbox(projectRoot);
      try {
        await mutateCatalogCardJson(sandbox, mutation);

        const checkBeforeGenerate = await runNode(["scripts/build-pages-catalog.mjs", "--check"], sandbox);
        expect(checkBeforeGenerate.exitCode).toBe(1);
        expect(checkBeforeGenerate.combined).toContain("assets/js/data.js is not up to date");

        const workflowCommands = [
          ...normalizeWorkflowCommands(strictCommandBlock),
          ...normalizeWorkflowCommands(strictTestBlock)
        ];
        const workflowResult = await runShell(workflowCommands.join("\n"), sandbox);
        expect(workflowResult.exitCode, `${mutation} workflow failed:\n${workflowResult.combined}`).toBe(0);
        expect(workflowResult.combined).toContain("Pages catalog generated:");
        expect(workflowResult.combined).toContain("Pages catalog OK:");
      } finally {
        await rm(sandbox, { force: true, recursive: true });
      }
    }
  }, 30_000);
});

async function createCatalogWorkflowSandbox(projectRoot) {
  const sandbox = await mkdtemp(join(tmpdir(), "web00-catalog-pr-"));
  await cp(join(projectRoot, "catalog"), join(sandbox, "catalog"), { recursive: true });
  await cp(join(projectRoot, "scripts"), join(sandbox, "scripts"), { recursive: true });
  await cp(join(projectRoot, "assets", "js"), join(sandbox, "assets", "js"), { recursive: true });
  await cp(join(projectRoot, "tests", "frontend"), join(sandbox, "tests", "frontend"), { recursive: true });
  return sandbox;
}

async function mutateCatalogCardJson(sandbox, mutation) {
  const cardsDir = join(sandbox, "catalog", "cards");
  if (mutation === "create") {
    const source = JSON.parse(await readFile(join(cardsDir, "site-custom.json"), "utf8"));
    const card = {
      ...source,
      id: "phase-two-three-created",
      slug: "phase-two-three-created",
      title: "Synthetic Phase 2.3 Created",
      legacyTitle: "Synthetic Phase 2.3 Created"
    };
    await writeFile(join(cardsDir, `${card.id}.json`), `${JSON.stringify(card, null, 2)}\n`, "utf8");
    return;
  }
  if (mutation === "update") {
    const cardPath = join(cardsDir, "site-custom.json");
    const card = JSON.parse(await readFile(cardPath, "utf8"));
    card.title = `${card.title} Phase 2.3`;
    await writeFile(cardPath, `${JSON.stringify(card, null, 2)}\n`, "utf8");
    return;
  }
  await rm(join(cardsDir, "drova.json"));
}

function normalizeWorkflowCommands(block) {
  const commands = [];
  let continued = "";
  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.replace(/^\s{10}/, "").trimEnd();
    const trimmed = line.trim();
    if (!trimmed || trimmed === "set -euo pipefail") {
      continue;
    }
    if (trimmed.endsWith("\\")) {
      continued += `${trimmed.slice(0, -1).trimEnd()} `;
      continue;
    }
    commands.push(`${continued}${trimmed}`.trim());
    continued = "";
  }
  if (continued.trim()) {
    commands.push(continued.trim());
  }
  return commands;
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
