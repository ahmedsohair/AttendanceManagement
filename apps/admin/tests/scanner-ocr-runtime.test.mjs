import assert from "node:assert/strict";
import test from "node:test";
import {
  extractStudentIdCandidate,
  describeOcrLoadError,
  getOcrCanvasWidth,
  preprocessLowLightImageData,
  supportsWasmSimd
} from "../src/lib/scanner-ocr-runtime.mjs";

test("extracts and prefers a seven-digit student ID candidate", () => {
  assert.equal(extractStudentIdCandidate("Student 1234567 barcode 12345678"), "1234567");
  assert.equal(extractStudentIdCandidate("12 345 67"), "1234567");
  assert.equal(extractStudentIdCandidate("ID: 418I947"), "418947");
});

test("rejects OCR text without a plausible student ID", () => {
  assert.equal(extractStudentIdCandidate("Room 8 level 2"), null);
  assert.equal(extractStudentIdCandidate("12345"), null);
  assert.equal(extractStudentIdCandidate("12345678901"), null);
});

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

test("reuses preprocessing buffers across 200 frames", () => {
  const frame = {
    width: 64,
    height: 24,
    data: new Uint8ClampedArray(64 * 24 * 4).fill(128)
  };
  let buffers = preprocessLowLightImageData(frame);
  const originalGray = buffers.gray;
  const originalIntegral = buffers.integral;

  for (let index = 1; index < 200; index += 1) {
    buffers = preprocessLowLightImageData(frame, buffers);
    assert.equal(buffers.gray, originalGray);
    assert.equal(buffers.integral, originalIntegral);
  }
});
