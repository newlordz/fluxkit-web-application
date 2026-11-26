const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const crypto = require("node:crypto")

function loadTransferModule() {
  const filePath = path.resolve(__dirname, "../src/fileTransfer.ts")
  const source = fs.readFileSync(filePath, "utf8")
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText
  const wrapper = `(function (exports, require, module, __filename, __dirname) {\n${code}\n})`
  const compiled = vm.runInThisContext(wrapper, { filename: filePath })
  const mod = { exports: {} }
  compiled(mod.exports, require, mod, filePath, path.dirname(filePath))
  return mod.exports
}

const transfer = loadTransferModule()
const ORIGIN = "https://masterfilepro.com"
const ROOM = "ABCDEFGHJK"

function createTransferHookHarness() {
  const refs = []
  const state = []
  const peers = []
  const createdBlobs = []
  let refIndex = 0
  let stateIndex = 0
  let cleanup
  let estimateImpl = async () => ({ quota: 1024 ** 3, usage: 0 })
  let hook

  const react = {
    useCallback: (callback) => callback,
    useEffect: (callback) => { cleanup = callback() },
    useRef: (initial) => {
      const index = refIndex++
      return refs[index] || (refs[index] = { current: initial })
    },
    useState: (initial) => {
      const index = stateIndex++
      if (!(index in state)) state[index] = initial
      return [state[index], (next) => {
        state[index] = typeof next === "function" ? next(state[index]) : next
      }]
    },
  }

  class MockConnection {
    constructor() {
      this.open = false
      this.handlers = new Map()
      this.messages = []
      this.dataChannel = { readyState: "open", bufferedAmount: 0 }
      this.peerConnection = { getStats: async () => new Map() }
    }
    on(event, callback) { this.handlers.set(event, callback) }
    emit(event, value) { this.handlers.get(event)?.(value) }
    send(value) { this.messages.push(value) }
    close() { this.open = false; this.emit("close") }
  }

  class MockPeer {
    constructor() {
      this.handlers = new Map()
      this.destroyed = false
      this.open = false
      this.connection = null
      peers.push(this)
    }
    on(event, callback) { this.handlers.set(event, callback) }
    emit(event, value) {
      if (event === "open") this.open = true
      this.handlers.get(event)?.(value)
    }
    connect() {
      this.connection = new MockConnection()
      return this.connection
    }
    destroy() { this.destroyed = true }
  }

  class MockURL extends URL {
    static createObjectURL(blob) {
      createdBlobs.push(blob)
      return `blob:transfer-test-${createdBlobs.length}`
    }
    static revokeObjectURL() {}
  }

  const filePath = path.resolve(__dirname, "../src/useFileTransfer.ts")
  const source = fs.readFileSync(filePath, "utf8")
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText.replaceAll("import.meta", "({ env: {} })")
  const module = { exports: {} }
  const context = {
    exports: module.exports,
    module,
    require: (id) => {
      if (id === "react") return react
      if (id === "peerjs") return { __esModule: true, default: MockPeer }
      if (id === "./fileTransfer") {
        return { ...transfer, getTransferIceServers: async () => ({ servers: [], relayMode: "none" }) }
      }
      return require(id)
    },
    window: {
      isSecureContext: false,
      innerWidth: 1280,
      innerHeight: 800,
      location: { origin: ORIGIN },
      matchMedia: () => ({ matches: false }),
    },
    navigator: { storage: { estimate: (...args) => estimateImpl(...args) } },
    process: { env: {} },
    crypto: crypto.webcrypto,
    File,
    Blob,
    URL: MockURL,
    ArrayBuffer,
    Uint8Array,
    DataView,
    TextEncoder,
    AbortController,
    performance,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
  }
  vm.runInNewContext(`(function (exports, require, module) {\n${code}\n})`, context, { filename: filePath })(
    module.exports,
    context.require,
    module,
  )

  function render() {
    refIndex = 0
    stateIndex = 0
    hook = module.exports.default()
    return hook
  }

  render()

  async function openRoom(code = ROOM) {
    await hook.joinRoom(code)
    render()
    const peer = peers.at(-1)
    if (!peer) throw new Error(`Transfer room did not start: ${hook.error}`)
    peer.emit("open")
    const connection = peer.connection
    if (!connection) throw new Error(`Transfer room did not connect: ${hook.error}`)
    connection.open = true
    connection.emit("open")
    return connection
  }

  async function flush() {
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  function offer(connection, value) {
    connection.emit("data", transfer.serializeTransferMessage({ v: 1, type: "file-offer", offer: value }))
  }

  function chunk(connection, value) {
    connection.emit("data", transfer.encodeTransferChunk(new TextEncoder().encode(value)))
  }

  function end(connection, transferId) {
    connection.emit("data", transfer.serializeTransferMessage({ v: 1, type: "file-end", transferId }))
  }

  return {
    render,
    openRoom,
    flush,
    offer,
    chunk,
    end,
    createdBlobs,
    get api() { return hook },
    setEstimate(value) { estimateImpl = value },
    cleanup() { cleanup?.() },
  }
}

const FILE_OFFER = { transferId: "one", name: "file.txt", size: 5, mime: "text/plain", lastModified: 1 }

test("room codes normalize to the pairing alphabet and round-trip through QR URLs", () => {
  const code = transfer.createRoomCode()
  assert.match(code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{10}$/)
  assert.notEqual(transfer.createRoomCode(), code)
  assert.equal(transfer.normalizeRoomCode(" abcd-efghjk "), ROOM)
  assert.equal(transfer.formatRoomCode(ROOM), "ABCDE-FGHJK")
  assert.equal(transfer.getHostPeerId(ROOM), `mpdrop-${ROOM}`)

  const url = transfer.buildPairingUrl(ROOM, ORIGIN)
  assert.equal(url, `${ORIGIN}/#transfer?room=${ROOM}&receive=1`)
  assert.equal(transfer.parsePairingUrl(url, ORIGIN), ROOM)
  assert.equal(transfer.parsePairingUrl(url, "https://example.com"), null)
  assert.equal(transfer.parsePairingUrl(`${ORIGIN}/#qr?room=${ROOM}`, ORIGIN), null)
  assert.equal(transfer.parsePairingUrl(`${ORIGIN}/#transfer?room=SHORT`, ORIGIN), null)
})

test("the file limit is exactly 1 GiB and rejects unsafe sizes", () => {
  assert.equal(transfer.MAX_FILE_BYTES, 1024 ** 3)
  assert.equal(transfer.validateFileSize(0), null)
  assert.equal(transfer.validateFileSize(1024 ** 3), null)
  assert.match(transfer.validateFileSize(1024 ** 3 + 1), /1 GB/)
  assert.match(transfer.validateFileSize(-1), /not valid/)
  assert.match(transfer.validateFileSize(Number.MAX_SAFE_INTEGER + 1), /not valid/)
  assert.equal(transfer.formatBytes(1024 ** 3), "1.00 GB")
})

test("file offers strip control characters and reject oversized or malformed metadata", () => {
  const offer = transfer.validateFileOffer({
    transferId: "transfer-1",
    name: "report\u0000.txt",
    size: 1024,
    mime: "text/plain",
    lastModified: 123,
  })
  assert.equal(offer.name, "report_.txt")
  assert.equal(transfer.validateFileOffer({ ...offer, size: transfer.MAX_FILE_BYTES + 1 }), null)
  assert.equal(transfer.validateFileOffer({ ...offer, transferId: "" }), null)
  assert.equal(transfer.validateFileOffer({ ...offer, lastModified: -1 }), null)
  assert.equal(transfer.validateFileOffer({ ...offer, mime: "x".repeat(256) }), null)
})

test("CRC32 matches the standard check value and detects chunk corruption", () => {
  const bytes = new TextEncoder().encode("123456789")
  assert.equal(transfer.crc32(bytes), 0xcbf43926)
  const frame = transfer.encodeTransferChunk(bytes)
  assert.equal(frame.byteLength, bytes.length + 4)
  const decoded = transfer.decodeTransferChunk(frame)
  assert.equal(decoded.valid, true)
  assert.deepEqual(Array.from(decoded.data), Array.from(bytes))
  const corrupted = frame.slice(0)
  new Uint8Array(corrupted)[4] ^= 1
  assert.equal(transfer.decodeTransferChunk(corrupted).valid, false)
  assert.equal(transfer.decodeTransferChunk(new ArrayBuffer(3)), null)
  assert.equal(transfer.decodeTransferChunk(new Uint8Array(transfer.CHUNK_SIZE + 5).buffer), null)
})

test("control messages accept only complete versioned protocol values", () => {
  const hello = { v: 1, type: "session-hello", role: "receive", deviceName: "Phone · 1A2B" }
  assert.deepEqual(transfer.parseTransferMessage(JSON.stringify(hello)), hello)
  assert.equal(transfer.parseTransferMessage(JSON.stringify({ ...hello, v: 2 })), null)
  assert.equal(transfer.parseTransferMessage(JSON.stringify({ ...hello, role: "host" })), null)
  assert.equal(transfer.parseTransferMessage(JSON.stringify({ v: 1, type: "unknown" })), null)
  assert.equal(transfer.parseTransferMessage("x".repeat(17 * 1024)), null)

  const offer = { transferId: "one", name: "file.txt", size: 5, mime: "text/plain", lastModified: 1 }
  const message = { v: 1, type: "file-offer", offer }
  assert.deepEqual(transfer.parseTransferMessage(JSON.stringify(message)), message)
  assert.equal(transfer.parseTransferMessage(JSON.stringify({ ...message, offer: { ...offer, size: -1 } })), null)
  assert.equal(transfer.parseTransferMessage(JSON.stringify({ v: 1, type: "chunk-ack", transferId: "one", bytes: -1 })), null)
  assert.equal(transfer.parseTransferMessage(JSON.stringify({ v: 1, type: "file-response", transferId: "one", accepted: "yes" })), null)
})

test("Open Relay credentials use the documented one-hour REST HMAC format", async () => {
  const now = 1_800_000_000_000
  const servers = await transfer.createOpenRelayIceServers(now)
  const username = String(Math.floor(now / 1000) + 3600)
  const expected = crypto.createHmac("sha1", "openrelayprojectsecret").update(username).digest("base64")
  assert.equal(servers.length, 1)
  assert.equal(servers[0].username, username)
  assert.equal(servers[0].credential, expected)
  assert.ok(servers[0].urls.some((url) => url.startsWith("turns:")))
  assert.ok(servers[0].urls.some((url) => url.includes("transport=tcp")))
})

test("the default relay is disclosed as community capacity and includes STUN", async () => {
  const result = await transfer.getTransferIceServers({ now: 1_800_000_000_000 })
  assert.equal(result.relayMode, "community")
  assert.equal(result.servers.length, 3)
  assert.ok(result.servers.some((server) => String(server.urls).startsWith("stun:")))
  assert.ok(result.servers.some((server) => String(server.urls).includes("openrelay")))
})

test("private TURN accepts short-lived endpoint credentials and rejects insecure endpoints", async () => {
  const previousWindow = global.window
  global.window = { location: { origin: ORIGIN } }
  try {
    const result = await transfer.getTransferIceServers({
      credentialsUrl: "/api/turn",
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({ iceServers: [{ urls: ["turn:turn.example.com:3478"], username: "short", credential: "token" }] }),
      }),
    })
    assert.equal(result.relayMode, "private")
    assert.equal(result.servers.length, 3)

    const insecure = await transfer.getTransferIceServers({
      credentialsUrl: "http://turn.example.com/credentials",
      fetchImpl: async () => { throw new Error("should not fetch") },
    })
    assert.equal(insecure.relayMode, "none")
    assert.match(insecure.warning, /HTTPS/)
  } finally {
    global.window = previousWindow
  }
})

