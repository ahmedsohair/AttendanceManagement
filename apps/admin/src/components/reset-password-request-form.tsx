"use client";

import Link from "next/link";
import { useState } from "react";

export function ResetPasswordRequestForm({
  initialError
}: {
  initialError?: string;
}) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError || "");
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setSent(false);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;

      if (!response.ok) {
        throw new Error(payload?.message || "Unable to send reset email.");
      }

      setSent(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Unable to send reset email."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card account-card account-reset-card">
      <div className="kicker">Account Recovery</div>
      <h2 className="section-title">Reset Password</h2>
      <p className="subtle account-intro">
        Enter your staff email address and we&apos;ll send a secure link to set a new
        password.
      </p>

      <form className="form-grid account-form" onSubmit={handleSubmit}>
        <div className="form-field">
          <label htmlFor="reset-password-email">Email address</label>
          <input
            id="reset-password-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            aria-describedby={error ? "reset-password-error" : undefined}
            aria-invalid={Boolean(error)}
          />
        </div>
        <button type="submit" disabled={busy}>
          {busy ? "Sending..." : "Send Reset Email"}
        </button>
      </form>

      {sent ? (
        <p className="account-status account-status-success">
          If an eligible account exists, a reset email will be sent shortly.
        </p>
      ) : null}

      {error ? (
        <p
          id="reset-password-error"
          className="account-status account-status-error"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div className="inline-actions account-actions account-actions-secondary">
        <Link href="/login" className="subtle">
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
