"use client";

const listeners = new Set();
const pendingSessions = [];
const pendingUpdates = [];
let getSessionCalls = 0;
let updateUserCalls = 0;
let signOutCalls = 0;
let subscriptionCalls = 0;

function sessionFor(userId = "b5-user") {
  return {
    access_token: `b5-access-${userId}`,
    refresh_token: `b5-refresh-${userId}`,
    expires_in: 3600,
    expires_at: 4102444800,
    token_type: "bearer",
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: `${userId}@example.test`,
      app_metadata: {},
      user_metadata: {},
      identities: [],
      created_at: "2026-09-06T00:00:00.000Z",
      updated_at: "2026-09-06T00:00:00.000Z"
    }
  };
}

function ensureControls() {
  if (window.__b5AuthControls) return window.__b5AuthControls;

  const controls = {
    emit(event, userId = "b5-user") {
      const session = userId ? sessionFor(userId) : null;
      listeners.forEach((listener) => listener(event, session));
    },
    resolveSession(hasSession = true) {
      pendingSessions.shift()?.resolve({
        data: { session: hasSession ? sessionFor() : null },
        error: null
      });
    },
    resolveUpdate(mode = "success") {
      const pending = pendingUpdates.shift();
      if (!pending) return;
      if (mode === "reject") pending.reject(new Error("Fixture update rejected."));
      else pending.resolve({ error: mode === "error" ? { message: "Fixture update failed." } : null });
    },
    counts() {
      return {
        getSession: getSessionCalls,
        updateUser: updateUserCalls,
        signOut: signOutCalls,
        subscriptions: subscriptionCalls
      };
    }
  };
  window.__b5AuthControls = controls;
  return controls;
}

function getSession() {
  getSessionCalls += 1;
  ensureControls();
  const scenario = window.__b5AuthScenario || "session";
  if (scenario === "reject") return Promise.reject(new Error("Fixture session check rejected."));
  if (scenario === "error") {
    return Promise.resolve({ data: { session: null }, error: { message: "Fixture session check failed." } });
  }
  if (scenario === "stall") {
    return new Promise((resolve) => pendingSessions.push({ resolve }));
  }
  return Promise.resolve({
    data: { session: scenario === "null" ? null : sessionFor() },
    error: null
  });
}

function updateUser() {
  updateUserCalls += 1;
  ensureControls();
  const mode = window.__b5AuthUpdateMode || "success";
  if (mode === "reject") return Promise.reject(new Error("Fixture update rejected."));
  if (mode === "error") return Promise.resolve({ error: { message: "Fixture update failed." } });
  if (mode === "pending") {
    return new Promise((resolve, reject) => pendingUpdates.push({ resolve, reject }));
  }
  return Promise.resolve({ error: null });
}

function signOut() {
  signOutCalls += 1;
  ensureControls();
  const mode = window.__b5AuthSignOutMode || "success";
  if (mode === "error") return Promise.resolve({ error: { message: "Fixture sign-out failed." } });
  if (mode === "pending") return new Promise(() => undefined);
  listeners.forEach((listener) => listener("SIGNED_OUT", null));
  return Promise.resolve({ error: null });
}

export function getSupabaseBrowserClient() {
  ensureControls();
  if (window.__b5AuthScenario === "client-throw" && !window.__b5AuthClientThrew) {
    window.__b5AuthClientThrew = true;
    throw new Error("Fixture client construction failed.");
  }

  return {
    auth: {
      getSession,
      updateUser,
      signOut,
      onAuthStateChange(listener) {
        subscriptionCalls += 1;
        listeners.add(listener);
        return {
          data: {
            subscription: {
              unsubscribe() {
                listeners.delete(listener);
              }
            }
          }
        };
      }
    }
  };
}