test("incomplete or invalid TURN configuration falls back to direct STUN", async () => {
  const incomplete = await transfer.getTransferIceServers({ urls: "turn:example.com" })
  assert.equal(incomplete.relayMode, "none")
  assert.match(incomplete.warning, /incomplete/)

  const invalid = await transfer.getTransferIceServers({
    urls: "https://example.com",
    username: "user",
    credential: "secret",
  })
  assert.equal(invalid.relayMode, "none")
  assert.match(invalid.warning, /invalid/)
})

test("transfer integration bypasses the generic 25 MB tool pipeline", () => {
  const app = fs.readFileSync(path.resolve(__dirname, "../src/App.tsx"), "utf8")
  const component = fs.readFileSync(path.resolve(__dirname, "../src/FileTransferTool.tsx"), "utf8")
  const hook = fs.readFileSync(path.resolve(__dirname, "../src/useFileTransfer.ts"), "utf8")
  assert.match(app, /pageRoute === "transfer"/)
  assert.match(app, /<FileTransferTool/)
  assert.match(component, /1 GB/)
  assert.match(hook, /serialization: "raw"/)
  assert.match(hook, /navigator\.storage\.getDirectory/)
  assert.match(hook, /createWritable/)
  assert.match(hook, /getConnectionPath/)
})

