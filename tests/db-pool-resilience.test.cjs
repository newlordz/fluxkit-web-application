const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

// ============================================================================
// server/_lib/db.ts pool resilience, driven through a scripted fake `pg`
// ============================================================================

const STALE = "Connection terminated due to connection timeout"

function makeFakePg(state) {
  class FakePool {
    constructor(config) {
      this.config = config
      this.errorListeners = []
      this.ended = false
      this.queryCalls = 0
      this.connectCalls = 0
      state.pools.push(this)
    }

    on(event, cb) {
      if (event === "error") this.errorListeners.push(cb)
    }

    emitIdleError() {
      // Reproduce what pg does when a client in the pool dies while idle.
      for (const cb of this.errorListeners) cb(new Error("idle client gone"))
    }

    async query(text, params) {
      this.queryCalls += 1
      if (state.staleFailures > 0) {
        state.staleFailures -= 1
        throw new Error(STALE)
      }
      if (state.customError) throw new Error(state.customError)
      return { rows: [{ echo: String(text).slice(0, 12), params }] }
    }

    async connect() {
      this.connectCalls += 1
      if (state.staleFailures > 0) {
        state.staleFailures -= 1
        throw new Error(STALE)
      }
      const client = {
        statements: [],
        queries: [],
        released: false,
        query: async (text) => {
          client.statements.push(String(text).split("\n")[0].slice(0, 24))
          return { rows: [{ ok: true }] }
        },
        release: () => {
          client.released = true
        },
      }
      client.queries = client.statements
      state.lastClient = client
      return client
    }

    end() {
      this.ended = true
      return Promise.resolve()
    }
  }

  return { Pool: FakePool }
}

function loadDbModule(state) {
  const filePath = path.resolve("server", "_lib", "db.ts")
  const raw = fs.readFileSync(filePath, "utf8")
  const code = ts
    .transpileModule(raw, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    })
    .outputText

  const wrapper = `(function (exports, require, module, __filename, __dirname) {\n${code}\n})`
  const compiled = vm.runInThisContext(wrapper, { filename: filePath })
  const mod = { exports: {} }
  const fake = makeFakePg(state)

  compiled(
    mod.exports,
    (id) => (id === "pg" ? fake : require(id)),
    mod,
    filePath,
    path.dirname(filePath),
  )

  return mod.exports
}

function freshState(overrides = {}) {
  return { pools: [], staleFailures: 0, customError: null, ...overrides }
}

process.env.SUPABASE_DB_URL = "postgres://fixture@pooler.example:6543/postgres"

test("Suite: server database pool resilience", async (t) => {
  await t.test("P.1 the pool is built with a bounded, serverless-safe config", async () => {
    const state = freshState()
    const db = loadDbModule(state)

    db.getPool()

    assert.equal(state.pools.length, 1)
    const cfg = state.pools[0].config
    assert.equal(cfg.max, 2, "a tiny pool so cold starts do not exhaust the pooler")
    assert.equal(cfg.idleTimeoutMillis, 8000)
    assert.equal(
      cfg.connectionTimeoutMillis,
      5000,
      "a failover still fits inside one invocation budget",
    )
    assert.equal(cfg.connectionString, process.env.SUPABASE_DB_URL)
    assert.equal(
      state.pools[0].errorListeners.length,
      1,
      "an idle client error must have a listener or it throws",
    )

    db.getPool()
    assert.equal(state.pools.length, 1, "getPool reuses the existing pool")
  })

  await t.test("P.2 an idle client error does not fail the invocation", async () => {
    const state = freshState()
    const db = loadDbModule(state)
    const pool = db.getPool()

    assert.doesNotThrow(() => pool.emitIdleError())

    const rows = await db.query("select 1")
    assert.equal(rows[0].echo, "select 1", "queries still work")
  })

  await t.test("P.3 a stale connection is retried against a rebuilt pool", async () => {
    const state = freshState({ staleFailures: 1 })
    const db = loadDbModule(state)

    const rows = await db.query("select email from users")

    assert.equal(state.pools.length, 2, "the dead pool was replaced")
    assert.equal(state.pools[0].ended, true, "the dead pool was dropped")
    assert.equal(state.pools[1].queryCalls, 1)
    assert.equal(rows[0].echo, "select email", "the retry returned the real rows")
  })

  await t.test("P.4 a genuine SQL error is not retried or hidden", async () => {
    const state = freshState({
      customError: 'duplicate key value violates unique constraint "users_email_key"',
    })
    const db = loadDbModule(state)

    await assert.rejects(() => db.query("insert into users"), (err) => {
      assert.match(err.message, /duplicate key value/)
      return true
    })

    assert.equal(state.pools.length, 1, "no pool churn for a real constraint violation")
    assert.equal(state.pools[0].queryCalls, 1, "the failing statement ran exactly once")
  })

  await t.test("P.5 a transaction retries once and always releases its client", async () => {
    const state = freshState({ staleFailures: 1 })
    const db = loadDbModule(state)

    const out = await db.transact(async (sql) => sql("select 1"))

    assert.equal(state.pools.length, 2, "the transaction retried on a fresh pool")
    assert.equal(out.length, 1)
    assert.equal(state.lastClient.released, true, "the client went back to the pool")
    assert.deepEqual(state.lastClient.statements, ["begin", "select 1", "commit"])
  })

  await t.test("P.6 a failed transaction rolls back and rethrows", async () => {
    const state = freshState()
    const db = loadDbModule(state)

    await assert.rejects(
      () =>
        db.transact(async () => {
          throw new Error("business rule broken")
        }),
      /business rule broken/,
    )

    assert.deepEqual(state.lastClient.statements, ["begin", "rollback"])
    assert.equal(state.lastClient.released, true)
    assert.equal(state.pools.length, 1, "a logic error does not rebuild the pool")
  })

  await t.test("P.7 missing credentials still fail loudly", async () => {
    const saved = process.env.SUPABASE_DB_URL
    delete process.env.SUPABASE_DB_URL
    try {
      const db = loadDbModule(freshState())
      assert.throws(() => db.getPool(), /SUPABASE_DB_URL is not set/)
    } finally {
      process.env.SUPABASE_DB_URL = saved
    }
  })

  await t.test("P.8 falls back to FALLBACK_DB_URL when primary stays unreachable", async () => {
    const saved = process.env.FALLBACK_DB_URL
    process.env.FALLBACK_DB_URL = "postgres://fixture@fallback.example:5432/fluxkit"
    try {
      const state = freshState({ staleFailures: 2 })
      const db = loadDbModule(state)

      const rows = await db.query("select 42")
      assert.equal(rows[0].echo, "select 42")
      assert.equal(
        state.pools[state.pools.length - 1].config.connectionString,
        process.env.FALLBACK_DB_URL,
      )
    } finally {
      if (saved === undefined) delete process.env.FALLBACK_DB_URL
      else process.env.FALLBACK_DB_URL = saved
    }
  })
})
