import assert from "node:assert/strict";
import test from "node:test";
import {
  describeOcrLoadError,
  getOcrCanvasWidth,
  supportsWasmSimd
} from "../src/lib/scanner-ocr-runtime.mjs";

test("caps OCR images at the model input limit", () => {
  assert.equal(getOcrCanvasWidth(120), 360);
  assert.equal(getOcrCanvasWidth(540), 540);
  assert.equal(getOcrCanvasWidth(1600), 640);
});

test("classifies actionable OCR initialization failures", () => {
  assert.match(describeOcrLoadError(new Error("request timed out")), /timed out/i);
  assert.match(describeOcrLoadError(new Error("Out of memory")), /memory/i);
  assert.match(describeOcrLoadError(new TypeError("Failed to fetch")), /downloaded/i);
  assert.match(describeOcrLoadError(new Error("WebAssembly unsupported")), /not supported/i);
  assert.match(describeOcrLoadError(new Error("scanner was closed")), /cancelled/i);
  assert.match(describeOcrLoadError(new Error("unknown initialization error")), /initialized/i);
});

test("SIMD capability detection is safe and returns a boolean", () => {
  assert.equal(typeof supportsWasmSimd(), "boolean");
});
