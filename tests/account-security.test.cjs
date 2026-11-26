const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function loadModule(relPath, stubs = {}, extraGlobals = {}) {
  const fullPath = path.resolve(relPath)
  const stubPaths = new Map(
    Object.entries(stubs).map(([spec, mod]) => [
      path.resolve(path.dirname(fullPath), spec),
      { __esModule: true, ...mod },
    ]),
  )
  function load(file) {
    if (stubPaths.has(file)) return stubPaths.get(file)
    const source = fs.readFileSync(file, "utf8")
    const code = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText
    const exports = {}
    vm.runInNewContext(code, {
      exports,
      module: { exports },
      require: (id) => {
        if (stubs[id]) return { __esModule: true, ...stubs[id] }
        if (!id.startsWith(".")) return require(id)
        const resolved = path.resolve(path.dirname(file), id)
        if (stubPaths.has(resolved)) return stubPaths.get(resolved)
        for (const ext of ["", ".ts"]) {
          if (fs.existsSync(resolved + ext)) return load(resolved + ext)
        }
        return require(resolved)
      },
      process,
      Buffer,
      URL,
      URLSearchParams,
      AbortController,
      AbortSignal,
      setTimeout,
      clearTimeout,
      console,
      ...extraGlobals,
    }, { filename: file })
    return exports.default || exports
  }
  return load(fullPath)
}

function response() {
  const headers = new Map()
  return {
    statusCode: 200,
    body: null,
    setHeader(key, value) { headers.set(key.toLowerCase(), value) },
    getHeader(key) { return headers.get(key.toLowerCase()) },
    end(body) { this.body = body ? JSON.parse(body) : null },
    header(key) { return headers.get(key.toLowerCase()) },
  }
}

const ACCOUNT = {
  id: "usr_member",
  email: "member@example.com",
  name: "Member",
  avatar: null,
  provider: "email",
  google_sub: null,
  role: "user",
  subscription_tier: "standard",
  pro_status: "none",
  unlocked_tools: [],
  must_reset_password: false,
  failed_attempts: 0,
  locked_until: null,
}

function authHarness(db) {
  return loadModule("server/_lib/auth.ts", { "./db.ts": db })
}

test("sessions accept only the opaque token's prefixed hash, never a stored hash as a bearer", async () => {
  const token = "a".repeat(64)
  const calls = []
  let storedHash
  const auth = authHarness({
    queryAuthoritative: async (sql, params) => {
      calls.push({ sql, params })
      if (sql.includes("from sessions s") && params[0] === storedHash) return [{ ...ACCOUNT }]
      return []
    },
  })
  storedHash = auth.hashSessionToken(token)

  const user = await auth.currentUser({ headers: { authorization: `Bearer ${token}` } })
  assert.equal(user.id, ACCOUNT.id)
  assert.deepEqual(Array.from(calls[0].params), [storedHash])
  assert.match(storedHash, /^sha256\$[a-f0-9]{64}$/)
  assert.doesNotMatch(calls[0].sql, /s\.token in/)

  const replayedHash = await auth.currentUser({ headers: { authorization: `Bearer ${storedHash}` } })
  assert.equal(replayedHash, null)
  assert.equal(calls.length, 1, "a prefixed stored hash is rejected before any database lookup")

  const legacyHash = storedHash.slice("sha256$".length)
  const replayedLegacyHash = await auth.currentUser({ headers: { authorization: `Bearer ${legacyHash}` } })
  assert.equal(replayedLegacyHash, null)
  assert.notEqual(calls[1].params[0], storedHash, "the bare hash is hashed again, not accepted as a session token")
  assert.equal(calls.some((call) => call.sql.includes("update sessions set token")), false)
})

test("forced password reset blocks privileged access without hiding the session", async () => {
  const auth = authHarness({
    queryAuthoritative: async () => [{ ...ACCOUNT, must_reset_password: true }],
  })
  const req = { headers: { authorization: `Bearer ${"b".repeat(64)}` } }
  assert.equal((await auth.currentUser(req)).id, ACCOUNT.id)
  assert.equal(await auth.requireActiveUser(req), null)
  assert.equal(await auth.requireAdmin(req), null)
})

