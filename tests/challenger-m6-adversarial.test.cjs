const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

// Global transpile cache
const transpileCache = new Map()

function getTranspiled(full) {
  if (transpileCache.has(full)) return transpileCache.get(full)
  const filename = fs.existsSync(full + ".tsx") ? full + ".tsx" : full + ".ts"
  const raw = fs.readFileSync(filename, "utf8")
  const code = ts.transpileModule(raw, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText.replace(/import\.meta\.env/g, "process.env")
  const result = { code, filename }
  transpileCache.set(full, result)
  return result
}

function createDOMEnv(initialHash = "overview") {
  const moduleCache = new Map()
  const storage = new Map()
  const mockLocation = { hash: `#${initialHash}` }

  const mockLocalStorage = {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, val) => storage.set(key, String(val)),
    removeItem: (key) => storage.delete(key),
    clear: () => storage.clear(),
  }

  const mockDocument = {
    createElement: (tag) => {
      let href = ""
      let download = ""
      return {
        get href() {
          return href
        },
        set href(v) {
          href = v
        },
        get download() {
          return download
        },
        set download(v) {
          download = v
        },
        click: () => {},
        getContext: () => ({
          fillRect: () => {},
          clearRect: () => {},
          beginPath: () => {},
          moveTo: () => {},
          lineTo: () => {},
          stroke: () => {},
          strokeRect: () => {},
          arc: () => {},
          fillText: () => {},
          drawImage: () => {},
          getImageData: () => ({ data: new Uint8ClampedArray(4) }),
          putImageData: () => {},
        }),
        toDataURL: () => "data:image/png;base64,mockPng",
      }
    },
    addEventListener: () => {},
    removeEventListener: () => {},
    documentElement: {
      dataset: {},
      style: { setProperty: () => {} },
    },
  }

  function load(name) {
    const full = path.resolve("src", name)
    if (moduleCache.has(full)) return moduleCache.get(full)
    const { code, filename } = getTranspiled(full)
    const exports = {}
    moduleCache.set(full, exports)

    vm.runInNewContext(
      code,
      {
        exports,
        require: (id) => {
          if (id === "./services") {
            return load("services")
          }
          return id.startsWith(".")
            ? load(
                path.relative(
                  path.resolve("src"),
                  path.resolve(path.dirname(full), id),
                ),
              )
            : require(id)
        },
        process: { env: {} },
        location: mockLocation,
        localStorage: mockLocalStorage,
        sessionStorage: mockLocalStorage,
        window: {
          localStorage: mockLocalStorage,
          sessionStorage: mockLocalStorage,
          location: mockLocation,
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => {},
          scrollTo: () => {},
        },
        document: mockDocument,
        navigator: {
          clipboard: { writeText: async () => {} },
          mediaDevices: { getUserMedia: async () => ({ getTracks: () => [] }) },
        },
        Blob,
        File,
        URL,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        CustomEvent: class CustomEvent {
          constructor(type, init) {
            this.type = type
            this.detail = init?.detail
          }
        },
        AbortSignal,
        DOMException,
      },
      { filename },
    )
    return exports
  }

  return { load, storage }
}

function loadServices() {
  const { load } = createDOMEnv()
  return load("services")
}

// ============================================================================
// CHALLENGE 1: Audio to Text (Tool #18) Binary Parsers & Transcriber Stress
// ============================================================================

