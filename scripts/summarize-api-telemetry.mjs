import { readFile, stat } from "node:fs/promises";
import { summarizeTelemetry } from "../apps/admin/src/lib/telemetry-summary.ts";

// Keep exports bounded; do not load environment files or contact remote services.
const maximumBytes = 10 * 1024 * 1024;
const maximumRecords = 50000;
try {
  const [path, ...extra] = process.argv.slice(2);
  if (!path || extra.length) throw new Error("usage");
  const info = await stat(path);
  if (!info.isFile() || info.size > maximumBytes) throw new Error("size");
  const buffer = await readFile(path);
  if (buffer.length > maximumBytes) throw new Error("size");
  const lines = buffer.toString("utf8").replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length > maximumRecords) throw new Error("size");
  let malformedLines = 0;
  const values = lines.map((line) => {
    try { return JSON.parse(line); }
    catch { malformedLines += 1; return null; }
  });
  const report = { ...summarizeTelemetry(values), malformedLines };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  // No valid evidence must never be mistaken for a clean bill of health.
  if (!report.acceptedRecords) process.exitCode = 2;
} catch {
  process.stderr.write("Unable to summarize logs. Supply one readable UTF-8 JSONL file (maximum 10 MiB / 50,000 records). Usage: npm.cmd run telemetry:summary -- <path>\n");
  process.exitCode = 1;
}
