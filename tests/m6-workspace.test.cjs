const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

// Global transpile cache for rapid in-memory test execution
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
            // Return live transpiled services module
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
// SUITE 1: React Route Mounting & UI Wireframe Verification (Tiers 1 & 2)
// ============================================================================

test("M6 Suite 1: Route #audio-text mounts active UI without 404 or Coming soon", () => {
  const { load } = createDOMEnv("audio-text")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.ok(html.length > 500, "HTML length must be > 500 characters")
  assert.ok(!html.includes("404 · A SMALL DETOUR"), "Must not render 404 page")
  assert.ok(!html.includes("Coming soon"), "Must not render Coming soon fallback")
  assert.match(html, /Audio to Text/, "Must display tool heading")
  assert.match(html, /dropzone|Record Mic|recording/i, "Must contain active audio inputs")
})

test("M6 Suite 1: Route #audio-text strictly preserves verbatim 'Backend not connected' invariant", () => {
  const { load } = createDOMEnv("audio-text")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  // CRITICAL REGRESSION INVARIANT per workspace.test.cjs:129 & stress-m1.test.cjs:436
  assert.match(
    html,
    /Backend not connected/,
    "Must preserve verbatim 'Backend not connected' on initial render",
  )
  assert.match(
    html,
    /Local in-browser speech engine and offline audio processor are active/,
    "Must explain client-side fallback availability",
  )
})

test("M6 Suite 1: Route #documents mounts active repository layout with stats & toolbar", () => {
  const { load } = createDOMEnv("documents")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.ok(html.length > 500, "HTML length must be > 500 characters")
  assert.ok(!html.includes("404 · A SMALL DETOUR"), "Must not render 404 page")
  assert.ok(!html.includes("Coming soon"), "Must not render Coming soon fallback")
  assert.match(html, /My Documents/i, "Must display tool heading")
  assert.match(html, /Total Documents/i, "Must display document repository stats")
  assert.match(html, /Search documents/i, "Must contain search input")
  assert.match(html, /Upload Document/i, "Must contain upload button")
})

test("M6 Suite 1: Route #meetings mounts active Virtual Meeting Studio", () => {
  const { load } = createDOMEnv("meetings")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.ok(html.length > 500, "HTML length must be > 500 characters")
  assert.ok(!html.includes("404 · A SMALL DETOUR"), "Must not render 404 page")
  assert.ok(!html.includes("Coming soon"), "Must not render Coming soon fallback")
  assert.match(html, /Video Meetings/i, "Must display tool heading")
  assert.match(html, /Virtual Meeting Studio/i, "Must display studio title")
  assert.match(html, /Mute Mic|Unmute Mic/i, "Must contain microphone controls")
  assert.match(html, /Turn (On|Off) Camera/i, "Must contain camera controls")
  assert.match(html, /Share Screen/i, "Must contain screen share controls")
  assert.match(html, /Start Meeting/i, "Must contain start meeting button")
})

test("M6 Suite 1: Route #whiteboards mounts active Whiteboard Canvas with full toolbar", () => {
  const { load } = createDOMEnv("whiteboards")
  const App = load("App").default
  const html = renderToStaticMarkup(React.createElement(App))

  assert.ok(html.length > 500, "HTML length must be > 500 characters")
  assert.ok(!html.includes("404 · A SMALL DETOUR"), "Must not render 404 page")
  assert.ok(!html.includes("Coming soon"), "Must not render Coming soon fallback")
  assert.match(html, /Whiteboards/i, "Must display tool heading")
  assert.match(html, /<canvas/i, "Must render HTML5 canvas element")
  assert.match(html, /Pen/i, "Must contain freehand Pen tool")
  assert.match(html, /Eraser/i, "Must contain Eraser tool")
  assert.match(html, /Export PNG/i, "Must contain Export PNG button")
  assert.match(html, /Clear Board/i, "Must contain Clear Board button")
})

// ============================================================================
// SUITE 2: Audio Analysis & Speech Fallback Processing Engine
// ============================================================================

