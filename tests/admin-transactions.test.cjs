const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function loadModule(relPath, stubs = {}, extraGlobals = {}) {
  const fullPath = path.resolve(relPath)
  const dir = path.dirname(fullPath)
  const stubPaths = new Map(
    Object.entries(stubs).map(([spec, mod]) => [path.resolve(dir, spec), { __esModule: true, ...mod }]),
  )
  const source = fs.readFileSync(fullPath, "utf8")
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText
  const exports = {}
  vm.runInNewContext(code, {
    exports,
    module: { exports },
    require: (id) => {
      if (id.startsWith(".")) {
        const resolved = path.resolve(dir, id)
        if (stubPaths.has(resolved)) return stubPaths.get(resolved)
        for (const ext of ["", ".ts", ".js", ".tsx"]) {
          if (fs.existsSync(resolved + ext)) return loadModule(path.relative(process.cwd(), resolved + ext), stubs, extraGlobals)
        }
      }
      return require(id)
    },
    process,
    Buffer,
    console,
    URL,
    URLSearchParams,
    AbortController,
    AbortSignal,
    setTimeout,
    clearTimeout,
    ...extraGlobals,
  }, { filename: fullPath })
  return exports
}

function mockResponse() {
  const headers = new Map()
  return {
    statusCode: 200,
    body: null,
    setHeader(name, value) { headers.set(name.toLowerCase(), value) },
    getHeader(name) { return headers.get(name.toLowerCase()) },
    status(code) { this.statusCode = code; return this },
    json(value) { this.body = value; return this },
    end(value) { this.body = value; return this },
  }
}

const PAYMENT_ROWS = [
  {
    id: "3",
    reference: "ref_3",
    user_id: "usr_3",
    email: "third@example.com",
    amount: "5.00",
    currency: "GHS",
    status: "success",
    gateway: "paystack",
    tool: "image-resize",
    created_at: "2026-11-26T10:00:00.000Z",
    updated_at: "2026-11-26T10:01:00.000Z",
    metadata: { secret: "must-not-leak" },
  },
  {
    id: "2",
    reference: "ref_2",
    user_id: "usr_2",
    email: "second@example.com",
    amount: "7.00",
    currency: "USD",
    status: "pending",
    gateway: "future-gateway",
    tool: null,
    created_at: "2026-11-26T10:00:00.000Z",
    updated_at: "2026-11-26T10:00:00.000Z",
  },
  {
    id: "1",
    reference: "ref_1",
    user_id: null,
    email: null,
    amount: "9.00",
    currency: "GHS",
    status: "failed",
    gateway: "paystack",
    tool: "pdf-to-word",
    created_at: "2026-11-25T10:00:00.000Z",
    updated_at: "2026-11-25T10:00:00.000Z",
  },
]

function handlerHarness({ actor = { id: "usr_admin", role: "admin" }, rows = PAYMENT_ROWS, error = null } = {}) {
  const calls = []
  const db = {
    cors: () => {},
    json: (res, status, data) => res.status(status).json(data),
    query: async () => { throw new Error("ledger must use the authoritative database") },
    queryAuthoritative: async (sql, params = []) => {
      calls.push({ sql, params })
      if (error) throw error
      if (/count\(\*\)::text as total/i.test(sql)) return [{ total: String(rows.length) }]
      if (/sum\(amount\)::text as gross_amount/i.test(sql)) {
        return [
          { currency: "GHS", transaction_count: "2", gross_amount: "14.00", successful_count: "1", successful_amount: "5.00" },
          { currency: "USD", transaction_count: "1", gross_amount: "7.00", successful_count: "0", successful_amount: "0.00" },
        ]
      }
      if (/json_agg\(value\)/i.test(sql)) {
        return [{ gateways: ["future-gateway", "paystack"], statuses: ["failed", "pending", "success"], currencies: ["GHS", "USD"] }]
      }
      const requestedLimit = Number(params[params.length - 1])
      return Number.isFinite(requestedLimit) ? rows.slice(0, requestedLimit) : rows
    },
  }
  const handler = loadModule("server/db/transactions.ts", {
    "../_lib/db.ts": db,
    "../_lib/auth.ts": { requireAdmin: async () => actor },
  }, error ? { console: { error: () => {} } } : {}).default
  return { handler, calls }
}

async function invoke(handler, { method = "GET", query = {}, headers = {} } = {}) {
  const req = { method, query, headers, url: "/api/db/transactions" }
  const res = mockResponse()
  await handler(req, res)
  return res
}

