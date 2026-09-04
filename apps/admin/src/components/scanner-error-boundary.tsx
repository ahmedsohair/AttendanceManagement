"use client";

import { Component, type ReactNode } from "react";
import { reportScannerEvent } from "@/lib/scanner-telemetry";
import { ExamPulseLogo } from "@/components/exam-pulse-logo";

type ScannerErrorBoundaryProps = {
  children: ReactNode;
};

type ScannerErrorBoundaryState = {
  failed: boolean;
  resetKey: number;
};

export class ScannerErrorBoundary extends Component<
  ScannerErrorBoundaryProps,
  ScannerErrorBoundaryState
> {
  state: ScannerErrorBoundaryState = {
    failed: false,
    resetKey: 0
  };

  static getDerivedStateFromError(): Partial<ScannerErrorBoundaryState> {
    return { failed: true };
  }

  componentDidCatch() {
    reportScannerEvent("boundary_error", "error");
  }

  private tryAgain = () => {
    this.setState((current) => ({
      failed: false,
      resetKey: current.resetKey + 1
    }));
  };

  render() {
    if (this.state.failed) {
      return (
        <div className="web-scan-shell">
          <section className="web-scan-card">
            <ExamPulseLogo className="web-brand-logo" />
            <h1>Scanner Interrupted</h1>
            <p className="subtle">
              Your attendance session is still secure. Try reopening the scanner, or
              reload the page if the camera does not recover.
            </p>
            <button type="button" onClick={this.tryAgain}>
              Reopen Scanner
            </button>
            <button
              className="secondary"
              type="button"
              onClick={() => window.location.reload()}
            >
              Reload Page
            </button>
          </section>
        </div>
      );
    }

    return <div key={this.state.resetKey}>{this.props.children}</div>;
  }
}
