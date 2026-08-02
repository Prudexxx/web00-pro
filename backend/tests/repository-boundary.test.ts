import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

function runGit(args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    throw new Error(`Git command failed: git ${args.join(" ")}`, { cause: error });
  }
}

function normalizePaths(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((entry) => entry.trim().replaceAll("\\", "/"))
    .filter(Boolean);
}

const authorizedQamaxNonBackendPaths = new Set([
  "app.html",
  "assets/css/catalog-premium.css",
  "assets/css/home-premium.css",
  "assets/css/pricing-premium.css",
  "assets/css/public-premium.css",
  "assets/css/status-premium.css",
  "assets/js/main.js",
  "cabinet.html",
  "contacts.html",
  "docs/WEB00_BACKEND_READINESS_AUDIT.md",
  "docs/WEB00_FRONTEND_TO_BACKEND_HANDOFF.md",
  "docs/WEB00_PUBLIC_CATALOG_ALWAYS_AVAILABLE_IMPLEMENTATION_PLAN.md",
  "faq.html",
  "how-it-works.html",
  "index.html",
  "pricing.html",
  "services.html",
  "solutions.html",
  "status.html",
  "tests/frontend/static-page-contract.test.mjs"
]);

describe("repository boundary", () => {
  it("checks repository root and non-backend paths", () => {
    const repoRoot = runGit(["rev-parse", "--show-toplevel"]).trim();

    expect(repoRoot).not.toHaveLength(0);

    const trackedOutsideBackend = normalizePaths(
      runGit(["-C", repoRoot, "diff", "--name-only", "--", ".", ":(exclude)backend/**"])
    );
    const untrackedOutsideBackend = normalizePaths(
      runGit(["-C", repoRoot, "ls-files", "--others", "--exclude-standard", "--", ".", ":(exclude)backend/**"])
    );

    expect(
      trackedOutsideBackend.filter((path) => !authorizedQamaxNonBackendPaths.has(path))
    ).toEqual([]);
    expect(
      untrackedOutsideBackend.filter((path) => !authorizedQamaxNonBackendPaths.has(path))
    ).toEqual([]);
  });
});
