const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib")

// The routing rule under test: the browser does the job and a billed engine is
// contacted only when that result is not good enough. Cloud traffic is counted by
// intercepting fetch, so a pass means no credit was spent rather than merely that an
// endpoint happened to be unreachable.

function loadServices(routerExports, ocrExports) {
  const filePath = path.resolve("src", "services.ts")
  const raw = fs.readFileSync(filePath, "utf8")
  const code = ts.transpileModule(raw, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText.replace(/import\.meta\.env/g, "process.env")

  const wrapper = `(function (exports, require, module, __filename, __dirname) {\n${code}\n})`
  const compiled = vm.runInThisContext(wrapper, { filename: filePath })
  const mod = { exports: {} }
  compiled(
    mod.exports,
    (id) => {
      // A dynamic import of a sibling module lands here, which is how the policy can be
      // switched between "good enough" and "needs a rescue" without a multi-megabyte
      // fixture in the repository.
      if (id === "./engineRouter" && routerExports) return routerExports
      // The in-browser OCR engine is stood up the same way: a real one drags a 3.9 MB
      // WASM binary and a Worker into a unit test that is only about the decision.
      if (id === "./browserOcr" && ocrExports) return ocrExports
      if (id === "./sessionService") return { getSessionToken: () => "test-session-token" }
      if (id === "./jobTypes") return {}
      return require(id)
    },
    mod,
    filePath,
    path.dirname(filePath),
  )
  return mod.exports
}

async function fixturePdf(pages) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (let i = 0; i < pages; i++) {
    const page = doc.addPage([612, 792])
    page.drawRectangle({ x: 80, y: 80, width: 300, height: 300, color: rgb(0.2, 0.4, 0.8) })
    page.drawText(`PAGE ${i + 1} carrying running text a local engine can genuinely shrink.`, {
      x: 60,
      y: 700,
      size: 18,
      font,
      color: rgb(0, 0, 0),
    })
  }
  return new File(
    [new Uint8Array(await doc.save({ useObjectStreams: false }))],
    "routing.pdf",
    { type: "application/pdf" },
  )
}

// Saved without object streams so its length is stable and predictable, which is what
// lets a test tell one engine's output from another by byte count alone.
async function pdfBase64(pages) {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([200, 200])
  return Buffer.from(await doc.save({ useObjectStreams: false })).toString("base64")
}

// Routes every /api/ call through a counter and answers with the payload, leaving any
// other request (a real provider probe) to fail loudly rather than silently.
function stubCloud(responder, offeredApi) {
  const calls = []
  const previousPool = global.window && global.window.__masterfileproApiPool
  const previousFetch = globalThis.fetch

  global.window = global.window || {}
  // The pool is made to look fully armed: Adobe available and in quota, so the only
  // thing that can stop a request is the routing policy itself.
  global.window.__masterfileproApiPool = {
    getNextAvailableApi: () => offeredApi || { id: "adobe-1", provider: "adobe" },
    recordApiOutcome: () => {},
  }
  globalThis.fetch = async (url, init) => {
    const target = String(url)
    if (target.startsWith("/api/")) {
      calls.push(target)
      return responder(target, init)
    }
    throw new Error(`Unexpected outbound request from a unit test: ${target}`)
  }

  return {
    calls,
    restore() {
      globalThis.fetch = previousFetch
      if (previousPool === undefined) delete global.window.__masterfileproApiPool
      else global.window.__masterfileproApiPool = previousPool
    },
  }
}

function jsonResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => payload }
}

const ALWAYS_LOCAL = {
  compressNeedsCloud: () => false,
  textNeedsCloud: () => false,
  tableNeedsCloud: () => false,
  deckNeedsCloud: () => false,
  ocrNeedsCloud: () => false,
}

const ALWAYS_ESCALATE = {
  compressNeedsCloud: () => true,
  textNeedsCloud: () => true,
  tableNeedsCloud: () => true,
  deckNeedsCloud: () => true,
  ocrNeedsCloud: () => true,
}

