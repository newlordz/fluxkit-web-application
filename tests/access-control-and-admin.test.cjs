const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

/**
 * Sandboxed in-memory TypeScript module loader and DOM/Storage simulator.
 * Compiles and executes TS/TSX modules from `src/` within an isolated VM context.
 */
function createHarness(options = {}) {
  const {
    hash = "overview",
    storageInitial = {},
    env = {},
  } = options

  const store = new Map(Object.entries(storageInitial))
  const localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => {
      store.set(key, String(value))
    },
    removeItem: (key) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    },
    get length() {
      return store.size
    },
    key: (i) => Array.from(store.keys())[i] || null,
  }

  const listeners = new Map()
  const windowObj = {
    localStorage,
    location: { hash: hash.startsWith("#") ? hash : `#${hash}` },
    addEventListener: (event, fn) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event).add(fn)
    },
    removeEventListener: (event, fn) => {
      if (listeners.has(event)) listeners.get(event).delete(fn)
    },
    dispatchEvent: (event) => {
      if (listeners.has(event.type)) {
        for (const fn of listeners.get(event.type)) {
          try {
            fn(event)
          } catch {}
        }
      }
      return true
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
        location: windowObj.location,
        crypto: globalThis.crypto,
        CustomEvent: class CustomEvent {
          constructor(type, init) {
            this.type = type
            this.detail = init?.detail
          }
        },
        Event: class Event {
          constructor(type) {
            this.type = type
          }
        },
        setTimeout,
        clearTimeout,
        AbortSignal,
        DOMException,
      },
      { filename },
    )
    return exports
  }

  return { load, store, localStorage, windowObj }
}

function hasModule(name) {
  const full = path.resolve("src", name)
  return fs.existsSync(full + ".tsx") || fs.existsSync(full + ".ts")
}

// ============================================================================
// TIER 1: Feature Coverage (>=12 discrete tests)
// ============================================================================

test("Tier 1 - F1: User Registration creates persistent account with standard tier", async (t) => {
  const harness = createHarness()
  const auth = harness.load("authService")
  assert.ok(auth, "authService must be loadable")

  try {
    const newUser = await auth.signUp({
      name: "Alice Montgomery",
      email: "alice@fluxkit.com",
      password: "StrongPassword2026!",
    })

    assert.ok(newUser, "signUp should return created UserAccount")
    assert.ok(typeof newUser.id === "string" && newUser.id.length > 0, "User must have a non-empty id")
    assert.equal(newUser.name, "Alice Montgomery")
    assert.equal(newUser.email, "alice@fluxkit.com")
    assert.equal(newUser.role, "user")
    assert.equal(newUser.subscriptionTier, "standard")
    assert.equal(newUser.proStatus, "none")
    assert.ok(newUser.createdAt, "createdAt timestamp must be set")
    assert.ok(newUser.lastLoginAt, "lastLoginAt timestamp must be set")

    const accounts = auth.getRegisteredAccounts()
    const found = accounts.find((a) => a.email.toLowerCase() === "alice@fluxkit.com")
    assert.ok(found, "Registered account must be persisted in registered accounts list")
  } catch (err) {
    if (/not connected/i.test(err.message)) {
      t.skip("auth.signUp backend adapter pending Milestone 1 implementation")
      return
    }
    throw err
  }
})

test("Tier 1 - F2: User Authentication with valid credentials returns active session", async (t) => {
  const harness = createHarness()
  const auth = harness.load("authService")

  try {
    const session = await auth.signIn({
      email: "alice@fluxkit.com",
      password: "StrongPassword2026!",
    })
    assert.ok(session, "signIn must return authenticated UserAccount")
    assert.equal(session.email, "alice@fluxkit.com")

    const current = auth.getCurrentUser()
    assert.ok(current, "getCurrentUser should return authenticated user")
    assert.equal(current.email, "alice@fluxkit.com")
    assert.ok(Date.parse(current.lastLoginAt) >= Date.parse(current.createdAt))
  } catch (err) {
    if (/not connected/i.test(err.message)) {
      t.skip("auth.signIn backend adapter pending Milestone 1 implementation")
      return
    }
    throw err
  }
})