test("admin transactions reject anonymous callers before querying payments", async () => {
  const { handler, calls } = handlerHarness({ actor: null })
  const res = await invoke(handler)
  assert.equal(res.statusCode, 401)
  assert.equal(calls.length, 0)
})

test("admin transactions accept sub-admins and return explicit ledger fields", async () => {
  const { handler } = handlerHarness({ actor: { id: "usr_sub", role: "sub-admin" }, rows: [] })
  const res = await invoke(handler)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.ok, true)
  assert.deepEqual(res.body.transactions, [])
  assert.equal(res.getHeader("cache-control"), "private, no-store")
})

test("admin transactions parameterize filters and literal wildcard search", async () => {
  const { handler, calls } = handlerHarness()
  const res = await invoke(handler, {
    query: { gateway: "paystack", status: "success", currency: "GHS", q: "a_b%", limit: "2" },
  })
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.transactions.length, 2)
  assert.equal(res.body.pagination.hasMore, true)
  assert.equal(res.body.pagination.total, "3")
  assert.equal(res.body.transactions[0].metadata, undefined)
  assert.ok(!JSON.stringify(res.body).includes("must-not-leak"))

  for (const call of calls.filter((entry) => entry.params.length >= 4)) {
    assert.equal(call.params[0], "paystack")
    assert.equal(call.params[1], "success")
    assert.equal(call.params[2], "GHS")
    assert.equal(call.params[3], "%a\\_b\\%%")
    assert.ok(!call.sql.includes("a_b%"))
  }
  const pageCall = calls.find((call) => /order by created_at desc, id desc/i.test(call.sql))
  assert.match(pageCall.sql, /limit \$5/)
  const cursor = JSON.parse(Buffer.from(res.body.pagination.nextCursor, "base64url").toString("utf8"))
  assert.deepEqual(cursor, { version: 1, createdAt: PAYMENT_ROWS[1].created_at, id: "2" })
})

test("admin transactions use a deterministic keyset cursor", async () => {
  const { handler, calls } = handlerHarness()
  const cursor = Buffer.from(JSON.stringify({ version: 1, createdAt: "2026-11-26T10:00:00.000Z", id: "2" })).toString("base64url")
  const res = await invoke(handler, { query: { cursor } })
  assert.equal(res.statusCode, 200)
  const pageCall = calls.find((call) => /order by created_at desc, id desc/i.test(call.sql))
  assert.match(pageCall.sql, /\(created_at, id\) < \(\$1::timestamptz, \$2::bigint\)/)
  assert.deepEqual(Array.from(pageCall.params.slice(0, 2)), ["2026-11-26T10:00:00.000Z", "2"])
  const countCall = calls.find((call) => /count\(\*\)::text as total/i.test(call.sql))
  const totalsCall = calls.find((call) => /sum\(amount\)::text as gross_amount/i.test(call.sql))
  assert.deepEqual(Array.from(countCall.params), [])
  assert.deepEqual(Array.from(totalsCall.params), [])
  assert.doesNotMatch(countCall.sql, /created_at, id/)
  assert.doesNotMatch(totalsCall.sql, /created_at, id/)
})

test("admin transactions keep totals and facets separated by currency", async () => {
  const { handler } = handlerHarness()
  const res = await invoke(handler)
  assert.deepEqual(res.body.totalsByCurrency.map((row) => row.currency), ["GHS", "USD"])
  assert.equal(res.body.totalsByCurrency[0].grossAmount, "14.00")
  assert.equal(res.body.totalsByCurrency[0].successfulAmount, "5.00")
  assert.ok(res.body.facets.gateways.includes("future-gateway"))
})

test("admin transactions reject invalid limits, filters, formats and cursors", async () => {
  for (const query of [
    { limit: "0" },
    { limit: "101" },
    { limit: "2.5" },
    { q: "x".repeat(101) },
    { gateway: "bad\0value" },
    { format: "xml" },
    { cursor: "not-a-cursor" },
    { cursor: Buffer.from(JSON.stringify({ version: 1, createdAt: "2026-11-26T10:00:00.000Z", id: "9999999999999999999" })).toString("base64url") },
    { cursor: Buffer.from(JSON.stringify({ version: 2, createdAt: "2026-11-26T10:00:00.000Z", id: "1" })).toString("base64url") },
  ]) {
    const { handler, calls } = handlerHarness()
    const res = await invoke(handler, { query })
    assert.equal(res.statusCode, 400, JSON.stringify(query))
    assert.equal(calls.length, 0)
  }
})

test("admin transactions expose generic database errors", async () => {
  const { handler } = handlerHarness({ error: new Error("connection password=do-not-leak") })
  const res = await invoke(handler)
  assert.equal(res.statusCode, 500)
  assert.equal(res.body.error, "Transactions are temporarily unavailable.")
  assert.ok(!JSON.stringify(res.body).includes("do-not-leak"))
})

