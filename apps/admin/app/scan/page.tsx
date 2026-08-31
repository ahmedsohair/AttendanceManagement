import { WebScannerApp } from "@/components/web-scanner-app";
import { ScannerErrorBoundary } from "@/components/scanner-error-boundary";

export const dynamic = "force-dynamic";

export default function ScanPage() {
  return (
    <div className="scan-route">
      <ScannerErrorBoundary>
        <WebScannerApp />
      </ScannerErrorBoundary>
    </div>
  );
}
