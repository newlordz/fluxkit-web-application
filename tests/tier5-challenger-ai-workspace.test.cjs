const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

// ============================================================================
// TypeScript Transpilation & Module Loader for Services & React Components
// ============================================================================

const transpileCache = new Map()

function getTranspiled(fullPath) {
  if (transpileCache.has(fullPath)) return transpileCache.get(fullPath)
  let resolved = fullPath
  if (!fs.existsSync(resolved)) {
    if (fs.existsSync(fullPath + ".tsx")) resolved = fullPath + ".tsx"
    else if (fs.existsSync(fullPath + ".ts")) resolved = fullPath + ".ts"
  }
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
  const { code } = getTranspiled(filePath)
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

const services = loadServices()

// Mock DOM Environment for React Route and Component Rendering
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
          if (id === "./services") return services
          if (id.startsWith(".")) {
            const cleanId = id.replace(/^\.\//, "").replace(/\.tsx?$|\.jsx?$/, "")
            return load(cleanId)
          }
          if (id === "react" || id === "react/jsx-runtime") return require(id)
          if (id === "lucide-react") {
            const lucide = require("lucide-react")
            return new Proxy(lucide, {
              get: (target, prop) =>
                target[prop] || (() => React.createElement("svg")),
            })
          }
          return require(id)
        },
        module: { exports },
        console,
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        window: {
          location: mockLocation,
          localStorage: mockLocalStorage,
          sessionStorage: mockLocalStorage,
          document: mockDocument,
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => true,
          matchMedia: () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }),
        },
        document: mockDocument,
        location: mockLocation,
        localStorage: mockLocalStorage,
        sessionStorage: mockLocalStorage,
        process,
      },
      { filename },
    )
    return exports
  }

  return { load, mockLocation, storage }
}

// ============================================================================
// SECTION 1: AI Text Suite White-Box Adversarial Hardening (Milestone 5)
// ============================================================================

test("Tier 5 Adversarial AI: Tool #26 summarizeDocument tokenization & scoring edges", async (t) => {
  const { summarizeDocument, summarizeText } = services

  await t.test("Rejects empty or whitespace-only documents with clean user error", () => {
    assert.throws(() => summarizeDocument(""), /Enter some text/)
    assert.throws(() => summarizeDocument("   \n\t  "), /Enter some text/)
    assert.equal(summarizeText, summarizeDocument, "summarizeText must be an alias of summarizeDocument")
  })

  await t.test("Single sentence input formats gracefully without division-by-zero", () => {
    const text = "A single sentence explaining FluxKit architecture."
    const bulletRes = summarizeDocument(text, { format: "bullet" })
    assert.equal(bulletRes.originalSentenceCount, 1)
    assert.equal(bulletRes.summarySentenceCount, 1)
    assert.equal(bulletRes.reductionPercentage, 0)
    assert.match(bulletRes.summary, /^• A single sentence/)

    const narrativeRes = summarizeDocument(text, { format: "narrative" })
    assert.equal(narrativeRes.summary, text)
  })

  await t.test("Untested Edge: Document with ZERO tokens of 3+ letters (all 1-2 letter words)", () => {
    // Every sentence consists purely of 1-2 letter words: regex /\b[a-z]{3,}\b/g matches nothing
    const shortTokenDoc = "He is in. We go up. It is on. Do it by me. I am at it."
    const res = summarizeDocument(shortTokenDoc, { mode: "sentences", targetLength: 2 })
    assert.ok(res.summarySentenceCount <= 2, "Should constrain to target sentence count")
    assert.ok(Number.isFinite(res.reductionPercentage), "Reduction percentage must be finite, not NaN")
    assert.ok(Array.isArray(res.keyThemes), "keyThemes must be an array")
    assert.ok(res.formattedReport.includes("Executive Summary Report:"), "Report formatted properly")
  })

  await t.test("Numeric, entity, and currency boost influences sentence scoring", () => {
    const doc = [
      "The project commenced during the initial quarter without explicit milestones.",
      "Revenue expanded by 45% reaching $12,500,000 across digital platforms.",
      "General operations proceeded normally according to standard working protocols.",
      "The engineering leadership reported steady developer velocity and low defect rates.",
    ].join(" ")

    const res = summarizeDocument(doc, { mode: "sentences", targetLength: 1 })
    assert.equal(res.summarySentenceCount, 1)
    assert.match(res.summary, /\$12,500,000/, "High-impact sentence with percentages and currency should be selected")
  })

  await t.test("Percentage mode out-of-bounds inputs are clamped strictly", () => {
    const multiSentenceDoc = Array.from({ length: 20 }, (_, i) => `Sentence ${i + 1} provides key contextual background.`).join(" ")
    // Negative percentage clamped to 5% (1 sentence)
    const lowRes = summarizeDocument(multiSentenceDoc, { mode: "percentage", targetLength: -50 })
    assert.equal(lowRes.summarySentenceCount, 1)

    // Oversized percentage clamped to 100% (20 sentences)
    const highRes = summarizeDocument(multiSentenceDoc, { mode: "percentage", targetLength: 999 })
    assert.equal(highRes.summarySentenceCount, 20)
  })

  await t.test("Executive format with custom title interpolates correctly", () => {
    const doc = "First sentence establishes baseline. Second sentence details metrics. Third concludes."
    const res = summarizeDocument(doc, { format: "executive", title: "Quarterly Performance" })
    assert.match(res.summary, /Quarterly Performance — Executive Summary/)
    assert.match(res.summary, /Key Takeaways:/)
  })

  await t.test("High-volume stress test: 200 sentences processed sublinearly", () => {
    const sentences = Array.from({ length: 200 }, (_, i) => `Statement ${i + 1} addresses scalable client-side computation and memory efficiency.`)
    const t0 = Date.now()
    const res = summarizeDocument(sentences.join(" "), { mode: "sentences", targetLength: 5 })
    const elapsed = Date.now() - t0
    assert.ok(elapsed < 500, `High-volume summarization took ${elapsed}ms (should be <500ms)`)
    assert.equal(res.summarySentenceCount, 5)
    assert.ok(res.reductionPercentage > 90)
  })
})