test("admin transactions CSV escapes cells, neutralizes formulas and omits metadata", async () => {
  const rows = [{
    ...PAYMENT_ROWS[0],
    reference: "=HYPERLINK(\"https://example.com\")",
    email: "line one\nline \"two\"@example.com",
  }]
  const { handler } = handlerHarness({ rows })
  const res = await invoke(handler, { query: { format: "csv", q: "buyer" } })
  assert.equal(res.statusCode, 200)
  assert.equal(res.getHeader("content-type"), "text/csv; charset=utf-8")
  assert.match(res.getHeader("content-disposition"), /masterfilepro-transactions-\d{4}-\d{2}-\d{2}\.csv/)
  assert.match(res.body, /"'=HYPERLINK\(""https:\/\/example.com""\)"/)
  assert.match(res.body, /line one\nline ""two""@example.com/)
  assert.ok(!res.body.includes("metadata"))
  assert.ok(!res.body.includes("must-not-leak"))
})

test("admin transactions CSV enforces the export cap and rejects pagination", async () => {
  const rows = Array.from({ length: 10_001 }, (_, index) => ({ ...PAYMENT_ROWS[0], id: String(index + 1) }))
  const capped = handlerHarness({ rows })
  const cappedRes = await invoke(capped.handler, { query: { format: "csv" } })
  assert.equal(cappedRes.statusCode, 413)
  assert.equal(cappedRes.body.code, "export_too_large")

  const paginated = handlerHarness()
  const paginatedRes = await invoke(paginated.handler, { query: { format: "csv", limit: "25" } })
  assert.equal(paginatedRes.statusCode, 400)
  assert.equal(paginated.calls.length, 0)
})

test("admin transactions reject write methods", async () => {
  const { handler, calls } = handlerHarness()
  const res = await invoke(handler, { method: "POST" })
  assert.equal(res.statusCode, 405)
  assert.equal(calls.length, 0)
})

function serviceHarness(fetchImpl) {
  return loadModule("src/adminTransactionsService.ts", {
    "./sessionService": { authHeaders: () => ({ Authorization: "Bearer admin-token" }) },
  }, { fetch: fetchImpl, URLSearchParams })
}

test("admin transaction service sends filters, cursor and bearer token", async () => {
  const requests = []
  const service = serviceHarness(async (url, init) => {
    requests.push({ url, init })
    return { ok: true, status: 200, json: async () => ({ ok: true, transactions: [] }) }
  })
  await service.getAdminTransactions({ gateway: "paystack", q: "buyer@example.com", status: "" }, "cursor-value")
  assert.equal(requests[0].url, "/api/db/transactions?gateway=paystack&q=buyer%40example.com&cursor=cursor-value")
  assert.equal(requests[0].init.headers.Authorization, "Bearer admin-token")
})

test("admin transaction service builds a valid CSV URL with no filters", async () => {
  const requests = []
  const service = serviceHarness(async (url, init) => {
    requests.push({ url, init })
    return {
      ok: true,
      status: 200,
      blob: async () => ({ size: 10 }),
      headers: { get: () => 'attachment; filename="ledger.csv"' },
    }
  })
  const result = await service.exportAdminTransactionsCsv()
  assert.equal(requests[0].url, "/api/db/transactions?format=csv")
  assert.equal(result.fileName, "ledger.csv")
})

test("admin transaction service turns authorization and export errors into actionable errors", async () => {
  const unauthorized = serviceHarness(async () => ({
    ok: false,
    status: 401,
    json: async () => ({ error: "private detail" }),
  }))
  await assert.rejects(
    unauthorized.getAdminTransactions(),
    (err) => err.status === 401 && /session has expired/i.test(err.message),
  )

  const tooLarge = serviceHarness(async () => ({
    ok: false,
    status: 413,
    json: async () => ({ code: "export_too_large", error: "Refine the filters." }),
  }))
  await assert.rejects(
    tooLarge.exportAdminTransactionsCsv({ currency: "GHS" }),
    (err) => err.status === 413 && err.code === "export_too_large",
  )
})

test("admin transaction service preserves abort errors and reports network failures", async () => {
  const aborted = serviceHarness(async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }) })
  await assert.rejects(aborted.getAdminTransactions(), (err) => err.name === "AbortError")

  const offline = serviceHarness(async () => { throw new Error("offline") })
  await assert.rejects(offline.getAdminTransactions(), (err) => err.status === 0 && /connection/i.test(err.message))
})
