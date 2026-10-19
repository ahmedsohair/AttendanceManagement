import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../src/components/scanner-preparation.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/components/scanner-preparation.module.css", import.meta.url), "utf8");
const styles = Object.fromEntries([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(([, name]) => [name, name]));
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }
}).outputText;
const componentModule = { exports: {} };
new Function("require", "module", "exports", compiled)(
  name => name.endsWith(".module.css") ? styles : require(name), componentModule, componentModule.exports
);
const { ScannerPreparation } = componentModule.exports;
const render = overrides => renderToStaticMarkup(React.createElement(ScannerPreparation, {
  active: true, ready: false, stage: "engine", slow: false, onManualEntry() {}, onRetry() {}, retryDisabled: false, ...overrides
}));

test("engine preparation identifies the actual active stage without invented progress", () => {
  const html = render();
  assert.match(html, /Loading the scanner engine/);
  assert.match(html, /aria-current="step"><span aria-hidden="true"><\/span>Engine/);
  assert.doesNotMatch(html, /\d+%|almost done|seconds remaining/i);
});

test("model stage marks only the imported engine complete", () => {
  const html = render({ stage: "models" });
  assert.match(html, /Downloading and preparing recognition models/);
  assert.match(html, /data-complete="true"/);
  assert.match(html, /aria-current="step"><span aria-hidden="true"><\/span>Models/);
});

test("a slow pending initializer is not presented as a failed download", () => {
  const html = render({ stage: "models", slow: true, error: "Wait deadline exceeded" });
  assert.match(html, /data-state="slow"/);
  assert.match(html, /setup continues/);
  assert.doesNotMatch(html, /Wait deadline exceeded/);
});

test("actual initialization failure retains manual recovery and stops decorative motion", () => {
  const html = render({ error: "OCR models could not be downloaded." });
  assert.match(html, /data-state="error"/);
  assert.match(html, /data-motion="paused"/);
  assert.match(html, /Use manual entry for now/);
  assert.match(html, /OCR models could not be downloaded/);
  assert.doesNotMatch(html, /Tip:/);
});

test("inactive preparation does not obscure student review or camera recovery", () => {
  assert.equal(render({ active: false }), "");
});

test("a cached ready worker does not flash a new loading panel", () => {
  assert.equal(render({ ready: true }), "");
});

test("manual recovery stays enabled and rotating tips are outside live announcements", () => {
  const html = render();
  assert.match(html, /aria-controls="scanner-manual-student-id"/);
  assert.match(html, /Use manual entry/);
  assert.doesNotMatch(html, /disabled|aria-modal/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /aria-live="off"/);
});

test("CSS supports both manual pause and a reduced-motion alternative", () => {
  assert.match(css, /data-motion="paused"[\s\S]*animation-play-state: paused/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*animation: none/);
});

test("retry is available beside manual entry for failures and long waits only", () => {
  assert.doesNotMatch(render(), /Retry OCR/);
  for (const overrides of [{ error: "Download failed" }, { slow: true }]) {
    const html = render(overrides);
    assert.match(html, /Retry OCR/);
    assert.match(html, /Use manual entry/);
    assert.doesNotMatch(html, /disabled/);
  }
  assert.match(render({ error: "Download failed", retryDisabled: true }), /class="retry" disabled=""/);
});

test("progress is indeterminate, names the real stage, and disappears on failure", () => {
  assert.match(render(), /role="progressbar" aria-label="Scanner setup progress" aria-valuetext="Loading the scanner engine"/);
  assert.match(render({ stage: "models" }), /aria-valuetext="Preparing recognition models"/);
  assert.doesNotMatch(render(), /aria-valuenow/);
  assert.doesNotMatch(render({ error: "Download failed" }), /role="progressbar"/);
  assert.match(css, /data-motion="paused"\] \.progressSweep \{ animation-play-state: paused/);
  assert.match(css, /prefers-reduced-motion: reduce[\s\S]*\.progressSweep \{ animation: none/);
});

test("scanner integration wires retry once and does not claim camera readiness while loading", () => {
  const scanner = readFileSync(new URL("../src/components/web-scanner-app.tsx", import.meta.url), "utf8");
  assert.match(scanner, /onRetry=\{retryOcrLoad\}/);
  assert.match(scanner, /retryDisabled=\{busy \|\| ocrLoading\}/);
  assert.doesNotMatch(scanner, /Camera ready\. Manual entry|Retry OCR Load/);
  assert.match(scanner, /Preparing scanner\. Manual entry is available/);
  assert.match(scanner, /Scanning unavailable\. Use manual entry or retry OCR/);
});
