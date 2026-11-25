const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function loadAdapter() {
  const filePath = path.resolve("server/_lib/geminiImageTable.ts")
  const code = ts.transpileModule(fs.readFileSync(filePath, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  vm.runInNewContext(
    code,
    {
      exports,
      AbortController,
      AbortSignal,
      setTimeout,
      clearTimeout,
      console,
    },
    { filename: filePath },
  )
  return exports
}

const TABLE = {
  columns: [
    { label: "Date", kind: "date" },
    { label: "Amount", kind: "amount" },
  ],
  rows: [
    {
      cells: [
        { value: "01/02/2026", confidence: 0.98 },
        { value: "2,500.00", confidence: 0.97 },
      ],
    },
  ],
}

function success(table = TABLE, status = 200) {
  return new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(table) }] } }] }),
    { status, headers: { "Content-Type": "application/json" } },
  )
}

function failure(status, body = { error: { message: "test failure" } }, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers })
}

function optionsFor(fetchImpl, overrides = {}) {
  const sleeps = []
  const calls = []
  let requests = 0
  return {
    sleeps,
    calls,
    options: {
      fetchImpl: async (url, init) => {
        requests++
        calls.push({ url: String(url), init })
        return fetchImpl(requests, url, init)
      },
      sleep: async (milliseconds) => sleeps.push(milliseconds),
      now: () => 1_000,
      health: new Map(),
      onCall: async (status) => calls.push({ status }),
      retryDelayMs: 400,
      timeoutMs: 5_000,
      ...overrides,
    },
  }
}

test("Gemini uses the 3.6 primary model and returns structured rows without exposing routing", async () => {
  const { extractImageTableWithGemini } = loadAdapter()
  const harness = optionsFor(async () => success())
  const result = await extractImageTableWithGemini(
    { imageBase64: "aW1hZ2U=", mimeType: "image/jpeg", apiKey: "server-only-test-key" },
    harness.options,
  )

  assert.equal(result.model, "gemini-3.6-flash")
  assert.equal(result.attempts, 1)
  assert.equal(result.table.rows[0].cells[1].value, "2,500.00")
  assert.equal(harness.calls.length, 2)
  assert.match(harness.calls[0].url, /gemini-3\.6-flash:generateContent$/)
  assert.equal(harness.calls[0].init.headers["x-goog-api-key"], "server-only-test-key")
  assert.deepEqual(harness.sleeps, [])
  assert.equal(harness.calls[1].status, "success")
})

test("Gemini retries one transient 503 before changing models", async () => {
  const { extractImageTableWithGemini } = loadAdapter()
  const harness = optionsFor(async (attempt) =>
    attempt === 1 ? failure(503) : success(),
  )
  const result = await extractImageTableWithGemini(
    { imageBase64: "aW1hZ2U=", mimeType: "image/jpeg", apiKey: "test" },
    harness.options,
  )

  assert.equal(result.model, "gemini-3.6-flash")
  assert.equal(result.attempts, 2)
  assert.deepEqual(harness.sleeps, [400])
  assert.equal(harness.calls.filter((call) => call.url).length, 2)
})

test("Gemini falls back to 3.5 after two transient primary failures", async () => {
  const { extractImageTableWithGemini } = loadAdapter()
  const harness = optionsFor(async (attempt) =>
    attempt <= 2 ? failure(503) : success(),
  )
  const result = await extractImageTableWithGemini(
    { imageBase64: "aW1hZ2U=", mimeType: "image/jpeg", apiKey: "test" },
    harness.options,
  )

  assert.equal(result.model, "gemini-3.5-flash-lite")
  assert.equal(result.attempts, 3)
  assert.deepEqual(harness.sleeps, [400])
  const requests = harness.calls.filter((call) => call.url)
  assert.match(requests[0].url, /gemini-3\.6-flash/)
  assert.match(requests[1].url, /gemini-3\.6-flash/)
  assert.match(requests[2].url, /gemini-3\.5-flash-lite/)
  assert.equal(harness.options.health.get("gemini-3.6-flash"), 61_000)
})

