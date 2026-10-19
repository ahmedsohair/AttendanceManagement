import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createScannerModelDownloads, scannerModelAssets } from "../src/lib/scanner-model-downloads.ts";

const urls = Object.values(scannerModelAssets).map(asset => asset.url);
const source = readFileSync(new URL("../src/components/web-scanner-app.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const tick = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

function fixture() {
  const requests = [];
  const downloads = createScannerModelDownloads({ fetchImpl: (url, init) => new Promise((resolve, reject) => {
    requests.push({ url, init, resolve, reject });
    init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
  }) });
  return { downloads, requests, resolve(index, text = "synthetic model archive") { requests[index].resolve(new Response(text)); } };
}

test("constructing the downloader is inert; preload starts exactly two public asset GETs", async () => {
  const f = fixture();
  assert.equal(f.requests.length, 0);
  f.downloads.preload();
  f.downloads.preload();
  await tick();
  assert.deepEqual(f.requests.map(request => request.url), urls);
  for (const { init } of f.requests) {
    assert.equal(init.credentials, "omit");
    assert.equal(init.referrerPolicy, "no-referrer");
    assert.equal(init.mode, "cors");
    assert.equal(init.headers, undefined);
    assert.equal(init.body, undefined);
  }
  f.downloads.dispose();
  await tick();
});

test("foreground OCR joins an in-flight preload without another network request", async () => {
  const f = fixture();
  f.downloads.preload();
  const result = f.downloads.fetch(urls[0]);
  await tick();
  assert.equal(f.requests.length, 2);
  f.resolve(0);
  const response = await result;
  assert.equal(response.ok, true);
  assert.equal(await response.text(), "synthetic model archive");
  f.downloads.dispose();
});

test("completed speculative bytes are reused and independent consumers can read them", async () => {
  const f = fixture();
  f.downloads.preload();
  await tick();
  f.resolve(0, "detector");
  f.resolve(1, "recognizer");
  await tick();
  const [a, b, c] = await Promise.all([f.downloads.fetch(urls[0]), f.downloads.fetch(urls[0]), f.downloads.fetch(urls[1])]);
  assert.deepEqual(await Promise.all([a.text(), b.text(), c.text()]), ["detector", "detector", "recognizer"]);
  assert.equal(f.requests.length, 2);
  f.downloads.dispose();
});

test("a failed preload is non-blocking and does not poison a later foreground fetch", async () => {
  const f = fixture();
  f.downloads.preload();
  await tick();
  f.requests[0].reject(new Error("Offline"));
  await tick();
  const result = f.downloads.fetch(urls[0]);
  await tick();
  assert.equal(f.requests.length, 3);
  f.resolve(2, "recovered");
  assert.equal(await (await result).text(), "recovered");
  f.downloads.dispose();
});

test("failure while foreground joins a preload retries that model once", async () => {
  const f = fixture();
  f.downloads.preload();
  const result = f.downloads.fetch(urls[0]);
  await tick();
  f.requests[0].resolve(new Response("unavailable", { status: 503 }));
  await tick();
  assert.equal(f.requests.length, 3);
  f.requests[2].reject(new Error("Still offline"));
  await assert.rejects(result, /Still offline/);
  assert.equal(f.requests.length, 3);
  f.downloads.dispose();
});

test("ordinary foreground failures remain retryable, without an automatic retry loop", async () => {
  const f = fixture();
  const result = f.downloads.fetch(urls[0]);
  await tick();
  f.requests[0].reject(new Error("Offline"));
  await assert.rejects(result, /Offline/);
  assert.equal(f.requests.length, 1);
  const retry = f.downloads.fetch(urls[0]);
  await tick();
  f.resolve(1);
  await retry;
  f.downloads.dispose();
});

test("timeout bounds speculative network work and frees it for a later retry", async () => {
  let requests = 0;
  const downloads = createScannerModelDownloads({ timeoutMs: 10, fetchImpl: (_url, init) => {
    requests++;
    return new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true }));
  } });
  downloads.preload();
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(requests, 2);
  const result = downloads.fetch(urls[0]);
  await assert.rejects(result, { name: "AbortError" });
  assert.equal(requests, 3);
  downloads.dispose();
});

test("route exit aborts pending downloads and never starts a foreground retry", async () => {
  const f = fixture();
  f.downloads.preload();
  const result = f.downloads.fetch(urls[0]);
  await tick();
  f.downloads.dispose();
  await assert.rejects(result, { name: "AbortError" });
  assert.ok(f.requests.every(request => request.init.signal.aborted));
  f.downloads.preload();
  await assert.rejects(f.downloads.fetch(urls[0]), { name: "AbortError" });
  assert.equal(f.requests.length, 2);
});

