import type { CliOutput, InteractiveTerminal } from "./cli.types.js";

const forbiddenValueNames = [
  "password",
  "passwordHash",
  "token",
  "cookie",
  "sessionHash",
  "DATABASE_URL"
];

export function writeCliOutput(terminal: InteractiveTerminal, output: CliOutput): void {
  const serialized = JSON.stringify(output);

  for (const forbidden of forbiddenValueNames) {
    if (serialized.includes(forbidden) && forbidden !== "password") {
      throw new Error("Unsafe CLI output was rejected.");
    }
  }

  terminal.writeSafe(`${serialized}\n`);
}
