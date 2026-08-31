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
    <div className="card" style={{ maxWidth: 520, margin: "0 auto" }}>
      <div className="kicker">Account Recovery</div>
      <h2 className="section-title">Reset Password</h2>
      <p className="subtle" style={{ marginTop: 0 }}>
        Enter your staff email address and we&apos;ll send a secure link to set a new
        password.
      </p>

      <form className="form-grid" onSubmit={handleSubmit}>
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="Email address"
          autoComplete="email"
          required
        />
        <button type="submit" disabled={busy}>
          {busy ? "Sending..." : "Send Reset Email"}
        </button>
      </form>

      {sent ? (
        <p className="subtle" style={{ color: "var(--ok)", marginBottom: 0 }}>
          If an eligible account exists, a reset email will be sent shortly.
        </p>
      ) : null}

      {error ? (
        <p className="subtle" style={{ color: "var(--accent-dark)", marginBottom: 0 }}>
          {error}
        </p>
      ) : null}

      <div className="inline-actions" style={{ marginTop: 12 }}>
        <Link href="/login" className="subtle" style={{ color: "var(--accent-dark)" }}>
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
