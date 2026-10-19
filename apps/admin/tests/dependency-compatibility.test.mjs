import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ExcelJS from "exceljs";

const require = createRequire(import.meta.url);
const nextRequire = createRequire(require.resolve("next/package.json"));
const excelRequire = createRequire(require.resolve("exceljs"));
const paddleRequire = createRequire(import.meta.resolve("@paddleocr/paddleocr-js"));
const ortRequire = createRequire(paddleRequire.resolve("onnxruntime-web"));

test("Next retains its release line while resolving patched CSS and image dependencies", async () => {
  assert.equal(require("next/package.json").version, "15.5.28");
  const postcss = nextRequire("postcss");
  assert.equal(postcss().version, "8.5.23");
  const result = await postcss().process(".probe { color: #123456; }", { from: undefined });
  assert.match(result.css, /color: #123456/);
  const postcssRequire = createRequire(nextRequire.resolve("postcss"));
  const { nanoid } = postcssRequire("nanoid");
  assert.equal(nanoid(12).length, 12);
  const { SourceMapGenerator, SourceMapConsumer } = postcssRequire("source-map-js");
  const generator = new SourceMapGenerator({ file: "probe.css" });
  generator.addMapping({ generated: { line: 1, column: 0 }, original: { line: 1, column: 0 }, source: "source.css" });
  assert.equal(new SourceMapConsumer(generator.toJSON()).originalPositionFor({ line: 1, column: 0 }).source, "source.css");

  const sharp = nextRequire("sharp");
  const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: "#123456" } }).png().toBuffer();
  const image = await sharp(png).metadata();
  assert.equal(image.width, 2);
  assert.equal(image.height, 2);
  assert.equal(image.format, "png");
});

test("ExcelJS conditional-format UUIDs round-trip with the patched CommonJS UUID dependency", async () => {
  const uuid = excelRequire("uuid");
  assert.equal(uuid.validate(uuid.v4()), true);
  assert.throws(() => uuid.v5("probe", uuid.v5.DNS, new Uint8Array(8), 4), RangeError);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Synthetic");
  sheet.addRows([["Student ID", "Present"], ["9000001", 1], ["9000002", 0]]);
  sheet.addConditionalFormatting({ ref: "B2:B3", rules: [{
    type: "dataBar", cfvo: [{ type: "min" }, { type: "max" }],
    color: { argb: "FF123456" }, gradient: false, showValue: true
  }] });
  const buffer = await workbook.xlsx.writeBuffer();
  const restored = new ExcelJS.Workbook();
  await restored.xlsx.load(buffer);
  assert.equal(restored.worksheets[0].getCell("A2").value, "9000001");
  assert.equal(restored.worksheets[0].getCell("B3").value, 0);
  assert.equal(restored.worksheets[0].conditionalFormattings[0].rules[0].type, "dataBar");
});

test("OCR's patched YAML and protobuf leaves retain normal configuration and tensor-message parsing", () => {
  const yaml = paddleRequire("js-yaml");
  assert.deepEqual(yaml.load("scanner:\n  backend: wasm\n  threads: 1\n"), { scanner: { backend: "wasm", threads: 1 } });
  assert.throws(() => yaml.load("!!js/function 'function () {}'"));
  const protobuf = ortRequire("protobufjs");
  const root = protobuf.parse('syntax = "proto3"; message Probe { string value = 1; }').root;
  const message = root.lookupType("Probe");
  const buffer = message.encode(message.create({ value: "synthetic" })).finish();
  assert.equal(message.decode(buffer).value, "synthetic");
  assert.equal(JSON.parse(require("node:fs").readFileSync(ortRequire.resolve("./../package.json"), "utf8")).version, "1.26.0");
});

test("release installers retain the workspace-override fix and the audit gate", () => {
  const yaml = paddleRequire("js-yaml");
  const workflow = yaml.load(readFileSync(new URL("../../../.github/workflows/web-release-gate.yml", import.meta.url), "utf8"));
  for (const job of [workflow.jobs["web-quality"], workflow.jobs["dependency-audit"]]) {
    const setup = job.steps.find(step => step.uses === "actions/setup-node@v5");
    assert.equal(setup.with["node-version"], "22.22.2");
    assert.ok(job.steps.some(step => step.run?.startsWith("npx --yes npm@12.2.1 ci ")));
    assert.ok(job.steps.some(step => step.run?.includes("--workspace @algo-attendance/admin --include-workspace-root")));
  }
  assert.ok(workflow.jobs["dependency-audit"].steps.some(step => step.run === "npm run audit:web"));
  const vercel = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.equal(vercel.installCommand, "npx --yes npm@12.2.1 ci --prefix ../.. --workspace @algo-attendance/admin --include-workspace-root --no-audit --no-fund");
});
