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

export function preprocessLowLightImageData(imageData, existingBuffers) {
  const { data, width, height } = imageData;
  const grayLength = width * height;
  const integralLength = (width + 1) * (height + 1);
  const gray =
    existingBuffers?.gray.length === grayLength
      ? existingBuffers.gray
      : new Uint8ClampedArray(grayLength);
  const integral =
    existingBuffers?.integral.length === integralLength
      ? existingBuffers.integral
      : new Float64Array(integralLength);
  integral.fill(0);
  let min = 255;
  let max = 0;

  for (let pixelIndex = 0, dataIndex = 0; pixelIndex < gray.length; pixelIndex += 1, dataIndex += 4) {
    const value = Math.round(
      data[dataIndex] * 0.299 + data[dataIndex + 1] * 0.587 + data[dataIndex + 2] * 0.114
    );
    gray[pixelIndex] = value;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }

  const range = Math.max(20, max - min);
  for (let index = 0; index < gray.length; index += 1) {
    const normalized = ((gray[index] - min) / range) * 255;
    gray[index] = Math.max(0, Math.min(255, Math.round(normalized * 1.18 - 16)));
  }

  for (let y = 0; y < height; y += 1) {
    let rowSum = 0;
    for (let x = 0; x < width; x += 1) {
      rowSum += gray[y * width + x];
      const integralIndex = (y + 1) * (width + 1) + x + 1;
      integral[integralIndex] = integral[integralIndex - (width + 1)] + rowSum;
    }
  }

  const radius = Math.max(8, Math.round(Math.min(width, height) / 28));
  for (let y = 0, dataIndex = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);

    for (let x = 0; x < width; x += 1, dataIndex += 4) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const area = (x1 - x0 + 1) * (y1 - y0 + 1);
      const sum =
        integral[(y1 + 1) * (width + 1) + x1 + 1] -
        integral[y0 * (width + 1) + x1 + 1] -
        integral[(y1 + 1) * (width + 1) + x0] +
        integral[y0 * (width + 1) + x0];
      const value = gray[y * width + x] > sum / area - 8 ? 255 : 0;
      data[dataIndex] = value;
      data[dataIndex + 1] = value;
      data[dataIndex + 2] = value;
      data[dataIndex + 3] = 255;
    }
  }

  return { gray, integral };
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