test("failed logins lock the account without issuing a session", async () => {
  const statements = []
  const state = { ...ACCOUNT }
  const auth = authHarness({
    transact: async (fn) => fn(async (sql) => {
      statements.push(sql)
      if (sql.includes("for update")) return [state]
      if (sql.includes("failed_attempts = case")) {
        state.failed_attempts = state.failed_attempts + 1
        if (state.failed_attempts >= 5) {
          state.failed_attempts = 0
          state.locked_until = new Date(Date.now() + 15 * 60_000).toISOString()
        }
      }
      return []
    }),
  })
  for (let i = 0; i < 5; i++) {
    assert.equal((await auth.authenticatePassword(ACCOUNT.email, "WrongPassword2026!")).status, "invalid")
  }
  assert.equal((await auth.authenticatePassword(ACCOUNT.email, "WrongPassword2026!")).status, "locked")
  assert.equal(statements.some((sql) => sql.includes("insert into sessions")), false)
  assert.ok(statements.every((sql) => !sql.includes("insert into sessions")))
})

test("reset issuance serializes per account and invalidates every older code", async () => {
  const statements = []
  const auth = authHarness({
    transact: async (fn) => fn(async (sql, params) => {
      statements.push({ sql, params })
      return []
    }),
  })

  const code = await auth.createResetCode(ACCOUNT.id, ACCOUNT.email)

  assert.match(code, /^\d{6}$/)
  assert.match(statements[0].sql, /from users where id = \$1 for update/)
  assert.match(statements[1].sql, /update password_resets set used_at = now\(\)/)
  assert.match(statements[1].sql, /user_id = \$1 and used_at is null/)
  assert.match(statements[2].sql, /insert into password_resets/)
  assert.equal(statements[0].params[0], ACCOUNT.id)
  assert.equal(statements[2].params[0], ACCOUNT.id)
})

test("a valid reset code changes the password once and revokes all sessions", async () => {
  const code = "123456"
  const resetSalt = "reset-salt"
  let reset = {
    id: "rst_1",
    user_id: ACCOUNT.id,
    code_salt: resetSalt,
    code_hash: authHarness({}).hashPassword(code, resetSalt),
    attempts: 0,
    used_at: null,
  }
  const statements = []
  const auth = authHarness({
    transact: async (fn) => fn(async (sql) => {
      statements.push(sql)
      if (sql.includes("from password_resets r")) return reset.used_at ? [] : [reset]
      if (sql.includes("update password_resets set used_at")) reset = { ...reset, used_at: new Date() }
      if (sql.includes("update password_resets set attempts")) reset = { ...reset, attempts: reset.attempts + 1 }
      return []
    }),
  })
  const first = await auth.resetPasswordWithCode(ACCOUNT.email, code, "NewSecurePassword2026!")
  const second = await auth.resetPasswordWithCode(ACCOUNT.email, code, "AnotherSecurePassword2026!")
  assert.equal(first.ok, true)
  assert.equal(second.ok, false)
  assert.ok(statements.some((sql) => sql.includes("for update of r, u")))
  assert.ok(statements.some((sql) => sql.includes("update sessions set revoked_at")))
  assert.ok(statements.filter((sql) => sql.includes("update users set password_salt")).length === 1)
})

test("a reset code cannot be used after the account's email changes", async () => {
  const code = "123456"
  const resetSalt = "reset-salt"
  const reset = {
    id: "rst_1",
    user_id: ACCOUNT.id,
    code_salt: resetSalt,
    code_hash: authHarness({}).hashPassword(code, resetSalt),
    attempts: 0,
    used_at: null,
  }
  let currentEmail = "replacement-owner@example.com"
  let passwordChanges = 0
  const statements = []
  const auth = authHarness({
    transact: async (fn) => fn(async (sql, params) => {
      statements.push(sql)
      if (sql.includes("from password_resets r")) {
        return sql.includes("lower(u.email::text) = lower(r.email::text)") && params[0] !== currentEmail
          ? []
          : [reset]
      }
      if (sql.includes("update users set password_salt")) passwordChanges++
      return []
    }),
  })

  const result = await auth.resetPasswordWithCode("former-address@example.com", code, "NewSecurePassword2026!")

  assert.equal(result.ok, false)
  assert.equal(result.error, "Invalid or expired verification code.")
  assert.equal(passwordChanges, 0)
  assert.ok(statements.every((sql) => !sql.includes("update users set password_salt")))
})

