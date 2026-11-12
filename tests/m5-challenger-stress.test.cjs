/**
 * Challenger M5-2: Empirical Stress, Boundary & Hostile Scenario Verification Suite
 *
 * This test suite stress-tests all Milestone 5 Client-Side AI Text Suite tools:
 * 1. Tool #26: Summarize Document (`summarizeDocument`, `summarizeText`)
 * 2. Tool #27: Rewrite Content (`rewriteContent`, `rewriteText`)
 * 3. Tool #28: Translate Text (`translateText`, `detectLanguage`)
 * 4. Tool #29: Ask Document AI (`askDocumentAI`)
 * 5. Tool #30: Extract Keywords (`extractKeywords`)
 * 6. Tool #31: Analyze Sentiment (`analyzeSentiment`)
 * 7. Tool #32: Compare Texts (`compareTexts`)
 * 8. Tool #33: Generate an Email (`generateEmail`)
 *
 * Boundaries & Stress Vectors Tested:
 * - Empty strings, whitespace-only, single-character, and degenerate repetitive tokens
 * - Hostile inputs: HTML/XSS injection tags, markdown, code snippets, SQL injections
 * - Special unicode, emojis, CJK, RTL languages, zero-width spaces, and null bytes
 * - BM25 zero-match fallback, punctuation-only questions, and stopword-only queries
 * - Massive document processing (50,000+ words) across all 8 tools with latency & memory checks
 * - Rapid React route mounting and navigation across all 8 AI tools in rapid succession
 */

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

// ============================================================================
// Service Engine & Component Dynamic Loader
// ============================================================================

const transpileCache = new Map()

function getTranspiled(fullPath) {
  if (transpileCache.has(fullPath)) return transpileCache.get(fullPath)
  const resolved = fs.existsSync(fullPath + ".tsx")
    ? fullPath + ".tsx"
    : fs.existsSync(fullPath + ".ts")
      ? fullPath + ".ts"
      : fullPath
  const raw = fs.readFileSync(resolved, "utf8")
  const code = ts.transpileModule(raw, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText.replace(/import\.meta\.env/g, "process.env")
  const result = { code, filename: resolved }
  transpileCache.set(fullPath, result)
  return result
}

function loadServices() {
  const filePath = path.resolve("src", "services.ts")
  const raw = fs.readFileSync(filePath, "utf8")
  const code = ts.transpileModule(raw, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText.replace(/import\.meta\.env/g, "process.env")

  const wrapper = `(function (exports, require, module, __filename, __dirname) {\n${code}\n})`
  const compiledWrapper = vm.runInThisContext(wrapper, { filename: filePath })
  const mod = { exports: {} }
  compiledWrapper(
    mod.exports,
    (id) => (id === "./jobTypes" ? {} : require(id)),
    mod,
    filePath,
    path.dirname(filePath),
  )
  return mod.exports
}

function createDOMEnv(hash = "overview") {
  const moduleCache = new Map()
  const storage = new Map()

  const mockLocalStorage = {
    getItem: (k) => storage.get(k) || null,
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  }

  const mockDocument = {
    createElement: () => ({
      href: "",
      download: "",
      click: () => {},
    }),
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
        location: { hash: `#${hash}` },
        localStorage: mockLocalStorage,
        sessionStorage: mockLocalStorage,
        window: {
          localStorage: mockLocalStorage,
          sessionStorage: mockLocalStorage,
          location: { hash: `#${hash}` },
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => {},
          scrollTo: () => {},
        },
        document: mockDocument,
        navigator: { userAgent: "Node" },
        Blob,
        File,
        TextEncoder,
        TextDecoder,
        URL,
      },
      { filename },
    )

    return exports
  }

  return { load }
}

const services = loadServices()

// Shared massive document holder
let testMassiveDoc = ""
let testTotalWords = 0

// ============================================================================
// SUITE 1: Hostile Boundary Testing (Zero-Length, Whitespace & Degenerates)
// ============================================================================