test("Challenger M6: WAV binary header parser handles multi-chunk, 8-bit mono & high sample rates", () => {
  const services = loadServices()
  const { parseWavHeader } = services

  // 1. Multi-chunk WAV: fmt chunk followed by JUNK metadata chunk, then data chunk
  // Total size: 12 (RIFF+WAVE) + 24 (fmt) + 16 (JUNK) + 8 (data header) + 44100 (data) = 44160
  const buffer = new Uint8Array(44160)
  const view = new DataView(buffer.buffer)
  
  // RIFF header
  buffer.set([0x52, 0x49, 0x46, 0x46], 0)
  view.setUint32(4, 44160 - 8, true)
  buffer.set([0x57, 0x41, 0x56, 0x45], 8)

  // fmt chunk at offset 12
  buffer.set([0x66, 0x6d, 0x74, 0x20], 12)
  view.setUint32(16, 16, true) // size 16
  view.setUint16(20, 1, true)  // PCM
  view.setUint16(22, 1, true)  // 1 channel (mono)
  view.setUint32(24, 22050, true) // 22.05 kHz
  view.setUint32(28, 22050, true) // byte rate (22050 B/s for 8-bit mono)
  view.setUint16(32, 1, true)  // block align 1
  view.setUint16(34, 8, true)  // 8 bits per sample

  // JUNK chunk at offset 36 (size 8 bytes)
  buffer.set([0x4a, 0x55, 0x4e, 0x4b], 36) // 'JUNK'
  view.setUint32(40, 8, true) // size 8
  // junk payload at 44..51

  // data chunk at offset 52
  buffer.set([0x64, 0x61, 0x74, 0x61], 52)
  view.setUint32(56, 44100, true) // 44100 bytes of data = 2.0 seconds @ 22050 B/s

  const parsed = parseWavHeader(buffer.buffer)
  assert.equal(parsed.channels, 1, "Must detect mono channel")
  assert.equal(parsed.sampleRate, 22050, "Must detect 22050 sample rate")
  assert.equal(parsed.bitsPerSample, 8, "Must detect 8 bits per sample")
  assert.equal(parsed.dataSize, 44100, "Must detect data size skipping JUNK chunk")
  assert.equal(Number(parsed.duration.toFixed(1)), 2.0, "Must accurately compute 2.0s duration")
})

test("Challenger M6: WAV parser strictly validates header boundaries and throws clean errors", () => {
  const services = loadServices()
  const { parseWavHeader } = services

  // Buffer < 44 bytes
  assert.throws(() => parseWavHeader(new ArrayBuffer(43)), /buffer too small/i)
  assert.throws(() => parseWavHeader(new ArrayBuffer(0)), /buffer too small/i)

  // Corrupt magic words
  const badRiff = new Uint8Array(50)
  badRiff.set([0x46, 0x41, 0x4b, 0x45], 0) // "FAKE"
  assert.throws(() => parseWavHeader(badRiff.buffer), /Missing RIFF or WAVE/i)
})

test("Challenger M6: MP3 frame parser parses ID3v2 tags and varied bitrates", () => {
  const services = loadServices()
  const { parseMp3Header } = services

  // Construct MP3 with 64-byte ID3v2 tag prefix
  const id3TagSize = 64
  const totalSize = 10 + id3TagSize + 8000
  const buffer = new Uint8Array(totalSize)

  // ID3 header: 'ID3', ver 3.0, flags 0, synchsafe size 64
  buffer[0] = 0x49
  buffer[1] = 0x44
  buffer[2] = 0x33
  buffer[3] = 3
  buffer[4] = 0
  buffer[5] = 0
  // synchsafe integer for 64
  buffer[6] = 0
  buffer[7] = 0
  buffer[8] = 0
  buffer[9] = 64

  // MP3 Sync frame at offset 10 + 64 = 74
  const frameOffset = 74
  buffer[frameOffset] = 0xff
  buffer[frameOffset + 1] = 0xfb // MPEG-1 Layer 3
  buffer[frameOffset + 2] = 0x50 // 0101 (64 kbps), 00 (44.1 kHz)
  buffer[frameOffset + 3] = 0xc0 // 11000000 -> channelMode = 3 (Single channel / Mono)

  const parsed = parseMp3Header(buffer.buffer)
  assert.equal(parsed.bitRate, 64, "Must detect 64 kbps")
  assert.equal(parsed.sampleRate, 44100, "Must detect 44.1 kHz")
  assert.equal(parsed.channels, 1, "Must detect mono channelMode 3")
  assert.ok(parsed.duration > 0, "Duration must be positive")
})

