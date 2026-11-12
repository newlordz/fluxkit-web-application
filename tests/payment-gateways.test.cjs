const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function createHarness() {
  const store = {}
  const mockStorage = {
    getItem: (k) => store[k] || null,
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
    clear: () => { Object.keys(store).forEach((k) => delete store[k]) },
  }

  const cache = new Map()
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
        require: (id) => (id.startsWith(".") ? load(path.relative(path.resolve("src"), path.resolve(path.dirname(full), id))) : require(id)),
        localStorage: mockStorage,
        window: { localStorage: mockStorage },
        document: {},
        setTimeout,
        clearTimeout,
      },
      { filename },
    )
    return exports
  }
  return { load, store }
}

test("Gateways: initializes default providers (Paystack, Stripe, Flutterwave, Custom)", () => {
  const harness = createHarness()
  const svc = harness.load("paymentIntegrationService")
  const gateways = svc.getAllGateways()

  assert.ok(Array.isArray(gateways))
  assert.equal(gateways.length, 4)

  const paystack = gateways.find((g) => g.id === "paystack")
  assert.ok(paystack)
  assert.equal(paystack.name, "Paystack")
  assert.equal(paystack.enabled, true)
  assert.equal(paystack.currency, "GHS")

  const stripe = gateways.find((g) => g.id === "stripe")
  assert.ok(stripe)
  assert.equal(stripe.name, "Stripe")

  const flw = gateways.find((g) => g.id === "flutterwave")
  assert.ok(flw)

  const custom = gateways.find((g) => g.id === "custom")
  assert.ok(custom)
})

test("Gateways: updates gateway credentials and mode", () => {
  const harness = createHarness()
  const svc = harness.load("paymentIntegrationService")

  const current = svc.getGateway("paystack")
  assert.ok(current)

  svc.saveGateway({
    ...current,
    publicKey: "pk_live_fluxkit_prod_abc123",
    secretKey: "sk_live_fluxkit_prod_xyz456",
    mode: "live",
    currency: "USD",
  })

  const updated = svc.getGateway("paystack")
  assert.equal(updated.publicKey, "pk_live_fluxkit_prod_abc123")
  assert.equal(updated.mode, "live")
  assert.equal(updated.currency, "USD")
})

test("Gateways: testGatewayConnection validates Paystack and Stripe key formats", async () => {
  const harness = createHarness()
  const svc = harness.load("paymentIntegrationService")

  // Test default valid paystack keys
  const res1 = await svc.testGatewayConnection("paystack")
  assert.equal(res1.success, true)
  assert.match(res1.message, /Paystack API handshake simulated/i)

  // Test invalid stripe keys
  svc.saveGateway({
    id: "stripe",
    name: "Stripe",
    description: "",
    enabled: true,
    mode: "test",
    publicKey: "invalid_key",
    secretKey: "invalid_secret",
    currency: "USD",
  })
  const res2 = await svc.testGatewayConnection("stripe")
  assert.equal(res2.success, false)
  assert.match(res2.message, /Stripe keys must start with pk_ and sk_/i)

  // Fix stripe keys
  svc.saveGateway({
    id: "stripe",
    name: "Stripe",
    description: "",
    enabled: true,
    mode: "test",
    publicKey: "pk_test_sample123",
    secretKey: "sk_test_sample123",
    currency: "USD",
  })
  const res3 = await svc.testGatewayConnection("stripe")
  assert.equal(res3.success, true)
})

test("Gateways: set and get active gateway", () => {
  const harness = createHarness()
  const svc = harness.load("paymentIntegrationService")

  svc.setActiveGateway("stripe")
  // Stripe disabled by default, so fallback or active
  svc.saveGateway({
    ...svc.getGateway("stripe"),
    enabled: true,
  })
  const active = svc.getActiveGateway()
  assert.ok(active)
  assert.equal(active.id, "stripe")
})