test("an admin email change invalidates reset codes issued to the former address", async () => {
  const statements = []
  const handler = loadModule("server/db/admin.ts", {
    "../_lib/db.ts": {
      cors: () => {},
      json: (res, status, payload) => { res.statusCode = status; res.body = payload },
      readBody: async () => ({ email: "new.admin@example.com" }),
      query: async () => [],
      transact: async (fn) => fn(async (sql, params) => {
        statements.push({ sql, params })
        return []
      }),
    },
    "../_lib/auth.ts": {
      requireAdmin: async () => ({ ...ACCOUNT, role: "admin" }),
    },
  })
  const res = { statusCode: 200, body: null }

  await handler({ method: "POST" }, res)

  assert.equal(res.statusCode, 200)
  const emailUpdate = statements.find(({ sql }) => /update users/.test(sql) && /set email/.test(sql))
  assert.ok(emailUpdate)
  assert.equal(emailUpdate.params[1], "new.admin@example.com")
  const resetInvalidation = statements.find(({ sql }) =>
    /update password_resets set used_at/.test(sql) && /lower\(email::text\) <> lower/.test(sql),
  )
  assert.ok(resetInvalidation)
  assert.equal(resetInvalidation.params[0], ACCOUNT.id)
  assert.ok(statements.indexOf(resetInvalidation) > statements.indexOf(emailUpdate))
})

test("auth throttling prunes old buckets and never stores raw IPs or emails", async () => {
  let query = ""
  let params = []
  const auth = authHarness({
    queryAuthoritative: async (sql, values) => {
      query = sql
      params = values
      return [{ attempts: 1, retry_after_seconds: 900 }]
    },
  })
  const req = {
    headers: { "x-forwarded-for": "203.0.113.42" },
    socket: { remoteAddress: "203.0.113.42" },
  }
  assert.deepEqual(JSON.parse(JSON.stringify(await auth.consumeAuthRateLimit(req, "login", 30, 900, ACCOUNT.email))), {
    allowed: true,
    retryAfterSeconds: 900,
  })
  assert.match(query, /delete from auth_rate_limits/)
  assert.equal(params.length, 2)
  assert.match(params[0], /^[a-f0-9]{64}$/)
  assert.ok(!JSON.stringify(params).includes(ACCOUNT.email))
  assert.ok(!JSON.stringify(params).includes("203.0.113.42"))
})

test("auth dispatch returns 429 with Retry-After and fails closed on limiter errors", async () => {
  const routeCalls = []
  const noop = async () => { routeCalls.push(true) }
  const stubs = {
    "../server/_lib/db.ts": {
      cors: () => {},
      json: (res, status, payload) => { res.statusCode = status; res.end(JSON.stringify(payload)) },
    },
    "../server/_lib/auth.ts": {
      consumeAuthRateLimit: async () => ({ allowed: false, retryAfterSeconds: 120 }),
    },
    "../server/auth/google.ts": { default: noop },
    "../server/auth/login.ts": { default: noop },
    "../server/auth/password.ts": { default: noop },
    "../server/auth/register.ts": { default: noop },
    "../server/auth/reset-confirm.ts": { default: noop },
    "../server/auth/reset-request.ts": { default: noop },
    "../server/auth/session.ts": { default: noop },
  }
  let handler = loadModule("api/auth.ts", stubs)
  let res = response()
  await handler({ method: "POST", url: "/?action=login" }, res)
  assert.equal(res.statusCode, 429)
  assert.equal(res.header("retry-after"), "120")
  assert.equal(routeCalls.length, 0)

  stubs["../server/_lib/auth.ts"].consumeAuthRateLimit = async () => { throw new Error("database unavailable") }
  handler = loadModule("api/auth.ts", stubs)
  res = response()
  await handler({ method: "POST", url: "/?action=login" }, res)
  assert.equal(res.statusCode, 503)
  assert.equal(routeCalls.length, 0)
})

test("CORS trusts only this deployment and the product origin", () => {
  const db = loadModule("server/_lib/db.ts", { pg: { Pool: class Pool {} } }, {
    process: { env: { VERCEL_URL: "masterfilepro-git-security.vercel.app" } },
  })
  const allowed = response()
  db.cors({ headers: { origin: "https://masterfilepro.com" } }, allowed)
  assert.equal(allowed.header("access-control-allow-origin"), "https://masterfilepro.com")
  const deployment = response()
  db.cors({ headers: { origin: "https://masterfilepro-git-security.vercel.app" } }, deployment)
  assert.equal(deployment.header("access-control-allow-origin"), "https://masterfilepro-git-security.vercel.app")
  const hostile = response()
  db.cors({ headers: { origin: "https://attacker.vercel.app" } }, hostile)
  assert.equal(hostile.header("access-control-allow-origin"), "null")
  assert.equal(hostile.header("access-control-allow-credentials"), "false")
})

