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
function loadHandler(relPath, stubs = {}, extraGlobals = {}, stubPaths = null) {
  const fullPath = path.resolve(relPath)
  const dir = path.dirname(fullPath)

  // Stub specifiers are written from the entry handler's point of view, so they are
  // made absolute once and reused by every nested import. Resolving them per file
  // silently missed a module the second hop down (a shared _lib helper pulled in by
  // a route) and the real implementation ran instead of the stub.
  if (!stubPaths) {
    stubPaths = new Map(
      Object.entries(stubs).map(([spec, mod]) => [
        path.resolve(dir, spec),
        { __esModule: true, ...mod },
      ]),
    )
  }

  const localRequire = (id) => {
    if (id.startsWith(".")) {
      const resolved = path.resolve(dir, id)
      if (stubPaths.has(resolved)) return stubPaths.get(resolved)
      for (const ext of ["", ".ts", ".js", ".tsx"]) {
        if (fs.existsSync(resolved + ext)) {
          return loadHandler(path.relative(process.cwd(), resolved + ext), stubs, extraGlobals, stubPaths)
        }
      }
      // Fallback for relative specifiers that name an npm package.
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
function createStubs({ admin, rows = [], prices = [], paymentRows = [], gateway = {} } = {}) {
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
      if (/from payments/i.test(sql)) return paymentRows
      // The plan prices the checkout is measured against.
      if (/from tools/i.test(sql)) return prices
      return []
    },
  }
  db.queryAuthoritative = (sql, params) => db.query(sql, params)
  db.transact = async (fn) => fn(db.queryAuthoritative)
  db.redactSecret = (value) => value ? "••••••••" : ""
  return {
    calls,
    db,
    auth: {
      requireAdmin: async () => admin ?? null,
      requireRole: async () => admin ?? null,
      requireActiveUser: async () => admin && !admin.must_reset_password ? admin : null,
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
  const responseHeaders = new Map()

  const res = {
    statusCode,
    setHeader(name, value) { responseHeaders.set(name.toLowerCase(), value) },
    getHeader(name) { return responseHeaders.get(name.toLowerCase()) },
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
    "../_lib/db.ts": s.db,
    "../_lib/auth.ts": s.auth,
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
    "../_lib/db.ts": s.db,
    "../_lib/auth.ts": s.auth,
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
    "../_lib/db.ts": s.db,
    "../_lib/auth.ts": s.auth,
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
    "../_lib/db.ts": s.db,
    "../_lib/auth.ts": s.auth,
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
    "../../server/_lib/db.ts": s.db,
    "../../server/_lib/auth.ts": s.auth,
    "../../server/_lib/providers.ts": s.providers,
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
    "../../server/_lib/db.ts": s.db,
    "../../server/_lib/auth.ts": s.auth,
    "../../server/_lib/providers.ts": s.providers,
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
    { "../../server/_lib/db.ts": s.db, "../../server/_lib/auth.ts": s.auth, "../../server/_lib/providers.ts": s.providers },
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

const BUYER = { id: "usr_buyer", role: "user", email: "buyer@example.com" }
const PRICED = [{ price: 4.99 }]

function paystackStubs({ user = null, prices = [], paymentRows = [] } = {}) {
  const s = createStubs({ admin: user, prices, paymentRows, gateway: { secretKey: "sk_test_server_side" } })
  return {
    s,
    stubs: {
      "../server/_lib/db.ts": s.db,
      "../server/_lib/auth.ts": s.auth,
      "../server/_lib/providers.ts": s.providers,
    },
  }
}

test("API Paystack: /api/paystack refuses an anonymous checkout and an anonymous verify", async () => {
  const { stubs } = paystackStubs({ user: null })
  const handler = loadHandler("api/paystack.ts", stubs)
  const net = stubOutboundFetch()

  try {
    const start = createMockReqRes({
      method: "POST",
      body: { amount: 499, tool: "pdf-to-word", email: "someone@else.com" },
    })
    await handler(start.req, start.res)
    assert.equal(start.res._getStatus(), 401)

    const check = createMockReqRes({ method: "GET", query: { action: "verify", reference: "ref_1" } })
    await handler(check.req, check.res)
    assert.equal(check.res._getStatus(), 401)
    assert.deepEqual(net.seen, [], "no transaction is opened and no ledger row is written")
  } finally {
    net.restore()
  }
})

test("API Paystack: a checkout cannot be started below the stored plan price", async () => {
  const { s, stubs } = paystackStubs({ user: BUYER, prices: PRICED })
  const handler = loadHandler("api/paystack.ts", stubs)
  const net = stubOutboundFetch()

  try {
    const { req, res } = createMockReqRes({
      method: "POST",
      body: { amount: 1, tool: "pdf-to-word" },
    })
    await handler(req, res)

    assert.equal(res._getStatus(), 400)
    assert.match(res._getData().message, /below the listed price/)
    assert.deepEqual(net.seen, [], "Paystack is not asked to take a penny for a subscription")
  } finally {
    net.restore()
  }

  assert.equal(
    s.calls.filter((c) => /insert into payments/i.test(c.sql)).length,
    0,
    "and nothing is booked in the ledger",
  )
})

test("API Paystack: the charge is raised for the signed-in account, not the address in the body", async () => {
  const sent = []
  const { stubs } = paystackStubs({ user: BUYER, prices: PRICED })
  const handler = loadHandler(
    "api/paystack.ts",
    stubs,
    {
      fetch: async (url, init) => {
        sent.push({ url: String(url), init })
        return {
          status: 200,
          json: async () => ({ status: true, data: { reference: "ref_paid_1", authorization_url: "https://checkout.paystack.com/x" } }),
        }
      },
    },
  )

  const { req, res } = createMockReqRes({
    method: "POST",
    body: { amount: 499, tool: "pdf-to-word", email: "someone@else.com", currency: "USD" },
  })
  await handler(req, res)

  assert.equal(sent.length, 1)
  const body = JSON.parse(sent[0].init.body)
  assert.equal(body.email, "buyer@example.com", "the account being charged is the session's own")
  assert.equal(body.amount, 499)
  assert.deepEqual(body.metadata, { userId: "usr_buyer", tool: "pdf-to-word" })
  assert.equal(res._getStatus(), 200)
})

test("API Paystack: a return address on another site is refused", async () => {
  const { stubs } = paystackStubs({ user: BUYER, prices: PRICED })
  const handler = loadHandler("api/paystack.ts", stubs)
  const net = stubOutboundFetch()

  try {
    const { req, res } = createMockReqRes({
      method: "POST",
      body: { amount: 6000, tool: "pdf-to-word", callback_url: "https://elsewhere.example.com/claim" },
    })
    await handler(req, res)

    assert.equal(res._getStatus(), 400)
    assert.match(res._getData().message, /return to this site/)
    assert.deepEqual(net.seen, [], "a transaction is never opened toward an outside address")
  } finally {
    net.restore()
  }
})

test("API Paystack: a verified caller-owned charge grants the purchased entitlement", async () => {
  const paymentRows = [{
    user_id: BUYER.id,
    email: BUYER.email,
    amount: 4.99,
    currency: "USD",
    tool: "pdf-to-word",
    status: "pending",
  }]
  const { s, stubs } = paystackStubs({ user: BUYER, prices: PRICED, paymentRows })
  const authoritativeQuery = s.db.query
  s.db.query = async () => { throw new Error("fallback must not grant paid access") }
  s.db.queryAuthoritative = authoritativeQuery
  const handler = loadHandler(
    "api/paystack.ts",
    stubs,
    {
      fetch: async () => ({
        status: 200,
        json: async () => ({
          status: true,
          data: {
            status: "success",
            amount: 499,
            currency: "USD",
            reference: "ref_paid_1",
            customer: { email: BUYER.email },
          },
        }),
      }),
    },
  )

  const { req, res } = createMockReqRes({ method: "GET", query: { action: "verify", reference: "ref_paid_1" } })
  await handler(req, res)

  assert.equal(res._getStatus(), 200)
  assert.equal(res._getData().status, "success")
  assert.equal(res._getData().tool, "pdf-to-word")
  assert.equal(res._getData().customer, undefined)
  const unlock = s.calls.find((c) => /array_append\(unlocked_tools/i.test(c.sql))
  assert.ok(unlock, "the tool unlock is written server-side")
  assert.deepEqual(JSON.parse(JSON.stringify(unlock.params)), [BUYER.id, "pdf-to-word"])
  const update = s.calls.find((c) => /update payments set status = 'success'/i.test(c.sql))
  assert.match(update.sql, /user_id = \$4/)
  assert.equal(update.params[3], BUYER.id)
})

test("API Paystack: a successful reference cannot be replayed to restore Pro", async () => {
  let payment = {
    user_id: BUYER.id,
    email: BUYER.email,
    amount: 19,
    currency: "USD",
    tool: "pro-monthly",
    status: "pending",
  }
  let proGrants = 0
  let verifications = 0
  const s = createStubs({ admin: BUYER, gateway: { secretKey: "sk_test_server_side" } })
  s.db.query = async (sql, params) => {
    s.calls.push({ sql, params })
    if (/from payments/i.test(sql)) {
      return /for update/i.test(sql) ? [{ status: payment.status }] : [{ ...payment }]
    }
    if (/update payments set status = 'success'/i.test(sql)) {
      payment = { ...payment, status: "success" }
    }
    if (/update users set subscription_tier = 'pro'/i.test(sql)) proGrants++
    return []
  }
  s.db.queryAuthoritative = s.db.query
  const handler = loadHandler("api/paystack.ts", {
    "../server/_lib/db.ts": s.db,
    "../server/_lib/auth.ts": s.auth,
    "../server/_lib/providers.ts": s.providers,
  }, {
    fetch: async () => {
      verifications++
      return {
        status: 200,
        json: async () => ({
          status: true,
          data: {
            status: "success",
            amount: 1900,
            currency: "USD",
            reference: "ref_pro_once",
            customer: { email: BUYER.email },
          },
        }),
      }
    },
  })

  const first = createMockReqRes({ method: "GET", query: { action: "verify", reference: "ref_pro_once" } })
  await handler(first.req, first.res)
  const replay = createMockReqRes({ method: "GET", query: { action: "verify", reference: "ref_pro_once" } })
  await handler(replay.req, replay.res)

  assert.equal(first.res._getStatus(), 200)
  assert.equal(replay.res._getStatus(), 409)
  assert.match(replay.res._getData().message, /already been processed/)
  assert.equal(proGrants, 1)
  assert.equal(verifications, 1)
  assert.ok(s.calls.some((call) => /from payments/i.test(call.sql) && /for update/i.test(call.sql)))
})

test("API Paystack: a late provider failure cannot overwrite a concurrent success", async () => {
  const payment = {
    user_id: BUYER.id,
    email: BUYER.email,
    amount: 19,
    currency: "USD",
    tool: "pro-monthly",
    status: "pending",
  }
  let proGrants = 0
  let verifications = 0
  let releaseSlow
  let markSlowStarted
  const slowStarted = new Promise((resolve) => { markSlowStarted = resolve })
  const slowResponse = new Promise((resolve) => { releaseSlow = resolve })
  const s = createStubs({ admin: BUYER, gateway: { secretKey: "sk_test_server_side" } })
  s.db.query = async (sql, params) => {
    s.calls.push({ sql, params })
    if (/from payments/i.test(sql)) return [{ ...payment }]
    if (/update payments set status = \$2/i.test(sql) && params?.[1] === "failed" && /status <> 'success'/i.test(sql)) {
      if (payment.status !== "success") payment.status = "failed"
    }
    if (/update payments set status = 'success'/i.test(sql)) payment.status = "success"
    if (/update users set subscription_tier = 'pro'/i.test(sql)) proGrants++
    return []
  }
  s.db.queryAuthoritative = s.db.query
  const handler = loadHandler("api/paystack.ts", {
    "../server/_lib/db.ts": s.db,
    "../server/_lib/auth.ts": s.auth,
    "../server/_lib/providers.ts": s.providers,
  }, {
    fetch: async () => {
      verifications++
      if (verifications === 1) {
        markSlowStarted()
        return slowResponse
      }
      return {
        status: 200,
        json: async () => ({
          status: true,
          data: {
            status: "success",
            amount: 1900,
            currency: "USD",
            reference: "ref_race",
            customer: { email: BUYER.email },
          },
        }),
      }
    },
  })

  const slow = createMockReqRes({ method: "GET", query: { action: "verify", reference: "ref_race" } })
  const slowRequest = handler(slow.req, slow.res)
  await slowStarted
  const successful = createMockReqRes({ method: "GET", query: { action: "verify", reference: "ref_race" } })
  await handler(successful.req, successful.res)
  releaseSlow({
    status: 200,
    json: async () => ({ status: true, data: { status: "pending", customer: { email: BUYER.email } } }),
  })
  await slowRequest

  assert.equal(successful.res._getStatus(), 200)
  assert.equal(slow.res._getStatus(), 402)
  assert.equal(payment.status, "success")
  assert.equal(proGrants, 1)
  assert.ok(s.calls.some((call) => /update payments set status = \$2/i.test(call.sql) && call.params?.[1] === "failed" && /status <> 'success'/i.test(call.sql)))
})

test("API Paystack: a verified charge survives an account email change", async () => {
  const actor = { ...BUYER, email: "new-address@example.com" }
  const paymentRows = [{
    user_id: BUYER.id,
    email: BUYER.email,
    amount: 4.99,
    currency: "USD",
    tool: "pdf-to-word",
    status: "pending",
  }]
  const { s, stubs } = paystackStubs({ user: actor, prices: PRICED, paymentRows })
  s.db.queryAuthoritative = s.db.query
  const handler = loadHandler("api/paystack.ts", stubs, {
    fetch: async () => ({
      status: 200,
      json: async () => ({
        status: true,
        data: {
          status: "success",
          amount: 499,
          currency: "USD",
          reference: "ref_email_changed",
          customer: { email: BUYER.email },
        },
      }),
    }),
  })

  const { req, res } = createMockReqRes({ method: "GET", query: { action: "verify", reference: "ref_email_changed" } })
  await handler(req, res)

  assert.equal(res._getStatus(), 200)
  assert.equal(res._getData().status, "success")
  assert.ok(s.calls.some((call) => /array_append\(unlocked_tools/i.test(call.sql)))
})

test("API Paystack: an outsider cannot verify a reference without a matching ledger row", async () => {
  const { stubs } = paystackStubs({ user: BUYER })
  const handler = loadHandler("api/paystack.ts", stubs)
  const net = stubOutboundFetch()
  try {
    const { req, res } = createMockReqRes({ method: "GET", query: { action: "verify", reference: "someone_elses_ref" } })
    await handler(req, res)
    assert.equal(res._getStatus(), 403)
    assert.deepEqual(net.seen, [])
  } finally {
    net.restore()
  }
})

test("API Cloud APIs: POST /api/cloud-apis/ping blocks loopback and SSRF IP addresses", async () => {
  // The probe dials an address the caller picks, so it now runs only for the pool
  // editor. An admin session is supplied to reach the address check itself.
  const s = createStubs({ admin: { id: "usr_admin", role: "admin" } })
  const handler = loadHandler("api/cloud-apis/ping.ts", {
    "../../server/_lib/auth.ts": s.auth,
  })
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

test("API Cloud APIs: POST /api/cloud-apis/ping requires an administrator session", async () => {
  const s = createStubs({ admin: null })
  const handler = loadHandler("api/cloud-apis/ping.ts", {
    "../../server/_lib/auth.ts": s.auth,
  })
  const { req, res } = createMockReqRes({
    method: "POST",
    body: { endpoint: "http://169.254.169.254/latest/meta-data/" },
  })

  await handler(req, res)

  assert.equal(res._getStatus(), 401)
  assert.equal(res._getData().ok, false)
})

// ---------------------------------------------------------------------------
// Paid cloud proxies: session, quota and payload gates
// ---------------------------------------------------------------------------

const MEMBER = {
  id: "usr_member",
  role: "user",
  subscription_tier: "standard",
  pro_status: "none",
  unlocked_tools: [],
}

function cloudStubs({ user = null, outOfQuota = false, hooks = {} } = {}) {
  const s = createStubs({ admin: user })

  const baseReadBody = s.db.readBody
  s.db.readBody = async (req, maxBytes) => {
    hooks.onReadBody && hooks.onReadBody(maxBytes)
    return baseReadBody(req, maxBytes)
  }

  return {
    s,
    stubs: {
      "../server/_lib/db.ts": s.db,
      "../server/_lib/auth.ts": s.auth,
      "../server/_lib/providers.ts": {
        ...s.providers,
        getAdobeCredentials: async () => ({ clientId: "client_id", clientSecret: "client_secret" }),
        getILovePdfCredentials: async () => ({ publicKey: "public_key", secretKey: "secret_key" }),
        isProviderOutOfQuota: async () => outOfQuota,
      },
    },
  }
}

function stubOutboundFetch() {
  const original = globalThis.fetch
  const seen = []

  globalThis.fetch = async (url, init) => {
    seen.push(String(url))
    throw new Error("outbound call attempted")
  }

  return { seen, restore: () => (globalThis.fetch = original) }
}

for (const [route, file, body] of [
  ["/api/adobe-pdf/compress", "api/adobe-pdf.ts", { pdfBase64: "AAAA" }],
  ["/api/ilovepdf/compress", "api/ilovepdf.ts", { pdfBase64: "AAAA" }],
  ["/api/ocr-space/parse", "api/ocr-space.ts", { base64Image: "AAAA" }],
]) {
  test(`API Cloud: ${route} refuses a caller without a session`, async () => {
    const { stubs } = cloudStubs({ user: null })
    const handler = loadHandler(file, stubs)
    const net = stubOutboundFetch()
    const { req, res } = createMockReqRes({ method: "POST", body })

    try {
      await handler(req, res)
    } finally {
      net.restore()
    }

    const data = res._getData()
    assert.equal(res.statusCode, 401)
    assert.equal(data.code, "sign_in_required")
    assert.deepEqual(net.seen, [], "the paid provider is never contacted")
  })
}

test("API Cloud: /api/adobe-pdf/compress refuses a member once the monthly quota is spent", async () => {
  const { stubs } = cloudStubs({ user: MEMBER, outOfQuota: true })
  const handler = loadHandler("api/adobe-pdf.ts", stubs)
  const net = stubOutboundFetch()
  const { req, res } = createMockReqRes({ method: "POST", body: { pdfBase64: "AAAA" } })

  try {
    await handler(req, res)
  } finally {
    net.restore()
  }

  assert.equal(res.statusCode, 429)
  assert.equal(res._getData().code, "quota_exhausted")
  assert.deepEqual(net.seen, [])
})

test("API Cloud: the session gate runs before the document is read from the wire", async () => {
  const hooks = {}
  let readCalled = false
  const { stubs, s } = cloudStubs({ user: null, hooks })
  const base = s.db.readBody
  s.db.readBody = async (req, maxBytes) => {
    readCalled = true
    return base(req, maxBytes)
  }

  const handler = loadHandler("api/adobe-pdf.ts", stubs)
  const { req, res } = createMockReqRes({ method: "POST", body: { pdfBase64: "AAAA" } })
  await handler(req, res)

  assert.equal(res.statusCode, 401)
  assert.equal(readCalled, false, "an oversized anonymous upload is refused without buffering it")
})

test("API Cloud: gateway reads the document under a bounded body size", async () => {
  const hooks = {}
  let cap = 0
  const { s } = cloudStubs({ user: MEMBER, hooks })
  const base = s.db.readBody
  s.db.readBody = async (req, maxBytes) => {
    cap = maxBytes
    return base(req, maxBytes)
  }

  const gateway = loadHandler("server/_lib/gateway.ts", {
    "./db.ts": s.db,
    "./auth.ts": s.auth,
    "./providers.ts": { isProviderOutOfQuota: async () => false },
  })

  const { req, res } = createMockReqRes({ method: "POST", body: { pdfBase64: "AAAA" } })
  const user = await gateway.requirePaidAccess(req, res, "adobe", "compress")
  assert.equal(user, MEMBER)

  const body = await gateway.readPaidBody(req, res)
  assert.deepEqual(body, { pdfBase64: "AAAA" })
  assert.ok(cap >= 25 * 1024 * 1024, `a 25 MB document must fit under the cap, got ${cap} bytes`)
})

test("API Cloud: a body larger than the cap is refused with 413 before any provider call", async () => {
  const gateway = loadHandler("server/_lib/gateway.ts", {
    "./auth.ts": { requireActiveUser: async () => MEMBER },
    "./providers.ts": { isProviderOutOfQuota: async () => false },
  })

  // Real readBody from server/_lib/db.ts, fed just past the 40 MB ceiling.
  const chunk = Buffer.alloc(1024 * 1024, 65)
  const { req, res } = createMockReqRes({ method: "POST", body: null })
  req[Symbol.asyncIterator] = async function* () {
    for (let i = 0; i < 45; i++) yield chunk
  }

  const body = await gateway.readPaidBody(req, res)
  assert.equal(body, null)
  assert.equal(res.statusCode, 413)
  assert.equal(res._getData().code, "payload_too_large")
})

// ---------------------------------------------------------------------------
// Image to Excel cloud assist: consent, validation, quota, and safe failures
// ---------------------------------------------------------------------------

const IMAGE_TABLE_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
)
const IMAGE_TABLE_BODY = {
  imageBase64: IMAGE_TABLE_PNG.toString("base64"),
  mimeType: "image/png",
  consent: true,
}
const IMAGE_TABLE_RESULT = {
  columns: [
    { label: "Date", kind: "date" },
    { label: "Amount", kind: "amount" },
  ],
  rows: [
    {
      cells: [
        { value: "01/02/2026", confidence: 0.99 },
        { value: "2,500.00", confidence: 0.98 },
      ],
    },
  ],
}

function imageTableStubs({ user = MEMBER, userCalls = 0, totalCalls = 0, apiKey = "server-test-key", error = null } = {}) {
  const usage = []
  const recorded = []
  const extracted = []
  const db = {
    cors: () => {},
    json: (res, status, data) => res.status(status).json(data),
    readBody: async (req) => req.body ?? {},
  }
  const providers = {
    countApiUsage: async (_provider, options) => {
      usage.push(options)
      return options.userId ? userCalls : totalCalls
    },
    getProviderSecret: async () => apiKey,
    recordApiCall: async (...args) => recorded.push(args),
  }
  class StubGeminiError extends Error {
    constructor(message, status, code) {
      super(message)
      this.status = status
      this.code = code
    }
  }
  const gemini = {
    GeminiImageError: StubGeminiError,
    extractImageTableWithGemini: async (input, options) => {
      extracted.push(input)
      await options.onCall("success")
      if (error) throw error
      return { table: IMAGE_TABLE_RESULT, model: "test-model", attempts: 1 }
    },
  }
  const gateway = {
    requirePaidAccess: async (_req, res) => {
      if (!user) {
        db.json(res, 401, { ok: false, code: "sign_in_required" })
        return null
      }
      return user
    },
    readPaidBody: async (req) => db.readBody(req),
  }
  return {
    usage,
    recorded,
    extracted,
    stubs: {
      "../server/_lib/db.ts": db,
      "../server/_lib/gateway.ts": gateway,
      "../server/_lib/providers.ts": providers,
      "../server/_lib/geminiImageTable.ts": gemini,
    },
  }
}

async function postImageTable(body = IMAGE_TABLE_BODY, stubs = imageTableStubs().stubs) {
  const handler = loadHandler("api/image-table.ts", stubs)
  const { req, res } = createMockReqRes({ method: "POST", body, query: { action: "extract" } })
  await handler(req, res)
  return res
}

test("Image to Excel cloud API refuses anonymous callers before reading the image", async () => {
  const harness = imageTableStubs({ user: null })
  const res = await postImageTable(IMAGE_TABLE_BODY, harness.stubs)
  assert.equal(res._getStatus(), 401)
  assert.equal(res._getData().code, "sign_in_required")
  assert.equal(harness.extracted.length, 0)
  assert.equal(harness.usage.length, 0)
})

test("Image to Excel cloud API requires explicit consent", async () => {
  const harness = imageTableStubs()
  const res = await postImageTable({ ...IMAGE_TABLE_BODY, consent: false }, harness.stubs)
  assert.equal(res._getStatus(), 400)
  assert.match(res._getData().error, /Explicit consent/)
  assert.equal(res._getData().code, "invalid_image")
  assert.equal(harness.extracted.length, 0)
})

test("Image to Excel cloud API rejects invalid base64, MIME, and magic bytes", async () => {
  const harness = imageTableStubs()
  for (const body of [
    { ...IMAGE_TABLE_BODY, imageBase64: "not base64" },
    { ...IMAGE_TABLE_BODY, mimeType: "image/gif" },
    { ...IMAGE_TABLE_BODY, mimeType: "image/jpeg" },
  ]) {
    const res = await postImageTable(body, harness.stubs)
    assert.equal(res._getStatus(), 400)
    assert.equal(res._getData().code, "invalid_image")
  }
  assert.equal(harness.extracted.length, 0)
})

test("Image to Excel cloud API enforces per-user and service daily attempt limits", async () => {
  const userLimit = imageTableStubs({ userCalls: 9 })
  const userRes = await postImageTable(IMAGE_TABLE_BODY, userLimit.stubs)
  assert.equal(userRes._getStatus(), 429)
  assert.equal(userRes._getData().code, "daily_user_limit")
  assert.equal(userLimit.extracted.length, 0)

  const serviceLimit = imageTableStubs({ totalCalls: 40 })
  const serviceRes = await postImageTable(IMAGE_TABLE_BODY, serviceLimit.stubs)
  assert.equal(serviceRes._getStatus(), 429)
  assert.equal(serviceRes._getData().code, "daily_service_limit")
  assert.equal(serviceLimit.extracted.length, 0)
})

test("Image to Excel cloud API refuses to call Gemini without a server key", async () => {
  const harness = imageTableStubs({ apiKey: "" })
  const res = await postImageTable(IMAGE_TABLE_BODY, harness.stubs)
  assert.equal(res._getStatus(), 503)
  assert.equal(res._getData().code, "cloud_not_configured")
  assert.equal(harness.extracted.length, 0)
})

test("Image to Excel cloud API returns only the table and records actual usage", async () => {
  const harness = imageTableStubs()
  const res = await postImageTable(IMAGE_TABLE_BODY, harness.stubs)
  const data = res._getData()

  assert.equal(res._getStatus(), 200)
  assert.equal(data.ok, true)
  assert.deepEqual(data.table, IMAGE_TABLE_RESULT)
  assert.equal(data.model, undefined)
  assert.equal(data.imageBase64, undefined)
  assert.equal(harness.extracted.length, 1)
  assert.equal(harness.extracted[0].apiKey, "server-test-key")
  assert.deepEqual(harness.recorded, [["google", "image-to-excel", MEMBER.id, "success"]])
  assert.equal(harness.usage.length, 2)
  assert.equal(harness.usage[0].tool, "image-to-excel")
  assert.equal(harness.usage[0].userId, MEMBER.id)
  assert.equal(harness.usage[0].since.getUTCHours(), 0)
})

test("Image to Excel cloud API maps quota and busy errors to local-first recovery messages", async () => {
  for (const [status, code, expectedStatus] of [
    [429, "provider_quota", 429],
    [503, "provider_busy", 503],
    [504, "provider_timeout", 504],
  ]) {
    class TestGeminiError extends Error {
      constructor(message, errorStatus, errorCode) {
        super(message)
        this.status = errorStatus
        this.code = errorCode
      }
    }
    const harness = imageTableStubs({
      error: new TestGeminiError("upstream detail must stay private", status, code),
    })
    harness.stubs["../server/_lib/geminiImageTable.ts"].GeminiImageError = TestGeminiError
    const res = await postImageTable(IMAGE_TABLE_BODY, harness.stubs)
    assert.equal(res._getStatus(), expectedStatus)
    assert.equal(res._getData().code, code)
    assert.match(res._getData().error, /local result is still available/i)
    assert.doesNotMatch(JSON.stringify(res._getData()), /upstream detail|server-test-key/)
  }
})

// ---------------------------------------------------------------------------
// Password hashing: scrypt for new credentials, sha256 honoured until next sign-in
// ---------------------------------------------------------------------------

const PASSWORD = "long-enough-serial-killer"

function loadAuth() {
  const query = async () => []
  return loadHandler("server/_lib/auth.ts", {
    "./db.ts": { query, queryAuthoritative: query, transact: async (fn) => fn(query) },
  })
}

test("Auth: a freshly hashed password is scrypt and never carries the plaintext", async () => {
  const auth = loadAuth()
  const salt = auth.generateSalt()
  const hash = await auth.hashPasswordScrypt(PASSWORD, salt)

  assert.match(hash, /^scrypt\$\d+\$\d+\$\d+\$/)
  assert.ok(!hash.includes(PASSWORD))
  assert.equal(auth.needsPasswordUpgrade({ password_hash: hash }), false)

  // Two hashes of the same password differ because each account gets its own salt.
  const other = await auth.hashPasswordScrypt(PASSWORD, auth.generateSalt())
  assert.notEqual(other, hash)
})

test("Auth: scrypt and migrated sha256 credentials both sign in", async () => {
  const auth = loadAuth()
  const salt = auth.generateSalt()
  const scryptHash = await auth.hashPasswordScrypt(PASSWORD, salt)
  const legacyHash = auth.hashPassword(PASSWORD, salt)

  assert.equal(await auth.verifyPassword({ password_salt: salt, password_hash: scryptHash }, PASSWORD), true)
  assert.equal(await auth.verifyPassword({ password_salt: salt, password_hash: legacyHash }, PASSWORD), true)

  assert.equal(await auth.verifyPassword({ password_salt: salt, password_hash: scryptHash }, `${PASSWORD}x`), false)
  assert.equal(await auth.verifyPassword({ password_salt: salt, password_hash: legacyHash }, `${PASSWORD}x`), false)
  assert.equal(await auth.verifyPassword({ password_salt: null, password_hash: null }, PASSWORD), false)

  // The cost parameters and salt travel inside the hash, so a row whose column was
  // cleared still verifies.
  assert.equal(await auth.verifyPassword({ password_salt: null, password_hash: scryptHash }, PASSWORD), true)

  assert.equal(auth.needsPasswordUpgrade({ password_hash: legacyHash }), true)
  assert.equal(auth.needsPasswordUpgrade({ password_hash: null }), false)
})

test("Auth: register stores a scrypt hash", async () => {
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
      return /select id, email/i.test(sql)
        ? [{ id: "usr_new", email: "new.member@example.com", name: "New", role: "user", subscription_tier: "standard", pro_status: "none", unlocked_tools: [] }]
        : /returning id/i.test(sql) ? [{ id: "usr_new" }] : []
    },
  }
  db.queryAuthoritative = db.query
  const handler = loadHandler("server/auth/register.ts", {
    "../_lib/db.ts": db,
    "../_lib/auth.ts": loadAuth(),
  })
  const { req, res } = createMockReqRes({ method: "POST", body: { email: "new.member@example.com", password: PASSWORD } })

  await handler(req, res)

  assert.equal(res.statusCode, 201)
  const insert = calls.find((c) => /insert into users/i.test(c.sql))
  assert.ok(insert, "the account must be created")
  assert.match(insert.params[4], /^scrypt\$/)
})

/** The pre-scrypt credential format the live accounts still carry. */
function legacyHash(password) {
  return require("node:crypto").createHash("sha256").update(`salt_legacy:${password}`).digest("hex")
}

function loginStubs({ legacy }) {
  const calls = []
  const user = {
    id: "usr_old",
    email: "member@example.com",
    name: "Member",
    role: "user",
    subscription_tier: "standard",
    pro_status: "none",
    unlocked_tools: [],
    must_reset_password: false,
    password_salt: "salt_legacy",
    password_hash: legacy ? legacyHash(PASSWORD) : null,
  }

  const auth = {
    authenticatePassword: async (email, password) => {
      if (email !== user.email || password !== PASSWORD) return { status: "invalid" }
      if (legacy) calls.push({ id: user.id, pw: password })
      return {
        status: "ok",
        user: { ...user, provider: "email", must_reset_password: legacy },
        token: "tok",
        expiresAt: new Date("2026-12-31T00:00:00.000Z"),
      }
    },
  }
  const db = {
    cors: () => {},
    json: (res, status, data) => {
      res.status(status).json(data)
      return res
    },
    readBody: async (req) => req.body ?? {},
    query: async () => [],
  }
  return { auth, calls, db, user }
}

test("Auth: a legacy sign-in is upgraded to scrypt and forced to reset", async () => {
  const s = loginStubs({ legacy: true })
  const handler = loadHandler("server/auth/login.ts", {
    "../_lib/db.ts": s.db,
    "../_lib/auth.ts": s.auth,
  })
  const { req, res } = createMockReqRes({ method: "POST", body: { email: "member@example.com", password: PASSWORD } })

  await handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res._getData().token, "tok")
  assert.equal(res._getData().mustResetPassword, true)
  assert.deepEqual(s.calls, [{ id: "usr_old", pw: PASSWORD }])
})

test("Auth: a locked account is not issued a session", async () => {
  const s = loginStubs({ legacy: false })
  s.auth.authenticatePassword = async () => ({ status: "locked" })
  const handler = loadHandler("server/auth/login.ts", {
    "../_lib/db.ts": s.db,
    "../_lib/auth.ts": s.auth,
  })
  const { req, res } = createMockReqRes({ method: "POST", body: { email: "member@example.com", password: PASSWORD } })

  await handler(req, res)

  assert.equal(res.statusCode, 401)
  assert.equal(res._getData().error, "Invalid email or password")
  assert.equal(res._getData().token, undefined)
})

test("Auth: an already-scrypt account is not re-hashed on every sign-in", async () => {
  const s = loginStubs({ legacy: false })
  const handler = loadHandler("server/auth/login.ts", {
    "../_lib/db.ts": s.db,
    "../_lib/auth.ts": s.auth,
  })
  const { req, res } = createMockReqRes({ method: "POST", body: { email: "member@example.com", password: PASSWORD } })

  await handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.deepEqual(s.calls, [])
})

test("API Pool: remembers which engine actually served the job", () => {
  const store = new Map()
  const pool = loadHandler("src/apiPoolService.ts", {}, {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
    indexedDB: undefined,
    fetch: async () => {
      throw new Error("offline")
    },
  })

  const apis = pool.getCloudApis()
  const cloud = apis.find((a) => a.provider === "adobe")
  const local = apis.find((a) => a.provider === "local")
  assert.ok(cloud && local, "the catalog must carry both a cloud and a local engine")

  const windowStart = Date.now()
  assert.equal(pool.getEngineRunSince(windowStart), null, "nothing has run yet")

  pool.recordApiOutcome(cloud.id, { success: true })
  assert.equal(pool.getEngineRunSince(windowStart).provider, "adobe")

  pool.recordApiOutcome(local.id, { success: true })
  assert.equal(pool.getEngineRunSince(windowStart).provider, "local")

  pool.recordApiOutcome(cloud.id, { success: false, errorMessage: "quota" })
  assert.equal(
    pool.getEngineRunSince(windowStart).provider,
    "local",
    "a refused cloud attempt must not be reported as the engine that ran the job",
  )
})

// The endpoint probe is admin-gated, so an unauthenticated curl can no longer show
// whether a given address would be refused. These assert the range logic itself.
test("API Pool: the endpoint probe refuses every form of a loopback address", () => {
  const file = path.resolve("api/cloud-apis/ping.ts")
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const mod = { exports: {} }
  vm.runInThisContext(`(function (exports, require, module) {\n${compiled}\n})`, {
    filename: file,
  })(
    mod.exports,
    (id) => (id.includes("/server/_lib/auth.ts") ? { requireAdmin: async () => ({ id: "admin" }) } : require(id)),
    mod,
  )
  const isPrivate = mod.exports.isPrivateAddress

  for (const blocked of [
    "127.0.0.1",
    "127.1",
    "2130706433",
    "0x7f000001",
    "::ffff:127.0.0.1",
    "0.0.0.0",
    "10.1.2.3",
    "169.254.169.254",
    "172.16.0.9",
    "192.168.1.1",
    "192.0.2.1",
    "100.64.0.1",
    "198.18.0.1",
    "224.0.0.1",
    "8.8.8.8\x00.internal",
    "::1",
    "[::1]",
    "::",
    "fe80::1",
    "fc00::1",
    "fd12::34",
    "64:ff9b::127.0.0.1",
  ]) {
    assert.equal(isPrivate(blocked), true, `${blocked} must never be dialed by the server`)
  }

  for (const allowed of ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946", "test.example.com"]) {
    assert.equal(isPrivate(allowed), false, `${allowed} is a legitimate public endpoint`)
  }
})

// ---------------------------------------------------------------------------
// Ownership, entitlement, and privileged-account boundaries
// ---------------------------------------------------------------------------

test("Showcase API: publishing requires an active account", async () => {
  const s = createStubs({ admin: null })
  const handler = loadHandler("api/showcase.ts", {
    "../server/_lib/db.ts": s.db,
    "../server/_lib/auth.ts": s.auth,
  })
  const { req, res } = createMockReqRes({
    method: "POST",
    body: { id: "anonymous_showcase", title: "Blocked", imageDataUrl: "data:image/png;base64,AA==" },
  })
  await handler(req, res)
  assert.equal(res._getStatus(), 401)
  assert.equal(s.calls.length, 0)
})

test("Showcase API: unsafe CTA links and non-image payloads are rejected", async () => {
  for (const body of [
    { id: "unsafe_cta", title: "Blocked", imageDataUrl: "data:image/png;base64,AA==", ctaEnabled: true, ctaUrl: "javascript:alert(1)" },
    { id: "unsafe_image", title: "Blocked", imageDataUrl: "data:text/html;base64,PHNjcmlwdD4=" },
  ]) {
    const s = createStubs({ admin: { id: "usr_owner", role: "user" } })
    const handler = loadHandler("api/showcase.ts", {
      "../server/_lib/db.ts": s.db,
      "../server/_lib/auth.ts": s.auth,
    })
    const { req, res } = createMockReqRes({ method: "POST", body })
    await handler(req, res)
    assert.equal(res._getStatus(), 400)
    assert.equal(s.calls.length, 0)
  }
})

test("Showcase API: a different account cannot overwrite or take ownership", async () => {
  const s = createStubs({ admin: { id: "usr_owner", role: "user" } })
  s.db.query = async () => { throw new Error("fallback must not authorize a showcase write") }
  s.db.queryAuthoritative = async (sql, params) => {
    s.calls.push({ sql, params })
    return []
  }
  const handler = loadHandler("api/showcase.ts", {
    "../server/_lib/db.ts": s.db,
    "../server/_lib/auth.ts": s.auth,
  })
  const { req, res } = createMockReqRes({
    method: "POST",
    body: { id: "shared_showcase", title: "Taken over", imageDataUrl: "data:image/png;base64,AA==" },
  })
  await handler(req, res)

  assert.equal(res._getStatus(), 403)
  const save = s.calls.find((call) => /insert into showcases/i.test(call.sql))
  assert.match(save.sql, /where showcases\.owner_user_id = \$2/)
  assert.doesNotMatch(save.sql, /owner_user_id = excluded\.owner_user_id/)
})

test("Showcase API: the owner can update without changing the owner column or using fallback", async () => {
  const s = createStubs({ admin: { id: "usr_owner", role: "user" } })
  s.db.query = async () => { throw new Error("fallback must not authorize a showcase write") }
  s.db.queryAuthoritative = async (sql, params) => {
    s.calls.push({ sql, params })
    return /returning id/i.test(sql) ? [{ id: params[0] }] : []
  }
  const handler = loadHandler("api/showcase.ts", {
    "../server/_lib/db.ts": s.db,
    "../server/_lib/auth.ts": s.auth,
  })
  const { req, res } = createMockReqRes({
    method: "POST",
    body: { id: "owned_showcase", title: "Mine", imageDataUrl: "data:image/png;base64,AA==" },
  })
  await handler(req, res)
  assert.equal(res._getStatus(), 201)
  const cleanup = s.calls.find((call) => /delete from showcases/i.test(call.sql))
  assert.match(cleanup.sql, /owner_user_id = \$1/)
  assert.equal(cleanup.params[0], "usr_owner")
})

test("Visitor API: ordinary accounts read only their own passes", async () => {
  const s = createStubs({ admin: { id: "usr_member", role: "user" } })
  const handler = loadHandler("api/visitor.ts", {
    "../server/_lib/db.ts": s.db,
    "../server/_lib/auth.ts": s.auth,
  })
  const { req, res } = createMockReqRes({ method: "GET" })
  await handler(req, res)

  assert.equal(res._getStatus(), 200)
  const read = s.calls.find((call) => /select id, payload from visitor_passes/i.test(call.sql))
  assert.match(read.sql, /where owner_user_id = \$1/)
  assert.deepEqual(JSON.parse(JSON.stringify(read.params)), ["usr_member"])
})

test("Visitor API: administrators can read the shared visitor log", async () => {
  const s = createStubs({ admin: { id: "usr_admin", role: "admin" } })
  const handler = loadHandler("api/visitor.ts", {
    "../server/_lib/db.ts": s.db,
    "../server/_lib/auth.ts": s.auth,
  })
  const { req, res } = createMockReqRes({ method: "GET" })
  await handler(req, res)

  assert.equal(res._getStatus(), 200)
  const read = s.calls.find((call) => /select id, payload from visitor_passes/i.test(call.sql))
  assert.doesNotMatch(read.sql, /where owner_user_id/)
})

test("Visitor API: a non-owner cannot tamper with an existing pass", async () => {
  const s = createStubs({ admin: { id: "usr_other", role: "user" } })
  s.db.query = async () => { throw new Error("fallback must not authorize visitor data") }
  s.db.queryAuthoritative = async (sql, params) => {
    s.calls.push({ sql, params })
    return /select owner_user_id, payload/i.test(sql)
      ? [{ owner_user_id: "usr_owner", payload: { status: "Expected" } }]
      : []
  }
  const handler = loadHandler("api/visitor.ts", {
    "../server/_lib/db.ts": s.db,
    "../server/_lib/auth.ts": s.auth,
  })
  const { req, res } = createMockReqRes({
    method: "POST",
    body: { action: "save", record: { id: "VP-1001", fullName: "Victim", status: "Checked-In" } },
  })
  await handler(req, res)

  assert.equal(res._getStatus(), 403)
  assert.equal(s.calls.some((call) => /insert into visitor_passes/i.test(call.sql)), false)
})

test("Visitor API: an administrator update cannot reassign pass ownership", async () => {
  const s = createStubs({ admin: { id: "usr_admin", role: "admin" } })
  s.db.query = async (sql, params) => {
    s.calls.push({ sql, params })
    if (/select owner_user_id, payload/i.test(sql)) return [{ owner_user_id: "usr_owner", payload: { status: "Expected" } }]
    if (/returning id/i.test(sql)) return [{ id: "VP-1001" }]
    return []
  }
  const handler = loadHandler("api/visitor.ts", {
    "../server/_lib/db.ts": s.db,
    "../server/_lib/auth.ts": s.auth,
  })
  const { req, res } = createMockReqRes({
    method: "POST",
    body: { action: "save", record: { id: "VP-1001", fullName: "Visitor", status: "Checked-In" } },
  })
  await handler(req, res)

  assert.equal(res._getStatus(), 200)
  const save = s.calls.find((call) => /insert into visitor_passes/i.test(call.sql))
  assert.match(save.sql, /where visitor_passes\.owner_user_id = \$2 or \$6/)
  assert.doesNotMatch(save.sql, /owner_user_id = excluded\.owner_user_id/)
  assert.equal(save.params[5], true)
})

test("Cloud gateway: Pro tools require active Pro or an explicit server-side unlock", async () => {
  for (const [user, allowed] of [
    [MEMBER, false],
    [{ ...MEMBER, subscription_tier: "pro", pro_status: "active" }, true],
    [{ ...MEMBER, unlocked_tools: ["pdf-to-word"] }, true],
    [{ ...MEMBER, role: "admin", subscription_tier: "standard", pro_status: "none" }, true],
  ]) {
    let quotaChecked = false
    const db = createStubs().db
    db.query = async () => { throw new Error("fallback must not grant tool access") }
    db.queryAuthoritative = async (sql) => (/from tools/i.test(sql) ? [{ tier: "pro" }] : [])
    const gateway = loadHandler("server/_lib/gateway.ts", {
      "./db.ts": db,
      "./auth.ts": { requireActiveUser: async () => user },
      "./providers.ts": { isProviderOutOfQuota: async () => { quotaChecked = true; return false } },
    })
    const { req, res } = createMockReqRes({ method: "POST" })
    const actor = await gateway.requirePaidAccess(req, res, "adobe", "pdf-to-word")
    assert.equal(!!actor, allowed)
    assert.equal(res._getStatus(), allowed ? 200 : 403)
    if (!allowed) assert.equal(res._getData().code, "tool_access_required")
    assert.equal(quotaChecked, allowed, "denied users never reach provider quota processing")
  }
})

const ROOT_USER = {
  id: "usr_admin_default",
  email: "admin@masterfilepro.com",
  name: "Root",
  avatar: null,
  provider: "email",
  role: "admin",
  subscription_tier: "pro",
  pro_status: "active",
  unlocked_tools: [],
  must_reset_password: false,
  created_at: "2026-01-01T00:00:00.000Z",
  last_login_at: null,
}

function usersStubs({ actor, target = ROOT_USER }) {
  const s = createStubs({ admin: actor })
  s.auth.requireRole = async (_req, roles) => (actor && roles.includes(actor.role) ? actor : null)
  s.db.query = async (sql, params) => {
    s.calls.push({ sql, params })
    if (/from users where id = \$1/i.test(sql)) return params[0] === target.id ? [target] : []
    return []
  }
  return s
}

test("Users API: another administrator cannot delete the root administrator", async () => {
  const s = usersStubs({ actor: { id: "usr_other_admin", role: "admin" } })
  const handler = loadHandler("server/db/users.ts", {
    "../_lib/db.ts": s.db,
    "../_lib/auth.ts": s.auth,
  })
  const { req, res } = createMockReqRes({ method: "POST", body: { action: "delete", userId: ROOT_USER.id } })
  await handler(req, res)

  assert.equal(res._getStatus(), 403)
  assert.equal(s.calls.some((call) => /delete from users/i.test(call.sql)), false)
})

test("Users API: the root can edit only its safe profile fields", async () => {
  const s = usersStubs({ actor: ROOT_USER })
  const handler = loadHandler("server/db/users.ts", {
    "../_lib/db.ts": s.db,
    "../_lib/auth.ts": s.auth,
  })
  const { req, res } = createMockReqRes({
    method: "POST",
    body: { user: { id: ROOT_USER.id, name: "Root Updated", role: "user", subscriptionTier: "standard", proStatus: "none" } },
  })
  await handler(req, res)

  assert.equal(res._getStatus(), 200)
  const update = s.calls.find((call) => /update users set name = coalesce/i.test(call.sql))
  assert.ok(update)
  assert.doesNotMatch(update.sql, /role =|subscription_tier =|pro_status =|unlocked_tools =/)
})

test("Users API: a sub-administrator cannot promote an account to administrator", async () => {
  const target = { ...ROOT_USER, id: "usr_member", email: "member@example.com", role: "user" }
  const s = usersStubs({ actor: { id: "usr_subadmin", role: "sub-admin" }, target })
  const handler = loadHandler("server/db/users.ts", {
    "../_lib/db.ts": s.db,
    "../_lib/auth.ts": s.auth,
  })
  const { req, res } = createMockReqRes({
    method: "POST",
    body: { user: { id: target.id, role: "admin" } },
  })
  await handler(req, res)

  assert.equal(res._getStatus(), 403)
  assert.equal(s.calls.some((call) => /update users/i.test(call.sql)), false)
})

test("Public database status does not expose an administrator email", async () => {
  const s = createStubs()
  s.db.query = async () => [{ tables: "13", admin_email: "private@example.com" }]
  const handler = loadHandler("server/db/status.ts", { "../_lib/db.ts": s.db })
  const { req, res } = createMockReqRes({ method: "GET" })
  await handler(req, res)

  assert.equal(res._getStatus(), 200)
  assert.deepEqual(JSON.parse(JSON.stringify(res._getData())), { ok: true, engine: "Supabase Postgres", tables: "13" })
})

test("Google auth: the server verifies the token and ignores client-supplied identity", async () => {
  const calls = []
  let inserted = false
  const user = { ...ROOT_USER, id: "usr_google", email: "verified@example.com", provider: "google", google_sub: "google-subject-123", must_reset_password: false, role: "user", subscription_tier: "standard", pro_status: "none", unlocked_tools: [], avatar: null }
  const db = {
    cors: () => {},
    json: (res, status, data) => res.status(status).json(data),
    readBody: async () => ({ accessToken: "google-token", email: "admin@masterfilepro.com", role: "admin" }),
    query: async (sql, params) => {
      calls.push({ sql, params })
      if (/insert into users/i.test(sql)) inserted = true
      return []
    },
  }
  db.queryAuthoritative = db.query
  const handler = loadHandler("server/auth/google.ts", {
    "../_lib/db.ts": db,
    "../_lib/auth.ts": {
      findUserByEmail: async () => inserted ? user : null,
      createSession: async () => ({ token: "session-token", expiresAt: new Date("2027-01-01T00:00:00Z") }),
    },
  }, {
    process: { env: { GOOGLE_CLIENT_ID: "configured-google-client" } },
    fetch: async (url, init) => {
      calls.push({ url: String(url), authorization: init.headers?.Authorization })
      if (String(url).includes("/tokeninfo")) {
        return { ok: true, json: async () => ({ aud: "configured-google-client", exp: Math.floor(Date.now() / 1000) + 3600, email: "verified@example.com", email_verified: "true", sub: "google-subject-123" }) }
      }
      return { ok: true, json: async () => ({ email: "verified@example.com", verified_email: true, sub: "google-subject-123", name: "Verified User" }) }
    },
  })
  const { req, res } = createMockReqRes({ method: "POST" })
  await handler(req, res)

  assert.equal(res._getStatus(), 200)
  assert.equal(res._getData().user.email, "verified@example.com")
  assert.equal(res._getData().user.role, "user")
  const insert = calls.find((call) => /insert into users/i.test(call.sql || ""))
  assert.equal(insert.params[1], "verified@example.com")
  assert.ok(calls.some((call) => call.authorization === "Bearer google-token"))
})

test("Google auth: an unverified Google profile cannot create a session", async () => {
  const s = createStubs()
  const handler = loadHandler("server/auth/google.ts", {
    "../_lib/db.ts": s.db,
    "../_lib/auth.ts": s.auth,
  }, {
    process: { env: { GOOGLE_CLIENT_ID: "configured-google-client" } },
    fetch: async () => ({ ok: true, json: async () => ({ aud: "configured-google-client", exp: Math.floor(Date.now() / 1000) + 3600, email: "unverified@example.com", email_verified: "false" }) }),
  })
  const { req, res } = createMockReqRes({ method: "POST", body: { accessToken: "token" } })
  await handler(req, res)

  assert.equal(res._getStatus(), 401)
  assert.equal(s.calls.length, 0)
})

test("Google auth: a token issued to another OAuth client is rejected", async () => {
  const s = createStubs()
  const handler = loadHandler("server/auth/google.ts", {
    "../_lib/db.ts": s.db,
    "../_lib/auth.ts": s.auth,
  }, {
    process: { env: { GOOGLE_CLIENT_ID: "configured-google-client" } },
    fetch: async () => ({
      ok: true,
      json: async () => ({ aud: "another-google-client", exp: Math.floor(Date.now() / 1000) + 3600, email: "victim@example.com", email_verified: "true" }),
    }),
  })
  const { req, res } = createMockReqRes({ method: "POST", body: { accessToken: "wrong-audience-token" } })
  await handler(req, res)

  assert.equal(res._getStatus(), 401)
  assert.equal(s.calls.length, 0)
})

test("Google auth: an expired access token is rejected", async () => {
  const s = createStubs()
  const handler = loadHandler("server/auth/google.ts", {
    "../_lib/db.ts": s.db,
    "../_lib/auth.ts": s.auth,
  }, {
    process: { env: { GOOGLE_CLIENT_ID: "configured-google-client" } },
    fetch: async () => ({
      ok: true,
      json: async () => ({ aud: "configured-google-client", exp: Math.floor(Date.now() / 1000) - 60, email: "expired@example.com", email_verified: "true" }),
    }),
  })
  const { req, res } = createMockReqRes({ method: "POST", body: { accessToken: "expired-token" } })
  await handler(req, res)

  assert.equal(res._getStatus(), 401)
  assert.equal(s.calls.length, 0)
})

test("Google auth: an email account is never linked automatically", async () => {
  const user = { ...ROOT_USER, id: "usr_email", email: "member@example.com", provider: "email", must_reset_password: false }
  let sessions = 0
  const handler = loadHandler("server/auth/google.ts", {
    "../_lib/db.ts": createStubs().db,
    "../_lib/auth.ts": {
      findUserByEmail: async () => user,
      createSession: async () => { sessions++; return { token: "must-not-issue", expiresAt: new Date() } },
    },
  }, {
    process: { env: { GOOGLE_CLIENT_ID: "configured-google-client" } },
    fetch: async (url) => ({
      ok: true,
      json: async () => String(url).includes("/tokeninfo")
        ? { aud: "configured-google-client", exp: Math.floor(Date.now() / 1000) + 3600, email: user.email, email_verified: true, sub: "attacker-subject" }
        : { email: user.email, verified_email: true, sub: "attacker-subject" },
    }),
  })
  const { req, res } = createMockReqRes({ method: "POST", body: { accessToken: "token" } })
  await handler(req, res)
  assert.equal(res._getStatus(), 409)
  assert.equal(sessions, 0)
})

test("Google auth: a different Google subject cannot take over an existing account", async () => {
  const user = { ...ROOT_USER, id: "usr_google", email: "member@example.com", provider: "google", google_sub: "owner-subject", must_reset_password: false }
  let sessions = 0
  const handler = loadHandler("server/auth/google.ts", {
    "../_lib/db.ts": createStubs().db,
    "../_lib/auth.ts": {
      findUserByEmail: async () => user,
      createSession: async () => { sessions++; return { token: "must-not-issue", expiresAt: new Date() } },
    },
  }, {
    process: { env: { GOOGLE_CLIENT_ID: "configured-google-client" } },
    fetch: async (url) => ({
      ok: true,
      json: async () => String(url).includes("/tokeninfo")
        ? { aud: "configured-google-client", exp: Math.floor(Date.now() / 1000) + 3600, email: user.email, email_verified: true, sub: "attacker-subject" }
        : { email: user.email, verified_email: true, sub: "attacker-subject" },
    }),
  })
  const { req, res } = createMockReqRes({ method: "POST", body: { accessToken: "token" } })
  await handler(req, res)
  assert.equal(res._getStatus(), 409)
  assert.equal(sessions, 0)
})

test("Google auth: a missing server client ID fails closed", async () => {
  const s = createStubs()
  const handler = loadHandler("server/auth/google.ts", {
    "../_lib/db.ts": s.db,
    "../_lib/auth.ts": s.auth,
  }, {
    process: { env: {} },
    fetch: async () => {
      throw new Error("Google must not be called without a configured audience")
    },
  })
  const { req, res } = createMockReqRes({ method: "POST", body: { accessToken: "token" } })
  await handler(req, res)

  assert.equal(res._getStatus(), 503)
  assert.equal(s.calls.length, 0)
})
