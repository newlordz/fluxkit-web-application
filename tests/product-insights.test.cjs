const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const { webcrypto } = require("node:crypto")

function loadModule(relativePath, globals = {}, stubs = {}, cache = new Map()) {
  const fullPath = path.resolve(relativePath)
  if (cache.has(fullPath)) return cache.get(fullPath)
  const source = fs.readFileSync(fullPath, "utf8")
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText.replace(/import\.meta\.env/g, "process.env")
  const exports = {}
  cache.set(fullPath, exports)
  vm.runInNewContext(
    code,
    {
      exports,
      module: { exports },
      require: (id) => {
        if (Object.hasOwn(stubs, id)) return stubs[id]
        if (id.startsWith(".")) {
          const base = path.resolve(path.dirname(fullPath), id)
          const resolved = [base, `${base}.ts`, `${base}.tsx`].find((candidate) => fs.existsSync(candidate))
          if (resolved) return loadModule(resolved, globals, stubs, cache)
        }
        return require(id)
      },
      process: { env: {} },
      console,
      Buffer,
      URL,
      URLSearchParams,
      AbortController,
      AbortSignal,
      setTimeout,
      clearTimeout,
      setImmediate,
      crypto: webcrypto,
      fetch: globalThis.fetch,
      ...globals,
    },
    { filename: fullPath },
  )
  return exports
}

function createResponse() {
  let statusCode = 200
  let payload
  return {
    setHeader() {},
    status(code) {
      statusCode = code
      return this
    },
    end(value) {
      payload = value ? JSON.parse(value) : undefined
      return this
    },
    get statusCode() {
      return statusCode
    },
    get payload() {
      return payload
    },
  }
}

function createInsightsDb() {
  const events = []
  const feedback = []
  const sql = async (text, params = []) => {
    if (text.includes("pg_advisory_xact_lock")) return [{}]
    if (text.includes("select 1 from funnel_events where visit_id = $1 and sequence = $2")) {
      return events.some((event) => event.visit_id === params[0] && event.sequence === params[1]) ? [{}] : []
    }
    if (text.includes("count(*)::text as count from funnel_events")) {
      const count = events.filter(
        (event) => event.visit_id === params[0] && Date.now() - event.created_at < 86_400_000,
      ).length
      return [{ count: String(count) }]
    }
    if (text.includes("select 1 from funnel_events")) {
      return events.some(
        (event) => event.visit_id === params[0] && event.tool_id === params[1] && event.stage === params[2],
      )
        ? [{}]
        : []
    }
    if (text.includes("insert into funnel_events")) {
      if (events.some((event) => event.visit_id === params[0] && event.sequence === params[3])) {
        throw Object.assign(new Error("duplicate"), { code: "23505" })
      }
      events.push({
        visit_id: params[0],
        tool_id: params[1],
        stage: params[2],
        sequence: params[3],
        created_at: Date.now(),
      })
      return []
    }
    if (text.includes("count(*)::text as count from product_feedback")) {
      const count = feedback.filter(
        (item) => item.visit_id === params[0] && Date.now() - item.created_at < 86_400_000,
      ).length
      return [{ count: String(count) }]
    }
    if (text.includes("insert into product_feedback")) {
      feedback.push({
        visit_id: params[0],
        tool_id: params[1],
        sentiment: params[2],
        created_at: Date.now(),
      })
      return []
    }
    if (text.includes("count(distinct visit_id)")) {
      const toolIds = [...new Set(events.map((event) => event.tool_id))]
      return toolIds.map((toolId) => {
        const rows = events.filter((event) => event.tool_id === toolId)
        const count = (stage) => new Set(rows.filter((event) => event.stage === stage).map((event) => event.visit_id)).size
        return {
          tool_id: toolId,
          opened: String(count("tool_opened")),
          files_added: String(count("file_added")),
          results: String(count("result_ready")),
          downloads: String(count("download_started")),
        }
      })
    }
    if (text.includes("select sentiment, count(*)")) {
      return [...new Set(feedback.map((item) => item.sentiment))].map((sentiment) => ({
        sentiment,
        count: String(feedback.filter((item) => item.sentiment === sentiment).length),
      }))
    }
    throw new Error(`Unexpected SQL: ${text}`)
  }
  return { events, feedback, transact: async (run) => run(sql) }
}