test("account security migration supports Neon and expires public showcases", () => {
  const migration = fs.readFileSync(path.resolve("supabase/migrations/0006_account_security.sql"), "utf8")
  assert.match(migration, /update sessions set revoked_at = now\(\) where revoked_at is null/)
  assert.match(migration, /if exists \(select 1 from pg_roles where rolname = 'anon'\)/)
  assert.match(migration, /if exists \(select 1 from pg_roles where rolname = 'authenticated'\)/)
  assert.match(migration, /using \(published and created_at > now\(\) - interval '30 days'\)/)
  assert.doesNotMatch(migration, /from anon, authenticated, public/)
})

test("an uncertain transaction commit is rolled back and never replayed", async () => {
  const statements = []
  let released = false
  class Pool {
    on() {}
    async connect() {
      return {
        async query(sql) {
          statements.push(sql)
          if (sql === "commit") throw new Error("connection terminated")
          return { rows: [] }
        },
        release() { released = true },
      }
    }
  }
  const db = loadModule("server/_lib/db.ts", { pg: { Pool } }, {
    process: { env: { SUPABASE_DB_URL: "postgres://test.invalid/db" } },
  })
  let calls = 0
  await assert.rejects(db.transact(async (sql) => {
    calls++
    await sql("insert into sessions (token) values ($1)", ["once"])
  }), /connection terminated/)
  assert.equal(calls, 1)
  assert.deepEqual(statements, ["begin", "insert into sessions (token) values ($1)", "commit", "rollback"])
  assert.equal(released, true)
})

test("password recovery never returns a code and invalidates it if mail fails", async () => {
  const calls = []
  const db = {
    cors: () => {},
    json: (res, status, payload) => { res.statusCode = status; res.body = payload },
    readBody: async () => ({ email: ACCOUNT.email }),
    queryAuthoritative: async (sql) => {
      calls.push(sql)
      return sql.includes("select id from users") ? [{ id: ACCOUNT.id }] : []
    },
  }
  let mails = 0
  const handler = loadModule("server/auth/reset-request.ts", {
    "../_lib/db.ts": db,
    "../_lib/auth.ts": {
      createResetCode: async () => "123456",
    },
    "../_lib/mail.ts": {
      passwordRecoveryConfigured: () => true,
      sendPasswordResetEmail: async () => { mails++; throw new Error("mail failed") },
    },
  })
  let res = { statusCode: 200, body: null }
  await handler({ method: "POST" }, res)
  assert.equal(res.statusCode, 502)
  assert.equal(mails, 1)
  assert.ok(!JSON.stringify(res.body).includes("123456"))
  assert.ok(calls.some((sql) => sql.includes("update password_resets set used_at")))

  calls.length = 0
  const unknown = loadModule("server/auth/reset-request.ts", {
    "../_lib/db.ts": { ...db, queryAuthoritative: async (sql) => { calls.push(sql); return [] } },
    "../_lib/auth.ts": { createResetCode: async () => { throw new Error("must not create") } },
    "../_lib/mail.ts": { passwordRecoveryConfigured: () => true, sendPasswordResetEmail: async () => {} },
  })
  res = { statusCode: 200, body: null }
  await unknown({ method: "POST" }, res)
  assert.equal(res.statusCode, 200)
  assert.equal(res.body.ok, true)
  assert.ok(!JSON.stringify(res.body).includes("123456"))
})

test("unconfigured recovery fails before account lookup", async () => {
  let queries = 0
  const handler = loadModule("server/auth/reset-request.ts", {
    "../_lib/db.ts": {
      cors: () => {},
      json: (res, status, payload) => { res.statusCode = status; res.body = payload },
      readBody: async () => ({ email: ACCOUNT.email }),
      queryAuthoritative: async () => { queries++; return [] },
    },
    "../_lib/auth.ts": {},
    "../_lib/mail.ts": { passwordRecoveryConfigured: () => false },
  })
  const res = { statusCode: 200, body: null }
  await handler({ method: "POST" }, res)
  assert.equal(res.statusCode, 503)
  assert.equal(queries, 0)
})

