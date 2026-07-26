import { describe, expect, it } from "vitest";
import { createAssetUploadCoordinator } from "../src/modules/images/asset-upload-coordinator.js";

describe("asset upload coordinator", () => {
  it("runs operations with the same key sequentially", async () => {
    const coordinator = createAssetUploadCoordinator();
    const events: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstReleased = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = coordinator.runExclusive("same", async () => {
      events.push("first:start");
      await firstReleased;
      events.push("first:end");
      return "first";
    });
    const second = coordinator.runExclusive("same", async () => {
      events.push("second:start");
      return "second";
    });

    await Promise.resolve();
    expect(events).toEqual(["first:start"]);
    releaseFirst?.();

    await expect(Promise.all([first, second])).resolves.toEqual(["first", "second"]);
    expect(events).toEqual(["first:start", "first:end", "second:start"]);
  });

  it("runs operations with different keys in parallel", async () => {
    const coordinator = createAssetUploadCoordinator();
    const events: string[] = [];
    let releaseA: (() => void) | undefined;
    const waitA = new Promise<void>((resolve) => {
      releaseA = resolve;
    });

    const first = coordinator.runExclusive("a", async () => {
      events.push("a:start");
      await waitA;
      events.push("a:end");
    });
    const second = coordinator.runExclusive("b", async () => {
      events.push("b:start");
    });

    await second;
    expect(events).toEqual(["a:start", "b:start"]);
    releaseA?.();
    await first;
  });

  it("releases the lock after rejected operations and removes completed keys", async () => {
    const coordinator = createAssetUploadCoordinator();

    await expect(
      coordinator.runExclusive("retry", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    await expect(coordinator.runExclusive("retry", async () => "ok")).resolves.toBe(
      "ok"
    );
    await expect(coordinator.runExclusive("retry", async () => "again")).resolves.toBe(
      "again"
    );
  });
});