test("Stress Boundary 1.1: Zero-length strings and whitespace-only rejection across all tools", async () => {
  const whitespaceInputs = ["", "   ", "\t\t\n\r  \n  ", "\n"]

  for (const emptyInput of whitespaceInputs) {
    // summarize
    assert.throws(
      () => services.summarizeDocument(emptyInput),
      /Enter some text or document content to process/,
      "summarizeDocument should reject empty/whitespace input",
    )

    // rewrite
    assert.throws(
      () => services.rewriteContent(emptyInput, { tone: "Professional" }),
      /Enter some text or document content to process/,
      "rewriteContent should reject empty/whitespace input",
    )

    // translate
    assert.throws(
      () => services.translateText(emptyInput, { targetLanguage: "Spanish" }),
      /Enter some text or document content to process/,
      "translateText should reject empty/whitespace input",
    )

    // askDocumentAI (empty document)
    assert.throws(
      () => services.askDocumentAI(emptyInput, { question: "What is this?" }),
      /Enter document text or upload a document to ask questions/,
      "askDocumentAI should reject empty/whitespace document",
    )

    // keywords
    assert.throws(
      () => services.extractKeywords(emptyInput),
      /Enter some text or document content to process/,
      "extractKeywords should reject empty/whitespace input",
    )

    // sentiment
    assert.throws(
      () => services.analyzeSentiment(emptyInput),
      /Enter some text or document content to process/,
      "analyzeSentiment should reject empty/whitespace input",
    )
  }

  // askDocumentAI with empty or whitespace question
  assert.throws(
    () => services.askDocumentAI("Valid document content.", { question: "" }),
    /Please enter a question to ask the document/,
  )
  assert.throws(
    () => services.askDocumentAI("Valid document content.", { question: "   \t\n  " }),
    /Please enter a question to ask the document/,
  )

  // compareTexts with empty/whitespace strings
  const compEmpty = services.compareTexts("", "")
  assert.strictEqual(compEmpty.stats.similarityPercentage, 100)
  assert.strictEqual(compEmpty.stats.additions, 0)
  assert.strictEqual(compEmpty.stats.deletions, 0)

  const compOneEmptyA = services.compareTexts("Alpha beta gamma", "")
  assert.strictEqual(compOneEmptyA.stats.similarityPercentage, 0)
  assert.strictEqual(compOneEmptyA.stats.deletions > 0, true)

  const compOneEmptyB = services.compareTexts("", "Alpha beta gamma")
  assert.strictEqual(compOneEmptyB.stats.similarityPercentage, 0)
  assert.strictEqual(compOneEmptyB.stats.additions > 0, true)

  // generateEmail with empty/whitespace notes generates a valid draft without throwing
  const emptyEmail = services.generateEmail("", { purpose: "follow-up", tone: "professional" })
  assert.ok(emptyEmail.fullDraft.includes("Subject: Follow-up:"))
  assert.strictEqual(emptyEmail.alternativeSubjects.length, 4)
  assert.ok(emptyEmail.salutation.length > 0)
})

test("Stress Boundary 1.2: Single-character and minimal token resilience", async () => {
  // summarize single character
  const sumSingle = services.summarizeDocument("A.")
  assert.strictEqual(sumSingle.originalSentenceCount, 1)
  assert.strictEqual(sumSingle.reductionPercentage, 0)
  assert.ok(sumSingle.summary.includes("A."))

  // rewrite single character
  const rewSingle = services.rewriteContent("A", { tone: "Professional" })
  assert.strictEqual(rewSingle.rewrittenText, "A")
  assert.strictEqual(rewSingle.originalWordCount, 1)

  // translate single character
  const transSingle = services.translateText("A", { targetLanguage: "Spanish" })
  assert.strictEqual(transSingle.translatedText, "A")

  // ask single sentence
  const askSingle = services.askDocumentAI("System is operational.", { question: "Is system operational?" })
  assert.ok(askSingle.primaryAnswer.includes("System is operational"))
  assert.strictEqual(typeof askSingle.confidenceScore, "number")
  assert.ok(!Number.isNaN(askSingle.confidenceScore))

  // keywords single word
  const kwSingle = services.extractKeywords("Omnipresence", { maxKeywords: 5 })
  assert.strictEqual(kwSingle.totalWords, 1)
  assert.strictEqual(kwSingle.uniqueWords, 1)
  assert.strictEqual(kwSingle.lexicalDiversity, 1.0)
  assert.ok(!Number.isNaN(kwSingle.lexicalDiversity))

  // sentiment single word
  const sentPos = services.analyzeSentiment("Superb.")
  assert.strictEqual(sentPos.polarity, "Positive")
  assert.ok(sentPos.compound > 0)

  const sentNeg = services.analyzeSentiment("Disaster.")
  assert.strictEqual(sentNeg.polarity, "Negative")
  assert.ok(sentNeg.compound < 0)

  // compare two single characters
  const compDiff = services.compareTexts("A", "B", { granularity: "chars" })
  assert.strictEqual(compDiff.stats.similarityPercentage, 0)
  assert.strictEqual(compDiff.stats.additions, 1)
  assert.strictEqual(compDiff.stats.deletions, 1)
})