function createInsightsHandler(db, admin = null) {
  return loadModule("server/db/insights.ts", {}, {
    "../_lib/db.ts": {
      cors() {},
      noStore: undefined,
      json: (res, status, payload) => res.status(status).end(JSON.stringify(payload)),
      readBody: async (req) => req.body,
      transact: db.transact,
    },
    "../_lib/auth.ts": { requireAdmin: async () => admin },
  }).default
}

async function post(handler, body) {
  const res = createResponse()
  await handler({ method: "POST", body }, res)
  return { status: res.statusCode, payload: res.payload }
}

const visitId = "123e4567-e89b-42d3-a456-426614174000"
const otherVisitId = "123e4567-e89b-42d3-a456-426614174001"
const funnel = (stage, sequence, id = visitId) => ({ visitId: id, toolId: "merge-pdf", stage, sequence })
const feedbackPayload = (id = visitId) => ({ visitId: id, toolId: "merge-pdf", sentiment: "works-well" })

test("insights payloads reject document data, identity, URLs, tokens, and extra keys", () => {
  const { parseFunnelPayload, parseFeedbackPayload } = loadModule("shared/insights.ts")
  assert.equal(JSON.stringify(parseFunnelPayload(funnel("tool_opened", 1))), JSON.stringify(funnel("tool_opened", 1)))
  assert.equal(JSON.stringify(parseFeedbackPayload(feedbackPayload())), JSON.stringify(feedbackPayload()))

  for (const key of ["filename", "content", "text", "email", "url", "token", "userId", "ip", "metadata", "fileSize"]) {
    assert.equal(parseFunnelPayload({ ...funnel("tool_opened", 1), [key]: "sensitive" }), null, key)
    assert.equal(parseFeedbackPayload({ ...feedbackPayload(), [key]: "sensitive" }), null, key)
  }
  assert.equal(parseFunnelPayload({ ...funnel("tool_opened", 1), toolId: "unknown-tool" }), null)
  assert.equal(parseFunnelPayload({ ...funnel("tool_opened", 1), stage: "file_uploaded" }), null)
  assert.equal(parseFunnelPayload({ ...funnel("tool_opened", 0) }), null)
  assert.equal(parseFunnelPayload({ ...funnel("tool_opened", 1001) }), null)
  assert.equal(parseFunnelPayload({ ...funnel("tool_opened", 1), visitId: "not-a-uuid" }), null)
  assert.equal(parseFeedbackPayload({ ...feedbackPayload(), sentiment: "free-text complaint" }), null)
})

test("insights tool allowlist stays aligned with the product catalog", () => {
  const { TOOL_IDS } = loadModule("shared/insights.ts")
  const { tools } = loadModule("src/config.ts")
  assert.deepEqual(Array.from(TOOL_IDS).sort(), Array.from(tools, (tool) => tool.id).sort())
})

