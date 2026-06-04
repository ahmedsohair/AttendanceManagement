import { WebScannerApp } from "@/components/web-scanner-app";

export const dynamic = "force-dynamic";

export default function ScanPage() {
  return (
    <div className="scan-route">
      <WebScannerApp />
    </div>
  );
}
