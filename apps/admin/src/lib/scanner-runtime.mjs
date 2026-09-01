/**
 * @typedef {ReturnType<typeof setTimeout>} ScannerTimer
 */

/**
 * @param {{
 *   task: () => Promise<void>,
 *   delayMs: number,
 *   onError?: (error: unknown) => void,
 *   schedule?: (callback: () => void, delay: number) => ScannerTimer,
 *   cancel?: (timer: ScannerTimer) => void
 * }} options
 */
export function createSingleFlightLoop({
  task,
  delayMs,
  onError = (_error) => undefined,
  schedule = (callback, delay) => setTimeout(callback, delay),
  cancel = (timer) => clearTimeout(timer)
}) {
  let timer = null;
  let generation = 0;
  let inFlight = false;

  function stop() {
    generation += 1;
    if (timer !== null) {
      cancel(timer);
      timer = null;
    }
  }

  function start(initialDelayMs = 0) {
    stop();
    const activeGeneration = generation;

    function scheduleNext(nextDelayMs) {
      if (activeGeneration !== generation) {
        return;
      }

      timer = schedule(async () => {
        timer = null;
        if (activeGeneration !== generation) {
          return;
        }

        if (!inFlight) {
          inFlight = true;
          try {
            await task();
          } catch (error) {
            onError(error);
          } finally {
            inFlight = false;
          }
        }

        scheduleNext(delayMs);
      }, nextDelayMs);
    }

    scheduleNext(initialDelayMs);
  }

  function state() {
    return {
      active: timer !== null || inFlight,
      inFlight,
      generation
    };
  }

  return { start, stop, state };
}

export function getScannerBackAction({ busy, lookupPending, scanPaused, hasRoom }) {
  if (busy || lookupPending) {
    return "wait";
  }
  if (scanPaused) {
    return "cancel-review";
  }
  if (hasRoom) {
    return "room-selection";
  }
  return "stay-signed-in";
}