// The shipped policy, compiled the same way the app loads it. A test that uses this
// proves the real thresholds decide, not a stub chosen to make the test pass.
function loadPolicy() {
  const src = fs.readFileSync(path.resolve("src", "engineRouter.ts"), "utf8")
  const compiled = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  vm.runInThisContext(`(function (exports, module) {\n${compiled}\n})`, {
    filename: "engineRouter.ts",
  })(mod.exports, mod)
  return mod.exports
}

test("engine policy: the thresholds that decide when a credit is spent", () => {
  const policy = loadPolicy()

  assert.equal(
    policy.compressNeedsCloud({ level: "balanced", originalSize: 4_000_000, outSize: 3_900_000 }),
    true,
    "a 4 MB file the page barely shrank is worth a rescue",
  )
  assert.equal(
    policy.compressNeedsCloud({ level: "balanced", originalSize: 4_000_000, outSize: 2_000_000 }),
    false,
    "a halving the browser achieved on its own is not",
  )
  assert.equal(
    policy.compressNeedsCloud({ level: "balanced", originalSize: 50_000, outSize: 50_000 }),
    false,
    "a small file never spends a credit",
  )
  assert.equal(
    policy.compressNeedsCloud({ level: "low", originalSize: 4_000_000, outSize: 4_000_000 }),
    false,
    "the stream-only profile is expected to save little",
  )

  assert.equal(policy.textNeedsCloud({ chars: 12, pageCount: 4 }), true)
  assert.equal(policy.textNeedsCloud({ chars: 9_000, pageCount: 4 }), false)
  assert.equal(policy.textNeedsCloud({ chars: 5_000, pageCount: 0 }), true)

  assert.equal(policy.ocrNeedsCloud({ chars: 5_000, pageCount: 0 }), true)
  assert.equal(
    policy.ocrNeedsCloud({ chars: 40, pageCount: 1 }),
    true,
    "a scan the engine could barely see is worth asking the provider about",
  )
  assert.equal(
    policy.ocrNeedsCloud({ chars: 900, pageCount: 1 }),
    false,
    "a page the engine read for free is not",
  )
  // Observed, not imagined: a page of random pixels returned 16,227 characters at a
  // mean confidence of 15. A gate that only counts characters ships that as a result.
  assert.equal(
    policy.ocrNeedsCloud({ chars: 16_227, pageCount: 1, confidence: 15 }),
    true,
    "confident-looking nonsense is not a finished job",
  )
  assert.equal(
    policy.ocrNeedsCloud({ chars: 1_800, pageCount: 2, confidence: 91 }),
    false,
    "a real scan scores in the low nineties and stays local",
  )

  assert.equal(policy.tableNeedsCloud([]), true)
  assert.equal(policy.tableNeedsCloud([["everything collapsed into one cell"]]), true)
  assert.equal(policy.tableNeedsCloud([["name", "amount"], ["rent", "900"]]), false)

  assert.equal(
    policy.deckNeedsCloud({ slideCount: 0, hasContent: false, isLegacyBinaryPpt: false }),
    true,
    "a deck with no slides cannot be built locally",
  )
  assert.equal(
    policy.deckNeedsCloud({ slideCount: 3, hasContent: false, isLegacyBinaryPpt: true }),
    true,
    "PowerPoint 97-2003 has no in-page reader",
  )
  assert.equal(
    policy.deckNeedsCloud({ slideCount: 3, hasContent: true, isLegacyBinaryPpt: false }),
    false,
  )
})

test("compress: a healthy local result never reaches a paid engine", async () => {
  const services = loadServices(ALWAYS_LOCAL)
  const file = await fixturePdf(2)
  const cloud = stubCloud(() => jsonResponse({ ok: true, pdfBase64: "" }))
  try {
    const result = await services.compressPDF(file, { level: "balanced" })
    assert.ok(result.blob.size > 0, "the document is still produced")
    assert.deepEqual(cloud.calls, [], "no billed request was made while the local result stood")
  } finally {
    cloud.restore()
  }
})