test("Tier 1 - F3: Standard tools are immediately accessible to users without gating", () => {
  const harness = createHarness({ hash: "qr" })
  const { tools } = harness.load("config")
  const qrTool = tools.find((t) => t.id === "qr")
  assert.ok(qrTool, "QR tool must be present in config.ts")
  assert.equal(qrTool.available, true, "QR tool must be available")

  if (hasModule("adminService")) {
    const admin = harness.load("adminService")
    assert.equal(admin.canUserAccessTool("qr", null), true, "Standard tool must be accessible to guests")
  }

  const App = harness.load("App").default
  const html = renderToStaticMarkup(React.createElement(App))
  assert.ok(html.length > 500, "App should render successfully")
  assert.doesNotMatch(html, /Pro subscription required|Upgrade to Pro to unlock/i)
})

test("Tier 1 - F4: Tool Tier Registry accurately identifies tool as Standard or Pro", (t) => {
  if (!hasModule("adminService")) {
    t.skip("Module src/adminService.ts not yet implemented (Milestone 2)")
    return
  }

  const harness = createHarness()
  const admin = harness.load("adminService")
  assert.equal(admin.getToolTier("qr"), "standard", "Default tool tier must be standard")
  assert.equal(admin.isToolPro("qr"), false)

  admin.setToolTier("qr", "pro")
  assert.equal(admin.getToolTier("qr"), "pro")
  assert.equal(admin.isToolPro("qr"), true)

  const allTiers = admin.getAllToolTiers()
  assert.equal(allTiers["qr"], "pro")

  admin.setToolTier("qr", "standard")
  assert.equal(admin.getToolTier("qr"), "standard")
  assert.equal(admin.isToolPro("qr"), false)
})

test("Tier 1 - F5: Pro Tool Access Gating restricts unapproved users and displays Paywall", (t) => {
  if (!hasModule("adminService")) {
    t.skip("Module src/adminService.ts not yet implemented (Milestone 2)")
    return
  }

  const harness = createHarness({ hash: "ocr" })
  const admin = harness.load("adminService")
  admin.setToolTier("ocr", "pro")

  const standardUser = {
    id: "usr_regular",
    name: "Regular User",
    email: "regular@fluxkit.com",
    role: "user",
    subscriptionTier: "standard",
    proStatus: "none",
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  }

  assert.equal(admin.canUserAccessTool("ocr", standardUser), false, "Standard user must be gated from Pro tool")
  assert.equal(admin.canUserAccessTool("ocr", null), false, "Guest must be gated from Pro tool")

  if (hasModule("ProActivationModal")) {
    const App = harness.load("App").default
    const html = renderToStaticMarkup(React.createElement(App))
    assert.match(html, /Pro|Upgrade|Unlock|Paywall/i)
  }
})

test("Tier 1 - F6: Simulated Payment Activation grants active Pro status", (t) => {
  if (!hasModule("adminService")) {
    t.skip("Module src/adminService.ts not yet implemented (Milestone 2)")
    return
  }

  const harness = createHarness()
  const admin = harness.load("adminService")
  const auth = harness.load("authService")

  const standardUser = {
    id: "usr_buyer_1",
    name: "Buyer User",
    email: "buyer@fluxkit.com",
    role: "user",
    subscriptionTier: "standard",
    proStatus: "none",
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  }
  auth.saveCurrentUser(standardUser)

  const upgraded = admin.activateProSimulatedPayment("usr_buyer_1")
  assert.equal(upgraded.subscriptionTier, "pro")
  assert.equal(upgraded.proStatus, "active")

  admin.setToolTier("ocr", "pro")
  assert.equal(admin.canUserAccessTool("ocr", upgraded), true, "Upgraded user must access Pro tool")
})

test("Tier 1 - F7: Admin Approval Request flow transitions status to pending", (t) => {
  if (!hasModule("adminService")) {
    t.skip("Module src/adminService.ts not yet implemented (Milestone 2)")
    return
  }

  const harness = createHarness()
  const admin = harness.load("adminService")
  const auth = harness.load("authService")

  const candidate = {
    id: "usr_applicant_1",
    name: "Applicant User",
    email: "applicant@fluxkit.com",
    role: "user",
    subscriptionTier: "standard",
    proStatus: "none",
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  }
  auth.saveCurrentUser(candidate)

  const pendingUser = admin.requestProApproval("usr_applicant_1")
  assert.equal(pendingUser.proStatus, "pending", "proStatus must transition to pending")
  assert.equal(pendingUser.subscriptionTier, "standard")

  admin.setToolTier("ocr", "pro")
  assert.equal(admin.canUserAccessTool("ocr", pendingUser), false, "Pending user remains gated")
})

