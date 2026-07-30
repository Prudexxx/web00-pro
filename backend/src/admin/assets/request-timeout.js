export function createTimedSignal({ externalSignal, timeoutMs } = {}) {
  const controller = new AbortController();
  const finiteTimeoutMs = normalizeTimeout(timeoutMs);
  let timedOut = false;
  let timeoutId = null;
  let externalAbortHandler = null;

  if (externalSignal?.aborted === true) {
    controller.abort();
  } else {
    if (externalSignal !== undefined && typeof externalSignal.addEventListener === "function") {
      externalAbortHandler = () => {
        controller.abort();
      };
      externalSignal.addEventListener("abort", externalAbortHandler, { once: true });
    }

    if (finiteTimeoutMs !== null) {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, finiteTimeoutMs);
    }
  }

  return {
    cleanup() {
      if (timeoutId !== null) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (
        externalSignal !== undefined &&
        externalAbortHandler !== null &&
        typeof externalSignal.removeEventListener === "function"
      ) {
        externalSignal.removeEventListener("abort", externalAbortHandler);
        externalAbortHandler = null;
      }
    },
    didTimeout() {
      return timedOut;
    },
    signal: controller.signal
  };
}

function normalizeTimeout(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number) && number >= 0 ? number : null;
}
