const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")
const vm = require("node:vm")

/**
 * Loads a TypeScript serverless handler from source and executes it in a VM.
 * Sibling imports (../_lib/*) resolve against the handler's own directory, and
 * anything listed in `stubs` is replaced in memory so the tests stay unit-level:
 * no Postgres, no network, no real session tokens.
 */
function loadHandler(relPath, stubs = {}, extraGlobals = {}) {
  const fullPath = path.resolve(relPath)
  const dir = path.dirname(fullPath)

  const stubPaths = new Map(
    Object.entries(stubs).map(([spec, mod]) => [
      path.resolve(dir, spec),
      { __esModule: true, ...mod },
    ]),
  )

  const localRequire = (id) => {
    if (id.startsWith(".")) {
      const resolved = path.resolve(dir, id)
      if (stubPaths.has(resolved)) return stubPaths.get(resolved)
      for (const ext of [".ts", ".js", ".tsx"]) {
        if (fs.existsSync(resolved + ext)) {
          return loadHandler(path.relative(process.cwd(), resolved + ext), stubs, extraGlobals)
        }
      }
      // Bare-specifier fallback for extensionless relative imports of npm packages.
      return require(resolved)
    }
    return require(id)
  }

  const source = fs.readFileSync(fullPath, "utf8")
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText

  const exports = {}
  const module = { exports }

  vm.runInNewContext(
    transpiled,
    {
      module,
      exports,
      require: localRequire,
      process,
      Buffer,
      setTimeout,
      clearTimeout,
      AbortController,
      AbortSignal,
      URL,
      URLSearchParams,
      fetch: globalThis.fetch,
      console,
      ...extraGlobals,
    },
    { filename: fullPath },
  )

  module.exports.__esModule = true
  return module.exports.default || module.exports
}

/** Minimal stand-ins for the server-side helpers the handlers depend on. */
function createStubs({ admin, rows = [], gateway = {} } = {}) {
  const calls = []
  const db = {
    cors: () => {},
    json: (res, status, data) => {
      res.status(status).json(data)
      return res
    },
    readBody: async (req) => req.body ?? {},
    query: async (sql, params) => {
      calls.push({ sql, params })
      if (/from payment_gateways/i.test(sql)) return rows
      return []
    },
  }
  return {
    calls,
    db,
    auth: {
      requireAdmin: async () => admin ?? null,
      currentUser: async () => admin ?? null,
    },
    providers: {
      getGatewayConfig: async () => ({
        secretKey: "",
        publicKey: "",
        ...gateway,
      }),
      recordApiCall: async () => {},
      getProviderSecret: async () => "",
    },
  }
}

function createMockReqRes({ method = "GET", body = null, query = {}, headers = {} } = {}) {
  const req = {
    method,
    body,
    query,
    headers,
    url: `/$${method.toLowerCase()}`,
    async *[Symbol.asyncIterator]() {
      if (body) yield Buffer.from(typeof body === "string" ? body : JSON.stringify(body))
    },
  }

  let statusCode = 200
  let resData = null

  const res = {
    statusCode,
    setHeader() {},
    status(code) {
      statusCode = code
      this.statusCode = code
      return this
    },
    json(data) {
      resData = data
      return this
    },
    end(data) {
      if (data && !resData) {
        try {
          resData = JSON.parse(data)
        } catch {
          resData = data
        }
      }
      return this
    },
    _getData() {
      return resData
    },
    _getStatus() {
      return statusCode
    },
  }

  return { req, res }
}

const GATEWAY_ROWS = [
  {
    id: "paystack",
    name: "Paystack",
    description: null,
    enabled: true,
    mode: "test",
    public_key: "pk_test_87fb0c5a46528ef690abe24123c62476ea8d996e",
    secret_key: "sk_test_real_server_side_value_0632",
    webhook_secret: "whsec_real_server_side_value_9931",
    currency: "GHS",
    notes: null,
    endpoint_url: null,
    test_status: "success",
    last_tested_at: null,
    test_message: null,
  },
  {
    id: "stripe",
    name: "Stripe",
    description: null,
    enabled: false,
    mode: "test",
    public_key: null,
    secret_key: null,
    webhook_secret: null,
    currency: "USD",
    notes: null,
    endpoint_url: null,
    test_status: "untested",
    last_tested_at: null,
    test_message: null,
  },
]