test("cancelling a receive discards queued chunks without closing the room", async () => {
  const harness = createTransferHookHarness()
  const connection = await harness.openRoom()
  harness.offer(connection, { ...FILE_OFFER, size: 10 })
  await harness.flush()
  await harness.api.respondToOffer(true)

  harness.chunk(connection, "hello")
  harness.api.cancelTransfer(FILE_OFFER.transferId)
  harness.chunk(connection, "world")
  harness.end(connection, FILE_OFFER.transferId)
  await harness.flush()

  assert.equal(connection.open, true)
  assert.equal(connection.messages.some((message) => JSON.parse(message).type === "session-end"), false)

  harness.offer(connection, { ...FILE_OFFER, transferId: "two" })
  await harness.flush()
  await harness.api.respondToOffer(true)
  harness.chunk(connection, "fresh")
  harness.end(connection, "two")
  await harness.flush()

  const latest = harness.render()
  assert.equal(latest.received.length, 1)
  assert.equal(await harness.createdBlobs[0].text(), "fresh")
  harness.cleanup()
})

test("queued chunks from a previous room cannot write into a new receive", async () => {
  const harness = createTransferHookHarness()
  const oldConnection = await harness.openRoom()
  harness.offer(oldConnection, FILE_OFFER)
  await harness.flush()
  await harness.api.respondToOffer(true)
  harness.chunk(oldConnection, "stale")
  harness.api.leaveRoom()

  const newConnection = await harness.openRoom("KLMNPQRSTU")
  harness.offer(newConnection, { ...FILE_OFFER, transferId: "new-room-file" })
  await harness.flush()
  await harness.api.respondToOffer(true)
  harness.chunk(newConnection, "fresh")
  harness.end(newConnection, "new-room-file")
  await harness.flush()

  const latest = harness.render()
  assert.equal(latest.received.length, 1)
  assert.equal(await harness.createdBlobs[0].text(), "fresh")
  harness.cleanup()
})

