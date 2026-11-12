const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function sourceLoader() {
  const cache = new Map()
  const storage = new Map()

  const mockLocalStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, val) => storage.set(key, String(val)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  }

  function load(name) {
    const full = path.resolve("src", name)
    if (cache.has(full)) return cache.get(full)
    const filename = fs.existsSync(full + ".tsx") ? full + ".tsx" : full + ".ts"
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
        location: { hash: "#overview" },
        localStorage: mockLocalStorage,
        window: {
          localStorage: mockLocalStorage,
          dispatchEvent: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
        },
        CustomEvent: class CustomEvent {
          constructor(type, init) {
            this.type = type
            this.detail = init?.detail
          }
        },
        setTimeout,
        clearTimeout,
      },
      { filename },
    )
    return exports
  }
  return load
}

test("Google / Gmail sign-in creates user account and manages session", async () => {
  const auth = sourceLoader()("authService")

  assert.equal(auth.getCurrentUser(), null)

  // 1. Sign in with Gmail
  const user = await auth.signInWithGoogle({
    email: "enoch.essel@gmail.com",
  })

  assert.ok(user.id.startsWith("usr_"))
  assert.equal(user.email, "enoch.essel@gmail.com")
  assert.equal(user.name, "Enoch Essel")
  assert.equal(user.provider, "google")
  assert.ok(user.createdAt)

  // 2. Session is persisted in current user
  const current = auth.getCurrentUser()
  assert.equal(current?.email, "enoch.essel@gmail.com")
  assert.equal(current?.name, "Enoch Essel")

  // 3. User appears in registered accounts list
  const registered = auth.getRegisteredAccounts()
  assert.equal(registered.length, 1)
  assert.equal(registered[0].email, "enoch.essel@gmail.com")

  // 4. Signing in again reuses account ID
  const secondSignIn = await auth.signInWithGoogle({
    email: "enoch.essel@gmail.com",
  })
  assert.equal(secondSignIn.id, user.id)

  // 5. Sign out clears current user
  auth.signOut()
  assert.equal(auth.getCurrentUser(), null)
})

test("Google auth derives formatted display names from email prefixes", () => {
  const { formatNameFromEmail } = sourceLoader()("authService")

  assert.equal(formatNameFromEmail("john.smith@gmail.com"), "John Smith")
  assert.equal(formatNameFromEmail("sarah_connor@gmail.com"), "Sarah Connor")
  assert.equal(
    formatNameFromEmail("alexander.graham.bell@gmail.com"),
    "Alexander Graham Bell",
  )
  assert.equal(formatNameFromEmail("dev99@gmail.com"), "Dev")
})
