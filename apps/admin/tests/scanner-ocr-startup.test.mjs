import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { describeOcrLoadError } from "../src/lib/scanner-ocr-runtime.mjs";
import { scannerModelAssets } from "../src/lib/scanner-model-downloads.ts";

// Exercise the actual component functions with controlled async dependencies,
// without loading the camera, models, React renderer or hosted services.
const source = readFileSync(new URL("../src/components/web-scanner-app.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");
function between(start, end) {
  const offset = source.indexOf(start);
  assert.ok(offset >= 0, `Missing source boundary: ${start}`);
  const limit = source.indexOf(end, offset + start.length);
  assert.ok(limit > offset, `Missing source boundary: ${end}`);
  return source.slice(offset, limit);
}
const startupSource = stripTypeScriptTypes(
  between("async function withTimeout<T>", "async function createDigitOcrWorker") +
  between("  async function loadOcrWorker()", "  function startOcrLoop()") +
  between("  async function startCamera(room: RoomWithSession)", "  async function toggleTorch()")
);
const readyEffect = between(
  "  useEffect(() => {\n    if (\n      !ocrReady",
  "  }, [ocrReady, cameraActive, user, selectedRoom, scanPaused, scanHold]);"
).replace("  useEffect(() => {", "");

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function fixture() {
  const initializations = [];
  const timers = new Map();
  const disposed = [];
  let nextTimer = 0;
  let starts = 0;
  const state = {
    ocrReady: false, ocrLoading: false, ocrLoadError: "", ocrStatus: "",
    cameraActive: true, user: { id: "synthetic" }, selectedRoom: { id: "room-a" },
    scanPaused: false, scanHold: false,
    componentActiveRef: { current: true }, cameraGenerationRef: { current: 1 },
    selectedRoomRef: { current: { id: "room-a" } }, scanPausedRef: { current: false },
    ocrWorkerRef: { current: null }, ocrLoadPromiseRef: { current: null },
    modelDownloadsRef: { current: null },
    streamRef: { current: { getVideoTracks: () => [{ readyState: "live" }] } },
    document: { visibilityState: "visible" },
    onnxModelTimeoutMs: 45000,
    setOcrStatus: value => { state.ocrStatus = value; },
    setOcrLoading: value => { state.ocrLoading = value; },
    setOcrReady: value => { state.ocrReady = value; },
    setOcrLoadError: value => { state.ocrLoadError = value; },
    setStatusMessage: () => { throw new Error("OCR must not overwrite attendance messages"); },
    describeOcrLoadError,
    measureScannerOperation: (_event, operation) => operation(),
    createDigitOcrWorker: () => {
      const gate = deferred();
      initializations.push(gate);
      return gate.promise;
    },
    startOcrLoopRef: { current: () => { starts++; } }
  };
  const window = {
    setTimeout(callback, ms) {
      assert.equal(ms, 45000, "Production timeout stays unchanged");
      const id = ++nextTimer;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) { timers.delete(id); }
  };
  function render() {
    const names = Object.keys(state).join(",");
    return new Function("window", "state", `const {${names}}=state;\n${startupSource}\nreturn {loadOcrWorker,retryOcrLoad,startCamera};`)(window, state);
  }
  function runReadyEffect() {
    const names = Object.keys(state).join(",");
    new Function("state", `const {${names}}=state;\n${readyEffect}`)(state);
  }
  return {
    state, render, runReadyEffect, initializations, disposed, starts: () => starts,
    expire() { for (const callback of [...timers.values()]) callback(); },
    resolve(index = 0) {
      const worker = { dispose: async () => { disposed.push(index); } };
      initializations[index].resolve(worker);
      return worker;
    }
  };
}

test("late initialization automatically becomes ready after the wait times out", async () => {
  const f = fixture();
  const wait = f.render().loadOcrWorker();
  const rejected = assert.rejects(wait, /timed out/);
  f.expire();
  await rejected;
  f.state.ocrLoadError = "OCR is still loading";
  const worker = f.resolve();
  await f.state.ocrLoadPromiseRef.current;
  assert.equal(f.state.ocrWorkerRef.current, worker);
  assert.equal(f.state.ocrReady, true);
  assert.equal(f.state.ocrLoadError, "");
  f.runReadyEffect();
  assert.equal(f.starts(), 1);
});

test("retry while pending reuses one initialization and announces readiness", async () => {
  const f = fixture();
  const first = f.render().loadOcrWorker();
  const rejected = assert.rejects(first, /timed out/);
  f.expire();
  await rejected;
  const retry = f.render().retryOcrLoad();
  assert.equal(f.state.ocrLoading, true);
  f.resolve();
  await retry;
  assert.equal(f.initializations.length, 1);
  assert.equal(f.state.ocrLoading, false);
  f.runReadyEffect();
  assert.equal(f.starts(), 1);
});

test("ready worker is reusable rather than becoming a dead-end Retry", async () => {
  const f = fixture();
  const wait = f.render().loadOcrWorker();
  f.resolve();
  await wait;
  await f.render().retryOcrLoad();
  f.runReadyEffect();
  assert.equal(f.initializations.length, 1);
  assert.equal(f.starts(), 1);
});

for (const [name, change] of [
  ["review", state => { state.scanPaused = true; state.scanPausedRef.current = true; }],
  ["user pause", state => { state.scanHold = true; }],
  ["background tab", state => { state.document.visibilityState = "hidden"; }],
  ["room exit", state => { state.selectedRoom = null; state.selectedRoomRef.current = null; }],
  ["sign-out", state => { state.user = null; }],
  ["stopped camera", state => { state.cameraActive = false; }],
  ["ended track", state => { state.streamRef.current = { getVideoTracks: () => [{ readyState: "ended" }] }; }],
  ["released stream", state => { state.streamRef.current = null; }]
]) {
  test(`late readiness does not resume OCR during ${name}`, async () => {
    const f = fixture();
    const wait = f.render().loadOcrWorker();
    change(f.state);
    f.resolve();
    await wait;
    f.runReadyEffect();
    assert.equal(f.starts(), 0);
  });
}

test("resuming after a paused late load starts OCR without another initialization", async () => {
  const f = fixture();
  f.state.scanHold = true;
  const wait = f.render().loadOcrWorker();
  f.resolve();
  await wait;
  f.runReadyEffect();
  assert.equal(f.starts(), 0);
  f.state.scanHold = false;
  f.runReadyEffect();
  assert.equal(f.starts(), 1);
  assert.equal(f.initializations.length, 1);
});

test("unmount disposes a late worker without publishing readiness", async () => {
  const f = fixture();
  const wait = f.render().loadOcrWorker();
  f.state.componentActiveRef.current = false;
  f.resolve();
  await assert.rejects(wait, /cancelled/);
  assert.deepEqual(f.disposed, [0]);
  assert.equal(f.state.ocrReady, false);
  assert.equal(f.state.ocrWorkerRef.current, null);
});

test("genuine initialization failure can be retried without clearing attendance messages", async () => {
  const f = fixture();
  const first = f.render().retryOcrLoad();
  f.initializations[0].reject(new Error("Failed to fetch"));
  await first;
  assert.match(f.state.ocrLoadError, /could not be downloaded/);
  assert.equal(f.state.ocrLoadPromiseRef.current, null);
  const retry = f.render().retryOcrLoad();
  f.resolve(1);
  await retry;
  assert.equal(f.initializations.length, 2);
  assert.equal(f.state.ocrLoadError, "");
});

test("an old retry failure cannot update the next camera session", async () => {
  const f = fixture();
  const wait = f.render().retryOcrLoad();
  f.state.cameraGenerationRef.current++;
  f.state.ocrLoadError = "New camera session notice";
  f.initializations[0].reject(new Error("Failed to fetch"));
  await wait;
  assert.equal(f.state.ocrLoadError, "New camera session notice");
});

test("failure after timeout replaces the still-loading notice with the actual error", async () => {
  const f = fixture();
  const wait = f.render().loadOcrWorker();
  const pending = f.state.ocrLoadPromiseRef.current;
  const timedOut = assert.rejects(wait, /timed out/);
  f.expire();
  await timedOut;
  f.state.ocrLoadError = "OCR is still loading in the background";
  const failed = assert.rejects(pending, /Failed to fetch/);
  f.initializations[0].reject(new Error("Failed to fetch"));
  await failed;
  assert.match(f.state.ocrLoadError, /could not be downloaded/);
  assert.equal(f.state.ocrLoadPromiseRef.current, null);
  assert.equal(f.state.ocrLoading, false);
});

for (const [name, stream] of [
  ["released", null],
  ["ended", { getVideoTracks: () => [{ readyState: "ended" }] }]
]) {
  test(`late rejection does not publish an OCR warning after the stream is ${name}`, async () => {
    const f = fixture();
    const wait = f.render().loadOcrWorker();
    f.state.streamRef.current = stream;
    const failed = assert.rejects(wait, /Failed to fetch/);
    f.initializations[0].reject(new Error("Failed to fetch"));
    await failed;
    assert.equal(f.state.ocrLoadError, "");
  });
}

function cameraFixture() {
  const f = fixture();
  const camera = deferred();
  const playback = deferred();
  let stopped = 0;
  const track = { readyState: "live", stop() { stopped++; this.readyState = "ended"; } };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  f.state.streamRef.current = null;
  Object.assign(f.state, {
    navigator: { mediaDevices: { getUserMedia: () => camera.promise } },
    videoRef: { current: { srcObject: null, play: () => playback.promise } },
    cancelRequests: () => undefined, stopOcrLoop: () => undefined,
    releaseCameraStream: () => {
      f.state.cameraGenerationRef.current++;
      f.state.streamRef.current?.getTracks().forEach(track => track.stop());
      f.state.streamRef.current = null;
      f.state.cameraActive = false;
    },
    resetForNextScan: () => undefined,
    trackSupportsTorch: () => false, reportScannerEvent: () => undefined,
    setSelectedRoom: value => { f.state.selectedRoom = value; },
    setStatusMessage: value => { f.state.statusMessage = value; },
    setCameraActive: value => { f.state.cameraActive = value; },
    setCameraRecoveryNeeded: () => undefined,
    setScanHold: value => { f.state.scanHold = value; },
    setTorchSupported: () => undefined, setTorchEnabled: () => undefined,
    setTorchMessage: () => undefined
  });
  return { ...f, camera, playback, stream, stopped: () => stopped };
}

test("late camera permission after room exit releases the owned stream without loading OCR", async () => {
  const f = cameraFixture();
  const wait = f.render().startCamera({ id: "room-a" });
  f.state.releaseCameraStream();
  f.state.selectedRoomRef.current = null;
  f.camera.resolve(f.stream);
  await wait;
  assert.equal(f.stopped(), 1);
  assert.equal(f.state.streamRef.current, null);
  assert.equal(f.initializations.length, 0);
});

test("late video playback after camera release does not restart OCR", async () => {
  const f = cameraFixture();
  const wait = f.render().startCamera({ id: "room-a" });
  f.camera.resolve(f.stream);
  await Promise.resolve();
  await Promise.resolve();
  f.state.releaseCameraStream();
  f.state.selectedRoomRef.current = null;
  f.playback.resolve();
  await wait;
  assert.equal(f.state.cameraActive, false);
  assert.equal(f.initializations.length, 0);
});

test("old camera failure does not overwrite a newer camera-session notice", async () => {
  const f = cameraFixture();
  const wait = f.render().startCamera({ id: "room-a" });
  f.state.cameraGenerationRef.current++;
  f.state.statusMessage = "New session notice";
  f.camera.reject(new Error("Old permission failure"));
  await wait;
  assert.equal(f.state.statusMessage, "New session notice");
});

test("normal startup waits for usable camera playback then publishes OCR readiness", async () => {
  const f = cameraFixture();
  const wait = f.render().startCamera({ id: "room-a" });
  assert.equal(f.state.cameraActive, false);
  f.camera.resolve(f.stream);
  f.playback.resolve();
  for (let i = 0; i < 5 && !f.initializations.length; i++) await Promise.resolve();
  assert.equal(f.state.cameraActive, true);
  assert.equal(f.initializations.length, 1);
  f.resolve();
  await wait;
  f.runReadyEffect();
  assert.equal(f.starts(), 1);
});

test("preparation stages follow actual module import and model creation, not timers", async () => {
  const importGate = deferred();
  const modelGate = deferred();
  const stages = [];
  const messages = [];
  const factorySource = stripTypeScriptTypes(between(
    "async function createDigitOcrWorker(", "function trackSupportsTorch("
  )).replace('import("@paddleocr/paddleocr-js")', "importPaddle()");
  const createWorker = new Function("importPaddle", "supportsWasmSimd", "scannerModelAssets", `${factorySource}; return createDigitOcrWorker;`)(
    () => importGate.promise, () => false, scannerModelAssets
  );
  const modelFetch = async () => new Response("unused");
  const wait = createWorker(message => messages.push(message), stage => stages.push(stage), modelFetch);
  assert.deepEqual(stages, ["engine"]);
  importGate.resolve({ PaddleOCR: { create: options => {
    assert.equal(options.fetch, modelFetch);
    assert.equal(options.textDetectionModelAsset, undefined);
    assert.equal(options.textRecognitionModelAsset, undefined);
    return modelGate.promise;
  } } });
  await Promise.resolve();
  assert.deepEqual(stages, ["engine", "models"]);
  assert.equal(messages.some(message => message.includes("ready")), false);
  const worker = { predict: async () => [], dispose: async () => undefined };
  modelGate.resolve(worker);
  assert.equal(await wait, worker);
  assert.equal(messages.at(-1), "ONNX OCR ready.");
});

test("real pinned SDK reproduces the rejected asset-only configuration before downloading", async () => {
  const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
  await assert.rejects(PaddleOCR.create({
    worker: false, initialize: false, lang: "en", ocrVersion: "PP-OCRv5",
    fetch: async () => { throw new Error("This configuration test must not download models"); },
    textDetectionModelAsset: scannerModelAssets.detection,
    textRecognitionModelAsset: scannerModelAssets.recognition
  }), /text_detection_model_dir requires text_detection_model_name/);
});

test("real SDK accepts the exact production worker options and resolves the prefetched defaults", async () => {
  const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
  const factorySource = stripTypeScriptTypes(between(
    "async function createDigitOcrWorker(", "function trackSupportsTorch("
  )).replace('import("@paddleocr/paddleocr-js")', "importPaddle()");
  const modelFetch = async () => { throw new Error("Configuration-only check must not initialize or download models"); };
  // Only disable initialization in this test; the library still validates/resolves
  // every option produced by the actual application's worker factory.
  const createWorker = new Function("importPaddle", "supportsWasmSimd", `${factorySource}; return createDigitOcrWorker;`)(
    async () => ({ PaddleOCR: { create: options => PaddleOCR.create({ ...options, initialize: false }) } }),
    () => false
  );
  const worker = await createWorker(() => {}, () => {}, modelFetch);
  assert.equal(worker.options.fetch, modelFetch);
  assert.deepEqual(worker.pipelineConfig.assets, { det: scannerModelAssets.detection, rec: scannerModelAssets.recognition });
  assert.deepEqual(worker.pipelineConfig.modelSelection, {
    textDetectionModelName: "PP-OCRv5_mobile_det", textRecognitionModelName: "PP-OCRv5_mobile_rec"
  });
  await worker.dispose();
});

test("immediate real SDK configuration rejection releases Retry's loading guard", async () => {
  const { PaddleOCR } = await import("@paddleocr/paddleocr-js");
  const f = fixture();
  f.state.createDigitOcrWorker = () => PaddleOCR.create({
    worker: false, initialize: false, lang: "en", ocrVersion: "PP-OCRv5",
    textDetectionModelAsset: scannerModelAssets.detection
  });
  await f.render().retryOcrLoad();
  assert.equal(f.state.ocrLoading, false);
  assert.equal(f.state.ocrReady, false);
  assert.equal(f.state.ocrLoadPromiseRef.current, null);
  assert.match(f.state.ocrLoadError, /could not be initialized/);
  f.state.createDigitOcrWorker = () => PaddleOCR.create({ worker: false, initialize: false, lang: "en", ocrVersion: "PP-OCRv5" });
  await f.render().retryOcrLoad();
  assert.equal(f.state.ocrLoading, false);
  assert.equal(f.state.ocrLoadError, "");
  assert.equal(f.state.ocrReady, true);
  await f.state.ocrWorkerRef.current.dispose();
});