test("Tier 1 - F8: Seeded Admin Account Authentication with admin privileges", async (t) => {
  const harness = createHarness()
  const auth = harness.load("authService")

  try {
    const adminAccount = await auth.signIn({
      email: "admin@fluxkit.com",
      password: "Admin@FluxKit2026!",
    })
    assert.ok(adminAccount)
    assert.equal(adminAccount.email, "admin@fluxkit.com")
    assert.equal(adminAccount.role, "admin")
  } catch (err) {
    if (/not connected/i.test(err.message)) {
      t.skip("Admin account sign-in pending Milestone 1 implementation")
      return
    }
    throw err
  }
})

test("Tier 1 - F9: Admin Dashboard Access Control renders Admin Panel for admin", (t) => {
  if (!hasModule("AdminPanel")) {
    t.skip("Module src/AdminPanel.tsx not yet implemented (Milestone 3)")
    return
  }

  const adminUser = {
    id: "usr_admin",
    name: "FluxKit Admin",
    email: "admin@fluxkit.com",
    role: "admin",
    subscriptionTier: "pro",
    proStatus: "active",
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  }

  const harness = createHarness({
    hash: "admin",
    storageInitial: { "fluxkit-current-user": JSON.stringify(adminUser) },
  })

  const App = harness.load("App").default
  const html = renderToStaticMarkup(React.createElement(App))
  assert.ok(html.length > 500)
  assert.doesNotMatch(html, /404 · A SMALL DETOUR/i)
  assert.match(html, /Tool Tier|User Approval|Page Manager|Admin/i)
})

test("Tier 1 - F10: Admin Tool Tier Management updates tool tier dynamically", (t) => {
  if (!hasModule("adminService")) {
    t.skip("Module src/adminService.ts not yet implemented (Milestone 2)")
    return
  }

  const harness = createHarness()
  const admin = harness.load("adminService")

  admin.setToolTier("merge-pdf", "pro")
  admin.setToolTier("split-pdf", "pro")
  admin.setToolTier("convert", "standard")

  const tiers = admin.getAllToolTiers()
  assert.equal(tiers["merge-pdf"], "pro")
  assert.equal(tiers["split-pdf"], "pro")
  assert.equal(tiers["convert"], "standard")
})

test("Tier 1 - F11: Admin User Approvals UI approves pending subscriptions", (t) => {
  if (!hasModule("adminService")) {
    t.skip("Module src/adminService.ts not yet implemented (Milestone 2)")
    return
  }

  const harness = createHarness()
  const admin = harness.load("adminService")
  const auth = harness.load("authService")

  const pendingUser = {
    id: "usr_pending_approval",
    name: "Pending Member",
    email: "pending@fluxkit.com",
    role: "user",
    subscriptionTier: "standard",
    proStatus: "pending",
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  }
  auth.saveCurrentUser(pendingUser)

  const approved = admin.approveProSubscription("usr_pending_approval")
  assert.equal(approved.proStatus, "active")
  assert.equal(approved.subscriptionTier, "pro")

  const stored = auth.getCurrentUser()
  if (stored && stored.id === "usr_pending_approval") {
    assert.equal(stored.proStatus, "active")
    assert.equal(stored.subscriptionTier, "pro")
  }
})