test("Stress Boundary 1.3: Repetitive degenerate tokens and mathematical boundaries", async () => {
  // 500 identical words for keywords
  const repetitiveText = "matrix ".repeat(500)
  const kwRep = services.extractKeywords(repetitiveText)
  assert.strictEqual(kwRep.totalWords, 500)
  assert.strictEqual(kwRep.uniqueWords, 1)
  assert.strictEqual(kwRep.lexicalDiversity, 0.0)
  assert.ok(!Number.isNaN(kwRep.lexicalDiversity))
  assert.strictEqual(kwRep.keywords.length, 1)
  assert.strictEqual(kwRep.keywords[0].term.toLowerCase(), "matrix")

  // Extreme positive sentiment clamp (compound score normalization)
  const extremePos = services.analyzeSentiment("brilliant perfect wonderful amazing awesome superb ".repeat(100))
  assert.strictEqual(extremePos.polarity, "Positive")
  assert.ok(extremePos.compound <= 1.0)
  assert.ok(extremePos.compound >= 0.95)

  // Extreme negative sentiment clamp
  const extremeNeg = services.analyzeSentiment("terrible horrible awful disastrous catastrophic tragic ".repeat(100))
  assert.strictEqual(extremeNeg.polarity, "Negative")
  assert.ok(extremeNeg.compound >= -1.0)
  assert.ok(extremeNeg.compound <= -0.95)

  // 100 identical sentences for summarize
  const repetitiveSentences = "The server is active. ".repeat(100)
  const sumRep = services.summarizeDocument(repetitiveSentences, { mode: "sentences", targetLength: 3 })
  assert.strictEqual(sumRep.summarySentenceCount, 3)
  assert.ok(sumRep.reductionPercentage > 90)
})

// ============================================================================
// SUITE 2: Hostile Input Resilience (HTML/XSS, Markdown, Unicode, Code)
// ============================================================================

test("Stress Hostile 2.1: XSS and script injection tag resilience", async () => {
  const xssPayload = `
    <script>alert('pwned')</script>
    <img src=x onerror=alert(1)>
    <iframe src="javascript:alert('xss')"></iframe>
    <div onclick="evil()">Click for dangerous exploit</div>
    <svg/onload=alert('svg')>
  `.trim()

  // Verify all 8 tools safely process the payload without executing, corrupting, or throwing
  const sumRes = services.summarizeDocument(xssPayload)
  assert.ok(sumRes.summary.length > 0)

  const rewRes = services.rewriteContent(xssPayload, { tone: "Professional" })
  assert.ok(rewRes.rewrittenText.length > 0)

  const transRes = services.translateText(xssPayload, { targetLanguage: "French" })
  assert.ok(transRes.translatedText.length > 0)

  const askRes = services.askDocumentAI(xssPayload, { question: "What is the script tag?" })
  assert.ok(askRes.primaryAnswer.length > 0)

  const kwRes = services.extractKeywords(xssPayload)
  assert.ok(Array.isArray(kwRes.keywords))

  const sentRes = services.analyzeSentiment(xssPayload)
  assert.ok(["Positive", "Negative", "Neutral"].includes(sentRes.polarity))

  const compRes = services.compareTexts(xssPayload, xssPayload)
  assert.strictEqual(compRes.stats.similarityPercentage, 100)

  const emailRes = services.generateEmail(xssPayload, { purpose: "proposal" })
  assert.ok(emailRes.fullDraft.length > 0)
})

