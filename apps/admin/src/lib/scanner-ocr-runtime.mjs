const wasmSimdProbe = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00, 0xfd, 0x0f, 0xfd, 0x62, 0x0b
]);

export function supportsWasmSimd() {
  try {
    return typeof WebAssembly !== "undefined" && WebAssembly.validate(wasmSimdProbe);
  } catch {
    return false;
  }
}

export function getOcrCanvasWidth(sourceWidth) {
  return Math.min(640, Math.max(360, Math.round(sourceWidth)));
}

export function describeOcrLoadError(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();

  if (normalized.includes("timed out") || normalized.includes("timeout")) {
    return "OCR loading timed out. Use manual entry now, or tap Retry OCR when the connection improves.";
  }
  if (
    normalized.includes("out of memory") ||
    normalized.includes("memory access") ||
    normalized.includes("allocation failed") ||
    normalized.includes("wasm memory")
  ) {
    return "This browser ran out of memory while loading OCR. Close unused tabs, then retry OCR or use manual entry.";
  }
  if (
    normalized.includes("failed to fetch") ||
    normalized.includes("network") ||
    normalized.includes("download")
  ) {
    return "OCR models could not be downloaded. Check the connection, then retry OCR or use manual entry.";
  }
  if (
    normalized.includes("webassembly") ||
    normalized.includes("wasm is not defined") ||
    normalized.includes("unsupported")
  ) {
    return "OCR is not supported by this browser. Continue with manual entry or use a current Safari or Chrome version.";
  }
  if (normalized.includes("cancelled") || normalized.includes("scanner was closed")) {
    return "OCR loading was cancelled. Retry OCR when you are ready, or continue with manual entry.";
  }
  return "OCR could not be initialized. Retry OCR or continue with manual entry.";
}