test("M6 Suite 2: RIFF/WAV binary header parser extracts duration, rate, channels", () => {
  const services = loadServices()
  const { parseWavHeader } = services

  // Construct valid 44-byte WAV header in memory with 1 second of stereo audio
  const buffer = new Uint8Array(44 + 88200)
  const view = new DataView(buffer.buffer)
  // 'RIFF'
  buffer.set([0x52, 0x49, 0x46, 0x46], 0)
  view.setUint32(4, 36 + 88200, true)
  // 'WAVE'
  buffer.set([0x57, 0x41, 0x56, 0x45], 8)
  // 'fmt '
  buffer.set([0x66, 0x6d, 0x74, 0x20], 12)
  view.setUint32(16, 16, true) // PCM chunk size
  view.setUint16(20, 1, true) // PCM format
  view.setUint16(22, 2, true) // 2 channels (stereo)
  view.setUint32(24, 44100, true) // sample rate
  view.setUint32(28, 44100 * 2 * 2, true) // byte rate (176400)
  view.setUint16(32, 4, true) // block align
  view.setUint16(34, 16, true) // bits per sample
  // 'data'
  buffer.set([0x64, 0x61, 0x74, 0x61], 36)
  view.setUint32(40, 88200, true) // data size = 88200 bytes = 0.5s stereo @ 176400 B/s

  const metadata = parseWavHeader(buffer.buffer)
  assert.equal(metadata.channels, 2)
  assert.equal(metadata.sampleRate, 44100)
  assert.equal(metadata.bitsPerSample, 16)
  assert.equal(metadata.dataSize, 88200)
  assert.equal(Number(metadata.duration.toFixed(1)), 0.5)
})

test("M6 Suite 2: MP3 frame header parser detects bitrate and estimates duration", () => {
  const services = loadServices()
  const { parseMp3Header } = services

  // Construct minimal MP3 sync word frame (0xFF 0xFB) @ 128 kbps
  const buffer = new Uint8Array(16000)
  buffer[0] = 0xff
  buffer[1] = 0xfb // MPEG-1 Layer 3, no CRC
  buffer[2] = 0x90 // 128 kbps bitrate index (9), 44.1 kHz
  buffer[3] = 0x00 // Stereo

  const mp3 = parseMp3Header(buffer.buffer)
  assert.equal(mp3.bitRate, 128)
  assert.equal(mp3.sampleRate, 44100)
  assert.equal(mp3.channels, 2)
  assert.ok(mp3.duration > 0, "Duration must be positive")
  assert.equal(Number(mp3.duration.toFixed(2)), 1.0)
})

test("M6 Suite 2: Peak amplitude downsampler produces normalized 64-bin array", () => {
  const services = loadServices()
  const { computeAudioPeaks } = services

  // Generate synthetic sine wave audio samples (1000 samples)
  const samples = new Float32Array(1000)
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin((i / 1000) * Math.PI * 8) * 0.8
  }

  const peaks = computeAudioPeaks(samples, 64)
  assert.equal(peaks.length, 64)
  assert.ok(peaks.every((p) => p >= 0.05 && p <= 1.0), "All peaks must be normalized between 0.05 and 1.0")
})

test("M6 Suite 2: In-browser transcript generator creates timed segments with speaker diarization", () => {
  const services = loadServices()
  const { generateInBrowserTranscript } = services

  const dummyAnalysis = {
    duration: 12.0,
    sampleRate: 44100,
    channels: 2,
    peaks: Array(64).fill(0.4),
    segments: [
      { startSeconds: 0, endSeconds: 4.0, avgEnergy: 0.6 },
      { startSeconds: 4.0, endSeconds: 8.0, avgEnergy: 0.7 },
      { startSeconds: 8.0, endSeconds: 12.0, avgEnergy: 0.5 },
    ],
  }

  const result = generateInBrowserTranscript(dummyAnalysis, {
    language: "en",
    speakerLabels: true,
    timestamps: true,
  })

  assert.ok(result.text.length > 50, "Transcript text must not be empty")
  assert.equal(result.segments.length, 3)
  assert.equal(result.segments[0].speaker, "Speaker 1")
  assert.equal(result.segments[1].speaker, "Speaker 2")
  assert.equal(result.segments[2].speaker, "Speaker 1")
  assert.match(result.text, /\[Speaker 1\]|Speaker 1:/)
  assert.match(result.text, /\[00:00 - 00:04\]/)
})

test("M6 Suite 2: Subtitle SubRip (SRT) and TXT exporters produce valid timecode format", () => {
  const services = loadServices()
  const { formatSrtTime, formatDisplayTime, exportToSRT, exportToTXT } = services

  // SRT timestamp verification: HH:MM:SS,mmm
  assert.equal(formatSrtTime(0), "00:00:00,000")
  assert.equal(formatSrtTime(65.45), "00:01:05,450")
  assert.equal(formatSrtTime(3661.125), "01:01:01,125")

  // Display time: MM:SS
  assert.equal(formatDisplayTime(0), "00:00")
  assert.equal(formatDisplayTime(95), "01:35")

  const segments = [
    { startSeconds: 0, endSeconds: 2.5, text: "Hello team.", speaker: "Speaker 1" },
    { startSeconds: 3.0, endSeconds: 6.2, text: "Good morning everyone.", speaker: "Speaker 2" },
  ]

  const srt = exportToSRT(segments)
  assert.match(srt, /1\r?\n00:00:00,000 --> 00:00:02,500\r?\n\[Speaker 1\] Hello team\./)
  assert.match(srt, /2\r?\n00:00:03,000 --> 00:00:06,200\r?\n\[Speaker 2\] Good morning everyone\./)

  const txt = exportToTXT(segments, true, true)
  assert.match(txt, /\[00:00 - 00:02\] Speaker 1: Hello team\./)
  assert.match(txt, /\[00:03 - 00:06\] Speaker 2: Good morning everyone\./)
})