test("auth database errors do not leak SQL details to clients", async () => {
  const handler = loadModule("server/auth/login.ts", {
    "../_lib/db.ts": {
      cors: () => {},
      json: (res, status, payload) => { res.statusCode = status; res.body = payload },
      readBody: async () => ({ email: ACCOUNT.email, password: "Password2026!" }),
    },
    "../_lib/auth.ts": {
      authenticatePassword: async () => { throw new Error("select users: connection password=secret") },
    },
  })
  const res = { statusCode: 200, body: null }
  await handler({ method: "POST" }, res)
  assert.equal(res.statusCode, 500)
  assert.ok(!JSON.stringify(res.body).includes("secret"))
  assert.ok(!JSON.stringify(res.body).includes("select users"))
})

test("another administrator cannot reset the root administrator's password", async () => {
  let passwordChanges = 0
  const handler = loadModule("server/auth/password.ts", {
    "../_lib/db.ts": {
      cors: () => {},
      json: (res, status, payload) => { res.statusCode = status; res.body = payload },
      readBody: async () => ({ userId: "usr_admin_default", newPassword: "NewSecurePassword2026!" }),
      queryAuthoritative: async () => [{ id: "usr_admin_default", email: "admin@masterfilepro.com", must_reset_password: false }],
    },
    "../_lib/auth.ts": {
      currentUser: async () => ({ ...ACCOUNT, id: "usr_other_admin", role: "admin" }),
      applyNewPassword: async () => { passwordChanges++ },
      changePasswordWithCurrent: async () => { passwordChanges++; return true },
      createSession: async () => { throw new Error("must not issue a root session") },
    },
  })
  const res = { statusCode: 200, body: null }
  await handler({ method: "POST" }, res)

  assert.equal(res.statusCode, 403)
  assert.equal(passwordChanges, 0)
  assert.match(res.body.error, /root administrator/i)
})

test("new sessions return an opaque token but persist only its hash", async () => {
  let stored
  const auth = authHarness({
    queryAuthoritative: async (_sql, params) => { stored = params; return [] },
  })
  const session = await auth.createSession(ACCOUNT.id)
  assert.match(session.token, /^[a-f0-9]{64}$/)
  assert.match(stored[0], /^sha256\$[a-f0-9]{64}$/)
  assert.equal(stored[0], auth.hashSessionToken(session.token))
  assert.equal(stored[1], ACCOUNT.id)
  assert.equal(stored[2], session.expiresAt)
})

test("database sync cannot transfer an existing showcase to a different owner", async () => {
  const writes = []
  const row = (owner, updatedAt) => ({
    id: "shared_showcase",
    owner_user_id: owner,
    title: owner,
    published: true,
    payload: { owner },
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: updatedAt,
  })
  const sync = loadModule("server/_lib/sync.ts", {}, {
    fetch: async (url, init) => {
      const connectionString = init.headers["Neon-Connection-String"]
      const target = new URL(connectionString).hostname
      const { query } = JSON.parse(init.body)
      if (/^select /i.test(query)) {
        const rows = /from showcases/i.test(query)
          ? [target === "primary.example.neon.tech" ? row("usr_victim", "2026-01-01T00:00:00.000Z") : row("usr_attacker", "2026-02-01T00:00:00.000Z")]
          : []
        return { ok: true, json: async () => ({ rows }) }
      }
      writes.push({ target, query })
      return { ok: true, json: async () => ({ rows: [] }) }
    },
  })

  const result = await sync.syncDatabases({
    primaryUrl: "postgres://test@primary.example.neon.tech/db",
    fallbackUrl: "postgres://test@fallback.example.neon.tech/db",
  })

  assert.equal(result.ok, true)
  const primaryToFallback = writes.find((write) =>
    write.target === "fallback.example.neon.tech" && /insert into showcases/i.test(write.query),
  )
  assert.ok(primaryToFallback)
  assert.match(primaryToFallback.query, /owner_user_id = excluded\.owner_user_id/)
  assert.match(primaryToFallback.query, /payload = excluded\.payload/)
  assert.doesNotMatch(primaryToFallback.query, /where excluded\.updated_at/)
  assert.equal(writes.some((write) => write.target === "primary.example.neon.tech"), false)
})
