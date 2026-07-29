import { describe, expect, it, vi } from "vitest";
import { CliError } from "../src/cli/cli-errors.js";
import {
  createPasswordPolicy,
  promptConfirmedPassword
} from "../src/cli/password-prompt.js";
import type { InteractiveTerminal } from "../src/cli/cli.types.js";
import { parseLoginBody } from "../src/modules/auth/auth.schemas.js";

describe("CLI password policy", () => {
  const policy = createPasswordPolicy();

  it("accepts minimum-length ASCII passwords that B4 login accepts", () => {
    const password = "a".repeat(15);

    expect(policy.validate(password)).toEqual({ ok: true });
    expect(parseLoginBody({ email: "admin@example.com", password }).password).toBe(password);
  });

  it("accepts spaces and preserves leading and trailing spaces", async () => {
    const password = "  long password with spaces  ";
    const terminal = fakeTerminal([password, password]);

    await expect(promptConfirmedPassword(terminal, policy)).resolves.toBe(password);
    expect(terminal.promptSecret).toHaveBeenCalledTimes(2);
  });

  it("accepts astral Unicode and combining characters by code point", () => {
    const astral = "x".repeat(13) + "\u{1F680}\u{1F4A1}";
    const combining = "e\u0301".repeat(8);

    expect([...astral].length).toBe(15);
    expect(policy.validate(astral)).toEqual({ ok: true });
    expect(policy.validate(combining)).toEqual({ ok: true });
  });

  it("rejects values below 15 Unicode code points without composition requirements", () => {
    expect(policy.validate("a".repeat(14))).toMatchObject({
      code: "PASSWORD_TOO_SHORT"
    });
    expect(policy.validate(" ".repeat(15))).toEqual({ ok: true });
  });

  it("accepts exactly the B4 login parser maximum for ASCII passwords", () => {
    const password = "a".repeat(1024);

    expect(policy.validate(password)).toEqual({ ok: true });
    expect(parseLoginBody({ email: "admin@example.com", password }).password).toBe(password);
  });

  it("rejects a code-point-valid password that exceeds B4 code-unit maximum", () => {
    const password = "\u{1F680}".repeat(1024);

    expect([...password].length).toBe(1024);
    expect(password.length).toBe(2048);
    expect(policy.validate(password)).toMatchObject({
      code: "PASSWORD_NOT_LOGIN_COMPATIBLE"
    });
  });

  it("rejects confirmation mismatch with a safe code", async () => {
    const terminal = fakeTerminal(["a".repeat(15), "b".repeat(15)]);

    await expect(promptConfirmedPassword(terminal, policy)).rejects.toMatchObject({
      code: "PASSWORD_CONFIRMATION_MISMATCH"
    });
  });

  it("never normalizes one side of the password comparison", async () => {
    const nfc = "\u00E9".repeat(15);
    const decomposed = "e\u0301".repeat(15);
    const terminal = fakeTerminal([nfc, decomposed]);

    await expect(promptConfirmedPassword(terminal, policy)).rejects.toBeInstanceOf(CliError);
  });
});

function fakeTerminal(secrets: string[]): InteractiveTerminal {
  const promptSecret = vi.fn(async () => {
    const value = secrets.shift();

    if (value === undefined) {
      throw new Error("missing fake secret");
    }

    return value;
  });

  return {
    close: vi.fn(async () => undefined),
    confirmExact: vi.fn(async () => true),
    promptSecret,
    promptVisible: vi.fn(async () => ""),
    writeSafe: vi.fn()
  };
}
