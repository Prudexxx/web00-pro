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

    expect(trackedOutsideBackend).toEqual([]);
    expect(untrackedOutsideBackend).toEqual([]);
  });
});
