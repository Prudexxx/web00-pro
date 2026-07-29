import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { CliError } from "../src/cli/cli-errors.js";
import { createInteractiveTerminal } from "../src/cli/interactive-terminal.js";

describe("InteractiveTerminal", () => {
  it("requires TTY input and output before reading a secret", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    input.isTTY = false;

    const terminal = createFakeTerminal(input, output);

    await expect(terminal.promptSecret("Password: ")).rejects.toMatchObject({
      code: "INTERACTIVE_TTY_REQUIRED"
    });
    expect(input.setRawMode).not.toHaveBeenCalled();
  });

  it("does not echo secret text or disclose secret length", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const terminal = createFakeTerminal(input, output);
    const secret = terminal.promptSecret("Password: ");

    input.emitData(Buffer.from("secret-value"));
    input.emitData(Buffer.from([13]));

    await expect(secret).resolves.toBe("secret-value");
    expect(output.text).not.toContain("secret-value");
    expect(output.text).not.toContain("*");
  });

  it("handles raw Ctrl+C byte without a SIGINT event", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const terminal = createFakeTerminal(input, output);
    const secret = terminal.promptSecret("Password: ");

    input.emitData(Buffer.from([0x03]));

    await expect(secret).rejects.toMatchObject({
      code: "CLI_CONFIRMATION_REQUIRED"
    });
    expect(output.text).not.toContain("Password cancelled");
  });

  it("restores raw and pause state and removes temporary listeners after success", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    input.isRaw = true;
    input.paused = true;
    const terminal = createFakeTerminal(input, output);
    const baseline = input.listenerCount("data");
    const secret = terminal.promptSecret("Password: ");

    expect(input.listenerCount("data")).toBe(baseline + 1);
    input.emitData(Buffer.from("abc"));
    input.emitData(Buffer.from([13]));

    await expect(secret).resolves.toBe("abc");
    expect(input.isRaw).toBe(true);
    expect(input.isPaused()).toBe(true);
    expect(input.listenerCount("data")).toBe(baseline);
  });

  it("restores non-raw active input after EOF", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    input.isRaw = false;
    input.paused = false;
    const terminal = createFakeTerminal(input, output);
    const secret = terminal.promptSecret("Password: ");

    input.emitEnd();

    await expect(secret).rejects.toBeInstanceOf(CliError);
    expect(input.isRaw).toBe(false);
    expect(input.isPaused()).toBe(false);
    expect(input.listenerCount("data")).toBe(0);
  });

  it("keeps exactly one raw stdin consumer while reading a secret", async () => {
    const input = new FakeInput();
    const output = new FakeOutput();
    const terminal = createFakeTerminal(input, output);
    const secret = terminal.promptSecret("Password: ");

    expect(input.listenerCount("data")).toBe(1);
    input.emitData(Buffer.from("abc"));
    input.emitData(Buffer.from([8, 100, 13]));

    await expect(secret).resolves.toBe("abd");
    expect(input.maxDataListeners).toBe(1);
    expect(input.listenerCount("data")).toBe(0);
  });

  it("allows close to be called twice safely", async () => {
    const terminal = createFakeTerminal(new FakeInput(), new FakeOutput());

    await terminal.close();
    await terminal.close();
  });
});

function createFakeTerminal(input: FakeInput, output: FakeOutput) {
  return createInteractiveTerminal({
    input: input as never,
    output: output as never
  });
}

class FakeInput extends EventEmitter {
  public isRaw = false;
  public isTTY = true;
  public maxDataListeners = 0;
  public paused = true;
  public readonly setRawMode = vi.fn((value: boolean) => {
    this.isRaw = value;

    return this;
  });

  public emitData(value: Buffer): void {
    this.emit("data", value);
  }

  public emitEnd(): void {
    this.emit("end");
  }

  public override on(eventName: string | symbol, listener: (...args: unknown[]) => void): this {
    const result = super.on(eventName, listener);

    if (eventName === "data") {
      this.maxDataListeners = Math.max(this.maxDataListeners, this.listenerCount("data"));
    }

    return result;
  }

  public pause(): this {
    this.paused = true;

    return this;
  }

  public resume(): this {
    this.paused = false;

    return this;
  }

  public isPaused(): boolean {
    return this.paused;
  }
}

class FakeOutput {
  public isTTY = true;
  public text = "";

  public write(value: string | Uint8Array): boolean {
    this.text += typeof value === "string" ? value : Buffer.from(value).toString("utf8");

    return true;
  }
}