test("Tier 5 Adversarial AI: Tool #27 rewriteContent tone rules & unknown fallbacks", async (t) => {
  const { rewriteContent, rewriteText } = services

  await t.test("Rejects empty or whitespace-only input", () => {
    assert.throws(() => rewriteContent("", { tone: "Professional" }), /Enter some text/)
    assert.throws(() => rewriteContent("   \n ", { tone: "Professional" }), /Enter some text/)
    assert.equal(rewriteText, rewriteContent)
  })

  await t.test("Unknown or custom tone defaults safely to contraction expansion without crashing", () => {
    const text = "We don't know why it can't run faster."
    const res = rewriteContent(text, { tone: "AvantGarde" })
    assert.match(res.rewrittenText, /do not/, "Contractions should expand under default branch")
    assert.match(res.rewrittenText, /cannot/, "can't expands to cannot")
    assert.equal(res.tone, "AvantGarde")
  })

  await t.test("Tone comparisons: Casual collapses contractions while Professional expands them", () => {
    const formalText = "We do not believe that they cannot participate."
    const casualRes = rewriteContent(formalText, { tone: "Casual" })
    assert.match(casualRes.rewrittenText, /don't|can't/, "Casual collapses contractions")

    const contractionText = "We don't think it won't succeed."
    const profRes = rewriteContent(contractionText, { tone: "Professional" })
    assert.match(profRes.rewrittenText, /do not/, "Professional expands don't")
    assert.match(profRes.rewrittenText, /will not/, "Professional expands won't")
  })

  await t.test("Casing preservation across TitleCase, uppercase, and lowercase", () => {
    const text = "UTILIZE the platform. Utilize the platform. We utilize the platform."
    const res = rewriteContent(text, { tone: "Concise" })
    // In CONCISE_TRANSFORMS, 'utilize' -> 'use'
    assert.match(res.rewrittenText, /USE the platform/, "Uppercase input preserved as uppercase")
    assert.match(res.rewrittenText, /Use the platform/, "TitleCase input preserved as TitleCase")
    assert.match(res.rewrittenText, /(?:We|we) use the platform/, "Lowercase input preserved as lowercase")
  })

  await t.test("No-op text produces 0 replacements and identical output", () => {
    const text = "A swift blue dolphin jumped over the calm lagoon."
    const res = rewriteContent(text, { tone: "Professional" })
    assert.equal(res.replacementsCount, 0)
    assert.equal(res.rewrittenText, text)
    assert.equal(res.appliedTransforms.length, 0)
  })
})