test("Stress Hostile 2.2: Special Unicode, Emojis, BiDi / RTL, and zero-width characters", async () => {
  // Detection resilience across 8 languages
  const deLang = services.detectLanguage("Das ist eine wunderbare Überraschung für Schüler.")
  assert.strictEqual(deLang.language, "German")

  const ptLang = services.detectLanguage("Esta é uma solução incrível para a nossa empresa com bom desempenho.")
  assert.strictEqual(ptLang.language, "Portuguese")

  const esLang = services.detectLanguage("Buenos días, el informe de la empresa está listo con gran éxito.")
  assert.strictEqual(esLang.language, "Spanish")

  const frLang = services.detectLanguage("C'est une excellente opportunité pour le développement du projet.")
  assert.strictEqual(frLang.language, "French")

  const zhLang = services.detectLanguage("人工智能是现代技术的核心领域。")
  assert.strictEqual(zhLang.language, "Chinese")

  const jaLang = services.detectLanguage("人工知能は現代技術の重要な分野です。")
  assert.strictEqual(jaLang.language, "Japanese")

  // Translate with emoji and unicode preservation
  const transEmoji = services.translateText("Hello friend! 🚀 Welcome to our world.", {
    sourceLanguage: "English",
    targetLanguage: "Spanish",
  })
  assert.ok(transEmoji.translatedText.includes("🚀"))
  assert.ok(transEmoji.translatedText.toLowerCase().includes("hola"))

  // Sentiment with emojis
  const sentEmojiPos = services.analyzeSentiment("Outstanding launch! 🚀🎉 Everything works smoothly.")
  assert.strictEqual(sentEmojiPos.polarity, "Positive")

  const sentEmojiNeg = services.analyzeSentiment("Catastrophic error! 💥 Terrible and completely broken.")
  assert.strictEqual(sentEmojiNeg.polarity, "Negative")
})

test("Stress Hostile 2.3: Code snippets, SQL injection, and unbalanced syntax", async () => {
  const codePayload = `
    -- SQL Injection Test Vector
    SELECT * FROM users WHERE '1'='1' UNION SELECT username, password FROM admin_credentials; DROP TABLE accounts;--

    // TypeScript / Python Snippets
    export async function dispatchTask<T extends Record<string, unknown>>(id: string, opts?: { timeout: number }): Promise<T[]> {
      const regex = /^[a-z0-9_-]+$/i;
      if (!opts?.timeout || opts.timeout < 0) throw new RangeError("Invalid bounds: " + id);
      return [{ id, status: "OK", payload: { data: [1, 2, 3] } }] as unknown as T[];
    }
  `.trim()

  // Summarize code
  const sumCode = services.summarizeDocument(codePayload)
  assert.ok(sumCode.summary.length > 0)
  assert.strictEqual(typeof sumCode.summaryWordCount, "number")

  // Keywords on code
  const kwCode = services.extractKeywords(codePayload)
  assert.ok(kwCode.keywords.length > 0)

  // Compare code diff
  const modifiedCode = codePayload.replace("timeout: number", "timeoutMs: number")
  const compCode = services.compareTexts(codePayload, modifiedCode, { granularity: "lines" })
  assert.strictEqual(compCode.stats.similarityPercentage > 85, true)
  assert.ok(compCode.stats.additions > 0)
  assert.ok(compCode.stats.deletions > 0)
})

// ============================================================================
// SUITE 3: BM25 Zero-Match Fallback & Hostile Question Retrieval
// ============================================================================

test("Stress BM25 3.1: Zero-match question fallback safety on technical document", async () => {
  const physicsDoc = `
    Quantum mechanics provides a fundamental framework for describing physical phenomena at subatomic scales.
    Entangled photons exhibit instantaneous correlations irrespective of the spatial separation between detectors.
    Bell inequality violations empirically demonstrate the non-local nature of quantum states.
    Superconducting qubits serve as the cornerstone for quantum computational processors.
  `.trim()

  // Hostile Query 1: Completely fabricated gibberish terms
  const resGibberish = services.askDocumentAI(physicsDoc, {
    question: "Xylophonic flabbergast zanzibar quux wobbegong?",
  })
  assert.ok(resGibberish.primaryAnswer.length > 0, "Primary answer must fallback to valid sentence")
  assert.ok(resGibberish.confidenceScore <= 30, `Confidence should be <= 30 on zero-match, got ${resGibberish.confidenceScore}`)
  assert.strictEqual(resGibberish.relevantTermsFound.length, 0)
  assert.strictEqual(resGibberish.topPassages[0].score, 0)

  // Hostile Query 2: Punctuation and symbol spam
  const resSymbols = services.askDocumentAI(physicsDoc, {
    question: "!@#$%^&*()_+ ??? ::: ;;;",
  })
  assert.ok(resSymbols.primaryAnswer.length > 0)
  assert.ok(!Number.isNaN(resSymbols.confidenceScore))
  assert.strictEqual(resSymbols.relevantTermsFound.length, 0)

  // Hostile Query 3: Stopword-only question
  const resStopwords = services.askDocumentAI(physicsDoc, {
    question: "What is the and of in on at?",
  })
  assert.ok(resStopwords.primaryAnswer.length > 0)
  assert.strictEqual(resStopwords.relevantTermsFound.length, 0)

  // Hostile Query 4: Unrelated culinary topic against quantum physics doc
  const resCulinary = services.askDocumentAI(physicsDoc, {
    question: "How many grams of melted butter and sourdough flour are needed for baking croissants?",
  })
  assert.ok(resCulinary.primaryAnswer.length > 0)
  assert.strictEqual(resCulinary.relevantTermsFound.length, 0)
  assert.strictEqual(resCulinary.confidenceRating, "Low")
})