test("M6 Suite 2: Multilingual transcript corpus generates valid text for 6 languages", () => {
  const services = loadServices()
  const { generateInBrowserTranscript } = services

  const dummyAnalysis = {
    duration: 8.0,
    sampleRate: 44100,
    channels: 2,
    peaks: Array(64).fill(0.5),
    segments: [
      { startSeconds: 0, endSeconds: 4.0, avgEnergy: 0.6 },
      { startSeconds: 4.0, endSeconds: 8.0, avgEnergy: 0.6 },
    ],
  }

  const langs = ["en", "es", "fr", "de", "zh", "ja"]
  for (const lang of langs) {
    const res = generateInBrowserTranscript(dummyAnalysis, { language: lang })
    assert.equal(res.language, lang)
    assert.ok(res.text.length > 20, `Language ${lang} must produce text`)
  }
})

// ============================================================================
// SUITE 3: My Documents Session Store & File Management
// ============================================================================

test("M6 Suite 3: Document store saves, retrieves, and filters documents", () => {
  const services = loadServices()
  const {
    saveSessionDocument,
    getSessionDocuments,
    deleteSessionDocument,
    clearSessionDocuments,
    filterDocuments,
    detectDocumentCategory,
  } = services

  clearSessionDocuments()

  // Verify category detection
  assert.equal(detectDocumentCategory("contract.pdf"), "pdf")
  assert.equal(detectDocumentCategory("data.xlsx"), "sheets")
  assert.equal(detectDocumentCategory("slides.pptx"), "slides")
  assert.equal(detectDocumentCategory("photo.png"), "images")
  assert.equal(detectDocumentCategory("transcript.srt"), "audio-text")
  assert.equal(detectDocumentCategory("notes.docx"), "docs")

  // Save new documents
  const doc1 = saveSessionDocument({
    name: "Sprint-Design-Spec.pdf",
    toolSource: "Merge PDF",
    rawSize: 1048576, // 1 MB
  })
  assert.equal(doc1.name, "Sprint-Design-Spec.pdf")
  assert.equal(doc1.category, "pdf")
  assert.equal(doc1.size, "1.0 MB")

  const doc2 = saveSessionDocument({
    name: "Customer-Interview.srt",
    toolSource: "Audio to Text",
    rawSize: 32768,
  })
  assert.equal(doc2.category, "audio-text")

  const all = getSessionDocuments()
  assert.ok(all.some((d) => d.id === doc1.id), "Store must contain doc1")
  assert.ok(all.some((d) => d.id === doc2.id), "Store must contain doc2")

  // Search filter
  const searchResults = filterDocuments("Sprint-Design", "all", all)
  assert.equal(searchResults.length, 1)
  assert.equal(searchResults[0].name, "Sprint-Design-Spec.pdf")

  // Category filter
  const pdfs = filterDocuments("", "pdf", all)
  assert.ok(pdfs.every((d) => d.category === "pdf"))

  // Delete
  const deleted = deleteSessionDocument(doc1.id)
  assert.equal(deleted, true)
  const remaining = getSessionDocuments()
  assert.ok(!remaining.some((d) => d.id === doc1.id), "doc1 must be deleted")
})

test("M6 Suite 3: getSampleDocuments seeds 4 starter documents when library is initialized", () => {
  const services = loadServices()
  const { getSampleDocuments } = services

  const samples = getSampleDocuments()
  assert.equal(samples.length, 4)
  assert.equal(samples[0].name, "FluxKit_Quickstart_Guide.pdf")
  assert.equal(samples[1].name, "Quarterly_Financial_Summary.xlsx")
  assert.equal(samples[2].name, "Architecture_Design_Notes.docx")
  assert.equal(samples[3].name, "System_Architecture_Diagram.png")
})

// ============================================================================
// SUITE 4: Video Meetings Simulator State Transitions
// ============================================================================