test("a stale accept preparation cannot install a receiver in a new room", async () => {
  const harness = createTransferHookHarness()
  let resolveOldEstimate
  let estimateCalls = 0
  harness.setEstimate(async () => {
    estimateCalls += 1
    if (estimateCalls === 1) {
      return new Promise((resolve) => { resolveOldEstimate = resolve })
    }
    return { quota: 1024 ** 3, usage: 0 }
  })

  const oldConnection = await harness.openRoom()
  harness.offer(oldConnection, FILE_OFFER)
  await harness.flush()
  const staleAccept = harness.api.respondToOffer(true)
  harness.api.leaveRoom()

  const newConnection = await harness.openRoom("KLMNPQRSTU")
  harness.offer(newConnection, { ...FILE_OFFER, transferId: "new-room-file" })
  await harness.flush()
  await harness.api.respondToOffer(true)
  resolveOldEstimate({ quota: 1024 ** 3, usage: 0 })
  await staleAccept
  await harness.flush()

  assert.equal(newConnection.messages.some((message) => {
    const parsed = JSON.parse(message)
    return parsed.type === "file-response" && parsed.transferId === FILE_OFFER.transferId
  }), false)

  harness.chunk(newConnection, "fresh")
  harness.end(newConnection, "new-room-file")
  await harness.flush()
  assert.equal(await harness.createdBlobs[0].text(), "fresh")
  harness.cleanup()
})
