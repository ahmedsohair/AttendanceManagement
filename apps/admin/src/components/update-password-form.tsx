"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let mounted = true;

    supabase.auth
      .getSession()
      .then(({ data, error: sessionError }) => {
        if (!mounted) {
          return;
        }

        if (sessionError) {
          setError(sessionError.message);
          return;
        }

        if (data.session) {
          setReady(true);
        }
      })
      .catch(() => {
        if (mounted) {
          setError("This recovery link is no longer valid. Request a new password reset email.");
        }
      });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) {
        return;
      }

      if (event === "PASSWORD_RECOVERY" || Boolean(session)) {
        setReady(true);
        setError("");
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Use at least 8 characters for the new password.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const supabase = getSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);
      setPassword("");
      setConfirmPassword("");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to update the password."
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleReturnToLogin() {
    const supabase = getSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login?reset=updated");
    router.refresh();
  }

  return (
    <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
      <div className="kicker">Recovery Complete</div>
      <h2 className="section-title">Choose New Password</h2>
      <p className="subtle" style={{ marginTop: 0 }}>
        Set a new password for your staff account. This link expires automatically.
      </p>

      {!ready && !success ? (
        <p className="subtle" style={{ color: error ? "var(--accent-dark)" : "var(--muted)" }}>
          {error || "Checking your recovery session..."}
        </p>
      ) : null}

      {ready && !success ? (
        <form className="form-grid" onSubmit={handleSubmit}>
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="New password"
            autoComplete="new-password"
            required
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            placeholder="Confirm new password"
            autoComplete="new-password"
            required
          />
          <button type="submit" disabled={busy}>
            {busy ? "Updating..." : "Update Password"}
          </button>
        </form>
      ) : null}

      {success ? (
        <>
          <p className="subtle" style={{ color: "var(--ok)", marginBottom: 0 }}>
            Password updated. You can now return to the mobile app or sign in again on the web.
          </p>
          <div className="inline-actions" style={{ marginTop: 12 }}>
            <button type="button" onClick={handleReturnToLogin}>
              Return to Sign In
            </button>
          </div>
        </>
      ) : null}

      {error && ready ? (
        <p className="subtle" style={{ color: "var(--accent-dark)", marginBottom: 0 }}>
          {error}
        </p>
      ) : null}

      {!success ? (
        <div className="inline-actions" style={{ marginTop: 12 }}>
          <Link href="/reset-password" className="subtle" style={{ color: "var(--accent-dark)" }}>
            Request another recovery email
          </Link>
        </div>
      ) : null}
    </div>
  );
}