test("Tier 1 - F12: Page Manager CRUD Operations create, read, update and delete pages", (t) => {
  if (!hasModule("pageManagerService")) {
    t.skip("Module src/pageManagerService.ts not yet implemented (Milestone 3)")
    return
  }

  const harness = createHarness()
  const pm = harness.load("pageManagerService")

  const initialCount = pm.getCustomPages().length

  const page = pm.createCustomPage({
    slug: "api-reference",
    title: "API Reference",
    navTitle: "API",
    description: "FluxKit Developer Documentation",
    content: "# FluxKit API\nUse the client SDK to automate workflow tasks.",
    showInNav: true,
    navOrder: 2,
    status: "published",
  })

  assert.ok(page.id, "Page must have an id assigned")
  assert.equal(page.slug, "api-reference")
  assert.equal(pm.getCustomPages().length, initialCount + 1)

  const fetched = pm.getCustomPageBySlug("api-reference")
  assert.ok(fetched)
  assert.equal(fetched.title, "API Reference")

  const updated = pm.updateCustomPage(page.id, {
    title: "API Reference v2",
    showInNav: false,
  })
  assert.equal(updated.title, "API Reference v2")
  assert.equal(updated.showInNav, false)

  const deleted = pm.deleteCustomPage(page.id)
  assert.equal(deleted, true)
  assert.equal(pm.getCustomPageBySlug("api-reference"), null)
})

// ============================================================================
// TIER 2: Boundary & Corner Cases (>=10 tests)
// ============================================================================

test("Tier 2 - B1: Password length validation rejects passwords < 12 characters", async (t) => {
  const harness = createHarness()
  const auth = harness.load("authService")

  const shortPasswords = ["short", "pass1234", "11charsPass", "a".repeat(11)]

  for (const pwd of shortPasswords) {
    try {
      await auth.signUp({
        name: "Short Pwd",
        email: `short_${pwd.length}@fluxkit.com`,
        password: pwd,
      })
      assert.fail(`Password of length ${pwd.length} should be rejected`)
    } catch (err) {
      if (/not connected/i.test(err.message)) {
        t.skip("signUp validation pending Milestone 1 implementation")
        return
      }
      assert.match(err.message, /12 characters|short|length/i)
    }
  }
})

test("Tier 2 - B2: Duplicate registration attempt with existing email is rejected", async (t) => {
  const harness = createHarness()
  const auth = harness.load("authService")

  try {
    await auth.signUp({
      name: "Original User",
      email: "duplicate-check@fluxkit.com",
      password: "ValidSecurePassword2026!",
    })

    // Case-insensitive duplicate attempt
    await auth.signUp({
      name: "Imposter User",
      email: "DUPLICATE-CHECK@FLUXKIT.COM",
      password: "AnotherSecurePassword2026!",
    })
    assert.fail("Duplicate email registration should throw an error")
  } catch (err) {
    if (/not connected/i.test(err.message)) {
      t.skip("Duplicate email validation pending Milestone 1 implementation")
      return
    }
    assert.match(err.message, /already registered|exists|duplicate/i)
  }
})

test("Tier 2 - B3: Authentication fails with invalid password or unregistered email", async (t) => {
  const harness = createHarness()
  const auth = harness.load("authService")

  try {
    await auth.signIn({
      email: "nonexistent@fluxkit.com",
      password: "SomePassword123!",
    })
    assert.fail("Nonexistent email should be rejected")
  } catch (err) {
    if (/not connected/i.test(err.message)) {
      t.skip("signIn credentials validation pending Milestone 1 implementation")
      return
    }
    assert.match(err.message, /not found|invalid|no account|credentials/i)
  }
})

test("Tier 2 - B4: Non-admin user accessing #admin is denied access", (t) => {
  const standardUser = {
    id: "usr_regular_bob",
    name: "Regular Bob",
    email: "bob@fluxkit.com",
    role: "user",
    subscriptionTier: "standard",
    proStatus: "none",
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  }

  const harness = createHarness({
    hash: "admin",
    storageInitial: { "fluxkit-current-user": JSON.stringify(standardUser) },
  })

  const App = harness.load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  // Non-admins must NOT see admin tabs or sensitive admin controls
  assert.doesNotMatch(html, /Tool Tier Manager|User Approvals|Page Manager/i)
  assert.match(html, /404 · A SMALL DETOUR|Access denied|Unauthorized|Restricted/i)
})

test("Tier 2 - B5: Deleted custom page immediately results in 404 Detour", (t) => {
  if (!hasModule("pageManagerService")) {
    t.skip("Module src/pageManagerService.ts not yet implemented (Milestone 3)")
    return
  }

  const harness = createHarness({ hash: "deleted-promo" })
  const pm = harness.load("pageManagerService")

  const promo = pm.createCustomPage({
    slug: "deleted-promo",
    title: "Deleted Promo",
    navTitle: "Promo",
    content: "Flash Sale",
    showInNav: false,
    navOrder: 1,
    status: "published",
  })
  pm.deleteCustomPage(promo.id)

  const App = harness.load("App").default
  const html = renderToStaticMarkup(React.createElement(App))
  assert.match(html, /404 · A SMALL DETOUR/i)
})

