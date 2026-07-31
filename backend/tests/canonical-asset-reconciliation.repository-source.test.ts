import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Prisma canonical asset reconciliation repository source contract", () => {
  it("uses parameterized SELECT FOR UPDATE row locking and no unsafe raw SQL", () => {
    const source = readFileSync(
      join(process.cwd(), "src/modules/admin/sites/canonical-asset-reconciliation.repository.ts"),
      "utf8"
    );

    expect(source).toMatch(/\$queryRaw/);
    expect(source).toContain("FOR UPDATE");
    expect(source).toMatch(/ORDER BY\s+slug/i);
    expect(source).not.toMatch(/\$queryRawUnsafe|\$executeRawUnsafe/);
    expect(source).not.toMatch(/SELECT FOR UPDATE.*\$\{/s);
  });
});
