export class ScannerRequestError extends Error {
  /**
   * @param {string} message
   * @param {"cancelled" | "timeout" | "offline" | "auth" | "conflict" | "server"} kind
   * @param {number | undefined} [status]
   */
  constructor(message, kind, status) {
    super(message);
    this.name = "ScannerRequestError";
    this.kind = kind;
    this.status = status;
  }
}

/**
 * @param {{
 *   fetchImpl?: typeof fetch,
 *   onAuthExpired?: () => void,
 *   schedule?: typeof setTimeout,
 *   cancelTimer?: typeof clearTimeout
 * }} [options]
 */
export function createRequestCoordinator({
  fetchImpl = globalThis.fetch,
  onAuthExpired = () => undefined,
  schedule = setTimeout,
  cancelTimer = clearTimeout
} = {}) {
  /** @type {Map<string, AbortController>} */
  const controllers = new Map();

  /**
   * @template T
   * @param {string} key
   * @param {RequestInfo | URL} input
   * @param {RequestInit | undefined} init
   * @param {number} timeoutMs
   * @returns {Promise<T>}
   */
  async function requestJson(key, input, init, timeoutMs = 10000) {
    controllers.get(key)?.abort();
    const controller = new AbortController();
    controllers.set(key, controller);
    let timedOut = false;
    const timeoutId = schedule(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetchImpl(input, { ...init, signal: controller.signal });
      const text = await response.text();
      let payload = {};
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          if (response.ok) {
            throw new ScannerRequestError("The server returned an invalid response.", "server", response.status);
          }
        }
      }

      if (!response.ok) {
        const serverMessage =
          payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
            ? payload.message
            : "Request failed.";

        if (response.status === 401) {
          onAuthExpired();
          throw new ScannerRequestError(
            "Your invigilator session has expired. Sign in again to continue.",
            "auth",
            response.status
          );
        }
        if (response.status === 409) {
          throw new ScannerRequestError(serverMessage, "conflict", response.status);
        }
        throw new ScannerRequestError(serverMessage, "server", response.status);
      }

      return /** @type {T} */ (payload);
    } catch (error) {
      if (controller.signal.aborted) {
        throw new ScannerRequestError(
          timedOut
            ? "The request timed out. Check the connection and try again."
            : "Request cancelled.",
          timedOut ? "timeout" : "cancelled"
        );
      }
      if (error instanceof ScannerRequestError) {
        throw error;
      }
      if (error instanceof TypeError) {
        throw new ScannerRequestError(
          "Unable to reach ExamPulse. Check your connection and try again.",
          "offline"
        );
      }
      throw error;
    } finally {
      cancelTimer(timeoutId);
      if (controllers.get(key) === controller) {
        controllers.delete(key);
      }
    }
  }

  function cancel(...keys) {
    for (const key of keys) {
      controllers.get(key)?.abort();
      controllers.delete(key);
    }
  }

  function cancelAll() {
    controllers.forEach((controller) => controller.abort());
    controllers.clear();
  }

  return {
    requestJson,
    cancel,
    cancelAll,
    activeCount: () => controllers.size
  };
}