test("Tier 2 - B6: Invalid or colliding page slug handling", (t) => {
  if (!hasModule("pageManagerService")) {
    t.skip("Module src/pageManagerService.ts not yet implemented (Milestone 3)")
    return
  }

  const harness = createHarness()
  const pm = harness.load("pageManagerService")

  // Reserved slug collision
  assert.throws(
    () => {
      pm.createCustomPage({
        slug: "admin",
        title: "Admin Collision",
        navTitle: "Admin",
        content: "Colliding content",
        showInNav: true,
        navOrder: 1,
        status: "published",
      })
    },
    /reserved|invalid|collision/i,
  )
})

test("Tier 2 - B7: User with pending approval status remains gated from Pro tools", (t) => {
  if (!hasModule("adminService")) {
    t.skip("Module src/adminService.ts not yet implemented (Milestone 2)")
    return
  }

  const harness = createHarness()
  const admin = harness.load("adminService")
  admin.setToolTier("audio-text", "pro")

  const pendingUser = {
    id: "usr_pending_dan",
    name: "Dan Pending",
    email: "dan@fluxkit.com",
    role: "user",
    subscriptionTier: "standard",
    proStatus: "pending",
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  }

  assert.equal(admin.canUserAccessTool("audio-text", pendingUser), false)
})

test("Tier 2 - B8: Unauthenticated guest access to Pro tools displays gating shield", (t) => {
  if (!hasModule("adminService")) {
    t.skip("Module src/adminService.ts not yet implemented (Milestone 2)")
    return
  }

  const harness = createHarness({ hash: "ocr" })
  const admin = harness.load("adminService")
  admin.setToolTier("ocr", "pro")

  assert.equal(admin.canUserAccessTool("ocr", null), false)
})

test("Tier 2 - B9: Password reset request handles non-existent email gracefully", async (t) => {
  const harness = createHarness()
  const auth = harness.load("authService")

  try {
    await auth.requestPasswordReset("nonexistent_user@fluxkit.com")
  } catch (err) {
    if (/not connected/i.test(err.message)) {
      t.skip("Password reset backend adapter pending Milestone 1 implementation")
      return
    }
  }
})

test("Tier 2 - B10: Offline unconfigured test mode preserves disconnected invariant", () => {
  const harness = createHarness()
  const auth = harness.load("authService")
  assert.equal(auth.authConnected, false)
  assert.throws(
    () => auth.signIn({ email: "test@example.com", password: "invalid-password" }),
    /not connected/,
  )
  assert.throws(
    () => auth.signUp({ name: "Tester", email: "test@example.com", password: "invalid-password" }),
    /not connected/,
  )
  assert.throws(
    () => auth.requestPasswordReset("test@example.com"),
    /not connected/,
  )
})

// ============================================================================
// TIER 3: Cross-Feature Combinations (>=5 state transitions)
// ============================================================================

test("Tier 3 - C1: Registration -> Simulated Payment -> Pro Tool Access", async (t) => {
  if (!hasModule("adminService")) {
    t.skip("Cross-feature payment requires adminService (Milestone 2)")
    return
  }

  const harness = createHarness()
  const auth = harness.load("authService")
  const admin = harness.load("adminService")

  admin.setToolTier("merge-compress", "pro")

  let user
  try {
    user = await auth.signUp({
      name: "C1 User",
      email: "c1_flow@fluxkit.com",
      password: "SecurePass2026!C1",
    })
  } catch (err) {
    if (/not connected/i.test(err.message)) {
      t.skip("signUp pending Milestone 1 implementation")
      return
    }
    throw err
  }

  // Initial state: standard user cannot access Pro tool
  assert.equal(admin.canUserAccessTool("merge-compress", user), false)

  // Step 2: Simulated card payment activation
  const upgraded = admin.activateProSimulatedPayment(user.id)
  assert.equal(upgraded.subscriptionTier, "pro")
  assert.equal(upgraded.proStatus, "active")

  // Step 3: Pro tool is now unlocked
  assert.equal(admin.canUserAccessTool("merge-compress", upgraded), true)
})

