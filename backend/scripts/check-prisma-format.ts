import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const schemaPath = join(process.cwd(), "prisma", "schema.prisma");
const originalSchema = readFileSync(schemaPath, "utf8");
const tempDirectory = mkdtempSync(join(tmpdir(), "web00-prisma-format-"));
const tempSchemaPath = join(tempDirectory, "schema.prisma");

try {
  writeFileSync(tempSchemaPath, originalSchema, "utf8");

  const result = spawnSync("prisma", ["format", "--schema", tempSchemaPath], {
    encoding: "utf8",
    shell: process.platform === "win32",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }

  const formattedSchema = readFileSync(tempSchemaPath, "utf8");

  if (formattedSchema !== originalSchema) {
    process.stderr.write("Prisma schema is not formatted. Run npm run prisma:format.\n");
    process.exit(1);
  }
} finally {
  rmSync(tempDirectory, { force: true, recursive: true });
}