const ADMIN = { id: "usr_admin", role: "admin" }

// ---------------------------------------------------------------------------
// /api/db/gateways
// ---------------------------------------------------------------------------

test("API Gateways: GET /api/db/gateways requires an administrator session", async () => {
  const s = createStubs({ admin: null, rows: GATEWAY_ROWS })
  const handler = loadHandler("server/db/gateways.ts", {
    "../_lib/db": s.db,
    "../_lib/auth": s.auth,
  })
  const { req, res } = createMockReqRes({ method: "GET" })

  await handler(req, res)

  assert.equal(res._getStatus(), 401)
  assert.equal(res._getData().ok, false)
  assert.equal(s.calls.length, 0, "an anonymous caller must not reach the database")
})

test("API Gateways: GET /api/db/gateways returns masked secrets to an admin", async () => {
  const s = createStubs({ admin: ADMIN, rows: GATEWAY_ROWS })
  const handler = loadHandler("server/db/gateways.ts", {
    "../_lib/db": s.db,
    "../_lib/auth": s.auth,
  })
  const { req, res } = createMockReqRes({ method: "GET", headers: { authorization: "Bearer t" } })

  await handler(req, res)
  const data = res._getData()

  assert.equal(res._getStatus(), 200)
  assert.ok(data.ok)
  assert.ok(Array.isArray(data.gateways))

  const paystack = data.gateways.find((g) => g.id === "paystack")
  assert.ok(paystack)
  assert.ok(paystack.secretKey.includes("••••"))
  assert.equal(paystack.hasSecretKey, true)

  // The full stored value must never appear anywhere in the response body.
  const serialized = JSON.stringify(data)
  assert.ok(!serialized.includes("sk_test_real_server_side_value_0632"))
  assert.ok(!serialized.includes("whsec_real_server_side_value_9931"))

  const stripe = data.gateways.find((g) => g.id === "stripe")
  assert.equal(stripe.hasSecretKey, false)
  assert.equal(stripe.secretKey, "")
})

test("API Gateways: POST /api/db/gateways preserves stored secrets when the UI sends masked values", async () => {
  const s = createStubs({ admin: ADMIN, rows: GATEWAY_ROWS })
  const handler = loadHandler("server/db/gateways.ts", {
    "../_lib/db": s.db,
    "../_lib/auth": s.auth,
  })
  const { req, res } = createMockReqRes({
    method: "POST",
    body: {
      gateways: [
        {
          id: "paystack",
          name: "Paystack",
          enabled: true,
          mode: "test",
          publicKey: "pk_test_rotated_public_key",
          secretKey: "sk_test_••••••••0632",
          webhookSecret: "whsec_••••••••••••9931",
          currency: "GHS",
        },
      ],
    },
  })

  await handler(req, res)
  const data = res._getData()

  assert.equal(res._getStatus(), 200)
  assert.ok(data.ok)
  // The response is the stored set, not an echo of the payload.
  assert.equal(data.gateways.length, GATEWAY_ROWS.length)

  const upsert = s.calls.find((c) => /insert into payment_gateways/i.test(c.sql))
  assert.ok(upsert, "the handler must upsert the gateway row")
  // $7 (index 6) is the insert value and $15/$16 (indexes 14/15) feed the coalesce().
  assert.equal(upsert.params[6], null, "a masked secret must not overwrite the stored secret")
  assert.equal(upsert.params[14], null)
  assert.equal(upsert.params[15], null)
  assert.equal(upsert.params[5], "pk_test_rotated_public_key", "public key is not secret and does update")

  assert.ok(
    s.calls.some((c) => /insert into audit_log/i.test(c.sql) && c.params[1] === "gateways.update"),
    "gateway writes must be audited",
  )
})