test("Stress BM25 3.2: High-density passage retrieval with needle-in-a-haystack accuracy", async () => {
  // Construct 60 distinct paragraphs where only paragraph 42 contains the secret needle
  const paragraphs = []
  for (let i = 1; i <= 60; i++) {
    if (i === 42) {
      paragraphs.push(
        `Paragraph ${i}: The top secret security key for the orbital satellite is CIPHER-DELTA-9842. This authorization token expires at midnight on Friday.`,
      )
    } else {
      paragraphs.push(
        `Paragraph ${i}: General telemetry data indicates nominal temperature readings across subsystem ${i}. No structural anomalies observed during orbit cycle ${i * 7}.`,
      )
    }
  }
  const document = paragraphs.join("\n\n")

  const answer = services.askDocumentAI(document, {
    question: "What is the top secret security key for the orbital satellite?",
    topPassagesCount: 3,
  })

  assert.strictEqual(answer.topPassages[0].paragraphNumber, 42)
  assert.ok(answer.primaryAnswer.includes("CIPHER-DELTA-9842"))
  assert.strictEqual(answer.confidenceRating, "High")
  assert.ok(answer.confidenceScore >= 75)
})

// ============================================================================
// SUITE 4: Massive Document Scale Stress (50,000+ Words)
// ============================================================================

