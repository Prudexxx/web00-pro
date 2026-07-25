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

    for (const name of ["admin:bootstrap", "user:create", "user:set-password"]) {
      const script = pkg.scripts?.[name] ?? "";

      expect(script).not.toContain("tsx");
      expect(script).not.toContain("ts-node");
      expect(script).not.toContain("npx");
      expect(script).not.toContain("npm exec");
    }
  });
});
