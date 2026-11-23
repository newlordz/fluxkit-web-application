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

function loadServices(routerExports) {
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
function stubCloud(responder) {
  const calls = []
  const previousPool = global.window && global.window.__masterfileproApiPool
  const previousFetch = globalThis.fetch

  global.window = global.window || {}
  // The pool is made to look fully armed: Adobe available and in quota, so the only
  // thing that can stop a request is the routing policy itself.
  global.window.__masterfileproApiPool = {
    getNextAvailableApi: () => ({ id: "adobe-1", provider: "adobe" }),
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
}

const ALWAYS_ESCALATE = {
  compressNeedsCloud: () => true,
  textNeedsCloud: () => true,
  tableNeedsCloud: () => true,
  deckNeedsCloud: () => true,
}

test("engine policy: the thresholds that decide when a credit is spent", () => {
  const src = fs.readFileSync(path.resolve("src", "engineRouter.ts"), "utf8")
  const compiled = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  vm.runInThisContext(`(function (exports, module) {\n${compiled}\n})`, {
    filename: "engineRouter.ts",
  })(mod.exports, mod)
  const policy = mod.exports

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
