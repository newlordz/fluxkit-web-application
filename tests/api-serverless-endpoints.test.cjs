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

// ---------------------------------------------------------------------------
// Paid cloud proxies: session, quota and payload gates
// ---------------------------------------------------------------------------

const MEMBER = { id: "usr_member", role: "user" }

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
  const user = await gateway.requirePaidAccess(req, res, "adobe")
  assert.equal(user, MEMBER)

  const body = await gateway.readPaidBody(req, res)
  assert.deepEqual(body, { pdfBase64: "AAAA" })
  assert.ok(cap >= 25 * 1024 * 1024, `a 25 MB document must fit under the cap, got ${cap} bytes`)
})

test("API Cloud: a body larger than the cap is refused with 413 before any provider call", async () => {
  const gateway = loadHandler("server/_lib/gateway.ts", {
    "./auth.ts": { currentUser: async () => MEMBER },
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
// Password hashing: scrypt for new credentials, sha256 honoured until next sign-in
// ---------------------------------------------------------------------------

const PASSWORD = "long-enough-serial-killer"

function loadAuth() {
  return loadHandler("server/_lib/auth.ts", { "./db.ts": { query: async () => [] } })
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
        : []
    },
  }
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
    findUserByEmail: async () => user,
    isLocked: () => false,
    verifyPassword: async (u, pw) => pw === PASSWORD,
    clearFailedAttempts: async () => {},
    createSession: async () => ({ token: "tok", expiresAt: new Date("2026-12-31T00:00:00.000Z") }),
    registerFailedAttempt: async () => {},
    needsPasswordUpgrade: (u) => legacy,
    upgradePasswordHash: async (id, pw) => {
      calls.push({ id, pw })
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

test("Auth: a legacy sign-in is upgraded to scrypt after the session is issued", async () => {
  const s = loginStubs({ legacy: true })
  const handler = loadHandler("server/auth/login.ts", {
    "../_lib/db.ts": s.db,
    "../_lib/auth.ts": s.auth,
  })
  const { req, res } = createMockReqRes({ method: "POST", body: { email: "member@example.com", password: PASSWORD } })

  await handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res._getData().token, "tok")
  assert.deepEqual(s.calls, [{ id: "usr_old", pw: PASSWORD }])
})

test("Auth: an upgrade failure never turns a valid password into a rejected sign-in", async () => {
  const s = loginStubs({ legacy: true })
  s.auth.upgradePasswordHash = async () => {
    throw new Error("database is unreachable")
  }
  const handler = loadHandler("server/auth/login.ts", {
    "../_lib/db.ts": s.db,
    "../_lib/auth.ts": s.auth,
  })
  const { req, res } = createMockReqRes({ method: "POST", body: { email: "member@example.com", password: PASSWORD } })

  await handler(req, res)

  assert.equal(res.statusCode, 200)
  assert.equal(res._getData().token, "tok")
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