test("telemetry sends only exact anonymous payloads and survives a failed request", async () => {
  const requests = []
  let failNext = true
  const telemetry = loadModule("src/privacyTelemetry.ts", {
    fetch: async (url, options) => {
      requests.push({ url, options, body: JSON.parse(options.body) })
      if (failNext) {
        failNext = false
        throw new Error("offline")
      }
      return { ok: true }
    },
  })

  telemetry.trackToolEvent("tool_opened", "merge-pdf")
  telemetry.trackToolEvent("tool_opened", "merge-pdf")
  telemetry.trackToolEvent("file_added", "merge-pdf")
  telemetry.trackToolEvent("result_ready", "merge-pdf")
  telemetry.trackToolEvent("download_started", "merge-pdf")
  telemetry.trackToolEvent("download_started", "merge-pdf")
  assert.equal(await telemetry.submitProductFeedback("works-well", "merge-pdf"), true)
  await new Promise(setImmediate)

  assert.equal(requests.length, 6)
  assert.deepEqual(requests.map((request) => request.body.stage).filter(Boolean), [
    "tool_opened",
    "file_added",
    "result_ready",
    "download_started",
    "download_started",
  ])
  for (const request of requests) {
    assert.equal(request.url, "/api/db/insights")
    assert.equal(request.options.credentials, "omit")
    assert.equal(request.options.referrerPolicy, "no-referrer")
    assert.equal(request.options.cache, "no-store")
    assert.match(request.body.visitId, /^[0-9a-f-]{36}$/)
    assert.equal(Object.keys(request.body).length, request.body.stage ? 4 : 3)
  }
  assert.deepEqual(Object.keys(requests[0].body).sort(), ["sequence", "stage", "toolId", "visitId"])
  assert.deepEqual(Object.keys(requests[5].body).sort(), ["sentiment", "toolId", "visitId"])
})

test("disabled telemetry performs no network requests", async () => {
  let calls = 0
  const telemetry = loadModule("src/privacyTelemetry.ts", {
    process: { env: { VITE_ENABLE_PRODUCT_INSIGHTS: "false" } },
    fetch: async () => {
      calls += 1
      return { ok: true }
    },
  })
  telemetry.trackToolEvent("tool_opened", "merge-pdf")
  assert.equal(await telemetry.submitProductFeedback("works-well", null), false)
  await new Promise(setImmediate)
  assert.equal(calls, 0)
})

test("funnel API enforces stage order, deduplicates, and caps daily events", async () => {
  const db = createInsightsDb()
  const handler = createInsightsHandler(db)

  assert.equal((await post(handler, funnel("file_added", 1, otherVisitId))).status, 409)
  for (const [index, stage] of ["tool_opened", "file_added", "result_ready", "download_started"].entries()) {
    assert.equal((await post(handler, funnel(stage, index + 1))).status, 200)
  }
  assert.equal((await post(handler, funnel("result_ready", 3))).status, 200)
  assert.equal(db.events.length, 4)

  const cappedVisit = "123e4567-e89b-42d3-a456-426614174002"
  for (let sequence = 1; sequence <= 100; sequence += 1) {
    assert.equal((await post(handler, funnel("tool_opened", sequence, cappedVisit))).status, 200)
  }
  assert.equal((await post(handler, funnel("tool_opened", 101, cappedVisit))).status, 429)
  assert.equal((await post(handler, funnel("tool_opened", 100, cappedVisit))).status, 200)
})

test("feedback API accepts fixed sentiments only and caps daily submissions", async () => {
  const db = createInsightsDb()
  const handler = createInsightsHandler(db)
  assert.equal((await post(handler, { ...feedbackPayload(), message: "private details" })).status, 400)
  assert.equal((await post(handler, { ...feedbackPayload(), sentiment: "other" })).status, 400)

  for (let index = 0; index < 5; index += 1) {
    assert.equal((await post(handler, feedbackPayload())).status, 200)
  }
  assert.equal((await post(handler, feedbackPayload())).status, 429)
  assert.equal(db.feedback.length, 5)
})

test("insights skips guest telemetry when the optional schema is absent", async () => {
  const missingSchema = Object.assign(new Error('relation "funnel_events" does not exist'), {
    code: "42P01",
  })
  const db = {
    transact: async () => {
      throw missingSchema
    },
  }
  const handler = createInsightsHandler(db)

  assert.deepEqual(await post(handler, funnel("tool_opened", 1)), {
    status: 200,
    payload: { ok: true, skipped: true },
  })
  assert.deepEqual(await post(handler, feedbackPayload()), {
    status: 200,
    payload: { ok: true, skipped: true },
  })

  const adminHandler = createInsightsHandler(db, { id: "admin", role: "admin" })
  const res = createResponse()
  await adminHandler({ method: "GET" }, res)
  assert.equal(res.statusCode, 503)
  assert.match(res.payload.error, /not configured on the primary database/i)
})

