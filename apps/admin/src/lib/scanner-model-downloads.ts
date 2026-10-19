// Keep these assets aligned with the pinned PaddleOCR 0.3.2 mobile models.
export const scannerModelAssets = {
  detection: { url: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_det_onnx.tar" },
  recognition: { url: "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0/PP-OCRv5_mobile_rec_onnx.tar" }
} as const;

const modelUrls: string[] = Object.values(scannerModelAssets).map(asset => asset.url);
const maxModelBytes = 24 * 1024 * 1024;

type Download = { controller: AbortController; promise: Promise<Blob> };

export function createScannerModelDownloads({
  fetchImpl = fetch,
  timeoutMs = 60000
}: { fetchImpl?: typeof fetch; timeoutMs?: number } = {}) {
  const downloads = new Map<string, Download>();
  let disposed = false;
  const cancelled = () => new DOMException("Scanner model download cancelled.", "AbortError");

  function start(url: string): Download {
    const existing = downloads.get(url);
    if (existing) return existing;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const download: Download = {
      controller,
      promise: Promise.resolve().then(async () => {
        if (disposed) throw cancelled();
        const response = await fetchImpl(url, {
          signal: controller.signal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
          mode: "cors"
        });
        if (!response.ok) {
          controller.abort();
          await response.body?.cancel().catch(() => undefined);
          throw new Error(`OCR model download failed (HTTP ${response.status}).`);
        }
        const length = Number(response.headers.get("content-length"));
        if (length > maxModelBytes) {
          controller.abort();
          await response.body?.cancel().catch(() => undefined);
          throw new Error("OCR model download exceeds the expected size.");
        }
        const reader = response.body?.getReader();
        if (!reader) throw new Error("OCR model download has an unexpected size.");
        const chunks: Blob[] = [];
        let bytes = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            bytes += value.byteLength;
            if (bytes > maxModelBytes) throw new Error("OCR model download exceeds the expected size.");
            // Immutable parts avoid retaining a full archive of raw JS buffers.
            chunks.push(new Blob([value]));
          }
        } catch (error) {
          controller.abort();
          await reader.cancel().catch(() => undefined);
          throw error;
        } finally {
          reader.releaseLock();
        }
        if (disposed || controller.signal.aborted) throw cancelled();
        if (!bytes) throw new Error("OCR model download has an unexpected size.");
        return new Blob(chunks);
      }).catch(error => {
        controller.abort();
        throw error;
      }).finally(() => clearTimeout(timer))
    };
    downloads.set(url, download);
    // Speculative failures must not reject into login, and must allow a later retry.
    void download.promise.catch(() => {
      if (downloads.get(url) === download) downloads.delete(url);
    });
    return download;
  }

  const modelFetch: typeof fetch = async (input, init) => {
    if (disposed) throw cancelled();
    // Only the SDK's plain GETs for the two public model archives are shared.
    if (typeof input !== "string" || !modelUrls.includes(input) || init !== undefined) {
      return fetchImpl(input, init);
    }
    const pending = downloads.get(input);
    let download = pending ?? start(input);
    let blob: Blob;
    try {
      blob = await download.promise;
    } catch (error) {
      if (!pending || disposed) throw error;
      download = start(input);
      blob = await download.promise;
    }
    if (disposed) throw cancelled();
    // Once handed to OCR, don't retain another archive reference for this visit.
    if (downloads.get(input) === download) downloads.delete(input);
    return new Response(blob);
  };

  return {
    preload() {
      if (!disposed) for (const url of modelUrls) start(url);
    },
    fetch: modelFetch,
    dispose() {
      disposed = true;
      for (const download of downloads.values()) download.controller.abort();
      downloads.clear();
    }
  };
}