test("Challenger M6: Audio peak calculation and segment detection handle extreme inputs", () => {
  const services = loadServices()
  const { computeAudioPeaks, detectAudioSegments } = services

  // 1. Extreme zero array
  const zeros = new Float32Array(500)
  const zeroPeaks = computeAudioPeaks(zeros, 64)
  assert.equal(zeroPeaks.length, 64)
  assert.ok(zeroPeaks.every((p) => p >= 0.08 && p <= 1.0), "Normalized minimum floor respected")

  // 2. Extreme saturated values
  const saturated = new Float32Array(1000).fill(10.0)
  const satPeaks = computeAudioPeaks(saturated, 32)
  assert.equal(satPeaks.length, 32)
  assert.ok(satPeaks.every((p) => p <= 1.0), "Normalized maximum ceiling respected")

  // 3. Segment detection on short (0.5s) and long (3600s) audio
  const shortSegs = detectAudioSegments(Array(64).fill(0.5), 0.5)
  assert.ok(shortSegs.length >= 1)
  assert.equal(shortSegs[0].startSeconds, 0)
  assert.ok(shortSegs[0].endSeconds <= 1.0)

  const longSegs = detectAudioSegments(Array(64).fill(0.5), 3600)
  assert.ok(longSegs.length <= 12, "Max 12 segments per spec")
  assert.equal(longSegs[longSegs.length - 1].endSeconds, 3600)
})

