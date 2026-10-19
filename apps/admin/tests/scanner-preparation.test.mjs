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
  active: true, ready: false, stage: "engine", slow: false, onManualEntry() {}, ...overrides
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
