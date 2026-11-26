const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function sourceLoader(
  fetchImpl = async () => {
    throw new Error("Network unavailable in test")
  },
  defines = {},
) {
  const cache = new Map()
  const storage = new Map()
  const sessionStorage = new Map()

  const mockSessionStorage = {
    getItem: (key) => sessionStorage.get(key) || null,
    setItem: (key, val) => sessionStorage.set(key, String(val)),
    removeItem: (key) => sessionStorage.delete(key),
    clear: () => sessionStorage.clear(),
  }

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
    let code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText
    for (const [name, value] of Object.entries(defines)) {
      code = code.replaceAll(name, JSON.stringify(value))
    }
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
        sessionStorage: mockSessionStorage,
        window: {
          localStorage: mockLocalStorage,
          sessionStorage: mockSessionStorage,
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
        fetch: fetchImpl,
      },
      { filename },
    )
    return exports
  }
  return Object.assign(load, { storage, sessionStorage })
}

test("Google sign-in accepts only a server-verified access token", async () => {
  const requests = []
  const auth = sourceLoader(async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body) })
    return {
      ok: true,
      status: 200,
      json: async () => ({
        ok: true,
        token: "server-session-token",
        user: {
          id: "usr_enoch",
          email: "enoch.essel@gmail.com",
          name: "Enoch Essel",
          provider: "google",
          role: "user",
          subscriptionTier: "standard",
          proStatus: "none",
          unlockedTools: [],
        },
      }),
    }
  })("authService")

  assert.equal(auth.getCurrentUser(), null)
  const user = await auth.signInWithGoogle("verified-google-token")
  assert.deepEqual(requests.filter((request) => request.url === "/api/auth/google"), [
    { url: "/api/auth/google", body: { accessToken: "verified-google-token" } },
  ])
  assert.equal(requests.some((request) => request.url === "/api/auth/google" && request.body.email), false)

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
  const secondSignIn = await auth.signInWithGoogle("verified-google-token")
  assert.equal(secondSignIn.id, user.id)

  // 5. Sign out clears current user
  auth.signOut()
  assert.equal(auth.getCurrentUser(), null)
})

test("Legacy cached credentials are removed and never bypass an unavailable server", async () => {
  const load = sourceLoader(async () => { throw new Error("offline") })
  load.storage.set("masterfilepro-credentials", JSON.stringify({ email: "admin@masterfilepro.com", hash: "legacy-hash" }))
  load.storage.set("masterfilepro-accounts", JSON.stringify([{ email: "admin@masterfilepro.com", role: "admin" }]))
  const freshAuth = load("authService")
  assert.equal(load.storage.get("masterfilepro-credentials"), undefined)
  assert.equal(load.storage.get("masterfilepro-accounts"), undefined)

  await assert.rejects(
    freshAuth.signIn({ email: "admin@masterfilepro.com", password: "CachedPassword2026!" }),
    /server|unavailable/i,
  )
  assert.equal(freshAuth.getCurrentUser(), null)

  await assert.rejects(
    freshAuth.signUp({ name: "Local Only", email: "local@example.com", password: "StrongPassword2026!" }),
    /unavailable/i,
  )
  assert.equal(freshAuth.getRegisteredAccounts().some((user) => user.email === "local@example.com"), false)
})

test("Malformed cached profiles are discarded without trusting local account data", () => {
  const load = sourceLoader()
  const auth = load("authService")
  load("sessionService").setSessionToken("legacy-session")
  load.sessionStorage.set("masterfilepro-current-user", JSON.stringify({ id: "legacy" }))

  assert.equal(auth.getCurrentUser(), null)
  assert.equal(load.sessionStorage.has("masterfilepro-current-user"), false)

  auth.saveCurrentUser({ id: "incomplete" })
  assert.equal(auth.getCurrentUser(), null)
})

test("Boot reconciliation drops a cached administrator when the session server is offline", async () => {
  const load = sourceLoader(async () => { throw new Error("offline") })
  const auth = load("authService")
  load("sessionService").setSessionToken("cached-session")
  auth.saveCurrentUser({
    id: "usr_admin",
    name: "Cached Admin",
    email: "admin@masterfilepro.com",
    provider: "email",
    role: "admin",
    subscriptionTier: "pro",
    proStatus: "active",
    unlockedTools: ["ocr"],
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  })

  assert.equal(await auth.reconcileSessionWithServer(), "unavailable")
  assert.equal(auth.getCurrentUser(), null)
})

test("Boot reconciliation replaces stale cached roles and tool unlocks from the server", async () => {
  const load = sourceLoader(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      ok: true,
      token: "server-session",
      user: {
        id: "usr_demoted",
        email: "member@example.com",
        name: "Member",
        provider: "email",
        role: "user",
        subscriptionTier: "standard",
        proStatus: "none",
        unlockedTools: [],
      },
    }),
  }))
  const auth = load("authService")
  load("sessionService").setSessionToken("server-session")
  auth.saveCurrentUser({
    id: "usr_demoted",
    name: "Member",
    email: "member@example.com",
    provider: "email",
    role: "admin",
    subscriptionTier: "pro",
    proStatus: "active",
    unlockedTools: ["ocr"],
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  })

  assert.equal(await auth.reconcileSessionWithServer(), "signed-in")
  assert.equal(auth.getCurrentUser().role, "user")
  assert.equal(auth.getCurrentUser().proStatus, "none")
  assert.deepEqual(Array.from(auth.getCurrentUser().unlockedTools || []), [])
})

test("Google client ID remains readable after Vite replaces the browser environment lookup", () => {
  const clientId = "configured-client.apps.googleusercontent.com"
  const auth = sourceLoader(undefined, {
    "process.env.VITE_GOOGLE_CLIENT_ID": clientId,
  })("authService")

  assert.equal(auth.getGoogleClientId(), clientId)
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

test("sign-out removes legacy credentials and tab-local account data", () => {
  const load = sourceLoader()
  load.storage.set("masterfilepro-session-token", "server-session")
  load.storage.set("masterfilepro-current-user", JSON.stringify({
    id: "usr_member",
    email: "member@example.com",
    name: "Member",
    provider: "google",
    role: "user",
    subscriptionTier: "standard",
    proStatus: "none",
    unlockedTools: [],
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  }))
  load.storage.set("masterfilepro-credentials", JSON.stringify({ hash: "legacy-secret" }))
  load.storage.set("masterfilepro-accounts", JSON.stringify([{ email: "member@example.com" }]))
  load.storage.set("masterfilepro-reset-tokens", JSON.stringify([{ code: "123456" }]))
  load.storage.set("masterfilepro-login-attempts", JSON.stringify([{ email: "member@example.com" }]))

  const auth = load("authService")
  assert.equal(auth.getCurrentUser().email, "member@example.com")
  assert.equal(load.sessionStorage.get("masterfilepro-session-token"), "server-session")
  assert.equal(load.storage.get("masterfilepro-session-token"), undefined)
  assert.equal(load.storage.get("masterfilepro-current-user"), undefined)

  auth.signOut()
  assert.equal(auth.getCurrentUser(), null)
  assert.equal(load.sessionStorage.size, 0)
  for (const key of ["masterfilepro-credentials", "masterfilepro-accounts", "masterfilepro-reset-tokens", "masterfilepro-login-attempts"]) {
    assert.equal(load.storage.get(key), undefined)
  }
})