test("API Gateways: POST /api/db/gateways rejects a non-admin writer", async () => {
  const s = createStubs({ admin: null, rows: GATEWAY_ROWS })
  const handler = loadHandler("server/db/gateways.ts", {
    "../_lib/db": s.db,
    "../_lib/auth": s.auth,
  })
  const { req, res } = createMockReqRes({
    method: "POST",
    body: { gateways: [{ id: "paystack", secretKey: "sk_test_stolen_quota_key" }] },
  })

  await handler(req, res)

  assert.equal(res._getStatus(), 401)
  assert.equal(s.calls.length, 0, "a rejected write must not touch the database")
})

// ---------------------------------------------------------------------------
// /api/paystack/verify-keys
// ---------------------------------------------------------------------------

test("API Paystack: POST /api/paystack/verify-keys requires an administrator session", async () => {
  const s = createStubs({ admin: null })
  const handler = loadHandler("api/paystack/verify-keys.ts", {
    "../../server/_lib/db": s.db,
    "../../server/_lib/auth": s.auth,
    "../../server/_lib/providers": s.providers,
  })
  const { req, res } = createMockReqRes({
    method: "POST",
    body: { secretKey: "sk_test_whatever", publicKey: "pk_test_whatever" },
  })

  await handler(req, res)

  assert.equal(res._getStatus(), 401)
  assert.equal(res._getData().ok, false)
})

test("API Paystack: POST /api/paystack/verify-keys rejects missing key", async () => {
  const s = createStubs({ admin: ADMIN })
  const handler = loadHandler("api/paystack/verify-keys.ts", {
    "../../server/_lib/db": s.db,
    "../../server/_lib/auth": s.auth,
    "../../server/_lib/providers": s.providers,
  })
  const { req, res } = createMockReqRes({
    method: "POST",
    body: { secretKey: "invalid_prefix_key", publicKey: "pk_test_123" },
  })

  await handler(req, res)
  const data = res._getData()

  assert.equal(res._getStatus(), 400)
  assert.equal(data.ok, false)
  assert.ok(data.message.includes("Invalid Paystack Secret Key format"))
})

test("API Paystack: POST /api/paystack/verify-keys safely unmasks bullet characters without crashing ByteString", async () => {
  const sent = []
  const s = createStubs({
    admin: ADMIN,
    gateway: {
      secretKey: "sk_test_real_server_side_value_0632",
      publicKey: "pk_test_87fb0c5a46528ef690abe24123c62476ea8d996e",
    },
  })
  const handler = loadHandler(
    "api/paystack/verify-keys.ts",
    { "../../server/_lib/db": s.db, "../../server/_lib/auth": s.auth, "../../server/_lib/providers": s.providers },
    {
      fetch: async (url, init) => {
        sent.push({ url, init })
        return {
          ok: true,
          status: 200,
          json: async () => ({ status: true }),
        }
      },
    },
  )

  const { req, res } = createMockReqRes({
    method: "POST",
    body: {
      secretKey: "sk_test_••••••••0632",
      publicKey: "pk_test_87fb0c5a46528ef690abe24123c62476ea8d996e",
    },
  })

  await handler(req, res)
  const data = res._getData()

  assert.ok(data)
  assert.equal(typeof data.ok, "boolean")
  assert.equal(data.ok, true)

  // The masked UI value is swapped for the stored secret before the outbound call,
  // so a bullet character can never reach a Latin1 header value.
  assert.equal(sent.length, 1)
  assert.equal(sent[0].init.headers.Authorization, "Bearer sk_test_real_server_side_value_0632")
})

test("API Cloud APIs: POST /api/cloud-apis/ping blocks loopback and SSRF IP addresses", async () => {
  const handler = loadHandler("api/cloud-apis/ping.ts")
  const { req, res } = createMockReqRes({
    method: "POST",
    body: { endpoint: "http://127.0.0.1:8080/admin" },
  })

  await handler(req, res)
  const data = res._getData()

  assert.equal(res._getStatus(), 403)
  assert.equal(data.ok, false)
  assert.ok(String(data.error || data.message || "").includes("Prohibited"))
})