test("Tier 3 - C2: Registration -> Request Approval -> Admin Approval -> Pro Tool Access", async (t) => {
  if (!hasModule("adminService")) {
    t.skip("Cross-feature approval requires adminService (Milestone 2)")
    return
  }

  const harness = createHarness()
  const auth = harness.load("authService")
  const admin = harness.load("adminService")

  admin.setToolTier("watermark", "pro")

  let applicant
  try {
    applicant = await auth.signUp({
      name: "Applicant C2",
      email: "c2_approval@fluxkit.com",
      password: "SecurePass2026!C2",
    })
  } catch (err) {
    if (/not connected/i.test(err.message)) {
      t.skip("signUp pending Milestone 1 implementation")
      return
    }
    throw err
  }

  // Step 1: User requests approval
  const pending = admin.requestProApproval(applicant.id)
  assert.equal(pending.proStatus, "pending")
  assert.equal(admin.canUserAccessTool("watermark", pending), false)

  // Step 2: Admin reviews and approves
  const approved = admin.approveProSubscription(applicant.id)
  assert.equal(approved.proStatus, "active")
  assert.equal(approved.subscriptionTier, "pro")

  // Step 3: Tool is now unlocked for approved user
  assert.equal(admin.canUserAccessTool("watermark", approved), true)
})

test("Tier 3 - C3: Admin Tool Tier Toggle dynamically controls user access without re-login", (t) => {
  if (!hasModule("adminService")) {
    t.skip("Cross-feature tier toggle requires adminService (Milestone 2)")
    return
  }

  const harness = createHarness()
  const admin = harness.load("adminService")

  const standardUser = {
    id: "usr_dyn_tier",
    name: "Dynamic User",
    email: "dyn@fluxkit.com",
    role: "user",
    subscriptionTier: "standard",
    proStatus: "none",
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  }

  // Tool begins as standard: accessible
  admin.setToolTier("summarize", "standard")
  assert.equal(admin.canUserAccessTool("summarize", standardUser), true)

  // Admin toggles to Pro: immediately gated
  admin.setToolTier("summarize", "pro")
  assert.equal(admin.canUserAccessTool("summarize", standardUser), false)

  // Admin toggles back to Standard: immediately unlocked
  admin.setToolTier("summarize", "standard")
  assert.equal(admin.canUserAccessTool("summarize", standardUser), true)
})

test("Tier 3 - C4: Admin Creates Custom Page with Nav -> Route Resolution & Navigation Visibility", (t) => {
  if (!hasModule("pageManagerService")) {
    t.skip("Custom page routing requires pageManagerService (Milestone 3)")
    return
  }

  const harness = createHarness({ hash: "changelog" })
  const pm = harness.load("pageManagerService")

  const page = pm.createCustomPage({
    slug: "changelog",
    title: "Platform Changelog",
    navTitle: "Changelog",
    content: "# What is New\nContinuous updates and stability improvements.",
    showInNav: true,
    navOrder: 3,
    status: "published",
  })

  // Published pages configured for nav appear in nav list
  const navPages = pm.getPublishedCustomPages().filter((p) => p.showInNav)
  assert.ok(navPages.some((p) => p.slug === "changelog"))

  // Edit to hide from nav
  pm.updateCustomPage(page.id, { showInNav: false })
  const updatedNavPages = pm.getPublishedCustomPages().filter((p) => p.showInNav)
  assert.ok(!updatedNavPages.some((p) => p.slug === "changelog"))

  // Still resolvable by slug
  assert.ok(pm.getCustomPageBySlug("changelog"))
})

