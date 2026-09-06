"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { AuthChangeEvent, Session } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type RecoveryStatus = "checking" | "ready" | "missing" | "error" | "submitting" | "success";
type Submission = {
  id: number;
  userId: string;
  invalidated: boolean;
};
type AuthSubscription = { unsubscribe: () => void };

const RECOVERY_CHECK_TIMEOUT_MS = 5000;
const MISSING_SESSION_MESSAGE =
  "No valid recovery session. Request a new reset email.";
const CHECK_FAILURE_MESSAGE =
  "We could not verify your recovery session. Check your connection and try again.";
const CHECK_TIMEOUT_MESSAGE =
  "Recovery session check took too long. Check your connection and try again.";
const BENIGN_SAME_ACCOUNT_EVENTS = new Set<AuthChangeEvent>([
  "TOKEN_REFRESHED",
  "SIGNED_IN",
  "USER_UPDATED"
]);

type BrowserSupabaseClient = ReturnType<typeof getSupabaseBrowserClient>;

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<RecoveryStatus>("checking");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [returnBusy, setReturnBusy] = useState(false);
  const [returnError, setReturnError] = useState("");
  const mountedRef = useRef(false);
  const statusRef = useRef<RecoveryStatus>("checking");
  const sessionRef = useRef<Session | null>(null);
  const supabaseRef = useRef<BrowserSupabaseClient | null>(null);
  const generationRef = useRef(0);
  const checkTimeoutRef = useRef<number | null>(null);
  const submissionRef = useRef<Submission | null>(null);
  const nextSubmissionIdRef = useRef(0);
  const subscriptionRef = useRef<AuthSubscription | null>(null);
  const returnBusyRef = useRef(false);

  function setRecoveryStatus(nextStatus: RecoveryStatus, nextMessage = "") {
    statusRef.current = nextStatus;
    setStatus(nextStatus);
    setMessage(nextMessage);
  }

  function clearCheckTimeout() {
    if (checkTimeoutRef.current !== null) {
      window.clearTimeout(checkTimeoutRef.current);
      checkTimeoutRef.current = null;
    }
  }

  function clearPasswordDrafts() {
    setPassword("");
    setConfirmPassword("");
  }

  function invalidateSubmission() {
    const submission = submissionRef.current;
    if (!submission) {
      return;
    }

    submission.invalidated = true;
    submissionRef.current = null;
    setBusy(false);
  }

  function beginSessionCheck(supabase: BrowserSupabaseClient) {
    clearCheckTimeout();
    sessionRef.current = null;
    const checkGeneration = generationRef.current + 1;
    generationRef.current = checkGeneration;
    setRecoveryStatus("checking");

    checkTimeoutRef.current = window.setTimeout(() => {
      if (
        !mountedRef.current ||
        generationRef.current !== checkGeneration ||
        statusRef.current !== "checking"
      ) {
        return;
      }

      // Invalidate the unresolved promise; a later auth event gets a new generation.
      generationRef.current += 1;
      sessionRef.current = null;
      checkTimeoutRef.current = null;
      setRecoveryStatus("error", CHECK_TIMEOUT_MESSAGE);
    }, RECOVERY_CHECK_TIMEOUT_MS);

    void supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (
          !mountedRef.current ||
          generationRef.current !== checkGeneration ||
          statusRef.current !== "checking"
        ) {
          return;
        }

        clearCheckTimeout();
        sessionRef.current = data.session;

        if (error) {
          sessionRef.current = null;
          setRecoveryStatus("error", CHECK_FAILURE_MESSAGE);
        } else if (data.session) {
          setRecoveryStatus("ready");
        } else {
          setRecoveryStatus("missing", MISSING_SESSION_MESSAGE);
        }
      })
      .catch(() => {
        if (
          !mountedRef.current ||
          generationRef.current !== checkGeneration ||
          statusRef.current !== "checking"
        ) {
          return;
        }

        clearCheckTimeout();
        sessionRef.current = null;
        setRecoveryStatus("error", CHECK_FAILURE_MESSAGE);
      });
  }

  function handleAuthStateChange(event: AuthChangeEvent, session: Session | null) {
    if (!mountedRef.current) {
      return;
    }

    clearCheckTimeout();
    generationRef.current += 1;
    const previousUserId = sessionRef.current?.user.id ?? null;
    const sameAccount = Boolean(session && previousUserId === session.user.id);
    const accountChanged = Boolean(
      session && previousUserId && previousUserId !== session.user.id
    );
    const isSignedOut = event === "SIGNED_OUT";
    const startsNewRecoveryFlow = event === "PASSWORD_RECOVERY";

    if (!session || isSignedOut || accountChanged || startsNewRecoveryFlow) {
      invalidateSubmission();
      clearPasswordDrafts();
    }

    sessionRef.current = isSignedOut ? null : session;

    if (!session || isSignedOut) {
      sessionRef.current = null;
      setRecoveryStatus("missing", MISSING_SESSION_MESSAGE);
      return;
    }

    if (
      sameAccount &&
      BENIGN_SAME_ACCOUNT_EVENTS.has(event) &&
      (statusRef.current === "submitting" || statusRef.current === "success")
    ) {
      return;
    }

    setRecoveryStatus("ready");
  }

  function ensureAuthSubscription(supabase: BrowserSupabaseClient) {
    if (subscriptionRef.current) {
      return;
    }

    const authState = supabase.auth.onAuthStateChange(handleAuthStateChange);
    subscriptionRef.current = authState.data.subscription;
  }

  function retrySessionCheck() {
    if (!mountedRef.current) {
      return;
    }

    let supabase = supabaseRef.current;
    try {
      supabase ||= getSupabaseBrowserClient();
      supabaseRef.current = supabase;
      ensureAuthSubscription(supabase);
      beginSessionCheck(supabase);
    } catch {
      setRecoveryStatus("error", CHECK_FAILURE_MESSAGE);
    }
  }

  useEffect(() => {
    mountedRef.current = true;

    try {
      const supabase = getSupabaseBrowserClient();
      supabaseRef.current = supabase;
      ensureAuthSubscription(supabase);
      beginSessionCheck(supabase);
    } catch {
      setRecoveryStatus("error", CHECK_FAILURE_MESSAGE);
    }

    return () => {
      mountedRef.current = false;
      clearCheckTimeout();
      if (submissionRef.current) {
        submissionRef.current.invalidated = true;
      }
      submissionRef.current = null;
      subscriptionRef.current?.unsubscribe();
      subscriptionRef.current = null;
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // The ref makes two synchronous submits share one updateUser call.
    if (
      submissionRef.current ||
      statusRef.current !== "ready" ||
      !sessionRef.current
    ) {
      return;
    }

    setMessage("");

    if (password.length < 8) {
      setMessage("Use at least 8 characters for the new password.");
      return;
    }

    if (password !== confirmPassword) {
      setMessage("Passwords do not match.");
      return;
    }

    const supabase = supabaseRef.current;
    const session = sessionRef.current;
    if (!supabase || !session) {
      setRecoveryStatus("missing", MISSING_SESSION_MESSAGE);
      return;
    }

    const submission: Submission = {
      id: nextSubmissionIdRef.current + 1,
      userId: session.user.id,
      invalidated: false
    };
    nextSubmissionIdRef.current = submission.id;
    submissionRef.current = submission;
    setBusy(true);
    setRecoveryStatus("submitting");

    const ownsSubmission = () =>
      mountedRef.current &&
      submissionRef.current === submission &&
      !submission.invalidated &&
      sessionRef.current?.user.id === submission.userId;

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (!ownsSubmission()) {
        return;
      }

      if (error) {
        setRecoveryStatus("ready", error.message || "Unable to update the password.");
        return;
      }

      // Only an accepted update clears the credentials and exposes completion.
      setPassword("");
      setConfirmPassword("");
      setRecoveryStatus("success");
    } catch (updateError) {
      if (ownsSubmission()) {
        setRecoveryStatus(
          "ready",
          updateError instanceof Error
            ? updateError.message
            : "Unable to update the password."
        );
      }
    } finally {
      if (submissionRef.current === submission) {
        submissionRef.current = null;
        setBusy(false);
      }
    }
  }

  async function handleReturnToLogin() {
    if (returnBusyRef.current) {
      return;
    }

    const supabase = supabaseRef.current;
    if (!supabase) {
      setReturnError("Unable to sign out safely. Please return to sign in manually.");
      return;
    }

    returnBusyRef.current = true;
    setReturnBusy(true);
    setReturnError("");

    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
      if (!mountedRef.current) {
        return;
      }

      router.replace("/login?reset=updated");
      router.refresh();
    } catch (signOutError) {
      if (mountedRef.current) {
        setReturnError(
          signOutError instanceof Error
            ? `Unable to sign out: ${signOutError.message}`
            : "Unable to sign out safely. Please try again."
        );
      }
    } finally {
      returnBusyRef.current = false;
      if (mountedRef.current) {
        setReturnBusy(false);
      }
    }
  }

  const title =
    status === "checking"
      ? "Checking Recovery Session"
      : status === "missing"
        ? "No Valid Recovery Session"
        : status === "error"
          ? "Unable to Verify Recovery Session"
          : status === "success"
            ? "Password Updated"
            : "Choose New Password";
  const kicker = status === "success" ? "Recovery Complete" : "Account Recovery";
  const formErrorId = "update-password-error";
  const description =
    status === "success"
      ? "Your password has been updated. Sign in again to continue."
      : status === "missing"
        ? "Request a new reset email to continue."
        : status === "error"
          ? "We could not verify this recovery link. Retry the check or request a new reset email."
          : status === "checking"
            ? "We are checking whether this recovery link is still valid."
            : "Set a new password for your staff account. This link expires automatically.";

  return (
    <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
      <div className="kicker">{kicker}</div>
      <h2 className="section-title">{title}</h2>
      <p className="subtle" style={{ marginTop: 0 }}>
        {description}
      </p>

      {status === "checking" ? (
        <p className="subtle" role="status" aria-live="polite">
          Checking your recovery session...
        </p>
      ) : null}

      {status === "missing" || status === "error" ? (
        <div
          id="update-password-status"
          className="subtle"
          role="alert"
          style={{ color: status === "error" ? "var(--accent-dark)" : "var(--warn)" }}
        >
          <p style={{ marginTop: 0 }}>{message}</p>
          {status === "error" ? (
            <button type="button" className="secondary" onClick={retrySessionCheck}>
              Retry check
            </button>
          ) : null}
        </div>
      ) : null}

      {status === "ready" || status === "submitting" ? (
        <form
          className="form-grid"
          onSubmit={handleSubmit}
          aria-busy={status === "submitting"}
        >
          <div className="form-field">
            <label htmlFor="update-password-new">New password</label>
            <input
              id="update-password-new"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
              aria-describedby={message ? formErrorId : undefined}
              aria-invalid={Boolean(message)}
            />
          </div>
          <div className="form-field">
            <label htmlFor="update-password-confirm">Confirm new password</label>
            <input
              id="update-password-confirm"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
              aria-describedby={message ? formErrorId : undefined}
              aria-invalid={Boolean(message)}
            />
          </div>
          {message ? (
            <p
              id={formErrorId}
              className="subtle"
              role="alert"
              style={{ color: "var(--accent-dark)", marginBottom: 0 }}
            >
              {message}
            </p>
          ) : null}
          <button type="submit" disabled={busy}>
            {busy ? "Updating..." : "Update Password"}
          </button>
        </form>
      ) : null}

      {status === "success" ? (
        <>
          <p className="subtle" style={{ color: "var(--ok)", marginBottom: 0 }} role="status">
            Password updated. You can now sign in again on the web.
          </p>
          <div className="inline-actions" style={{ marginTop: 12 }}>
            <button type="button" onClick={handleReturnToLogin} disabled={returnBusy}>
              {returnBusy ? "Signing out..." : "Return to Sign In"}
            </button>
          </div>
          {returnError ? (
            <p
              id="return-to-login-error"
              className="subtle"
              role="alert"
              style={{ color: "var(--accent-dark)", marginBottom: 0 }}
            >
              {returnError}
            </p>
          ) : null}
        </>
      ) : null}

      {status !== "success" ? (
        <div className="inline-actions" style={{ marginTop: 12 }}>
          <Link href="/reset-password" className="subtle" style={{ color: "var(--accent-dark)" }}>
            Request another recovery email
          </Link>
        </div>
      ) : null}
    </div>
  );
}
