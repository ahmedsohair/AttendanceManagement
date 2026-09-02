const databaseName = "exampulse-scanner";
const databaseVersion = 1;
const storeName = "attendance-outbox";
const leaseDurationMs = 30_000;

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve(undefined);
    transaction.onerror = () => reject(transaction.error || new Error("Scanner storage failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Scanner storage was aborted."));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Scanner storage failed."));
  });
}

function openDatabase(indexedDb = globalThis.indexedDB) {
  if (!indexedDb) {
    return Promise.reject(new Error("Offline scanner storage is unavailable in this browser."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDb.open(databaseName, databaseVersion);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(storeName)) {
        database.createObjectStore(storeName, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open scanner storage."));
    request.onblocked = () => reject(new Error("Scanner storage upgrade is blocked by another tab."));
  });
}

export function getRetryDelayMs(attempts, random = Math.random) {
  const exponent = Math.max(0, Math.min(attempts - 1, 5));
  const base = Math.min(1000 * 2 ** exponent, 30_000);
  return Math.round(base * (0.8 + random() * 0.4));
}

export function classifyOutboxError(error) {
  if (error?.kind === "offline" || error?.kind === "timeout") {
    return "retry";
  }
  if (error?.kind === "server" && (!error.status || error.status >= 500 || error.status === 429)) {
    return "retry";
  }
  if (error?.kind === "conflict" || error?.status === 409) {
    return "conflict";
  }
  return "failed";
}

export function summarizeOutbox(items) {
  return items.reduce(
    (counts, item) => {
      counts.total += 1;
      if (item.status === "syncing") counts.syncing += 1;
      else if (item.status === "failed") counts.failed += 1;
      else if (item.status === "conflict") counts.conflict += 1;
      else counts.pending += 1;
      return counts;
    },
    { total: 0, pending: 0, syncing: 0, failed: 0, conflict: 0 }
  );
}

export function createScannerOutbox({ indexedDb = globalThis.indexedDB, now = Date.now } = {}) {
  let databasePromise;
  const getDatabase = () => {
    databasePromise ||= openDatabase(indexedDb);
    return databasePromise;
  };

  async function enqueue(operation) {
    const database = await getDatabase();
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put({
      ...operation,
      status: "pending",
      attempts: 0,
      nextAttemptAt: operation.queuedAt,
      leaseUntil: 0,
      lastError: null
    });
    await transactionDone(transaction);
  }

  async function list() {
    const database = await getDatabase();
    const transaction = database.transaction(storeName, "readonly");
    const items = await requestResult(transaction.objectStore(storeName).getAll());
    await transactionDone(transaction);
    return items.sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
  }

  async function claimNext() {
    const database = await getDatabase();
    const transaction = database.transaction(storeName, "readwrite");
    const objectStore = transaction.objectStore(storeName);
    const items = await requestResult(objectStore.getAll());
    const currentTime = now();
    const candidate = items
      .filter((item) =>
        (item.status === "pending" && item.nextAttemptAt <= currentTime) ||
        (item.status === "syncing" && item.leaseUntil <= currentTime)
      )
      .sort((left, right) => left.queuedAt.localeCompare(right.queuedAt))[0];

    if (candidate) {
      candidate.status = "syncing";
      candidate.leaseUntil = currentTime + leaseDurationMs;
      objectStore.put(candidate);
    }
    await transactionDone(transaction);
    return candidate || null;
  }

  async function complete(id) {
    const database = await getDatabase();
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).delete(id);
    await transactionDone(transaction);
  }

  async function markRetry(id, message, delayMs) {
    const database = await getDatabase();
    const transaction = database.transaction(storeName, "readwrite");
    const objectStore = transaction.objectStore(storeName);
    const item = await requestResult(objectStore.get(id));
    if (item) {
      item.status = "pending";
      item.attempts += 1;
      item.nextAttemptAt = now() + delayMs;
      item.leaseUntil = 0;
      item.lastError = message;
      objectStore.put(item);
    }
    await transactionDone(transaction);
  }

  async function markTerminal(id, status, message) {
    const database = await getDatabase();
    const transaction = database.transaction(storeName, "readwrite");
    const objectStore = transaction.objectStore(storeName);
    const item = await requestResult(objectStore.get(id));
    if (item) {
      item.status = status;
      item.attempts += 1;
      item.leaseUntil = 0;
      item.lastError = message;
      objectStore.put(item);
    }
    await transactionDone(transaction);
  }

  async function retry(id) {
    const database = await getDatabase();
    const transaction = database.transaction(storeName, "readwrite");
    const objectStore = transaction.objectStore(storeName);
    const item = await requestResult(objectStore.get(id));
    if (item) {
      item.status = "pending";
      item.nextAttemptAt = now();
      item.leaseUntil = 0;
      item.lastError = null;
      objectStore.put(item);
    }
    await transactionDone(transaction);
  }

  return { enqueue, list, claimNext, complete, markRetry, markTerminal, retry };
}