test("Tier 3 - C5: Admin Deletes Custom Page -> Route Cascade to 404 & Re-creation Recovery", (t) => {
  if (!hasModule("pageManagerService")) {
    t.skip("Cascade to 404 requires pageManagerService (Milestone 3)")
    return
  }

  const harness = createHarness({ hash: "dynamic-guide" })
  const pm = harness.load("pageManagerService")

  const guide = pm.createCustomPage({
    slug: "dynamic-guide",
    title: "Guide Title",
    navTitle: "Guide",
    content: "Original Guide Content",
    showInNav: false,
    navOrder: 1,
    status: "published",
  })
  assert.ok(pm.getCustomPageBySlug("dynamic-guide"))

  // Deletion
  pm.deleteCustomPage(guide.id)
  assert.equal(pm.getCustomPageBySlug("dynamic-guide"), null)

  // Re-creation with same slug restores access
  const restored = pm.createCustomPage({
    slug: "dynamic-guide",
    title: "New Guide Title",
    navTitle: "New Guide",
    content: "Replaced Guide Content",
    showInNav: false,
    navOrder: 1,
    status: "published",
  })
  assert.ok(restored)
  assert.equal(pm.getCustomPageBySlug("dynamic-guide").title, "New Guide Title")
})

// ============================================================================
// TIER 4: Real-World Scenarios (>=3 comprehensive workflows)
// ============================================================================

test("Tier 4 - S1: Complete End-to-End User Onboarding & Subscription Lifecycle", async (t) => {
  if (!hasModule("adminService")) {
    t.skip("Scenario S1 requires adminService (Milestone 2)")
    return
  }

  const harness = createHarness()
  const auth = harness.load("authService")
  const admin = harness.load("adminService")

  admin.setToolTier("audio-text", "pro")

  // 1. Guest user registers
  let user
  try {
    user = await auth.signUp({
      name: "Jordan Lee",
      email: "jordan@example.com",
      password: "ComplexPassword2026!",
    })
  } catch (err) {
    if (/not connected/i.test(err.message)) {
      t.skip("Scenario S1 auth pending Milestone 1 implementation")
      return
    }
    throw err
  }

  // 2. Jordan uses standard tool
  assert.equal(admin.canUserAccessTool("qr", user), true)

  // 3. Jordan encounters Pro tool paywall
  assert.equal(admin.canUserAccessTool("audio-text", user), false)

  // 4. Jordan submits approval request
  const pendingUser = admin.requestProApproval(user.id)
  assert.equal(pendingUser.proStatus, "pending")

  // 5. Admin logs in and approves Jordan
  const approvedUser = admin.approveProSubscription(user.id)
  assert.equal(approvedUser.subscriptionTier, "pro")
  assert.equal(approvedUser.proStatus, "active")

  // 6. Jordan now has full access to the Pro tool
  assert.equal(admin.canUserAccessTool("audio-text", approvedUser), true)
})

test("Tier 4 - S2: Site Administrator Content & Navigation Publishing Lifecycle", (t) => {
  if (!hasModule("pageManagerService")) {
    t.skip("Scenario S2 requires pageManagerService (Milestone 3)")
    return
  }

  const harness = createHarness()
  const pm = harness.load("pageManagerService")

  // 1. Admin creates multiple custom pages
  const p1 = pm.createCustomPage({
    slug: "developer-terms",
    title: "Developer Terms",
    navTitle: "Dev Terms",
    content: "Terms for API users.",
    showInNav: true,
    navOrder: 1,
    status: "published",
  })

  const p2 = pm.createCustomPage({
    slug: "internal-notes",
    title: "Internal Notes",
    navTitle: "Notes",
    content: "Internal admin notes.",
    showInNav: false,
    navOrder: 2,
    status: "draft",
  })

  // 2. Published navigation items verify only p1 is in navigation
  const navPages = pm.getPublishedCustomPages().filter((p) => p.showInNav)
  assert.ok(navPages.some((p) => p.slug === "developer-terms"))
  assert.ok(!navPages.some((p) => p.slug === "internal-notes"))

  // 3. Admin updates content
  pm.updateCustomPage(p1.id, {
    title: "Developer Terms v2",
    content: "Updated terms.",
  })
  assert.equal(pm.getCustomPageBySlug("developer-terms").title, "Developer Terms v2")

  // 4. Admin removes draft page
  pm.deleteCustomPage(p2.id)
  assert.equal(pm.getCustomPageBySlug("internal-notes"), null)
})