// Metadata stripping re-saves a document, which would move the byte count this test
// compares, so every call below switches it off and the served length then identifies
// exactly which engine's bytes were delivered.
test("compress: an escalated engine is used only when it returns the smaller file", async () => {
  const services = loadServices(ALWAYS_ESCALATE)
  const file = await fixturePdf(8)
  const cloudBytes = Buffer.from(await pdfBase64(1), "base64")
  const local = await loadServices(ALWAYS_LOCAL).compressPDF(file, {
    level: "balanced",
    stripMetadata: false,
  })
  assert.ok(
    cloudBytes.length < local.blob.size,
    "the engine must genuinely have the better answer for this test to mean anything",
  )

  const cloud = stubCloud(() => jsonResponse({ ok: true, pdfBase64: cloudBytes.toString("base64") }))
  let result
  try {
    result = await services.compressPDF(file, { level: "balanced", stripMetadata: false })
  } finally {
    cloud.restore()
  }

  assert.equal(cloud.calls.length, 1, "exactly one rescue request, not one per engine")
  assert.match(cloud.calls[0], /^\/api\/(adobe-pdf|ilovepdf)/)
  assert.equal(
    result.blob.size,
    cloudBytes.length,
    "the bytes served are the engine's, because they beat what the browser produced",
  )
  assert.ok(result.blob.size < file.size, "and the download did get smaller")
})

test("compress: a rescue that returns a bigger file is thrown away", async () => {
  const file = await fixturePdf(8)
  const local = await loadServices(ALWAYS_LOCAL).compressPDF(file, {
    level: "balanced",
    stripMetadata: false,
  })

  const bloatedBytes = Buffer.from(await pdfBase64(300), "base64")
  assert.ok(
    bloatedBytes.length > local.blob.size,
    "the engine must genuinely return a worse result for this test to mean anything",
  )

  const escalating = loadServices(ALWAYS_ESCALATE)
  const cloud = stubCloud(() =>
    jsonResponse({ ok: true, pdfBase64: bloatedBytes.toString("base64") }),
  )
  let result
  try {
    result = await escalating.compressPDF(file, { level: "balanced", stripMetadata: false })
  } finally {
    cloud.restore()
  }

  assert.equal(cloud.calls.length, 1, "the engine was still asked, because the policy said so")
  // Two runs of the local engine differ by a couple of bytes because the document ID is
  // regenerated, so the check is that the served file is the browser's own answer and
  // nowhere near the engine's bloated one.
  assert.ok(
    Math.abs(result.blob.size - local.blob.size) <= 16,
    `the local bytes are served (${result.blob.size} vs ${local.blob.size})`,
  )
  assert.ok(result.blob.size * 2 < bloatedBytes.length, "the worse engine answer is not served")
})

test("convert tools: a readable document never reaches a paid engine", async () => {
  const services = loadServices(ALWAYS_LOCAL)
  const file = await fixturePdf(3)

  const word = stubCloud(() => jsonResponse({ ok: true }))
  const excel = stubCloud(() => jsonResponse({ ok: true }))
  const ppt = stubCloud(() => jsonResponse({ ok: true }))
  try {
    await services.pdfToWord(file, { format: "docx" })
    await services.pdfToExcel(file, { format: "xlsx" })
    await services.pdfToPPT(file, {})
  } finally {
    word.restore()
    excel.restore()
    ppt.restore()
  }

  assert.deepEqual(
    [...word.calls, ...excel.calls, ...ppt.calls].filter((u) => u.startsWith("/api/")),
    [],
    "a page that yields text, a grid and slides is served entirely from the browser",
  )
})

test("convert tools: an unreadable document asks for one rescue", async () => {
  const services = loadServices(ALWAYS_ESCALATE)
  const file = await fixturePdf(1)
  const cloud = stubCloud(() => jsonResponse({ ok: false, error: "engine unavailable" }))
  try {
    await services.pdfToWord(file, { format: "docx" })
    await services.pdfToExcel(file, { format: "csv" })
  } finally {
    cloud.restore()
  }

  // A failed rescue must fall back to the local answer rather than losing the job.
  assert.ok(cloud.calls.length >= 1, "the weak local result asked the pool for help")
})

