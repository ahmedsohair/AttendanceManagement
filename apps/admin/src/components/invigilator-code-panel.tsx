"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "@algo-attendance/shared";
import { KeyIcon } from "@/components/action-icons";
import { CopyButton } from "@/components/copy-button";

type InvigilatorCodePanelProps = {
  initialAccessCode?: string;
  invigilator: User;
};

async function readJsonResponse(response: Response) {
  const payload = (await response.json().catch(() => ({}))) as {
    accessCode?: string;
    message?: string;
  };

  if (!response.ok) {
    throw new Error(payload.message || "Request failed.");
  }

  return payload;
}

export function InvigilatorCodePanel({
  initialAccessCode,
  invigilator
}: InvigilatorCodePanelProps) {
  const [accessCode, setAccessCode] = useState(initialAccessCode || "");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEmailing, setIsEmailing] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!panelRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  async function generateCode() {
    setIsGenerating(true);
    setNotice("");
    setError("");

    try {
      const payload = await readJsonResponse(
        await fetch(`/api/invigilators/${invigilator.id}/access-code`, {
          method: "POST"
        })
      );

      setAccessCode(payload.accessCode || "");
      setNotice(payload.message || "New access code generated.");
    } catch (generateError) {
      setError(
        generateError instanceof Error
          ? generateError.message
          : "Unable to generate access code."
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function emailCode() {
    if (!accessCode) {
      setError("Generate a code before emailing.");
      return;
    }

    setIsEmailing(true);
    setNotice("");
    setError("");

    try {
      const payload = await readJsonResponse(
        await fetch("/api/invigilators/email-code", {
          body: JSON.stringify({
            accessCode,
            email: invigilator.email,
            fullName: invigilator.fullName
          }),
          headers: {
            "Content-Type": "application/json"
          },
          method: "POST"
        })
      );

      setNotice(payload.message || "Access code emailed.");
      window.setTimeout(() => setIsOpen(false), 800);
    } catch (emailError) {
      setError(emailError instanceof Error ? emailError.message : "Unable to email code.");
    } finally {
      setIsEmailing(false);
    }
  }

  return (
    <details className="inline-details" open={isOpen} ref={panelRef}>
      <summary
        className="icon-button"
        onClick={(event) => {
          event.preventDefault();
          setIsOpen((current) => !current);
        }}
        title="Access code"
      >
        <KeyIcon />
        <span className="sr-only">Access code</span>
      </summary>
      <div className="inline-popover">
        {accessCode ? (
          <div className="access-code-box compact-code-box">
            <div>
              <div className="kicker">New Code</div>
              <div className="access-code-value">{accessCode}</div>
            </div>
            <div className="subtle">
              Share this now. Existing codes cannot be viewed later.
            </div>
            <div className="inline-actions">
              <CopyButton
                className="secondary compact-button"
                label="Copy"
                value={accessCode}
              />
              <button type="button" onClick={emailCode} disabled={isEmailing}>
                {isEmailing ? "Emailing..." : "Email Code"}
              </button>
            </div>
          </div>
        ) : (
          <div className="subtle">
            Existing access codes are stored securely and cannot be viewed. Generate a
            new code if this invigilator needs access.
          </div>
        )}
        <button type="button" onClick={generateCode} disabled={isGenerating}>
          {isGenerating ? "Generating..." : "Generate New Code"}
        </button>
        {notice ? <p className="pill ok toast-message">{notice}</p> : null}
        {error ? <p className="pill warn toast-message">{error}</p> : null}
      </div>
    </details>
  );
}
