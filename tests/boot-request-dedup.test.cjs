const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

/**
 * The boot sequence has several readers of the same records. A production page
 * load must issue one request per endpoint, so this harness counts fetches.
 */
function createHarness() {
  const store = new Map()
  const requests = []
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  }

  const windowObj = {
    localStorage,
    location: { hash: "#overview" },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type
        this.detail = init?.detail
      }
    },
  }

  const fetch = async (url, init = {}) => {
    requests.push({ url: String(url), method: (init.method || "GET").toUpperCase() })
    const body =
      String(url).includes("/api/db/admin")
        ? {
            ok: true,
            admin: {
              id: "usr_admin_default",
              name: "Masterfilepro Administrator",
              email: "admin@masterfilepro.com",
              role: "admin",
              updatedAt: new Date().toISOString(),
            },
            database: { syncedAt: new Date().toISOString() },
            toolTiers: { "merge-pdf": "pro" },
            toolPrices: { "merge-pdf": 4 },
          }
        : { ok: true }
    return { ok: true, status: 200, json: async () => body }
  }

  const cache = new Map()
  function load(name) {
    const full = path.resolve("src", name)
    if (cache.has(full)) return cache.get(full)
    const filename = fs.existsSync(full + ".tsx") ? full + ".tsx" : full + ".ts"
    if (!fs.existsSync(filename)) return null
    const exports = {}
    cache.set(full, exports)
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText
    vm.runInNewContext(
      code,
      {
        exports,
        require: (id) =>
          id === "./services"
            ? { apiBaseUrl: undefined, download: () => {} }
            : id.startsWith(".")
              ? load(
                  path.relative(
                    path.resolve("src"),
                    path.resolve(path.dirname(full), id),
                  ),
                )
              : require(id),
        window: windowObj,
        localStorage,
        location: windowObj.location,
        crypto: globalThis.crypto,
        CustomEvent: windowObj.CustomEvent,
        setTimeout,
        clearTimeout,
        console,
        fetch,
      },
      { filename },
    )
    return exports
  }

  return { load, store, requests }
}

test("Boot: concurrent readers of /api/db/admin share a single request", async () => {
  const harness = createHarness()
  const admin = harness.load("adminService")
  const db = harness.load("adminDbService")

  await Promise.all([
    db.initializeDatabaseSync(),
    admin.syncToolTiersFromDatabase(),
  ])

  const adminCalls = harness.requests.filter(
    (r) => r.url === "/api/db/admin" && r.method === "GET",
  )
  assert.equal(
    adminCalls.length,
    1,
    "the profile read and the tier read must not double-fetch the same record",
  )

  // Both readers still get their data from that one response.
  assert.equal(admin.getToolTier("merge-pdf"), "pro")
  assert.equal(admin.getToolPrice("merge-pdf"), 4)
})

test("Boot: a settled request is re-fetched rather than served stale", async () => {
  const harness = createHarness()
  const admin = harness.load("adminService")

  await admin.syncToolTiersFromDatabase()
  await admin.syncToolTiersFromDatabase()

  assert.equal(
    harness.requests.filter((r) => r.url === "/api/db/admin").length,
    2,
    "dedup is single-flight only, not a cache: a later focus refresh must hit the server",
  )
})
