import { validateScannerReport } from "./scanner-telemetry.ts";
import { getApiErrorStatus } from "./api-errors.ts";

type Dependencies = {
  enabled: () => boolean;
  authorize: (request: Request) => Promise<{ id: string }>;
  allow: (request: Request, userId: string) => Promise<boolean>;
  log: (report: NonNullable<ReturnType<typeof validateScannerReport>>, request: Request) => void;
};

export function createScannerTelemetryReceiver(dependencies: Dependencies) {
  return async (request: Request) => {
    if (!dependencies.enabled()) return new Response(null, { status: 404 });
    try {
      if (request.headers.get("origin") !== new URL(request.url).origin) return new Response(null, { status: 403 });
      if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") return new Response(null, { status: 415 });
      if (Number(request.headers.get("content-length")) > 8192) return new Response(null, { status: 413 });
      const user = await dependencies.authorize(request);
      if (!await dependencies.allow(request, user.id)) return new Response(null, { status: 429 });
      const reader = request.body?.getReader();
      if (!reader) return new Response(null, { status: 400 });
      const chunks: Uint8Array[] = [];
      let size = 0;
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => undefined); }, 3000);
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (timedOut) return new Response(null, { status: 408 });
          if (done) break;
          size += value.byteLength;
          if (size > 8192) { await reader.cancel(); return new Response(null, { status: 413 }); }
          chunks.push(value);
        }
      } finally { clearTimeout(timer); reader.releaseLock(); }
      const data = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
      const report = validateScannerReport(JSON.parse(new TextDecoder().decode(data)));
      if (!report) return new Response(null, { status: 422 });
      dependencies.log(report, request);
      return new Response(null, { status: 204 });
    } catch (error) {
      return new Response(null, { status: getApiErrorStatus(error, 503) });
    }
  };
}
