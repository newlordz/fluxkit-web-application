const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")
const vm = require("node:vm")

function loadHandler(relPath) {
  const fullPath = path.resolve(relPath)
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

  const context = {
    module,
    exports,
    require,
    process,
    Buffer,
    setTimeout,
    clearTimeout,
    AbortController,
    AbortSignal,
    URL,
    fetch: globalThis.fetch,
  }

  vm.runInNewContext(transpiled, context)
  return module.exports.default || module.exports
}

function createMockReqRes({ method = "GET", body = null, query = {}, headers = {} } = {}) {
  const req = {
    method,
    body,
    query,
    headers,
    async *[Symbol.asyncIterator]() {
      if (body) {
        yield Buffer.from(typeof body === "string" ? body : JSON.stringify(body))
      }
    },
  }

  let statusCode = 200
  let resHeaders = {}
  let resData = null

  const res = {
    statusCode,
    setHeader(k, v) {
      resHeaders[k.toLowerCase()] = v
    },
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

test("API Gateways: GET /api/db/gateways returns masked secrets", async () => {
  const handler = loadHandler("api/db/gateways.ts")
  const { req, res } = createMockReqRes({ method: "GET" })

  await handler(req, res)
  const data = res._getData()

  assert.equal(res._getStatus(), 200)
  assert.ok(data.ok)
  assert.ok(Array.isArray(data.gateways))

  const paystack = data.gateways.find((g) => g.id === "paystack")
  assert.ok(paystack)
  assert.ok(paystack.secretKey.includes("••••"))
  assert.equal(paystack.hasSecretKey, true)
})

test("API Gateways: POST /api/db/gateways preserves secrets when masked", async () => {
  const handler = loadHandler("api/db/gateways.ts")
  const { req, res } = createMockReqRes({
    method: "POST",
    body: {
      gateways: [
        {
          id: "paystack",
          name: "Paystack",
          enabled: true,
          mode: "test",
          publicKey: "pk_test_sample",
          secretKey: "sk_test_••••••••0632",
        },
      ],
    },
  })

  await handler(req, res)
  const data = res._getData()

  assert.equal(res._getStatus(), 200)
  assert.ok(data.ok)
  assert.equal(data.count, 1)
})

test("API Paystack: POST /api/paystack/verify-keys rejects missing key", async () => {
  const handler = loadHandler("api/paystack/verify-keys.ts")
  const { req, res } = createMockReqRes({
    method: "POST",
    body: {
      secretKey: "invalid_prefix_key",
      publicKey: "pk_test_123",
    },
  })

  await handler(req, res)
  const data = res._getData()

  assert.equal(res._getStatus(), 400)
  assert.equal(data.ok, false)
  assert.ok(data.message.includes("Invalid Paystack Secret Key format"))
})

test("API Cloud APIs: POST /api/cloud-apis/ping blocks loopback and SSRF IP addresses", async () => {
  const handler = loadHandler("api/cloud-apis/ping.ts")
  const { req, res } = createMockReqRes({
    method: "POST",
    body: {
      endpoint: "http://127.0.0.1:8080/admin",
    },
  })

  await handler(req, res)
  const data = res._getData()

  assert.equal(res._getStatus(), 403)
  assert.equal(data.ok, false)
  assert.ok(data.error.includes("Prohibited"))
})

test("API Paystack: POST /api/paystack/verify-keys safely unmasks bullet characters without crashing ByteString", async () => {
  const handler = loadHandler("api/paystack/verify-keys.ts")
  const { req, res } = createMockReqRes({
    method: "POST",
    body: {
      secretKey: "sk_test_••••••••0632",
      publicKey: "pk_test_87fb0c5a46528ef690abe24123c62476ea8d996e",
    },
  })

  await handler(req, res)
  const data = res._getData()
  // Must not throw ByteString TypeError (code 8226)
  assert.ok(data)
  assert.ok(typeof data.ok === "boolean")
})