test("pool: the offered engines are only the ones a tool can actually call", () => {
  const src = fs.readFileSync(path.resolve("src", "apiPoolService.ts"), "utf8")
  const compiled = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  vm.runInThisContext(`(function (exports, require, module) {\n${compiled}\n})`, {
    filename: path.resolve("src", "apiPoolService.ts"),
  })(mod.exports, (id) => (id === "./sessionService" ? { authHeaders: () => ({}) } : require(id)), mod)

  const offered = mod.exports.DEFAULT_CLOUD_APIS.filter((api) => api.category === "pdf-compression").map((api) => api.id)
  // CloudConvert and ConvertAPI sat at priorities 3 and 4 while no tool ever sent a
  // request to them, so the pool must offer only engines a job can actually reach.
  assert.deepEqual(offered, ["adobe-pdf-services", "ilovepdf-cloud", "local-wasm-engine"])
  assert.equal(typeof mod.exports.getNextAvailableApi, "function")
  assert.match(src, /ERROR_COOLDOWN_MS/, "a failed engine gets a cooldown window before reuse")
})

function loadPool() {
  const src = fs.readFileSync(path.resolve("src", "apiPoolService.ts"), "utf8")
  const compiled = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  vm.runInThisContext(`(function (exports, require, module) {\n${compiled}\n})`, {
    filename: path.resolve("src", "apiPoolService.ts"),
  })(mod.exports, (id) => (id === "./sessionService" ? { authHeaders: () => ({}) } : require(id)), mod)
  return mod.exports
}

test("pool: an engine that just failed is rested so the job moves to the next one", () => {
  // A fresh module instance plus a fresh store, so the cooldown is observed rather than
  // inherited from another test.
  const store = new Map()
  const savedLocalStorage = global.localStorage
  const savedFetch = globalThis.fetch
  const savedWindow = global.window
  global.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  }
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) })
  global.window = { dispatchEvent: () => {} }

  const pool = loadPool()
  try {
    assert.equal(pool.getNextAvailableApi("pdf-compression").id, "adobe-pdf-services")

    // Not a quota error: a quota miss is permanent for the month, whereas a transport
    // failure should only cost that engine its turn.
    pool.recordApiOutcome("adobe-pdf-services", { success: false, errorMessage: "gateway timeout" })

    assert.equal(
      pool.getNextAvailableApi("pdf-compression").id,
      "ilovepdf-cloud",
      "the next priority serves the job instead of the engine that just failed",
    )

    pool.recordApiOutcome("adobe-pdf-services", { success: true })
    assert.equal(
      pool.getNextAvailableApi("pdf-compression").id,
      "adobe-pdf-services",
      "a recovered engine is offered its priority back",
    )
  } finally {
    global.localStorage = savedLocalStorage
    globalThis.fetch = savedFetch
    global.window = savedWindow
  }
})

// A page image that is not a PDF, so the scan reaches the recognizer without a DOM to
// rasterize into. The PDF branch is proven in the browser instead.
function scanImage() {
  return new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])], "scan.png", {
    type: "image/png",
  })
}

function readableEngine() {
  const sentence =
    "Amount due for the period described above is payable within thirty days of receipt."

  return {
    isLocallySupported: () => true,
    recognizePage: async () => ({
      text: [sentence, sentence, sentence].join("\n"),
      confidence: 93,
      lines: [sentence, sentence, sentence].map((text) => ({ text, confidence: 93 })),
    }),
  }
}

test("scan: a page the browser can read never reaches a paid engine", async () => {
  const services = loadServices(loadPolicy(), readableEngine())
  const cloud = stubCloud(
    () => jsonResponse({ ok: false, error: "should not be asked" }),
    { id: "ocr-1", provider: "ocrspace" },
  )
  let result
  try {
    result = await services.scanOCR(scanImage(), {})
  } finally {
    cloud.restore()
  }

  assert.deepEqual(cloud.calls, [], "the whole job stayed on the visitor's own machine")
  assert.ok(result.characterCount > 200, "and the transcript is the engine's own work")
  assert.equal(result.confidence, 93, "a real recognition score is reported, not a placeholder")
  assert.equal(result.sourceType, "image-raster")
})

