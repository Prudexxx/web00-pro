import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("production CLI scripts", () => {
  it("points every B6 CLI command to compiled dist JavaScript", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };

    expect(pkg.scripts?.["admin:bootstrap"]).toBe(
      "node dist/cli/admin-bootstrap.command.js"
    );
    expect(pkg.scripts?.["user:create"]).toBe("node dist/cli/user-create.command.js");
    expect(pkg.scripts?.["user:set-password"]).toBe(
      "node dist/cli/user-set-password.command.js"
    );
    expect(pkg.scripts?.["storage:bootstrap-public-catalog"]).toBe(
      "node dist/cli/public-catalog-storage-bootstrap.command.js"
    );

    for (const name of [
      "admin:bootstrap",
      "storage:bootstrap-public-catalog",
      "user:create",
      "user:set-password"
    ]) {
      const script = pkg.scripts?.[name] ?? "";

      expect(script).not.toContain("tsx");
      expect(script).not.toContain("ts-node");
      expect(script).not.toContain("npx");
      expect(script).not.toContain("npm exec");
    }
  });

  it("keeps production start free of one-off operational work", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
      scripts?: Record<string, string>;
    };
    const start = pkg.scripts?.start ?? "";

    expect(start).toBe("node dist/server.js");
    expect(start).not.toContain("migrate");
    expect(start).not.toContain("seed");
    expect(start).not.toContain("storage:bootstrap-public-catalog");
    expect(start).not.toContain("storage:bootstrap");
    expect(start).not.toContain("admin:bootstrap");
  });
});