test("Challenger M6: Subtitle SRT and TXT formatting handle timestamp edge cases", () => {
  const services = loadServices()
  const { formatSrtTime, exportToSRT, exportToTXT } = services

  // SRT millisecond padding and hour rollover
  assert.equal(formatSrtTime(0.005), "00:00:00,005")
  assert.equal(formatSrtTime(0.09), "00:00:00,090")
  assert.equal(formatSrtTime(3661.125), "01:01:01,125")
  // Verified integer millisecond conversion Math.floor(safeSeconds * 1000) % 1000 resolves IEEE 754 rounding
  assert.equal(formatSrtTime(7265.123), "02:01:05,123")

  const segments = [
    { startSeconds: 0, endSeconds: 5, text: "Testing <script>alert(1)</script>", speaker: "Speaker 1" },
    { startSeconds: 5.5, endSeconds: 10, text: "Special chars: & \" ' / 🚀", speaker: "Speaker 2" },
  ]

  const srt = exportToSRT(segments)
  assert.match(srt, /00:00:00,000 --> 00:00:05,000/)
  assert.match(srt, /\[Speaker 1\] Testing <script>alert\(1\)<\/script>/)
  assert.match(srt, /Special chars: & " ' \/ 🚀/)

  const txt = exportToTXT(segments, true, true)
  assert.match(txt, /\[00:00 - 00:05\] Speaker 1:/)
  assert.match(txt, /Speaker 2: Special chars/)
})

test("Challenger M6: Route #audio-text strictly preserves verbatim 'Backend not connected' on initial mount", () => {
  const { load } = createDOMEnv("audio-text")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  // CRITICAL REGRESSION INVARIANT per workspace.test.cjs:129
  assert.match(html, /Backend not connected/, "Must display 'Backend not connected' invariant")
  assert.match(html, /dropzone|drag/i, "Must contain active audio dropzone")
  assert.ok(!html.includes("Coming soon"), "Must not display 'Coming soon'")
  assert.ok(!html.includes("404 · A SMALL DETOUR"), "Must not display 404")
})

// ============================================================================
// CHALLENGE 2: Documents Store (Tool #34) CRUD & Filtering Boundaries
// ============================================================================

test("Challenger M6: detectDocumentCategory correctly classifies wide array of file extensions", () => {
  const services = loadServices()
  const { detectDocumentCategory } = services

  // PDFs
  assert.equal(detectDocumentCategory("doc.pdf"), "pdf")
  assert.equal(detectDocumentCategory("REPORT.PDF"), "pdf")

  // Spreadsheets
  assert.equal(detectDocumentCategory("budget.xlsx"), "sheets")
  assert.equal(detectDocumentCategory("accounts.xls"), "sheets")
  assert.equal(detectDocumentCategory("data.csv"), "sheets")

  // Presentations
  assert.equal(detectDocumentCategory("pitch.pptx"), "slides")
  assert.equal(detectDocumentCategory("slides.ppt"), "slides")

  // Images
  assert.equal(detectDocumentCategory("board.png"), "images")
  assert.equal(detectDocumentCategory("photo.jpg"), "images")
  assert.equal(detectDocumentCategory("art.svg"), "images")

  // Audio / Transcripts
  assert.equal(detectDocumentCategory("meeting.srt"), "audio-text")
  assert.equal(detectDocumentCategory("voice.mp3"), "audio-text")
  assert.equal(detectDocumentCategory("audio.wav"), "audio-text")

  // Text Documents
  assert.equal(detectDocumentCategory("notes.docx"), "docs")
  assert.equal(detectDocumentCategory("memo.doc"), "docs")
  assert.equal(detectDocumentCategory("readme.txt"), "docs")
  assert.equal(detectDocumentCategory("spec.md"), "docs")

  // Other / unknown
  assert.equal(detectDocumentCategory("archive.unknown"), "other")
})

test("Challenger M6 Empirical Finding: detectDocumentCategory toolSource evaluation precedence", () => {
  const services = loadServices()
  const { detectDocumentCategory } = services

  // When no file extension is present, toolSource provides accurate category fallback:
  assert.equal(detectDocumentCategory("whiteboard-export", "Whiteboards"), "images")
  assert.equal(detectDocumentCategory("audio-recording", "Audio to Text"), "audio-text")

  // Verified: file extension takes precedence over toolSource (e.g. 'financials.xlsx' from 'PDF to Excel' is sheets):
  const convertedResult = detectDocumentCategory("financials.xlsx", "PDF to Excel")
  assert.equal(convertedResult, "sheets", "Verified: extension takes precedence over toolSource")
})

test("Challenger M6: Document store saves, persists, and prevents hostile injection attacks", () => {
  const services = loadServices()
  const {
    saveSessionDocument,
    getSessionDocuments,
    deleteSessionDocument,
    clearSessionDocuments,
    filterDocuments,
  } = services

  clearSessionDocuments()

  // 1. Hostile inputs: XSS payload in name, path traversal in toolSource
  const hostileDoc = saveSessionDocument({
    name: '<script>alert("xss")</script>.pdf',
    toolSource: "../../etc/passwd",
    contentSnippet: "Injection test",
  })

  assert.ok(hostileDoc.id.length > 0)
  assert.equal(hostileDoc.category, "pdf")

  let docs = getSessionDocuments()
  assert.ok(docs.some((d) => d.id === hostileDoc.id))

  // 2. Search filtering with regex metacharacters
  const hostileQueries = ["[", "]", "*", "+", "?", "^", "$", "(", ")", "\\"]
  for (const q of hostileQueries) {
    assert.doesNotThrow(() => {
      filterDocuments(q, "all", docs)
    }, `Search query '${q}' must not throw regex error`)
  }

  // 3. Delete operations
  assert.equal(deleteSessionDocument(hostileDoc.id), true)
  assert.equal(deleteSessionDocument("non-existent-id-9999"), false)

  // 4. Clear all and reseed
  clearSessionDocuments()
  const reseeded = getSessionDocuments()
  assert.equal(reseeded.length, 4, "Must reseed 4 starter documents on empty store")
})

test("Challenger M6: Route #documents renders interactive layout with search, category pills & view modes", () => {
  const { load } = createDOMEnv("documents")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /My Documents/i)
  assert.match(html, /Total Documents/i)
  assert.match(html, /Search documents by name or tool source/i)
  assert.match(html, /Upload Document/i)
  assert.match(html, /Clear Library/i)
  assert.match(html, /Table/i)
  assert.match(html, /Grid/i)
  assert.ok(!html.includes("Coming soon"))
  assert.ok(!html.includes("404 · A SMALL DETOUR"))
})

// ============================================================================
// CHALLENGE 3: Video Meetings Simulator (Tool #36) State Machine
// ============================================================================