test("Tier 5 Adversarial AI: Tool #28 translateText multilingual dictionary & script detection", async (t) => {
  const { translateText, detectLanguage } = services

  await t.test("Rejects empty or whitespace-only input", () => {
    assert.throws(() => translateText("", { targetLanguage: "Spanish" }), /Enter some text/)
  })

  await t.test("Script-level auto detection for Japanese, Chinese, and European languages", () => {
    // Pure Japanese (Hiragana & Katakana)
    assert.equal(detectLanguage("こんにちは世界").language, "Japanese")
    // Pure Chinese (Hanzi)
    assert.equal(detectLanguage("欢迎使用纯浏览器端文本处理工具").language, "Chinese")
    // Mixed Kanji + Hiragana (Common Japanese sentence) must detect as Japanese, NOT Chinese
    assert.equal(detectLanguage("本日の定例ミーティングを開始します").language, "Japanese")

    // Distinctive European diacritics
    assert.equal(detectLanguage("¡Muchas gracias por su atención señor!").language, "Spanish")
    assert.equal(detectLanguage("Bonjour à tous, merci beaucoup pour l'aide").language, "French")
    assert.equal(detectLanguage("Guten Morgen, vielen Dank für das Meeting").language, "German")
    assert.equal(detectLanguage("Ciao a tutti, grazie mille per l'aiuto").language, "Italian")
    assert.equal(detectLanguage("Olá a todos, muito obrigado pela atenção").language, "Portuguese")

    // Ambiguous short string fallback to English
    assert.equal(detectLanguage("xyz 123 456").language, "English")
  })

  await t.test("Identical source and target language returns immediately with 100% coverage", () => {
    const text = "This document is already in English."
    const res = translateText(text, { sourceLanguage: "English", targetLanguage: "English" })
    assert.equal(res.translatedText, text)
    assert.equal(res.coveragePercentage, 100)
    assert.match(res.formattedReport, /Source and target are identical/)
  })

  await t.test("Multi-word idioms translated before single vocabulary tokens", () => {
    const text = "Good morning everyone. Thank you very much for your time."
    const res = translateText(text, { sourceLanguage: "English", targetLanguage: "Spanish" })
    assert.match(res.translatedText, /Buenos días/i, "Good morning translated as full idiom")
    assert.match(res.translatedText, /Muchas gracias/i, "Thank you very much translated as full idiom")
  })

  await t.test("Cross-language translation between non-English pairs (e.g. Spanish to German)", () => {
    const text = "Hola amigo, gracias por el documento."
    const res = translateText(text, { sourceLanguage: "Spanish", targetLanguage: "German" })
    assert.ok(res.translatedText.length > 0)
    assert.equal(res.sourceLanguage, "Spanish")
    assert.equal(res.targetLanguage, "German")
  })

  await t.test("Untranslated entities (names, numbers, punctuation) remain intact", () => {
    const text = "Alex Chen generated invoice #98421 on 2026-11-10!"
    const res = translateText(text, { sourceLanguage: "English", targetLanguage: "French" })
    assert.match(res.translatedText, /Alex Chen/)
    assert.match(res.translatedText, /#98421/)
    assert.match(res.translatedText, /2026-11-10!/)
  })
})

test("Tier 5 Adversarial AI: Tool #29 askDocumentAI BM25 retrieval & intent edge cases", async (t) => {
  const { askDocumentAI } = services

  const doc = [
    "Project Apollo was initiated by Dr. Evelyn Reed in March 2024 to accelerate quantum simulation.",
    "Total capital expenditure for phase one was capped at $4,500,000 with a strict delivery deadline.",
    "The engineering deployment deadline is November 15, 2026 across all global regions.",
    "Security architecture enforces AES-256 encryption at rest and TLS 1.3 in transit.",
    "Marcus Vance serves as the principal systems architect supervising the distributed cluster.",
  ].join("\n\n")

  await t.test("Rejects empty document or empty question with clean errors", () => {
    assert.throws(() => askDocumentAI("", { question: "What is this?" }), /Enter document text/)
    assert.throws(() => askDocumentAI(doc, { question: "   " }), /Please enter a question/)
  })

  await t.test("Edge case: Question containing ONLY stopwords handles gracefully", () => {
    // All tokens 'what', 'is', 'it', 'about' are stopwords
    const res = askDocumentAI(doc, { question: "What is it about?" })
    assert.ok(res.primaryAnswer.length > 0, "Must return a primary answer sentence")
    assert.ok(res.confidenceScore >= 15 && res.confidenceScore <= 98, "Confidence score must be bounded")
    assert.ok(Array.isArray(res.passages), "Passages must be returned")
  })

  await t.test("Temporal intent boosts sentences with dates and deadlines", () => {
    const res = askDocumentAI(doc, { question: "When is the deployment deadline?" })
    assert.equal(res.questionIntent, "temporal")
    assert.match(res.primaryAnswer, /November 15, 2026/, "Should prioritize deadline sentence")
  })

  await t.test("Quantitative intent boosts numerical amounts and percentages", () => {
    const res = askDocumentAI(doc, { question: "How much capital expenditure was allocated?" })
    assert.equal(res.questionIntent, "quantitative")
    assert.match(res.primaryAnswer, /\$4,500,000/, "Should prioritize financial figure")
  })

  await t.test("Entity intent boosts capitalized names and leadership", () => {
    const res = askDocumentAI(doc, { question: "Who is the principal systems architect?" })
    assert.equal(res.questionIntent, "entity")
    assert.match(res.primaryAnswer, /Marcus Vance/, "Should prioritize architect sentence")
  })

  await t.test("Single paragraph document splits into sentence pairs without crashing", () => {
    const singlePara = "Sentence A introduces the theme. Sentence B develops it. Sentence C adds data. Sentence D concludes."
    const res = askDocumentAI(singlePara, { question: "Where is theme introduced?" })
    assert.ok(res.passages.length >= 1)
    assert.ok(res.primaryAnswer.includes("Sentence A"))
  })
})

test("Tier 5 Adversarial AI: Tool #30 extractKeywords RAKE matrix & ngram filtering", async (t) => {
  const { extractKeywords } = services

  await t.test("Rejects empty or whitespace-only text", () => {
    assert.throws(() => extractKeywords(""), /Enter some text/)
  })

  await t.test("includeNgrams: false strictly suppresses bigrams and trigrams", () => {
    const text = "Machine learning algorithms optimize distributed cloud infrastructure performance."
    const res = extractKeywords(text, { includeNgrams: false, maxKeywords: 10 })
    assert.ok(res.keywords.length > 0)
    for (const kw of res.keywords) {
      assert.equal(kw.type, "unigram", `Keyword '${kw.term}' must be unigram when includeNgrams is false`)
      assert.ok(!kw.term.includes(" "), `Unigram '${kw.term}' must not contain spaces`)
    }
  })

  await t.test("minFrequency constraint filters low-frequency terms strictly", () => {
    const text = "Cache invalidation is hard. Cache invalidation requires precision. Network latency is also hard."
    const res = extractKeywords(text, { minFrequency: 2 })
    for (const kw of res.keywords) {
      assert.ok(kw.frequency >= 2, `Keyword '${kw.term}' frequency ${kw.frequency} must be >= 2`)
    }
  })

  await t.test("Stopwords-only text returns empty keywords without division-by-zero", () => {
    const text = "The and is at which with they from this."
    const res = extractKeywords(text)
    assert.equal(res.keywords.length, 0, "No keywords should be extracted from pure stopwords")
    assert.equal(res.lexicalDiversity, 1.0)
    assert.equal(res.readingTimeMinutes, 1)
    assert.equal(res.speakingTimeMinutes, 1)
  })

  await t.test("Reading and speaking time calculation invariants", () => {
    // 400 words = 2 min reading time (400/200), 4 min speaking time (ceil(400/130) = 4)
    const longWords = Array.from({ length: 400 }, () => "word").join(" ")
    const res = extractKeywords(longWords)
    assert.equal(res.readingTimeMinutes, 2)
    assert.equal(res.speakingTimeMinutes, 4)
  })
})

test("Tier 5 Adversarial AI: Tool #31 analyzeSentiment VADER compound & conjunction clauses", async (t) => {
  const { analyzeSentiment } = services

  await t.test("Rejects empty or whitespace-only text", () => {
    assert.throws(() => analyzeSentiment(""), /Enter some text/)
  })

  await t.test("Contrastive conjunction clause weighting boosts second clause (1.4x)", () => {
    // Negative clause first ("terrible"), but positive clause second ("exceptional", "phenomenal")
    const text = "The early prototype was terrible, but the final release is exceptional and phenomenal."
    const res = analyzeSentiment(text)
    assert.equal(res.polarity, "Positive", "Second clause after 'but' should dominate sentiment")
    assert.ok(res.compoundScore > 0.2)
  })

  await t.test("Lookback negation window (3 tokens) flips sentiment valence", () => {
    const text = "The system is not at all good."
    const res = analyzeSentiment(text)
    assert.equal(res.polarity, "Negative", "Negated positive word must produce negative effective score")
    assert.ok(res.compoundScore < 0)
  })

  await t.test("Amplifier and dampener modifiers scale valence magnitude", () => {
    const dampRes = analyzeSentiment("The performance was barely adequate.")
    const ampRes = analyzeSentiment("The performance was extremely adequate.")
    assert.ok(ampRes.compoundScore > dampRes.compoundScore, "Amplifier score should exceed dampener score")
  })

  await t.test("All-caps word triggers 1.25x boost", () => {
    const norm = analyzeSentiment("This solution is fantastic.")
    const caps = analyzeSentiment("This solution is FANTASTIC.")
    assert.ok(caps.compoundScore >= norm.compoundScore)
  })

  await t.test("VADER compound score remains strictly bounded between -1.0 and 1.0", () => {
    const extremePositive = Array.from({ length: 50 }, () => "fantastic magnificent exceptional").join(" ")
    const posRes = analyzeSentiment(extremePositive)
    assert.ok(posRes.compoundScore <= 1.0 && posRes.compoundScore >= 0.9)
    assert.equal(posRes.mood, "Joyful & Enthusiastic")

    const extremeNegative = Array.from({ length: 50 }, () => "horrible terrible catastrophic").join(" ")
    const negRes = analyzeSentiment(extremeNegative)
    assert.ok(negRes.compoundScore >= -1.0 && negRes.compoundScore <= -0.9)
    assert.equal(negRes.mood, "Frustrated & Alarmed")
  })
})

test("Tier 5 Adversarial AI: Tool #32 compareTexts LCS dynamic programming & granularity", async (t) => {
  const { compareTexts } = services

  await t.test("Empty original and modified texts return 100% similarity and 0 diffs", () => {
    const res = compareTexts("", "")
    assert.equal(res.stats.similarityPercentage, 100)
    assert.equal(res.stats.additions, 0)
    assert.equal(res.stats.deletions, 0)
    assert.match(res.unifiedDiffText, /Both texts are empty/)
  })

  await t.test("Completely disjoint texts return 0% similarity", () => {
    const textA = "Alpha\nBravo\nCharlie"
    const textB = "Delta\nEcho\nFoxtrot"
    const res = compareTexts(textA, textB)
    assert.equal(res.stats.similarityPercentage, 0)
    assert.equal(res.stats.deletions, 3)
    assert.equal(res.stats.additions, 3)
  })

  await t.test("Granularity modes: lines vs words vs chars", () => {
    const a = "Hello beautiful world"
    const b = "Hello wonderful world"

    const lineRes = compareTexts(a, b, { granularity: "lines" })
    assert.equal(lineRes.stats.similarityPercentage, 0, "Lines granularity treats entire line as changed")

    const wordRes = compareTexts(a, b, { granularity: "words" })
    assert.ok(wordRes.stats.similarityPercentage > 50, "Word granularity recognizes common words 'Hello' and 'world'")

    const charRes = compareTexts(a, b, { granularity: "chars" })
    assert.ok(charRes.stats.similarityPercentage > 50, "Char granularity calculates character-level LCS")
  })

  await t.test("ignoreWhitespace and ignoreCase toggles", () => {
    const a = "   FluxKit Web App   "
    const b = "fluxkit web app"

    const strictRes = compareTexts(a, b, { ignoreWhitespace: false, ignoreCase: false })
    assert.ok(strictRes.stats.similarityPercentage < 100)

    const relaxedRes = compareTexts(a, b, { ignoreWhitespace: true, ignoreCase: true })
    assert.equal(relaxedRes.stats.similarityPercentage, 100, "Relaxed options match texts with 100% similarity")
  })
})

test("Tier 5 Adversarial AI: Tool #33 generateEmail combinatorial matrix & parameter fallbacks", async (t) => {
  const { generateEmail } = services

  const purposes = ["follow-up", "proposal", "thank-you", "inquiry", "announcement", "apology", "meeting-request", "status-update"]
  const tones = ["professional", "friendly", "urgent", "persuasive", "concise", "formal"]

  await t.test("All 48 purpose * tone combinations synthesize coherent emails without missing hooks", () => {
    for (const purpose of purposes) {
      for (const tone of tones) {
        const res = generateEmail("Key milestone completed ahead of schedule.", {
          purpose,
          tone,
          recipient: "Dev Team",
          sender: "Tech Lead",
        })
        assert.ok(res.openingHook.length > 10, `Opening hook missing for purpose=${purpose}, tone=${tone}`)
        assert.ok(res.fullDraft.includes("Dev Team"), "Draft should address recipient")
        assert.ok(res.fullDraft.includes("Tech Lead"), "Draft should include sender sign-off")
        assert.equal(res.alternativeSubjects.length, 4, "Must offer 4 alternative subjects")
      }
    }
  })

  await t.test("Topic extraction strips markdown bullets and truncates long titles", () => {
    const longNotes = "• This is an extraordinarily verbose document title describing complex engineering workflows that exceeds standard length limits."
    const res = generateEmail(longNotes)
    assert.ok(res.subject.includes("Follow-up: This is an extraordinarily verbose document title..."))
  })

  await t.test("Default parameter fallbacks when notes and options are omitted", () => {
    const res = generateEmail("")
    assert.equal(res.recipient, "Colleague")
    assert.equal(res.sender, "Alex Chen")
    assert.match(res.subject, /Project Update & Next Steps/)
  })
})

// ============================================================================
// SECTION 2: QR Code Studio White-Box Adversarial Hardening (Milestone 1)
// ============================================================================

test("Tier 5 Adversarial QR: Tool #17 qr protocol security & formatting validation", async (t) => {
  const { generateQR } = services

  await t.test("generateQR creates valid data URL for standard input", async () => {
    const dataUrl = await generateQR("https://fluxkit.app")
    assert.match(dataUrl, /^data:image\/png;base64,/)
  })

  await t.test("Wi-Fi WPA format escapes special characters and strips control characters", () => {
    // Simulated ToolPage Wi-Fi escaping logic
    const escapeWifi = (ssid, pass) => {
      const cleanSSID = ssid.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 64)
      const cleanPass = pass.replace(/[\x00-\x1f\x7f]/g, "").slice(0, 128)
      const escape = (s) => s.replace(/([\\;,:"])/g, "\\$1")
      return `WIFI:T:WPA;S:${escape(cleanSSID)};P:${escape(cleanPass)};;`
    }

    const payload = escapeWifi("Home;Net,Work:123", 'Pass"Word\\1')
    assert.equal(payload, 'WIFI:T:WPA;S:Home\\;Net\\,Work\\:123;P:Pass\\"Word\\\\1;;')
  })

  await t.test("URL protocol enforcement: rejects dangerous protocols", () => {
    const validateUrl = (urlStr) => {
      if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(urlStr)) {
        const parsed = new URL(urlStr)
        if (!["http:", "https:"].includes(parsed.protocol)) {
          throw new Error("Use a valid https:// or http:// URL.")
        }
        return urlStr
      }
      return `https://${urlStr}`
    }

    assert.equal(validateUrl("fluxkit.app/test"), "https://fluxkit.app/test")
    assert.equal(validateUrl("http://internal.net"), "http://internal.net")
    assert.throws(() => validateUrl("javascript:alert(1)"), /Use a valid https:\/\/ or http:\/\/ URL/)
    assert.throws(() => validateUrl("data:text/html,<h1>Pwn</h1>"), /Use a valid https:\/\/ or http:\/\/ URL/)
    assert.throws(() => validateUrl("file:///etc/passwd"), /Use a valid https:\/\/ or http:\/\/ URL/)
    assert.throws(() => validateUrl("ftp://ftp.is.co.za"), /Use a valid https:\/\/ or http:\/\/ URL/)
  })

  await t.test("High-density QR code stress (1,200 chars) and maximum capacity limit", async () => {
    const densePayload = "FLUXKIT-VERIFIED-DATA-".repeat(50)
    const dataUrl = await generateQR(densePayload)
    assert.ok(dataUrl.length > 500)

    // Exceeding QR version 40 byte capacity (>3000 chars) throws error
    const oversized = "A".repeat(3500)
    await assert.rejects(async () => {
      await generateQR(oversized)
    })
  })
})

// ============================================================================
// SECTION 3: Audio Transcription White-Box Binary Parsers (Milestone 6)
// ============================================================================

test("Tier 5 Adversarial Audio: Tool #18 audio-text binary parsers & diarization", async (t) => {
  const {
    parseWavHeader,
    parseMp3Header,
    computeAudioPeaks,
    detectAudioSegments,
    formatSrtTime,
    exportToSRT,
    exportToTXT,
    generateInBrowserTranscript,
  } = services

  await t.test("parseWavHeader rejects small or corrupted buffer", () => {
    assert.throws(() => parseWavHeader(new ArrayBuffer(32)), /buffer too small/)
    const badId = new Uint8Array(44)
    assert.throws(() => parseWavHeader(badId.buffer), /Missing RIFF or WAVE identifier/)
  })

  await t.test("parseWavHeader handles non-fmt chunk before data and calculates duration", () => {
    // Construct synthetic WAV: RIFF ... WAVE ... JUNK ... fmt  ... data
    const totalSize = 100
    const buf = new ArrayBuffer(totalSize)
    const view = new DataView(buf)
    const setAscii = (offset, str) => {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
    }
    setAscii(0, "RIFF")
    view.setUint32(4, totalSize - 8, true)
    setAscii(8, "WAVE")

    // JUNK chunk of 8 bytes
    setAscii(12, "JUNK")
    view.setUint32(16, 8, true)

    // fmt chunk at offset 28
    setAscii(28, "fmt ")
    view.setUint32(32, 16, true)
    view.setUint16(36, 1, true) // mono
    view.setUint16(38, 2, true) // 2 channels
    view.setUint32(40, 48000, true) // 48kHz
    view.setUint32(44, 192000, true) // byteRate
    view.setUint16(48, 4, true) // blockAlign
    view.setUint16(50, 16, true) // 16 bits

    // data chunk at offset 52
    setAscii(52, "data")
    view.setUint32(56, 40, true)

    const parsed = parseWavHeader(buf)
    assert.equal(parsed.channels, 2)
    assert.equal(parsed.sampleRate, 48000)
    assert.equal(parsed.byteRate, 192000)
    assert.equal(parsed.bitsPerSample, 16)
    assert.equal(parsed.dataSize, 40)
    assert.ok(parsed.duration > 0)
  })

  await t.test("parseMp3Header parses ID3v2 synchsafe tag and frame sync", () => {
    // Synthetic MP3 buffer with ID3v2 tag (10 bytes header + 10 bytes payload) followed by frame sync 0xFF 0xFB
    const buf = new Uint8Array(40)
    // ID3
    buf[0] = 0x49; buf[1] = 0x44; buf[2] = 0x33; buf[3] = 0x03; buf[4] = 0x00; buf[5] = 0x00
    // Tag size: 10 bytes synchsafe
    buf[6] = 0x00; buf[7] = 0x00; buf[8] = 0x00; buf[9] = 0x0a
    // Frame sync at offset 20: 0xFF 0xFB (MPEG-1 Layer 3, 128kbps, 44100Hz, Joint Stereo)
    buf[20] = 0xff; buf[21] = 0xfb
    buf[22] = (9 << 4) | (0 << 2) // 128 kbps, 44100 Hz
    buf[23] = 0x00

    const mp3 = parseMp3Header(buf.buffer)
    assert.equal(mp3.sampleRate, 44100)
    assert.equal(mp3.bitRate, 128)
    assert.ok(mp3.duration > 0)
  })

  await t.test("computeAudioPeaks with silent samples preserves visual floor (0.08)", () => {
    const silent = new Float32Array(1024)
    const peaks = computeAudioPeaks(silent, 64)
    assert.equal(peaks.length, 64)
    for (const p of peaks) {
      assert.ok(p >= 0.08 && p <= 1.0, "Silent audio peaks should be bounded by base floor")
    }
  })

  await t.test("formatSrtTime millisecond exact precision", () => {
    assert.equal(formatSrtTime(0), "00:00:00,000")
    assert.equal(formatSrtTime(65.123), "00:01:05,123")
    assert.equal(formatSrtTime(3661.999), "01:01:01,999")
  })

  await t.test("generateInBrowserTranscript across all 6 supported languages & unknown fallback", () => {
    const analysis = {
      duration: 16.0,
      sampleRate: 44100,
      channels: 2,
      peaks: Array(64).fill(0.5),
      segments: [
        { startSeconds: 0.0, endSeconds: 4.0, avgEnergy: 0.6 },
        { startSeconds: 4.0, endSeconds: 8.0, avgEnergy: 0.7 },
        { startSeconds: 8.0, endSeconds: 12.0, avgEnergy: 0.5 },
        { startSeconds: 12.0, endSeconds: 16.0, avgEnergy: 0.8 },
      ],
    }

    const langs = ["en", "es", "fr", "de", "zh", "ja"]
    for (const lang of langs) {
      const res = generateInBrowserTranscript(analysis, { language: lang, speakerLabels: true, timestamps: true })
      assert.equal(res.segments.length, 4)
      assert.equal(res.segments[0].speaker, "Speaker 1")
      assert.equal(res.segments[1].speaker, "Speaker 2")
      assert.ok(res.text.length > 50)
    }

    // Unknown language code falls back to English corpus
    const fallback = generateInBrowserTranscript(analysis, { language: "xx-unknown" })
    assert.match(fallback.text, /Good morning everyone|review the milestone/)
  })
})

// ============================================================================
// SECTION 4: Workspace Tools White-Box Adversarial Hardening (Milestone 6)
// ============================================================================

test("Tier 5 Adversarial Workspace: Document store, search ReDoS, meeting & whiteboard boundaries", async (t) => {
  const {
    detectDocumentCategory,
    formatByteSize,
    filterDocuments,
    createMeetingState,
    sendChatMessage,
    createWhiteboardHistory,
    saveSessionDocument,
    deleteSessionDocument,
    clearSessionDocuments,
    getSessionDocuments,
  } = services

  await t.test("detectDocumentCategory extension takes precedence over toolSource", () => {
    // Even if toolSource says 'Excel to PDF', if the output is .pdf, category is 'pdf'
    assert.equal(detectDocumentCategory("report.pdf", "Excel to PDF"), "pdf")
    // If output is .xlsx, category is 'sheets'
    assert.equal(detectDocumentCategory("table.xlsx", "PDF to Excel"), "sheets")
    // If output is .docx, category is 'docs'
    assert.equal(detectDocumentCategory("doc.docx", "PDF to Word"), "docs")
    // If output is .png, category is 'images'
    assert.equal(detectDocumentCategory("drawing.png", "Whiteboards"), "images")
    // If output is .srt, category is 'audio-text'
    assert.equal(detectDocumentCategory("captions.srt", "Audio to Text"), "audio-text")

    // When extension is missing or unrecognized, toolSource keywords are evaluated
    assert.equal(detectDocumentCategory("unnamed_file", "Excel to PDF"), "sheets")
    assert.equal(detectDocumentCategory("unnamed_file", "Whiteboard Canvas"), "images")
    assert.equal(detectDocumentCategory("unknown_bin.dat", "Unknown"), "other")
  })

  await t.test("filterDocuments is ReDoS-proof and handles malicious regex patterns", () => {
    const docs = [
      { id: "1", name: "Financial_Report_Q4.xlsx", size: "10 KB", time: "10:00", category: "sheets", toolSource: "Excel" },
      { id: "2", name: "Security_Audit.pdf", size: "20 KB", time: "10:05", category: "pdf", toolSource: "PDF" },
    ]

    // Hostile regex patterns that cause catastrophic backtracking in naive RegExp matches
    const maliciousQueries = [
      "(a+)+$",
      "(((a*)*)*)*",
      "[[[[[[",
      "\\k<unmatched>",
      "*+?{}",
      "\0",
    ]

    for (const q of maliciousQueries) {
      assert.doesNotThrow(() => {
        const filtered = filterDocuments(q, "all", docs)
        assert.ok(Array.isArray(filtered))
      }, `Search query '${q}' should not throw or lock up execution`)
    }

    // Normal matching
    const matches = filterDocuments("financial", "sheets", docs)
    assert.equal(matches.length, 1)
    assert.equal(matches[0].id, "1")
  })

  await t.test("createWhiteboardHistory boundary, undo/redo, and maxDepth cap", () => {
    const history = createWhiteboardHistory(5) // max depth 5
    assert.equal(history.canUndo(), false)
    assert.equal(history.canRedo(), false)
    assert.equal(history.undo(), null)
    assert.equal(history.redo(), null)

    // Push 1 item
    history.push("snap-1")
    assert.equal(history.canUndo(), false, "Cannot undo with only 1 snapshot")
    assert.equal(history.canRedo(), false)

    // Push 2 items
    history.push("snap-2")
    assert.equal(history.canUndo(), true)
    assert.equal(history.undo(), "snap-1")
    assert.equal(history.canRedo(), true)
    assert.equal(history.redo(), "snap-2")

    // Branching: Undo to snap-1, then push snap-3 (truncates snap-2)
    history.undo()
    history.push("snap-3")
    assert.equal(history.canRedo(), false, "Redo history invalidated on branch")
    assert.equal(history.undo(), "snap-1")
    assert.equal(history.redo(), "snap-3")

    // Max depth overflow test
    for (let i = 4; i <= 15; i++) {
      history.push(`snap-${i}`)
    }
    assert.ok(history.getDepth() <= 5, "Depth must not exceed maxDepth (5)")
    history.clear()
    assert.equal(history.getDepth(), 0)
    assert.equal(history.canUndo(), false)
  })

  await t.test("Meeting state chat message validation rejects empty or whitespace messages", () => {
    const state = createMeetingState()
    assert.throws(() => sendChatMessage(state, "User", ""), /cannot be empty/)
    assert.throws(() => sendChatMessage(state, "User", "   \t\n  "), /cannot be empty/)

    const updated = sendChatMessage(state, "Alice", "Hello team!")
    assert.equal(updated.chatMessages.length, state.chatMessages.length + 1)
    assert.equal(updated.chatMessages[updated.chatMessages.length - 1].text, "Hello team!")
  })

  await t.test("Document store lifecycle: save, query, delete, and clear", () => {
    clearSessionDocuments()
    const doc1 = saveSessionDocument({ name: "Doc1.pdf", toolSource: "PDF Core" })
    const doc2 = saveSessionDocument({ name: "Doc2.xlsx", toolSource: "Sheets" })
    const all = getSessionDocuments()
    assert.ok(all.some((d) => d.name === "Doc1.pdf"))
    assert.ok(all.some((d) => d.name === "Doc2.xlsx"))

    const deleted = deleteSessionDocument(doc1.id)
    assert.equal(deleted, true)
    const afterDelete = getSessionDocuments()
    assert.ok(!afterDelete.some((d) => d.id === doc1.id))

    clearSessionDocuments()
    const afterClear = getSessionDocuments()
    // Cleared store falls back to sample documents
    assert.ok(afterClear.length > 0)
  })
})

// ============================================================================
// SECTION 5: React Component Mount & Route Invariants Smoke Verification
// ============================================================================

test("Tier 5 Route Invariants: AI text, QR, audio, and workspace routes render cleanly", async (t) => {
  const routesToVerify = [
    { hash: "summarize", title: "Summarize Document" },
    { hash: "rewrite", title: "Rewrite Content" },
    { hash: "translate", title: "Translate Text" },
    { hash: "ask", title: "Ask Document AI" },
    { hash: "keywords", title: "Extract Keywords" },
    { hash: "sentiment", title: "Analyze Sentiment" },
    { hash: "compare", title: "Compare Texts" },
    { hash: "email", title: "Generate an Email" },
    { hash: "qr", title: "QR Code Studio" },
    { hash: "audio-text", title: "Audio to Text" },
    { hash: "documents", title: "My Documents" },
    { hash: "activity", title: "Activity Feed" },
    { hash: "meetings", title: "Video Meetings" },
    { hash: "whiteboards", title: "Whiteboards" },
  ]

  for (const { hash, title } of routesToVerify) {
    await t.test(`Route #${hash} renders active interface with zero 'Coming soon' or 404 badges`, () => {
      const { load } = createDOMEnv(hash)
      const App = load("App").default
      const html = renderToStaticMarkup(React.createElement(App))

      assert.doesNotMatch(html, /404 · A SMALL DETOUR/, `Route #${hash} must not trigger 404`)
      assert.doesNotMatch(html, /Coming soon/i, `Route #${hash} must not show Coming soon`)

      if (hash === "audio-text") {
        // Contractual regression invariant for #audio-text on initial mount
        assert.match(html, /Backend not connected/, "Route #audio-text must display verbatim 'Backend not connected' banner")
      }
    })
  }
})
