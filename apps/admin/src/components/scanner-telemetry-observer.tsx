"use client";

import { useEffect } from "react";
import { createScannerReporter, observeScannerErrors, setScannerReporter } from "@/lib/scanner-telemetry";

export function ScannerTelemetryObserver() {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SCANNER_TELEMETRY_ENABLED !== "true") return;
    const reporter = createScannerReporter({
      userAgent: navigator.userAgent,
      send: async (report) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        try {
          await fetch("/api/telemetry/scanner", {
            method: "POST", credentials: "same-origin", signal: controller.signal,
            headers: { "Content-Type": "application/json" }, body: JSON.stringify(report)
          });
        } finally { clearTimeout(timeout); }
      }
    });
    setScannerReporter(reporter);
    const stopObserving = observeScannerErrors(window);
    const interval = setInterval(() => { void reporter.flush(); }, 30000);
    return () => {
      clearInterval(interval);
      stopObserving();
      setScannerReporter(null);
      reporter.stop();
    };
  }, []);
  return null;
}