test("Challenger M6: Meeting state transitions and chat dispatch enforce validation invariants", () => {
  const services = loadServices()
  const { createMeetingState, sendChatMessage } = services

  let state = createMeetingState("demo-room", "Challenger")
  assert.equal(state.roomKey, "demo-room")
  assert.equal(state.inMeeting, false)
  assert.equal(state.micMuted, false)
  assert.equal(state.cameraOff, false)
  assert.equal(state.isScreenSharing, false)
  assert.equal(state.participants.length, 4)
  assert.equal(state.chatMessages.length, 3)

  // Dispatch valid message
  state = sendChatMessage(state, "Challenger", "Hello from empirical challenger!")
  assert.equal(state.chatMessages.length, 4)
  assert.equal(state.chatMessages[3].sender, "Challenger")
  assert.equal(state.chatMessages[3].text, "Hello from empirical challenger!")

  // Empty or whitespace-only messages must be rejected
  assert.throws(() => sendChatMessage(state, "Challenger", ""), /empty/i)
  assert.throws(() => sendChatMessage(state, "Challenger", "    \n\t  "), /empty/i)

  // Long message stress (2000 chars)
  const longMsg = "A".repeat(2000)
  state = sendChatMessage(state, "Challenger", longMsg)
  assert.equal(state.chatMessages.length, 5)
  assert.equal(state.chatMessages[4].text.length, 2000)
})

test("Challenger M6: Route #meetings renders complete meeting studio with media controls & chat", () => {
  const { load } = createDOMEnv("meetings")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /Virtual Meeting Studio/i)
  assert.match(html, /Mute Mic|Unmute Mic/i)
  assert.match(html, /Turn (On|Off) Camera/i)
  assert.match(html, /Share Screen/i)
  assert.match(html, /Start Meeting/i)
  assert.match(html, /Meeting Room Key/i)
  assert.match(html, /Chat \(/i)
  assert.match(html, /People \(4\)/i)
  assert.ok(!html.includes("Coming soon"))
  assert.ok(!html.includes("404 · A SMALL DETOUR"))
})

// ============================================================================
// CHALLENGE 4: Whiteboards Studio (Tool #37) History Stack & Geometry
// ============================================================================

test("Challenger M6: Whiteboard history stack manages branching, overflow and underflow strictly", () => {
  const services = loadServices()
  const { createWhiteboardHistory } = services

  const history = createWhiteboardHistory(10)

  // Underflow checks
  assert.equal(history.canUndo(), false)
  assert.equal(history.canRedo(), false)
  assert.equal(history.undo(), null)
  assert.equal(history.redo(), null)

  // Push single item: depth 1, cannot undo
  history.push("snap-1")
  assert.equal(history.getDepth(), 1)
  assert.equal(history.canUndo(), false)

  // Push second item: depth 2, can undo
  history.push("snap-2")
  assert.equal(history.getDepth(), 2)
  assert.equal(history.canUndo(), true)

  // Push third item
  history.push("snap-3")
  assert.equal(history.getDepth(), 3)

  // Undo to snap-2
  assert.equal(history.undo(), "snap-2")
  assert.equal(history.canRedo(), true)

  // Branching: pushing new snapshot at snap-2 truncates snap-3
  history.push("snap-branch")
  assert.equal(history.canRedo(), false, "Redo must be disabled after branching")
  assert.equal(history.getDepth(), 3) // [snap-1, snap-2, snap-branch]

  // Undo from snap-branch should yield snap-2
  assert.equal(history.undo(), "snap-2")

  // Overflow clamping test: push 50 snapshots on stack with maxDepth=10
  for (let i = 0; i < 50; i++) {
    history.push(`overflow-${i}`)
  }
  assert.equal(history.getDepth(), 10, "Depth must be clamped at exactly 10")
  assert.equal(history.canUndo(), true)

  // Clear resets all
  history.clear()
  assert.equal(history.getDepth(), 0)
  assert.equal(history.canUndo(), false)
  assert.equal(history.canRedo(), false)
})

test("Challenger M6: Route #whiteboards renders canvas surface with full drawing toolkit & export", () => {
  const { load } = createDOMEnv("whiteboards")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.match(html, /<canvas/i)
  assert.match(html, /width="1200"/i)
  assert.match(html, /height="650"/i)
  assert.match(html, /Pen/i)
  assert.match(html, /Line/i)
  assert.match(html, /Rect/i)
  assert.match(html, /Circle/i)
  assert.match(html, /Eraser/i)
  assert.match(html, /Text/i)
  assert.match(html, /Export PNG/i)
  assert.match(html, /Export JPEG/i)
  assert.match(html, /Clear Board/i)
  assert.ok(!html.includes("Coming soon"))
  assert.ok(!html.includes("404 · A SMALL DETOUR"))
})