test("insights aggregates require an administrator and expose no raw event rows", async () => {
  const db = createInsightsDb()
  const anonymous = createInsightsHandler(db)
  const denied = createResponse()
  await anonymous({ method: "GET" }, denied)
  assert.equal(denied.statusCode, 403)
  assert.equal(db.events.length, 0)

  const handler = createInsightsHandler(db, { id: "admin", role: "admin" })
  for (const [index, stage] of ["tool_opened", "file_added", "result_ready", "download_started"].entries()) {
    assert.equal((await post(handler, funnel(stage, index + 1))).status, 200)
  }
  assert.equal((await post(handler, feedbackPayload())).status, 200)

  const res = createResponse()
  await handler({ method: "GET" }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.payload.totals.opened, 1)
  assert.equal(res.payload.totals.filesAdded, 1)
  assert.equal(res.payload.totals.results, 1)
  assert.equal(res.payload.totals.downloads, 1)
  assert.equal(res.payload.totals.resultRate, 100)
  assert.equal(res.payload.totals.downloadRate, 100)
  assert.equal(res.payload.feedback["works-well"], 1)
  assert.equal(res.payload.tools[0].toolId, "merge-pdf")
  assert.doesNotMatch(JSON.stringify(res.payload), /visitId|visit_id|filename|content|email|token/i)
})

test("insights migration is default-deny and the API remains at twelve functions", () => {
  const migration = fs.readFileSync("supabase/migrations/0004_product_insights.sql", "utf8")
  assert.match(migration, /alter table funnel_events enable row level security/i)
  assert.match(migration, /alter table product_feedback enable row level security/i)
  assert.match(migration, /revoke all on table funnel_events from anon, authenticated/i)
  assert.match(migration, /revoke all on table product_feedback from anon, authenticated/i)
  assert.doesNotMatch(migration, /create policy/i)
  assert.doesNotMatch(migration, /filename|document_content|extracted_text|email|ip_address|token/i)

  const apiFiles = fs.readdirSync("api", { recursive: true }).filter((file) => file.endsWith(".ts"))
  assert.equal(apiFiles.length, 12)
})

test("core journeys expose keyboard, progress, retry, and result semantics", () => {
  const app = fs.readFileSync("src/App.tsx", "utf8")
  const overview = fs.readFileSync("src/Overview.tsx", "utf8")
  const toolPage = fs.readFileSync("src/ToolPage.tsx", "utf8")

  assert.match(app, /inert=\{mobileViewport && !mobile/)
  assert.match(app, /inert=\{mobileViewport && mobile/)
  assert.match(app, /const trapFocus = \(event: KeyboardEvent\)/)
  assert.match(app, /aria-controls="workspace-sidebar"/)
  assert.match(overview, /role=\{stagedFile \? undefined : "button"\}/)
  assert.match(overview, /e\.key === "Enter" \|\| e\.key === " "/)
  assert.match(overview, /event\.key === "ArrowRight"/)
  assert.match(
    overview,
    /restoreTarget\?\.focus\(\)/,
    "modal close must return focus to a visible trigger",
  )
  assert.match(toolPage, /aria-busy=\{isProcessing\}/)
  assert.match(toolPage, /className="job-status" role="status"/)
  assert.match(toolPage, /<progress/)
  assert.match(
    toolPage,
    /aria-disabled=\{isProcessing \|\| undefined\}/,
    "submit must stay focusable while processing",
  )
  assert.match(toolPage, /Retry\s*<\/button>/)
  assert.match(toolPage, /ref=\{resultPanelRef\}/)
  assert.match(toolPage, /tabIndex=\{-1\}/)
  assert.match(toolPage, /trackToolEvent\("result_ready", tool\.id\)/)
  assert.match(toolPage, /trackToolEvent\("download_started", tool\.id\)/)
  assert.match(toolPage, /<QuickFeedback toolId=\{tool\.id\}/)
})
