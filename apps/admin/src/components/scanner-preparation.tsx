"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./scanner-preparation.module.css";

export type OcrLoadStage = "engine" | "models";

const tips = [
  "You can enter student numbers manually while the scanner prepares.",
  "Keep only the printed student number inside the red box when scanning.",
  "Check the returned student details before choosing Mark Present."
];

type ScannerPreparationProps = {
  active: boolean;
  ready: boolean;
  stage: OcrLoadStage;
  slow: boolean;
  error?: string;
  onManualEntry: () => void;
};

export function ScannerPreparation({ active, ready, stage, slow, error, onManualEntry }: ScannerPreparationProps) {
  const [tip, setTip] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(true);
  const [visible, setVisible] = useState(false);
  const [showReady, setShowReady] = useState(false);
  const wasPreparing = useRef(false);
  const failed = Boolean(error && !slow);
  const moving = active && !ready && !failed && !paused && !reducedMotion && visible;

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPreference = () => setReducedMotion(preference.matches);
    const syncVisibility = () => setVisible(document.visibilityState !== "hidden");
    syncPreference();
    syncVisibility();
    preference.addEventListener("change", syncPreference);
    document.addEventListener("visibilitychange", syncVisibility);
    return () => {
      preference.removeEventListener("change", syncPreference);
      document.removeEventListener("visibilitychange", syncVisibility);
    };
  }, []);

  useEffect(() => {
    if (!moving) return;
    const timer = window.setInterval(() => setTip(current => (current + 1) % tips.length), 7000);
    return () => window.clearInterval(timer);
  }, [moving]);

  useEffect(() => {
    if (!active) {
      setShowReady(false);
      return;
    }
    if (!ready) {
      wasPreparing.current = true;
      return;
    }
    if (!wasPreparing.current) return;
    setShowReady(true);
    const timer = window.setTimeout(() => {
      wasPreparing.current = false;
      setShowReady(false);
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [active, ready]);

  if (!active || (ready && !showReady)) return null;

  const status = ready
    ? "Scanner ready. Position the student number inside the red box."
    : failed
      ? error
      : slow
        ? "Still preparing your scanner. Manual entry is available while setup continues."
        : stage === "engine"
          ? "Loading the scanner engine."
          : "Downloading and preparing recognition models.";

  return (
    <section
      className={`${styles.panel} ${ready ? styles.ready : ""}`}
      aria-label="Scanner preparation"
      data-motion={moving ? "running" : "paused"}
      data-state={ready ? "ready" : failed ? "error" : slow ? "slow" : stage}
    >
      <div className={styles.intro}>
        <div className={styles.art} aria-hidden="true">
          {ready ? (
            <svg viewBox="0 0 96 72" fill="none">
              <circle cx="48" cy="36" r="24" className={styles.readyRing} />
              <path d="m36 36 8 8 17-18" className={styles.check} />
            </svg>
          ) : (
            <svg viewBox="0 0 96 72" fill="none">
              <rect x="9" y="8" width="78" height="56" rx="7" className={styles.card} />
              <circle cx="29" cy="28" r="6" className={styles.cardInk} />
              <path d="M19 46c0-11 20-11 20 0M49 24h25M49 33h18M49 46h25" className={styles.cardInk} />
              <g className={styles.beam}>
                <path d="M4 33h88" className={styles.beamGlow} />
                <path d="M4 36h88" className={styles.beamLine} />
              </g>
            </svg>
          )}
        </div>
        <div className={styles.copy}>
          <h2>{ready ? "Scanner ready" : failed ? "Use manual entry for now" : "Preparing your scanner"}</h2>
          <p className={styles.status} role="status" aria-live="polite" aria-atomic="true">{status}</p>
        </div>
      </div>
      {!ready ? (
        <>
          <ol className={styles.stages} aria-label="Scanner setup stages">
            <li data-complete={stage === "models"} aria-current={stage === "engine" ? "step" : undefined}>
              <span aria-hidden="true" />Engine
            </li>
            <li aria-current={stage === "models" ? "step" : undefined}>
              <span aria-hidden="true" />Models
            </li>
            <li><span aria-hidden="true" />Ready</li>
          </ol>
          {!failed ? <p className={styles.tip} aria-live="off"><strong>Tip:</strong> {tips[tip]}</p> : null}
          <div className={styles.actions}>
            <button type="button" className={styles.manual} onClick={onManualEntry} aria-controls="scanner-manual-student-id">
              Use manual entry
              <svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" /></svg>
            </button>
            {!failed && !reducedMotion ? (
              <button
                type="button"
                className={styles.motion}
                aria-label={paused ? "Resume loading animation and tips" : "Pause loading animation and tips"}
                aria-pressed={paused}
                title={paused ? "Resume animation and tips" : "Pause animation and tips"}
                onClick={() => setPaused(current => !current)}
              >
                <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
                  {paused ? <path d="m7 4 9 6-9 6V4Z" /> : <path d="M7 4v12M13 4v12" />}
                </svg>
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </section>
  );
}
