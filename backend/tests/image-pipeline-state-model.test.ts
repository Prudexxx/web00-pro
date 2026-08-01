import { describe, expect, it } from "vitest";

type FileState =
  | "SELECTED"
  | "QUEUED"
  | "PROCESSING"
  | "PROCESSED"
  | "UPLOADING"
  | "UPLOADED_UNATTACHED"
  | "ATTACHING"
  | "ATTACHED"
  | "FAILED_RETRYABLE"
  | "FAILED_TERMINAL"
  | "CANCELLED"
  | "UNCERTAIN";

type Event =
  | "admit"
  | "start"
  | "processed"
  | "upload"
  | "uploaded"
  | "attach"
  | "attached"
  | "retry"
  | "terminalFail"
  | "transientFail"
  | "cancel"
  | "uncertain"
  | "reconcileAttached"
  | "reconcileRetryable";

const transitionTable: Record<FileState, Partial<Record<Event, FileState>>> = {
  SELECTED: {
    admit: "QUEUED",
    cancel: "CANCELLED",
    terminalFail: "FAILED_TERMINAL",
    transientFail: "FAILED_RETRYABLE"
  },
  QUEUED: {
    cancel: "CANCELLED",
    start: "PROCESSING",
    terminalFail: "FAILED_TERMINAL",
    transientFail: "FAILED_RETRYABLE"
  },
  PROCESSING: {
    cancel: "CANCELLED",
    processed: "PROCESSED",
    terminalFail: "FAILED_TERMINAL",
    transientFail: "FAILED_RETRYABLE",
    uncertain: "UNCERTAIN"
  },
  PROCESSED: {
    cancel: "CANCELLED",
    upload: "UPLOADING",
    terminalFail: "FAILED_TERMINAL",
    transientFail: "FAILED_RETRYABLE",
    uncertain: "UNCERTAIN"
  },
  UPLOADING: {
    cancel: "CANCELLED",
    terminalFail: "FAILED_TERMINAL",
    transientFail: "FAILED_RETRYABLE",
    uncertain: "UNCERTAIN",
    uploaded: "UPLOADED_UNATTACHED"
  },
  UPLOADED_UNATTACHED: {
    attach: "ATTACHING",
    transientFail: "FAILED_RETRYABLE",
    uncertain: "UNCERTAIN"
  },
  ATTACHING: {
    attached: "ATTACHED",
    transientFail: "FAILED_RETRYABLE",
    uncertain: "UNCERTAIN"
  },
  ATTACHED: {
    reconcileAttached: "ATTACHED"
  },
  FAILED_RETRYABLE: {
    retry: "QUEUED"
  },
  FAILED_TERMINAL: {},
  CANCELLED: {
    retry: "QUEUED"
  },
  UNCERTAIN: {
    reconcileAttached: "ATTACHED",
    reconcileRetryable: "FAILED_RETRYABLE"
  }
};

const events: Event[] = [
  "admit",
  "start",
  "processed",
  "upload",
  "uploaded",
  "attach",
  "attached",
  "retry",
  "terminalFail",
  "transientFail",
  "cancel",
  "uncertain",
  "reconcileAttached",
  "reconcileRetryable"
];

describe("image pipeline state model", () => {
  it("rejects impossible transitions across 300 deterministic schedules", () => {
    const invariantViolations: string[] = [];

    for (let seed = 1; seed <= 300; seed += 1) {
      let state: FileState = "SELECTED";
      let value = seed;

      for (let step = 0; step < 40; step += 1) {
        value = nextRandom(value);
        const event = events[value % events.length] as Event;
        const next: FileState | undefined = transitionTable[state][event];

        if (next === undefined) {
          if (isForbiddenTransition(state, event)) {
            continue;
          }
          continue;
        }

        if (state === "ATTACHED" && next !== "ATTACHED") {
          invariantViolations.push(`${seed}:${step}:attached-regressed`);
        }
        if (state === "FAILED_TERMINAL" && event === "retry") {
          invariantViolations.push(`${seed}:${step}:terminal-retried`);
        }
        if (state === "UNCERTAIN" && event === "retry") {
          invariantViolations.push(`${seed}:${step}:uncertain-retried`);
        }
        if (state === "CANCELLED" && next === "ATTACHED") {
          invariantViolations.push(`${seed}:${step}:cancelled-attached`);
        }

        state = next;
      }
    }

    expect(invariantViolations).toEqual([]);
  });
});

function nextRandom(value: number): number {
  return (value * 1_103_515_245 + 12_345) & 0x7fffffff;
}

function isForbiddenTransition(state: FileState, event: Event): boolean {
  return (
    (state === "ATTACHED" && event === "start") ||
    (state === "FAILED_TERMINAL" && event === "retry") ||
    (state === "UNCERTAIN" && event === "retry") ||
    (state === "CANCELLED" && event === "attached")
  );
}
