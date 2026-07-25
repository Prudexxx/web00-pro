import { StringDecoder } from "node:string_decoder";
import process from "node:process";
import { createInterface, type Interface } from "node:readline/promises";
import type { Readable, Writable } from "node:stream";
import { CliError } from "./cli-errors.js";
import type { InteractiveTerminal } from "./cli.types.js";

type TerminalInput = Readable & {
  isRaw?: boolean;
  isTTY?: boolean;
  isPaused?: () => boolean;
  setRawMode?: (mode: boolean) => TerminalInput;
};

type TerminalOutput = Writable & {
  isTTY?: boolean;
};

export interface CreateInteractiveTerminalOptions {
  input?: TerminalInput;
  output?: TerminalOutput;
}

export function createInteractiveTerminal(
  options: CreateInteractiveTerminalOptions = {}
): InteractiveTerminal {
  return new NodeInteractiveTerminal(
    options.input ?? (process.stdin as TerminalInput),
    options.output ?? (process.stdout as TerminalOutput)
  );
}

class NodeInteractiveTerminal implements InteractiveTerminal {
  private closed = false;
  private owner: "visible" | "secret" | null = null;
  private visible: Interface | null = null;

  public constructor(
    private readonly input: TerminalInput,
    private readonly output: TerminalOutput
  ) {}

  public async promptVisible(label: string): Promise<string> {
    this.assertInteractive();
    this.assertFree();
    this.owner = "visible";
    this.visible = createInterface({
      input: this.input,
      output: this.output,
      terminal: true
    });

    try {
      return await this.visible.question(label);
    } finally {
      this.visible.close();
      this.visible = null;
      this.owner = null;
    }
  }

  public async promptSecret(label: string): Promise<string> {
    this.assertInteractive();
    this.assertFree();
    this.closeVisibleReader();

    if (typeof this.input.setRawMode !== "function") {
      throw new CliError("INTERACTIVE_TTY_REQUIRED");
    }

    const wasRaw = this.input.isRaw === true;
    const wasPaused = this.input.isPaused?.() ?? true;
    const decoder = new StringDecoder("utf8");
    const chars: string[] = [];
    this.owner = "secret";
    this.output.write(label);

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        this.input.off("data", onData);
        this.input.off("error", onError);
        this.input.off("end", onEnd);
        this.input.setRawMode?.(wasRaw);
        if (wasPaused) {
          this.input.pause();
        } else {
          this.input.resume();
        }
        this.owner = null;
        this.output.write("\n");
      };
      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }

        settled = true;
        try {
          cleanup();
        } finally {
          callback();
        }
      };
      const accept = () => {
        finish(() => resolve(chars.join("")));
      };
      const fail = (error: unknown) => {
        finish(() => reject(error));
      };
      const onEnd = () => {
        fail(new CliError("CLI_CONFIRMATION_REQUIRED"));
      };
      const onError = () => {
        fail(new CliError("CLI_CONFIRMATION_REQUIRED"));
      };
      const onData = (chunk: Buffer | string) => {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);

        for (const byte of bytes) {
          if (byte === 0x03) {
            fail(new CliError("CLI_CONFIRMATION_REQUIRED"));
            return;
          }

          if (byte === 0x0d || byte === 0x0a) {
            accept();
            return;
          }

          if (byte === 0x08 || byte === 0x7f) {
            chars.pop();
            continue;
          }

          const single = Buffer.from([byte]);

          try {
            const decoded = decoder.write(single);

            if (decoded !== "") {
              chars.push(...[...decoded]);
            }
          } finally {
            single.fill(0);
          }
        }
      };

      this.input.on("data", onData);
      this.input.on("error", onError);
      this.input.on("end", onEnd);
      this.input.setRawMode?.(true);
      this.input.resume();
    });
  }

  public async confirmExact(label: string, expected: string): Promise<boolean> {
    return (await this.promptVisible(label)) === expected;
  }

  public writeSafe(message: string): void {
    this.output.write(message);
  }

  public async close(): Promise<void> {
    if (this.closed) {
      return;
    }

    this.closed = true;
    this.closeVisibleReader();
  }

  private assertInteractive(): void {
    if (this.input.isTTY !== true || this.output.isTTY !== true) {
      throw new CliError("INTERACTIVE_TTY_REQUIRED");
    }
  }

  private assertFree(): void {
    if (this.owner !== null) {
      throw new CliError("CLI_CONFIRMATION_REQUIRED");
    }
  }

  private closeVisibleReader(): void {
    if (this.visible !== null) {
      this.visible.close();
      this.visible = null;
      this.owner = null;
    }
  }
}