test("M6 Suite 4: Video meeting room state, chat dispatch, and participant roster", () => {
  const services = loadServices()
  const { createMeetingState, sendChatMessage } = services

  let state = createMeetingState("fluxkit-team-room", "Jamie (Host)")
  assert.equal(state.roomKey, "fluxkit-team-room")
  assert.equal(state.inMeeting, false)
  assert.equal(state.participants.length, 4)
  assert.equal(state.participants[0].name, "Jamie (Host)")
  assert.equal(state.participants[0].role, "Host")
  assert.equal(state.chatMessages.length, 3)

  // Send valid message
  state = sendChatMessage(state, "Jamie", "Welcome everyone to the demo!")
  assert.equal(state.chatMessages.length, 4)
  assert.equal(state.chatMessages[3].sender, "Jamie")
  assert.equal(state.chatMessages[3].text, "Welcome everyone to the demo!")
  assert.ok(state.chatMessages[3].time.length > 0)

  // Reject empty message
  assert.throws(() => sendChatMessage(state, "Jamie", "   "), /empty/i)
})

// ============================================================================
// SUITE 5: Whiteboard Canvas Drawing, Geometry & History Stack
// ============================================================================

test("M6 Suite 5: Whiteboard history stack supports push, undo, redo, and clamping", () => {
  const services = loadServices()
  const { createWhiteboardHistory } = services

  const history = createWhiteboardHistory(5)
  assert.equal(history.canUndo(), false)
  assert.equal(history.canRedo(), false)
  assert.equal(history.getDepth(), 0)

  // Push initial snapshot
  history.push("snapshot-0")
  assert.equal(history.canUndo(), false, "Depth 1 has nothing to undo to")
  assert.equal(history.getDepth(), 1)

  // Push second snapshot
  history.push("snapshot-1")
  assert.equal(history.canUndo(), true)
  assert.equal(history.canRedo(), false)

  // Push third snapshot
  history.push("snapshot-2")
  assert.equal(history.getDepth(), 3)

  // Undo
  const undoResult = history.undo()
  assert.equal(undoResult, "snapshot-1")
  assert.equal(history.canUndo(), true)
  assert.equal(history.canRedo(), true)

  // Redo
  const redoResult = history.redo()
  assert.equal(redoResult, "snapshot-2")
  assert.equal(history.canRedo(), false)

  // Branching: Undo then new Push truncates future redo states
  history.undo() // back to snapshot-1
  assert.equal(history.canRedo(), true)
  history.push("snapshot-branch-new")
  assert.equal(history.canRedo(), false, "Redo stack must be cleared on new branch")

  // Clamping at maxDepth (5)
  for (let i = 0; i < 10; i++) {
    history.push(`overflow-${i}`)
  }
  assert.ok(history.getDepth() <= 5, "Depth must be clamped at maxDepth 5")

  // Clear
  history.clear()
  assert.equal(history.getDepth(), 0)
  assert.equal(history.canUndo(), false)
  assert.equal(history.canRedo(), false)
})

// ============================================================================
// SUITE 6: Adversarial, Boundary & Stress Invariants
// ============================================================================

test("M6 Suite 6: Rapid route cycling across all 4 M6 routes (10 cycles)", () => {
  const routes = ["audio-text", "documents", "meetings", "whiteboards"]
  for (let cycle = 0; cycle < 10; cycle++) {
    const targetRoute = routes[cycle % routes.length]
    const { load } = createDOMEnv(targetRoute)
    const App = load("App").default
    const html = renderToStaticMarkup(React.createElement(App))
    assert.ok(html.length > 500, `Cycle ${cycle} route ${targetRoute} must render`)
    assert.ok(!html.includes("404 · A SMALL DETOUR"))
  }
})

test("M6 Suite 6: Corrupt / truncated audio buffer parsing does not throw fatal uncaught errors", async () => {
  const services = loadServices()
  const { parseWavHeader, parseMp3Header, analyzeAudioFile } = services

  // 1. Truncated buffer for parseWavHeader throws clean error
  assert.throws(() => parseWavHeader(new ArrayBuffer(10)), /Invalid WAV file/)

  // 2. Corrupt buffer for analyzeAudioFile handles gracefully without rejection
  const corruptFile = new File([new Uint8Array([1, 2, 3, 4, 5])], "corrupt.mp3", {
    type: "audio/mp3",
  })
  const analysis = await analyzeAudioFile(corruptFile)
  assert.ok(analysis.duration > 0)
  assert.equal(analysis.peaks.length, 64)
  assert.ok(analysis.segments.length > 0)
})

test("M6 Suite 6: Document filter handles hostile regex characters safely", () => {
  const services = loadServices()
  const { filterDocuments } = services

  const docs = [
    { id: "1", name: "Report [2026] + Special (v1).pdf", toolSource: "PDF", category: "pdf", size: "1 MB", time: "10:00 AM" },
  ]

  // Hostile regex characters: [, ], +, *, (, ), ?
  const results = filterDocuments("[2026]", "all", docs)
  assert.equal(results.length, 1)
  assert.equal(results[0].id, "1")

  const plusResults = filterDocuments("+", "all", docs)
  assert.equal(plusResults.length, 1)
})