test("Gemini treats quota as non-retryable and immediately tries the fallback", async () => {
  const { extractImageTableWithGemini } = loadAdapter()
  const harness = optionsFor(async (attempt) =>
    attempt === 1
      ? failure(429, { error: { details: [{ retryDelay: "120s" }] } })
      : success(),
  )
  const result = await extractImageTableWithGemini(
    { imageBase64: "aW1hZ2U=", mimeType: "image/jpeg", apiKey: "test" },
    harness.options,
  )

  assert.equal(result.model, "gemini-3.5-flash-lite")
  assert.equal(result.attempts, 2)
  assert.deepEqual(harness.sleeps, [])
  assert.equal(harness.options.health.get("gemini-3.6-flash"), 121_000)
  assert.equal(harness.calls.filter((call) => call.url).length, 2)
})

test("Gemini reports quota exhaustion after both models refuse retries", async () => {
  const { extractImageTableWithGemini } = loadAdapter()
  const harness = optionsFor(async () => failure(429))
  await assert.rejects(
    extractImageTableWithGemini(
      { imageBase64: "aW1hZ2U=", mimeType: "image/jpeg", apiKey: "test" },
      harness.options,
    ),
    (error) => error.name === "GeminiImageError" && error.code === "provider_quota",
  )
  assert.deepEqual(harness.sleeps, [])
  assert.equal(harness.calls.filter((call) => call.url).length, 2)
})

test("Gemini retries malformed structured output and can recover on the fallback", async () => {
  const { extractImageTableWithGemini } = loadAdapter()
  const harness = optionsFor(async (attempt) =>
    attempt < 3 ? success({ columns: [{ label: "Only one" }], rows: [] }) : success(),
  )
  const result = await extractImageTableWithGemini(
    { imageBase64: "aW1hZ2U=", mimeType: "image/jpeg", apiKey: "test" },
    harness.options,
  )

  assert.equal(result.model, "gemini-3.5-flash-lite")
  assert.equal(result.attempts, 3)
  assert.deepEqual(harness.sleeps, [400])
})

test("Gemini timeout and network failures are retryable and can fall back", async () => {
  const { extractImageTableWithGemini } = loadAdapter()
  const harness = optionsFor(
    async (attempt) => {
      if (attempt < 3) throw new TypeError("network unavailable")
      return success()
    },
    { retryDelayMs: 0 },
  )
  const result = await extractImageTableWithGemini(
    { imageBase64: "aW1hZ2U=", mimeType: "image/jpeg", apiKey: "test" },
    harness.options,
  )
  assert.equal(result.model, "gemini-3.5-flash-lite")
  assert.equal(result.attempts, 3)
})

test("Gemini skips a model during its health cooldown", async () => {
  const { extractImageTableWithGemini } = loadAdapter()
  const harness = optionsFor(async () => success())
  harness.options.health.set("gemini-3.6-flash", 5_000)
  const result = await extractImageTableWithGemini(
    { imageBase64: "aW1hZ2U=", mimeType: "image/jpeg", apiKey: "test" },
    harness.options,
  )

  assert.equal(result.model, "gemini-3.5-flash-lite")
  assert.equal(result.attempts, 1)
  const requests = harness.calls.filter((call) => call.url)
  assert.equal(requests.length, 1)
  assert.match(requests[0].url, /gemini-3\.5-flash-lite/)
})

test("Gemini treats a missing model as unavailable without retrying it", async () => {
  const { extractImageTableWithGemini } = loadAdapter()
  const harness = optionsFor(async (attempt) =>
    attempt === 1 ? failure(404) : success(),
  )
  const result = await extractImageTableWithGemini(
    { imageBase64: "aW1hZ2U=", mimeType: "image/jpeg", apiKey: "test" },
    harness.options,
  )

  assert.equal(result.model, "gemini-3.5-flash-lite")
  assert.deepEqual(harness.sleeps, [])
  assert.equal(harness.options.health.get("gemini-3.6-flash"), 21_601_000)
})