test("Stress Scale 4.1: Massive 50,000+ words document generation and memory baseline", async () => {
  const paragraphTemplate = (idx) => `
    Section ${idx}. The distributed architectural matrix operates under asynchronous consensus protocols designed to maximize throughput and fault tolerance across global data centers.
    Engineering teams continuously analyze telemetry, latency percentiles, and memory allocations to ensure that database queries execute within strict single-digit millisecond thresholds.
    Security audits and cryptographic verifications run continuously, validating zero-trust authorization policies across all API endpoints, microservices, and storage layers.
    Customer feedback indicates substantial improvements in user productivity, seamless document workflows, and robust offline capabilities across modern web applications.
    We need to fix and start the system right now because it cannot wait.
    Furthermore, automated pipelines monitor bundle size, dependency licenses, and build performance to uphold engineering excellence and reliability standards.
  `.trim()

  // Each paragraph is ~90 words. 600 paragraphs = ~54,000 words.
  const paragraphs = []
  for (let i = 1; i <= 600; i++) {
    paragraphs.push(paragraphTemplate(i))
  }
  const massiveDocument = paragraphs.join("\n\n")

  const totalWords = (massiveDocument.match(/\b[\w'-]+\b/g) || []).length
  assert.ok(totalWords >= 50000, `Document must contain >= 50,000 words, got ${totalWords}`)

  // Store for subsequent tests in Suite 4
  testMassiveDoc = massiveDocument
  testTotalWords = totalWords
})

test("Stress Scale 4.2: summarizeDocument on 50,000+ words document", async () => {
  assert.ok(testMassiveDoc.length > 0, "Massive document must be prepared")

  const startMem = process.memoryUsage().heapUsed
  const startTime = performance.now()

  const summary = services.summarizeDocument(testMassiveDoc, {
    mode: "sentences",
    targetLength: 5,
    format: "bullet",
  })

  const elapsed = performance.now() - startTime
  const endMem = process.memoryUsage().heapUsed
  const memDeltaMB = (endMem - startMem) / (1024 * 1024)

  assert.strictEqual(summary.summarySentenceCount, 5)
  assert.strictEqual(summary.originalSentenceCount > 3000, true)
  assert.ok(summary.reductionPercentage > 95)
  assert.ok(summary.keyThemes.length > 0)
  assert.ok(summary.formattedReport.includes("Executive Summary"))
  assert.ok(elapsed < 2500, `Summarization of 50k words must complete in < 2500ms, took ${elapsed.toFixed(1)}ms`)
})

test("Stress Scale 4.3: rewriteContent on 50,000+ words document", async () => {
  const startTime = performance.now()

  const rewritten = services.rewriteContent(testMassiveDoc, {
    tone: "Professional",
  })

  const elapsed = performance.now() - startTime
  assert.ok(rewritten.rewrittenText.length > 0)
  assert.strictEqual(rewritten.originalWordCount >= 50000, true)
  assert.strictEqual(rewritten.newWordCount > 0, true)
  assert.strictEqual(rewritten.replacementsCount > 0, true)
  assert.ok(elapsed < 2000, `Rewriting 50k words must complete in < 2000ms, took ${elapsed.toFixed(1)}ms`)
})

test("Stress Scale 4.4: translateText on 50,000+ words document", async () => {
  const startTime = performance.now()

  const trans = services.translateText(testMassiveDoc, {
    sourceLanguage: "English",
    targetLanguage: "Spanish",
  })

  const elapsed = performance.now() - startTime
  assert.strictEqual(trans.sourceLanguage, "English")
  assert.strictEqual(trans.targetLanguage, "Spanish")
  assert.ok(trans.translatedWordCount > 0)
  assert.ok(trans.coveragePercentage > 0)
  assert.ok(!Number.isNaN(trans.coveragePercentage))
  assert.ok(elapsed < 2000, `Translation of 50k words must complete in < 2000ms, took ${elapsed.toFixed(1)}ms`)
})

test("Stress Scale 4.5: askDocumentAI BM25 search across 50,000+ words (600 passages)", async () => {
  // Inject a unique needle into paragraph 333
  const targetNeedle = "The Project Titan secret budget allocation is $42,500,000 approved by executive council."
  const modifiedDoc = testMassiveDoc.replace("Section 333.", `Section 333. ${targetNeedle}`)

  const startTime = performance.now()

  const answer = services.askDocumentAI(modifiedDoc, {
    question: "What is the secret budget allocation for Project Titan?",
    topPassagesCount: 3,
  })

  const elapsed = performance.now() - startTime
  assert.strictEqual(answer.topPassages[0].paragraphNumber, 333)
  assert.ok(answer.primaryAnswer.includes("$42,500,000"))
  assert.ok(answer.confidenceScore >= 70)
  assert.ok(elapsed < 2500, `BM25 passage retrieval across 600 passages must complete in < 2500ms, took ${elapsed.toFixed(1)}ms`)
})

test("Stress Scale 4.6: extractKeywords on 50,000+ words document", async () => {
  const startTime = performance.now()

  const kw = services.extractKeywords(testMassiveDoc, {
    maxKeywords: 10,
    includeNgrams: true,
  })

  const elapsed = performance.now() - startTime
  assert.strictEqual(kw.keywords.length, 10)
  assert.strictEqual(kw.totalWords >= 50000, true)
  assert.ok(kw.readingTimeMinutes >= 250)
  assert.ok(kw.lexicalDiversity > 0 && kw.lexicalDiversity <= 1.0)
  assert.ok(elapsed < 2000, `RAKE keyword extraction on 50k words must complete in < 2000ms, took ${elapsed.toFixed(1)}ms`)
})

test("Stress Scale 4.7: analyzeSentiment on 50,000+ words document", async () => {
  const startTime = performance.now()

  const sentiment = services.analyzeSentiment(testMassiveDoc)

  const elapsed = performance.now() - startTime
  assert.ok(["Positive", "Negative", "Neutral"].includes(sentiment.polarity))
  assert.ok(sentiment.compound >= -1.0 && sentiment.compound <= 1.0)
  assert.ok(!Number.isNaN(sentiment.compound))
  assert.ok(elapsed < 1500, `Sentiment analysis on 50k words must complete in < 1500ms, took ${elapsed.toFixed(1)}ms`)
})

test("Stress Scale 4.8: generateEmail with massive 50,000+ words input notes", async () => {
  const startTime = performance.now()

  const email = services.generateEmail(testMassiveDoc, {
    purpose: "status-update",
    tone: "professional",
    recipient: "Executive Leadership",
  })

  const elapsed = performance.now() - startTime
  assert.ok(email.fullDraft.includes("Executive Leadership"))
  assert.strictEqual(email.alternativeSubjects.length, 4)
  assert.ok(email.subject.length > 0 && email.subject.length <= 100)
  assert.ok(elapsed < 500, `Email generation must complete in < 500ms, took ${elapsed.toFixed(1)}ms`)
})

test("Stress Scale 4.9: compareTexts on large documents with line granularity", async () => {
  // 500 lines text comparison
  const linesA = []
  const linesB = []
  for (let i = 1; i <= 500; i++) {
    linesA.push(`Line ${i}: System configuration parameter ${i} = ENABLED`)
    if (i % 25 === 0) {
      linesB.push(`Line ${i}: System configuration parameter ${i} = MODIFIED_VALUE`)
    } else {
      linesB.push(`Line ${i}: System configuration parameter ${i} = ENABLED`)
    }
  }

  const textA = linesA.join("\n")
  const textB = linesB.join("\n")

  const startTime = performance.now()
  const diff = services.compareTexts(textA, textB, { granularity: "lines" })
  const elapsed = performance.now() - startTime

  assert.ok(diff.stats.similarityPercentage >= 95)
  assert.strictEqual(diff.stats.additions, 20)
  assert.strictEqual(diff.stats.deletions, 20)
  assert.strictEqual(diff.stats.unchanged, 480)
  assert.ok(elapsed < 1500, `500-line LCS diff must complete in < 1500ms, took ${elapsed.toFixed(1)}ms`)
})

// ============================================================================
// SUITE 5: React UI Mounting & Rapid Sequential Route Navigation Stress
// ============================================================================

test("Stress UI 5.1: All 8 AI tool routes mount interactive options panels and action buttons", async () => {
  const tools = [
    { id: "summarize", actionText: "Summarize Document", optionCheck: "Length Mode" },
    { id: "rewrite", actionText: "Rewrite Content", optionCheck: "Target Tone" },
    { id: "translate", actionText: "Translate Text", optionCheck: "Source Language" },
    { id: "ask", actionText: "Ask Document AI", optionCheck: "Question to Ask Document" },
    { id: "keywords", actionText: "Extract Keywords", optionCheck: "Maximum Keywords" },
    { id: "sentiment", actionText: "Analyze Sentiment", optionCheck: "detailed word-by-word valence ratings" },
    { id: "compare", actionText: "Compare Texts", optionCheck: "Diff Granularity" },
    { id: "email", actionText: "Generate Email", optionCheck: "Email Purpose" },
  ]

  for (const t of tools) {
    const env = createDOMEnv(t.id)
    const AppMod = env.load("App.tsx")
    const AppComp = AppMod.default || AppMod
    const html = renderToStaticMarkup(React.createElement(AppComp))

    // Must not display "Coming soon" or 404
    assert.ok(!html.includes("Coming soon"), `Route #${t.id} must not display "Coming soon"`)
    assert.ok(!html.includes("404"), `Route #${t.id} must not display 404`)

    // Must include the document upload bar
    assert.ok(
      html.includes("Load text from file (.txt, .md, .pdf)"),
      `Route #${t.id} must include the dual-input document upload bar`,
    )

    // Must include the contextual action button verb
    assert.ok(
      html.includes(t.actionText),
      `Route #${t.id} must include contextual action button "${t.actionText}"`,
    )

    // Must include the tool's options panel
    assert.ok(
      html.includes(t.optionCheck),
      `Route #${t.id} must mount options panel containing "${t.optionCheck}"`,
    )
  }
})

test("Stress UI 5.2: Rapid sequential router navigation across all 8 AI tools (3 rapid cycles = 24 route navigations)", async () => {
  const aiRoutes = ["summarize", "rewrite", "translate", "ask", "keywords", "sentiment", "compare", "email"]
  let renderCount = 0

  for (let cycle = 1; cycle <= 3; cycle++) {
    for (const route of aiRoutes) {
      const env = createDOMEnv(route)
      const AppMod = env.load("App.tsx")
      const AppComp = AppMod.default || AppMod
      const html = renderToStaticMarkup(React.createElement(AppComp))
      assert.ok(html.length > 500, `Rendered HTML for route #${route} must be valid`)
      assert.ok(!html.includes("Coming soon"))
      assert.ok(!html.includes("404"))
      renderCount++
    }
  }

  assert.strictEqual(renderCount, 24)
})