test("scan: a page the browser read badly asks the pool exactly once", async () => {
  const services = loadServices(loadPolicy(), {
    isLocallySupported: () => true,
    recognizePage: async () => ({
      text: "rn 1",
      confidence: 11,
      lines: [{ text: "rn 1", confidence: 11 }],
    }),
  })
  const cloud = stubCloud(
    () => jsonResponse({ success: true, text: "Recovered invoice total 4,200.00 owing." }),
    { id: "ocr-1", provider: "ocrspace" },
  )
  let result
  try {
    result = await services.scanOCR(scanImage(), {})
  } finally {
    cloud.restore()
  }

  assert.deepEqual(cloud.calls, ["/api/ocr-space/parse"], "one rescue, not one per attempt")
  assert.match(result.text, /Recovered invoice/, "the provider's better reading is what ships")
})

test("scan: a hallucinated page is not treated as a result", async () => {
  // The shape a page of visual noise actually produced: plenty of characters, none of
  // them trusted. A gate that only counts characters would have shipped this.
  const services = loadServices(loadPolicy(), {
    isLocallySupported: () => true,
    recognizePage: async () => ({
      text: "BE Dela ctigeah cesta ead eee tee cage wana ates Sr ee ure ge A eras sapere ".repeat(6),
      confidence: 15,
      lines: Array.from({ length: 18 }, (unused, i) => ({
        text: `noise line ${i} with plausible looking garbage`,
        confidence: 15,
      })),
    }),
  })
  const cloud = stubCloud(
    () => jsonResponse({ success: true, text: "The page holds no readable text." }),
    { id: "ocr-1", provider: "ocrspace" },
  )
  let result
  try {
    result = await services.scanOCR(scanImage(), {})
  } finally {
    cloud.restore()
  }

  assert.deepEqual(cloud.calls, ["/api/ocr-space/parse"], "the guess was not good enough to keep")
  assert.match(result.text, /no readable text/, "the provider's reading is what ships")
})

test("scan: a language the bundled model cannot spell goes straight to the provider", async () => {
  const services = loadServices(loadPolicy(), {
    isLocallySupported: () => false,
    recognizePage: async () => {
      throw new Error("must not be reached")
    },
  })
  const asked = []
  const cloud = stubCloud(
    () => {
      asked.push(true)
      return jsonResponse({ success: true, text: "Total a payer dans les trente jours." })
    },
    { id: "ocr-1", provider: "ocrspace" },
  )
  let result
  try {
    result = await services.scanOCR(scanImage(), { language: "fra" })
  } finally {
    cloud.restore()
  }

  assert.deepEqual(cloud.calls, ["/api/ocr-space/parse"], "no local guess is attempted")
  assert.match(result.text, /dans les trente jours/)
})

test("scan: an engine that cannot start is not treated as a failure of the document", async () => {
  const services = loadServices(loadPolicy(), {
    isLocallySupported: () => true,
    recognizePage: async () => null,
  })
  const cloud = stubCloud(
    () => jsonResponse({ success: true, text: "The provider finished what the browser could not." }),
    { id: "ocr-1", provider: "ocrspace" },
  )
  let result
  try {
    result = await services.scanOCR(scanImage(), {})
  } finally {
    cloud.restore()
  }

  assert.equal(cloud.calls.length, 1, "the job moved to the engine that can do it")
  assert.match(result.text, /provider finished/)
})

// A missing file does not fail loudly: the engine cannot start, every scan quietly
// costs a credit, and the site looks like it never changed. So the assets are checked in.
test("ocr: the engine a scan needs is shipped from this origin", () => {
  for (const rel of [
    "public/ocr/worker.min.js",
    "public/ocr/tesseract-core-simd-lstm.wasm.js",
    "public/ocr/langs/eng.traineddata",
  ]) {
    assert.ok(fs.existsSync(path.resolve(rel)), `${rel} is missing and the CSP would block a CDN copy`)
  }

  const src = fs.readFileSync(path.resolve("src", "browserOcr.ts"), "utf8")

  assert.match(src, /corePath/, "the WASM build is pinned to a local file")
  assert.match(src, /langPath/, "the language model is pinned to a local file")
  assert.match(src, /gzip:\s*false/, "the model is not served through a second layer of gzip")
  assert.doesNotMatch(src, /cdn\.jsdelivr\.net|unpkg\.com/, "no third-party host is trusted with it")
})
