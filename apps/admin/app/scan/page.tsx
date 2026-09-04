import { WebScannerApp } from "@/components/web-scanner-app";
import { ScannerErrorBoundary } from "@/components/scanner-error-boundary";
import { ScannerTelemetryObserver } from "@/components/scanner-telemetry-observer";

export const dynamic = "force-dynamic";

export default function ScanPage() {
  return (
    <div className="scan-route">
      <ScannerTelemetryObserver />
      <ScannerErrorBoundary>
        <WebScannerApp />
      </ScannerErrorBoundary>
    </div>
  );
}