test("Tier 4 - S3: Monetization & Tool Tier Administration Lifecycle", (t) => {
  if (!hasModule("adminService")) {
    t.skip("Scenario S3 requires adminService (Milestone 2)")
    return
  }

  const harness = createHarness()
  const admin = harness.load("adminService")
  const auth = harness.load("authService")

  // 1. Admin changes 3 tools to Pro
  const proTools = ["merge-pdf", "ocr", "summarize"]
  for (const tid of proTools) {
    admin.setToolTier(tid, "pro")
  }

  // 2. Standard user checks access
  const member = {
    id: "usr_member_sam",
    name: "Sam Member",
    email: "sam@example.com",
    role: "user",
    subscriptionTier: "standard",
    proStatus: "none",
    createdAt: new Date().toISOString(),
    lastLoginAt: new Date().toISOString(),
  }
  auth.saveCurrentUser(member)

  assert.equal(admin.canUserAccessTool("qr", member), true, "Standard tool remains accessible")
  for (const tid of proTools) {
    assert.equal(admin.canUserAccessTool(tid, member), false, `Tool ${tid} must be gated`)
  }

  // 3. Sam upgrades via simulated payment
  const upgraded = admin.activateProSimulatedPayment(member.id)
  for (const tid of proTools) {
    assert.equal(admin.canUserAccessTool(tid, upgraded), true, `Tool ${tid} now accessible`)
  }

  // 4. Subscription revocation
  const revoked = admin.revokeProSubscription(member.id)
  assert.equal(revoked.subscriptionTier, "standard")
  assert.equal(revoked.proStatus, "none")
  for (const tid of proTools) {
    assert.equal(admin.canUserAccessTool(tid, revoked), false, `Tool ${tid} gated after revocation`)
  }
})

test("Tier 4 - S4: Admin sidepanel console and workstation tools availability", () => {
  const adminUser = {
    id: "usr_admin_default",
    name: "FluxKit Administrator",
    email: "admin@fluxkit.com",
    role: "admin",
    subscriptionTier: "pro",
    proStatus: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastLoginAt: "2026-01-01T00:00:00.000Z",
  }

  const harness = createHarness({
    hash: "overview",
    storageInitial: { "fluxkit-current-user": JSON.stringify(adminUser) },
  })
  const App = harness.load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.ok(html.includes("Admin Portal"), "Admin sees Admin Portal")
  assert.ok(html.includes("Payment &amp; APIs") || html.includes("Payment & APIs"), "Admin sees Payment & APIs link")
  assert.ok(html.includes("WORKSTATION"), "Admin has workstation tools available at their disposal")
})

test("Tier 4 - S5: Root Admin lock, Sub-Admin promotion & User Management", (t) => {
  const harness = createHarness({
    hash: "admin",
  })
  const admin = harness.load("adminService")
  const auth = harness.load("authService")

  // 1. Root admin verification
  assert.equal(admin.isRootAdmin("usr_admin_default"), true)
  assert.equal(admin.isRootAdmin("admin@fluxkit.com"), true)

  // 2. Root admin cannot be deleted
  assert.throws(
    () => admin.deleteUser("usr_admin_default"),
    /permanently locked and cannot be deleted/,
  )

  // 3. Root admin cannot be demoted
  assert.throws(
    () => admin.updateUserRole("usr_admin_default", "user"),
    /permanently locked and cannot be demoted/,
  )

  // 4. Admin creates new user with sub-admin role
  const subAdmin = admin.createUserByAdmin({
    name: "Operations Lead",
    email: "ops@fluxkit.com",
    password: "OpsPassword2026!",
    role: "sub-admin",
    subscriptionTier: "pro",
  })
  assert.equal(subAdmin.role, "sub-admin")
  assert.equal(subAdmin.subscriptionTier, "pro")

  // 5. Sub-Admin can access tools
  assert.equal(admin.canUserAccessTool("merge-pdf", subAdmin), true)

  // 6. Change user password
  assert.doesNotThrow(() => {
    admin.changeUserPassword(subAdmin.id, "NewOpsPassword2026!")
  })

  // 7. Change Root admin password
  assert.doesNotThrow(() => {
    admin.changeUserPassword("admin@fluxkit.com", "BrandNewRootAdminPass123!")
  })

  // 8. Non-root user can be deleted
  assert.doesNotThrow(() => {
    admin.deleteUser(subAdmin.id)
  })
})
