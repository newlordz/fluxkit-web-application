const test = require("node:test")
const assert = require("node:assert/strict")
const path = require("node:path")
const fs = require("node:fs")
const vm = require("node:vm")
const ts = require("typescript")

function createHarness() {
  const moduleCache = new Map()
  const storage = new Map([
    [
      "masterfilepro-registered-accounts",
      JSON.stringify([
        {
          id: "usr_admin_default",
          name: "Masterfilepro Administrator",
          email: "admin@masterfilepro.com",
          role: "admin",
          subscriptionTier: "pro",
          proStatus: "active",
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        },
        {
          id: "usr_regular_1",
          name: "Jane Doe",
          email: "jane@example.com",
          role: "user",
          subscriptionTier: "standard",
          proStatus: "none",
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
        },
      ]),
    ],
    [
      "masterfilepro-current-user",
      JSON.stringify({
        id: "usr_admin_default",
        name: "Masterfilepro Administrator",
        email: "admin@masterfilepro.com",
        role: "admin",
        subscriptionTier: "pro",
        proStatus: "active",
      }),
    ],
  ])

  const mockLocalStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  }

  const mockWindow = {
    localStorage: mockLocalStorage,
    dispatchEvent: () => true,
    CustomEvent: class CustomEvent {
      constructor(type, init) {
        this.type = type
        this.detail = init?.detail
      }
    },
    addEventListener: () => {},
    removeEventListener: () => {},
  }

  function transpileAndExecute(fileName) {
    const fullPath = path.resolve("src", fileName + ".ts")
    if (moduleCache.has(fullPath)) return moduleCache.get(fullPath)

    const raw = fs.readFileSync(fullPath, "utf8")
    const code = ts.transpileModule(raw, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    }).outputText.replace(/import\.meta\.env/g, "process.env")

    const wrapper = `(function(exports, require, module, __filename, __dirname, window, localStorage) {\n${code}\n})`
    const compiled = vm.runInThisContext(wrapper, { filename: fullPath })
    const mod = { exports: {} }

    moduleCache.set(fullPath, mod.exports)

    compiled(
      mod.exports,
      (reqPath) => {
        if (!reqPath.startsWith(".") && !reqPath.startsWith("/")) {
          try {
            return require(reqPath)
          } catch {
            return {}
          }
        }
        const basename = path.basename(reqPath).replace(/\.[jt]sx?$/, "")
        if (basename === "jobTypes" || basename === "pageManagerService" || basename === "services") {
          return {}
        }
        return transpileAndExecute(basename)
      },
      mod,
      fullPath,
      path.dirname(fullPath),
      mockWindow,
      mockLocalStorage,
    )

    return mod.exports
  }

  return {
    load: (modName) => transpileAndExecute(modName),
    storage,
  }
}

test("Root Admin Lock: Status is locked and cannot be demoted, revoked, or stripped of Pro", () => {
  const harness = createHarness()
  const admin = harness.load("adminService")

  // 1. Root admin check
  assert.equal(admin.isRootAdmin("usr_admin_default"), true)
  assert.equal(admin.isRootAdmin("admin@masterfilepro.com"), true)

  // 2. Demotion is rejected
  assert.throws(
    () => admin.updateUserRole("usr_admin_default", "user"),
    /permanently locked and cannot be demoted/,
  )

  // 3. Revoke pro is rejected
  assert.throws(
    () => admin.revokeProSubscription("usr_admin_default"),
    /permanently active and cannot be revoked/,
  )

  // 4. Approve pro is rejected / guarded
  assert.throws(
    () => admin.approveProSubscription("usr_admin_default"),
    /permanently active and locked/,
  )

  // 5. Deletion is rejected
  assert.throws(
    () => admin.deleteUser("usr_admin_default"),
    /permanently locked and cannot be deleted/,
  )
})

test("Root Admin Lock: updateUserDetails locks status, role, tier, and name, but allows email and password update", async () => {
  const harness = createHarness()
  const admin = harness.load("adminService")

  // Try changing name, role, tier, proStatus, and email on root admin
  const updated = await admin.updateUserDetails("usr_admin_default", {
    name: "Hacked Hacker Name", // Should be ignored/locked
    email: "newroot@masterfilepro.com", // Should succeed
    role: "user", // Should be locked to admin
    subscriptionTier: "standard", // Should be locked to pro
    proStatus: "none", // Should be locked to active
    newPassword: "NewSecretPassword2026!", // Should succeed
  })

  assert.equal(updated.name, "Masterfilepro Administrator", "Name must remain locked")
  assert.equal(updated.email, "newroot@masterfilepro.com", "Email must be updated")
  assert.equal(updated.role, "admin", "Role must remain admin")
  assert.equal(updated.subscriptionTier, "pro", "Tier must remain pro")
  assert.equal(updated.proStatus, "active", "Pro status must remain active")
})