test("a new mount works after Strict Mode-style cleanup of the old instance", async () => {
  const old = fixture();
  old.downloads.preload();
  old.downloads.dispose();
  await tick();
  assert.equal(old.requests.length, 0);
  const fresh = fixture();
  fresh.downloads.preload();
  await tick();
  assert.equal(fresh.requests.length, 2);
  fresh.downloads.dispose();
});

test("only plain known model GETs are shared; other requests pass through untouched", async () => {
  const calls = [];
  const fetchImpl = async (...args) => { calls.push(args); return new Response("pass through"); };
  const downloads = createScannerModelDownloads({ fetchImpl });
  const init = { method: "HEAD" };
  await downloads.fetch(urls[0], init);
  await downloads.fetch("https://example.invalid/unrelated");
  assert.equal(calls[0][1], init);
  assert.deepEqual(calls[1], ["https://example.invalid/unrelated", undefined]);
  downloads.dispose();
});

test("empty and unexpectedly large responses are rejected instead of retained", async () => {
  for (const response of [new Response(""), new Response("too big", { headers: { "content-length": String(25 * 1024 * 1024) } })]) {
    const downloads = createScannerModelDownloads({ fetchImpl: async () => response });
    await assert.rejects(downloads.fetch(urls[0]), /expected size|unexpected size/);
    downloads.dispose();
  }
});

test("consumed archives are released instead of retained for the entire scanner visit", async () => {
  const f = fixture();
  const first = f.downloads.fetch(urls[0]);
  await tick();
  f.resolve(0);
  await first;
  const next = f.downloads.fetch(urls[0]);
  await tick();
  assert.equal(f.requests.length, 2);
  f.resolve(1);
  await next;
  f.downloads.dispose();
});

test("non-success response cancels its body and aborts the underlying request", async () => {
  let cancelled = false, signal;
  const downloads = createScannerModelDownloads({ fetchImpl: async (_url, init) => {
    signal = init.signal;
    return new Response(new ReadableStream({ cancel() { cancelled = true; } }), { status: 503 });
  } });
  await assert.rejects(downloads.fetch(urls[0]), /HTTP 503/);
  assert.equal(cancelled, true);
  assert.equal(signal.aborted, true);
  downloads.dispose();
});

test("a missing or understated Content-Length cannot bypass the streaming byte limit", async () => {
  for (const headers of [{}, { "content-length": "1" }]) {
    let cancelled = false, signal, reads = 0;
    const downloads = createScannerModelDownloads({ fetchImpl: async (_url, init) => {
      signal = init.signal;
      return new Response(new ReadableStream({
        pull(controller) {
          reads++;
          controller.enqueue(new Uint8Array(reads === 1 ? 24 * 1024 * 1024 : 1));
        },
        cancel() { cancelled = true; }
      }), { headers });
    } });
    await assert.rejects(downloads.fetch(urls[0]), /exceeds the expected size/);
    assert.equal(cancelled, true);
    assert.equal(signal.aborted, true);
    assert.ok(reads <= 3, "Must stop reading at the cap, not buffer the rest");
    downloads.dispose();
  }
});

test("component mount starts downloads without awaiting auth, camera or the heavy OCR import", () => {
  const start = source.indexOf("  useEffect(() => {\n    const downloads = createScannerModelDownloads();");
  const end = source.indexOf("  }, []);", start);
  assert.ok(start >= 0 && end > start);
  const effect = source.slice(start, end).replace("  useEffect(() => {", "");
  let preloads = 0, disposals = 0;
  const downloads = { preload() { preloads++; }, dispose() { disposals++; } };
  const ref = { current: null };
  const cleanup = new Function("createScannerModelDownloads", "modelDownloadsRef", effect)(() => downloads, ref);
  assert.equal(ref.current, downloads);
  assert.equal(preloads, 1);
  assert.doesNotMatch(effect, /await|PaddleOCR|import\(|accessCode|user|camera/);
  cleanup();
  assert.equal(disposals, 1);
  assert.equal(ref.current, null);
  assert.match(source, /modelDownloadsRef\.current\?\.fetch\)\.then/);
});

test("preloaded model URLs match the installed pinned SDK's existing defaults", () => {
  const sdk = readFileSync(new URL(import.meta.resolve("@paddleocr/paddleocr-js")), "utf8");
  for (const url of urls) assert.ok(sdk.includes(url), "Do not silently prefetch a different OCR model");
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.dependencies["@paddleocr/paddleocr-js"], "0.3.2");
});
