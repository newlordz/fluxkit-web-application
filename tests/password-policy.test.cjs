const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function createHarness() {
  const store = new Map([["masterfilepro-session-token", "admin-server-token"]])
  const localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value))
    },
    removeItem: (key) => {
      store.delete(key)
    },
    clear: () => store.clear(),
  }

  const windowObj = {
    localStorage,
    sessionStorage: localStorage,
    location: { hash: "#overview", href: "http://localhost:3000/#overview" },
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
    CustomEvent: class CustomEvent {
      constructor(type, eventInitDict) {
        this.type = type
        this.detail = eventInitDict ? eventInitDict.detail : null
      }
    },
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
        require: (id) => {
          if (id === "./services")
            return { apiBaseUrl: undefined, download: () => {} }
          return id.startsWith(".")
            ? load(
                path.relative(
                  path.resolve("src"),
                  path.resolve(path.dirname(full), id),
                ),
              )
            : require(id)
        },
        window: windowObj,
        localStorage,
        sessionStorage: localStorage,
        location: windowObj.location,
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        fetch: async () => ({
          ok: true,
          status: 200,
          json: async () => ({ ok: true }),
        }),
      },
      { filename },
    )
    return exports
  }

  return { load, store }
}

test("Password Policy: Administrator can toggle 'Require Password Reset on Next Login'", async () => {
  const { load } = createHarness()
  const admin = load("adminService")
  const auth = load("authService")

  // Create a standard user
  const user = await admin.createUserByAdmin({
    name: "Robert Testing",
    email: "robert.test@example.com",
    password: "InitialPassword123!",
    role: "user",
    subscriptionTier: "standard",
  })

  assert.equal(user.email, "robert.test@example.com")
  assert.equal(user.requirePasswordReset, undefined)

  // Enforce password reset
  const updated = admin.requireUserPasswordReset(user.id, true)
  assert.equal(updated.requirePasswordReset, true)

  // Verify registered accounts reflect the flag
  const allUsers = admin.getAllUsers()
  const found = allUsers.find((u) => u.id === user.id)
  assert.ok(found)
  assert.equal(found.requirePasswordReset, true)

  // Clear password reset requirement
  const cleared = admin.requireUserPasswordReset(user.id, false)
  assert.equal(cleared.requirePasswordReset, false)
})

test("Password Policy: completeForcedPasswordReset enforces minimum 12 chars and clears flag", async () => {
  const { load } = createHarness()
  const admin = load("adminService")
  const auth = load("authService")

  const user = await admin.createUserByAdmin({
    name: "Sarah Testing",
    email: "sarah.test@example.com",
    password: "OldPassword12345!",
    role: "user",
    subscriptionTier: "standard",
  })

  // Set reset required
  admin.requireUserPasswordReset(user.id, true)

  // Attempt with short password (< 12 chars) -> should throw
  await assert.rejects(
    async () => {
      await auth.completeForcedPasswordReset(user.email, "short123")
    },
    /Password must be at least 12 characters long/,
  )

  // Reset with valid >= 12 char password
  const res = await auth.completeForcedPasswordReset(
    user.email,
    "BrandNewSecurePassword2026!",
  )
  assert.equal(res.success, true)
  assert.equal(res.user.requirePasswordReset, false)

  // Verify in registered accounts
  const allUsers = admin.getAllUsers()
  const found = allUsers.find((u) => u.id === user.id)
  assert.equal(found.requirePasswordReset, false)
})

test("Password Policy: updateUserDetails respects requirePasswordReset option", async () => {
  const { load } = createHarness()
  const admin = load("adminService")

  const user = await admin.createUserByAdmin({
    name: "David Policy",
    email: "david.policy@example.com",
    password: "Password123456!",
    role: "user",
    subscriptionTier: "standard",
  })

  const updated = await admin.updateUserDetails(user.id, {
    name: "David Policy Updated",
    requirePasswordReset: true,
  })

  assert.equal(updated.name, "David Policy Updated")
  assert.equal(updated.requirePasswordReset, true)
})
