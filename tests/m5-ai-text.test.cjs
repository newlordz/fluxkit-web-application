const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

// ============================================================================
// Module Transpiler & Dynamic Loader for Node Test Harness
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

// ============================================================================
// SUITE 1: Extractive TF-ISF Document Summarizer (Tool #26: summarize)
// ============================================================================

test("Suite 1: Tool #26 summarizeDocument (Extractive TF-ISF Sentence Engine)", async (t) => {
  const sampleArticle = `
    Artificial intelligence is rapidly transforming modern software development across the globe.
    Developers utilize automated algorithms to accelerate repetitive design and code review workflows.
    FluxKit delivers a complete suite of browser-native utilities that operate strictly on client hardware.
    Data privacy is guaranteed because zero bytes ever leave the local execution environment.
    Extractive summarization identifies high-information sentences through term frequency and inverse sentence frequency.
    Teams achieve significant productivity improvements while maintaining total governance over sensitive intellectual property.
    The future of edge productivity relies upon self-contained and performant web technologies.
  `.trim()

  await t.test("1.1 Basic sentence count extraction and format modes", () => {
    // 3 sentences bullet mode
    const res3 = services.summarizeDocument(sampleArticle, {
      mode: "sentences",
      targetLength: 3,
      format: "bullet",
    })
    assert.equal(res3.originalSentenceCount, 7)
    assert.equal(res3.summarySentenceCount, 3)
    assert.ok(res3.summary.startsWith("• "))
    assert.ok(res3.reductionPercentage > 0)
    assert.ok(res3.keyThemes.length > 0)
    assert.ok(res3.formattedReport.includes("Executive Summary"))

    // Narrative mode
    const resNarrative = services.summarizeDocument(sampleArticle, {
      mode: "sentences",
      targetLength: 2,
      format: "narrative",
    })
    assert.equal(resNarrative.summarySentenceCount, 2)
    assert.ok(!resNarrative.summary.startsWith("• "))

    // Executive report format mode
    const resExec = services.summarizeDocument(sampleArticle, {
      mode: "sentences",
      targetLength: 2,
      format: "executive",
      title: "Q4 Roadmap",
    })
    assert.ok(resExec.summary.includes("Q4 Roadmap — Executive Summary"))
    assert.ok(resExec.summary.includes("Key Takeaways:"))
  })

  await t.test("1.2 Percentage mode calculation", () => {
    const res50 = services.summarizeDocument(sampleArticle, {
      mode: "percentage",
      targetLength: 50,
    })
    // 7 sentences * 50% = 4 sentences
    assert.equal(res50.summarySentenceCount, 4)

    const res25 = services.summarizeDocument(sampleArticle, {
      mode: "percentage",
      targetLength: 25,
    })
    // 7 sentences * 25% = 2 sentences
    assert.equal(res25.summarySentenceCount, 2)
  })

  await t.test("1.3 Chronological sentence ordering preservation", () => {
    const res = services.summarizeDocument(sampleArticle, {
      mode: "sentences",
      targetLength: 4,
      format: "bullet",
    })
    const bulletLines = res.summary
      .split("\n\n")
      .map((l) => l.replace(/^•\s*/, "").trim())
    const originalPositions = bulletLines.map((line) =>
      sampleArticle.indexOf(line),
    )

    for (let i = 1; i < originalPositions.length; i++) {
      assert.ok(
        originalPositions[i] > originalPositions[i - 1],
        "Summarized sentences must appear in their original document chronological order",
      )
    }
  })

  await t.test("1.4 Edge cases: empty text, single sentence, and alias export", () => {
    assert.throws(
      () => services.summarizeDocument(""),
      /Enter some text or document content to process/,
    )
    assert.throws(
      () => services.summarizeDocument("   \n\t  "),
      /Enter some text or document content to process/,
    )

    const single = services.summarizeDocument("A single informative sentence.")
    assert.equal(single.originalSentenceCount, 1)
    assert.equal(single.summarySentenceCount, 1)
    assert.equal(single.reductionPercentage, 0)

    // Verify alias summarizeText
    assert.equal(services.summarizeText, services.summarizeDocument)
  })
})

// ============================================================================
// SUITE 2: Multi-Tone Linguistic Rewriting Engine (Tool #27: rewrite)
// ============================================================================

test("Suite 2: Tool #27 rewriteContent (Multi-Tone Linguistic Engine)", async (t) => {
  await t.test("2.1 Professional tone: contraction expansion and formality upgrades", () => {
    const input = "I can't attend because we don't have enough time. But let's fix it soon."
    const res = services.rewriteContent(input, { tone: "Professional" })

    assert.equal(res.tone, "Professional")
    assert.ok(res.rewrittenText.includes("cannot"))
    assert.ok(res.rewrittenText.includes("do not"))
    assert.ok(res.rewrittenText.includes("let us"))
    assert.ok(res.replacementsCount > 0)
    assert.ok(res.formattedReport.includes("Rewritten Content Report (Professional Tone)"))
  })

  await t.test("2.2 Casual tone: contraction collapse and conversational styling", () => {
    const input = "I cannot believe that you do not want to attend the meeting. We are going to be late."
    const res = services.rewriteContent(input, { tone: "Casual" })

    assert.equal(res.tone, "Casual")
    assert.ok(res.rewrittenText.includes("can't"))
    assert.ok(res.rewrittenText.includes("don't"))
    assert.ok(res.rewrittenText.includes("We're") || res.rewrittenText.toLowerCase().includes("we're"))
  })

  await t.test("2.3 Academic tone: scholarly phrasing and elevated lexicon", () => {
    const input = "A lot of people think that the system is good, but it has problems."
    const res = services.rewriteContent(input, { tone: "Academic" })

    assert.equal(res.tone, "Academic")
    assert.ok(
      res.rewrittenText.includes("postulate") ||
      res.rewrittenText.includes("efficacious") ||
      res.rewrittenText.includes("considerable") ||
      res.rewrittenText.includes("adverse")
    )
  })

  await t.test("2.4 Concise tone: padding and redundancy elimination", () => {
    const input = "In order to complete the project at the present time, we must in the event that there are delays make a decision."
    const res = services.rewriteContent(input, { tone: "Concise" })

    assert.equal(res.tone, "Concise")
    assert.ok(!res.rewrittenText.includes("in order to"))
    assert.ok(!res.rewrittenText.includes("at the present time"))
    assert.ok(res.rewrittenText.toLowerCase().includes("to"))
    assert.ok(res.rewrittenText.includes("currently") || res.rewrittenText.includes("now"))
    assert.ok(res.newWordCount < res.originalWordCount)
  })

  await t.test("2.5 Persuasive tone: compelling and value-oriented diction", () => {
    const input = "Our team can try to make a change to the product and help you."
    const res = services.rewriteContent(input, { tone: "Persuasive" })

    assert.equal(res.tone, "Persuasive")
    assert.ok(
      res.rewrittenText.includes("guarantee") ||
      res.rewrittenText.includes("transform") ||
      res.rewrittenText.includes("empower") ||
      res.rewrittenText.includes("drive")
    )
  })

  await t.test("2.6 Casing preservation & Edge cases", () => {
    const titleInput = "Can't and Won't."
    const res = services.rewriteContent(titleInput, { tone: "Professional" })
    assert.ok(res.rewrittenText.includes("Cannot"))
    assert.ok(res.rewrittenText.includes("Will not"))

    assert.throws(
      () => services.rewriteContent("", { tone: "Professional" }),
      /Enter some text or document content to process/,
    )

    // Verify alias
    assert.equal(services.rewriteText, services.rewriteContent)
  })
})

// ============================================================================
// SUITE 3: Multilingual Phrase & Lexicon Translation (Tool #28: translate)
// ============================================================================

test("Suite 3: Tool #28 translateText & detectLanguage", async (t) => {
  await t.test("3.1 Language detection heuristic across supported languages", () => {
    assert.equal(services.detectLanguage("Good morning everyone. This is a project summary.").language, "English")
    assert.equal(services.detectLanguage("Buenos días. Este es un documento importante del proyecto.").language, "Spanish")
    assert.equal(services.detectLanguage("Bonjour tout le monde. Voici les résultats de l'équipe.").language, "French")
    assert.equal(services.detectLanguage("Guten Tag. Das ist ein wichtiger Bericht für die Arbeit.").language, "German")
    assert.equal(services.detectLanguage("Buongiorno a tutti. Questo è il lavoro del team.").language, "Italian")
    assert.equal(services.detectLanguage("Olá bom dia. Este é o projeto da nossa equipe.").language, "Portuguese")
    assert.equal(services.detectLanguage("你好。欢迎使用我们的项目文档。").language, "Chinese")
    assert.equal(services.detectLanguage("こんにちは。プロジェクトのドキュメントへようこそ。").language, "Japanese")
  })

  await t.test("3.2 English to all 7 target languages", () => {
    const input = "Hello, welcome to the project! Thank you for the important work."
    const targets = ["Spanish", "French", "German", "Italian", "Portuguese", "Chinese", "Japanese"]

    for (const tgt of targets) {
      const res = services.translateText(input, {
        sourceLanguage: "English",
        targetLanguage: tgt,
      })
      assert.equal(res.targetLanguage, tgt)
      assert.equal(res.sourceLanguage, "English")
      assert.ok(res.translatedWordCount > 0)
      assert.ok(res.coveragePercentage > 0)
      assert.ok(res.translatedText.length > 0)
    }
  })

  await t.test("3.3 Multi-word idioms translation", () => {
    const resES = services.translateText("good morning, thank you very much for as soon as possible.", {
      sourceLanguage: "English",
      targetLanguage: "Spanish",
    })
    assert.ok(resES.translatedText.includes("buenos días"))
    assert.ok(resES.translatedText.includes("muchas gracias"))

    const resFR = services.translateText("good morning, thank you very much", {
      sourceLanguage: "English",
      targetLanguage: "French",
    })
    assert.ok(resFR.translatedText.includes("bonjour"))
    assert.ok(resFR.translatedText.includes("merci beaucoup"))
  })

  await t.test("3.4 Reverse and identical language handling", () => {
    // Reverse: Spanish to English
    const resReverse = services.translateText("Hola, bienvenido al proyecto. Gracias.", {
      sourceLanguage: "Spanish",
      targetLanguage: "English",
    })
    assert.ok(resReverse.translatedText.toLowerCase().includes("hello") || resReverse.translatedText.toLowerCase().includes("welcome"))

    // Identical: Spanish to Spanish returns clean text with 100% coverage
    const resSame = services.translateText("Hola amigos.", {
      sourceLanguage: "Spanish",
      targetLanguage: "Spanish",
    })
    assert.equal(resSame.coveragePercentage, 100)
    assert.equal(resSame.translatedText, "Hola amigos.")
  })

  await t.test("3.5 Edge cases and input validation", () => {
    assert.throws(
      () => services.translateText("", { targetLanguage: "Spanish" }),
      /Enter some text or document content to process/,
    )
  })
})

// ============================================================================
// SUITE 4: Okapi BM25 Document QA Engine (Tool #29: ask)
// ============================================================================

test("Suite 4: Tool #29 askDocumentAI (BM25 Semantic Retrieval & QA Engine)", async (t) => {
  const multiPassageDoc = `
    FluxKit Security Architecture
    The encryption protocol utilizes AES-GCM-256 for all local storage persistence. The security review team confirmed zero remote vulnerabilities.
    
    Q4 Project Milestones and Schedule
    The final release deadline is November 28, 2026. All documentation and audit logs must be finalized before November 20, 2026.
    
    Executive Leadership & Stakeholders
    Elena Vance leads the engineering department as Chief Technology Officer. Marcus Brody oversees quality assurance and verification testing.
    
    Financial Budget and Performance
    The infrastructure expenditure was reduced by 42% through browser-native execution. Total capital allocation for 2026 was $1,500,000.
  `.trim()

  await t.test("4.1 Temporal question intent and deadline extraction", () => {
    const res = services.askDocumentAI(multiPassageDoc, {
      question: "When is the final release deadline?",
    })
    assert.equal(res.questionIntent, "temporal")
    assert.ok(res.primaryAnswer.includes("November 28, 2026"))
    assert.ok(res.confidenceScore >= 50)
    assert.ok(res.topPassages.length > 0)
    assert.ok(res.topPassages[0].paragraphNumber > 0)
    assert.ok(res.formattedReport.includes("Primary Answer") || res.formattedReport.includes("Direct Answer"))
  })

  await t.test("4.2 Quantitative question intent and numerical metrics", () => {
    const res = services.askDocumentAI(multiPassageDoc, {
      question: "How much was the infrastructure expenditure reduced?",
    })
    assert.equal(res.questionIntent, "quantitative")
    assert.ok(res.primaryAnswer.includes("42%"))
  })

  await t.test("4.3 Entity question intent and leadership attribution", () => {
    const res = services.askDocumentAI(multiPassageDoc, {
      question: "Who leads the engineering department as Chief Technology Officer?",
    })
    assert.equal(res.questionIntent, "entity")
    assert.ok(res.primaryAnswer.includes("Elena Vance"))
  })

  await t.test("4.4 Definition question intent and encryption protocol", () => {
    const res = services.askDocumentAI(multiPassageDoc, {
      question: "What encryption protocol is utilized for storage persistence?",
    })
    assert.ok(res.primaryAnswer.includes("AES-GCM-256"))
  })

  await t.test("4.5 Edge cases: missing document, missing question, and irrelevant query", () => {
    assert.throws(
      () => services.askDocumentAI("", { question: "What is this?" }),
      /Enter document text or upload a document to ask questions/,
    )
    assert.throws(
      () => services.askDocumentAI(multiPassageDoc, { question: "" }),
      /Please enter a question to ask the document/,
    )

    // Unrelated query returns graceful fallback without crashing
    const unrelated = services.askDocumentAI(multiPassageDoc, {
      question: "What is the favorite color of a Martian astronaut?",
    })
    assert.ok(unrelated.primaryAnswer)
    assert.ok(unrelated.confidenceScore <= 70)
  })
})

// ============================================================================
// SUITE 5: TF-IDF & RAKE Keyword Extractor (Tool #30: keywords)
// ============================================================================

test("Suite 5: Tool #30 extractKeywords (RAKE Collocations & Keyphrase Engine)", async (t) => {
  const sampleText = `
    Machine learning algorithms and natural language processing empower intelligent user interfaces.
    Modern client-side applications utilize machine learning models running directly in the browser environment.
    Data privacy, responsive design, and machine learning pipelines ensure seamless user engagement.
    Performance optimization is essential for browser-native machine learning workflows.
  `.trim()

  await t.test("5.1 Extracts ranked keywords with unigrams and bigrams", () => {
    const res = services.extractKeywords(sampleText, {
      maxKeywords: 10,
      includeNgrams: true,
    })

    assert.ok(res.keywords.length > 0)
    assert.ok(res.keywords.length <= 10)
    assert.ok(res.totalWords > 0)
    assert.ok(res.uniqueWords > 0)
    assert.ok(res.lexicalDiversity > 0 && res.lexicalDiversity <= 1)
    assert.ok(res.readingTimeMinutes >= 1)
    assert.ok(res.speakingTimeMinutes >= 1)

    // High-frequency keyphrase check
    const terms = res.keywords.map((k) => k.term.toLowerCase())
    assert.ok(
      terms.some((t) => t.includes("machine learning") || t === "learning" || t === "machine"),
      "Should extract 'machine learning' or dominant technical collocations",
    )
  })

  await t.test("5.2 Max keywords constraint adherence", () => {
    const res5 = services.extractKeywords(sampleText, { maxKeywords: 5 })
    assert.ok(res5.keywords.length <= 5)
    for (let i = 0; i < res5.keywords.length; i++) {
      assert.equal(res5.keywords[i].rank, i + 1)
    }
  })

  await t.test("5.3 Edge cases: empty text, stopwords only, single word", () => {
    assert.throws(
      () => services.extractKeywords(""),
      /Enter some text or document content to process/,
    )

    const single = services.extractKeywords("Architecture")
    assert.equal(single.totalWords, 1)
    assert.equal(single.keywords.length, 1)
    assert.equal(single.keywords[0].term.toLowerCase(), "architecture")

    const stopOnly = services.extractKeywords("in on at by with from about")
    assert.equal(stopOnly.totalWords, 7)
  })
})

// ============================================================================
// SUITE 6: Valence Sentiment Analysis Engine (Tool #31: sentiment)
// ============================================================================

test("Suite 6: Tool #31 analyzeSentiment (Valence Engine with Negation & Boosters)", async (t) => {
  await t.test("6.1 Strongly positive and negative sentiment classification", () => {
    const pos = services.analyzeSentiment("The software is fantastic, brilliant, outstanding, and delivers amazing value!")
    assert.equal(pos.polarity, "Positive")
    assert.ok(pos.compound > 0.5)
    assert.ok(pos.positiveWords.length >= 3)
    assert.ok(pos.breakdown.positive > pos.breakdown.negative)

    const neg = services.analyzeSentiment("The application is terrible, broken, horrible, and an awful disaster.")
    assert.equal(neg.polarity, "Negative")
    assert.ok(neg.compound < -0.5)
    assert.ok(neg.negativeWords.length >= 3)
    assert.ok(neg.breakdown.negative > pos.breakdown.positive)
  })

  await t.test("6.2 Negation handling flips sentiment valence", () => {
    const affirmed = services.analyzeSentiment("The user interface is good and clean.")
    assert.equal(affirmed.polarity, "Positive")

    const negated = services.analyzeSentiment("The user interface is not good and not clean.")
    assert.ok(
      negated.compound < affirmed.compound,
      "Negated positive words must reduce compound score significantly",
    )
  })

  await t.test("6.3 Booster amplifiers and dampeners", () => {
    const normal = services.analyzeSentiment("The latency is bad.")
    const amplified = services.analyzeSentiment("The latency is extremely bad.")
    assert.ok(
      amplified.compound < normal.compound,
      "Booster word 'extremely' must amplify negative valence",
    )
  })

  await t.test("6.4 Contrastive conjunction clause weighting", () => {
    const clause1 = services.analyzeSentiment("The presentation looked great, but the actual execution was horrible.")
    assert.equal(clause1.polarity, "Negative")

    const clause2 = services.analyzeSentiment("The initial draft had flaws, but the final outcome was magnificent.")
    assert.equal(clause2.polarity, "Positive")
  })

  await t.test("6.5 Neutral text and edge cases", () => {
    const neutral = services.analyzeSentiment("The report contains twelve pages printed on standard paper.")
    assert.equal(neutral.polarity, "Neutral")
    assert.ok(Math.abs(neutral.compound) <= 0.2)

    assert.throws(
      () => services.analyzeSentiment(""),
      /Enter some text or document content to process/,
    )
  })
})

// ============================================================================
// SUITE 7: Myers / DP LCS Text Diff Engine (Tool #32: compare)
// ============================================================================

test("Suite 7: Tool #32 compareTexts (LCS Diff & Similarity Scoring)", async (t) => {
  await t.test("7.1 Identical texts produce 100% similarity and 0 diffs", () => {
    const text = "First line\nSecond line\nThird line"
    const res = services.compareTexts(text, text, { granularity: "lines" })

    assert.equal(res.stats.similarityPercentage, 100)
    assert.equal(res.stats.additions, 0)
    assert.equal(res.stats.deletions, 0)
    assert.equal(res.stats.unchanged, 3)
    assert.ok(res.segments.every((s) => s.type === "unchanged"))
  })

  await t.test("7.2 Line additions and deletions are accurately detected", () => {
    const v1 = "Alpha\nBeta\nGamma"
    const v2 = "Alpha\nBeta\nDelta\nGamma"

    const res = services.compareTexts(v1, v2, { granularity: "lines" })
    assert.equal(res.stats.additions, 1)
    assert.equal(res.stats.deletions, 0)
    assert.equal(res.stats.unchanged, 3)
    assert.ok(res.segments.some((s) => s.type === "added" && s.value === "Delta"))
  })

  await t.test("7.3 Single line insertion does not invalidate subsequent matching lines", () => {
    const orig = "Header\nRow 1\nRow 2\nRow 3\nFooter"
    const mod = "Header\nINSERTED ROW\nRow 1\nRow 2\nRow 3\nFooter"

    const res = services.compareTexts(orig, mod, { granularity: "lines" })
    assert.equal(res.stats.additions, 1)
    assert.equal(res.stats.deletions, 0)
    assert.equal(res.stats.unchanged, 5)
    assert.ok(res.stats.similarityPercentage >= 90)
  })

  await t.test("7.4 Word-level diff granularity", () => {
    const orig = "The quick brown fox"
    const mod = "The fast brown fox"

    const res = services.compareTexts(orig, mod, { granularity: "words" })
    assert.ok(res.segments.some((s) => s.type === "deleted" && s.value.trim() === "quick"))
    assert.ok(res.segments.some((s) => s.type === "added" && s.value.trim() === "fast"))
  })

  await t.test("7.5 Whitespace and case-sensitivity toggles", () => {
    const orig = "Hello World"
    const mod = "hello world"

    const sensitive = services.compareTexts(orig, mod, { ignoreCase: false, granularity: "words" })
    assert.ok(sensitive.stats.additions > 0)

    const insensitive = services.compareTexts(orig, mod, { ignoreCase: true, granularity: "words" })
    assert.equal(insensitive.stats.similarityPercentage, 100)
  })

  await t.test("7.6 Disjoint texts produce 0% similarity", () => {
    const res = services.compareTexts("AAA", "BBB", { granularity: "lines" })
    assert.equal(res.stats.similarityPercentage, 0)
    assert.equal(res.stats.unchanged, 0)
  })
})

// ============================================================================
// SUITE 8: Natural Language Email Synthesizer (Tool #33: email)
// ============================================================================

test("Suite 8: Tool #33 generateEmail (Structured Email Synthesis Engine)", async (t) => {
  const notes = `
    - Completed Milestone 5 client-side text tools suite
    - 357 passing baseline tests validated with zero regressions
    - Need executive sign-off before shipping to production
  `.trim()

  await t.test("8.1 Generates cohesive draft across purpose and tone variations", () => {
    const res = services.generateEmail(notes, {
      purpose: "follow-up",
      tone: "professional",
      recipient: "Sarah Connor",
      callToAction: "Please confirm your availability for a 15-minute sync.",
    })

    assert.ok(res.salutation.includes("Sarah Connor"))
    assert.ok(res.subject.length > 0)
    assert.equal(res.alternativeSubjects.length, 4)
    assert.ok(res.bodyParagraphs.length > 0)
    assert.ok(res.callToAction.includes("Please confirm your availability"))
    assert.ok(res.signOff.length > 0)
    assert.ok(res.fullDraft.includes("Sarah Connor"))
    assert.ok(res.formattedReport.includes("Alternative Subject"))
  })

  await t.test("8.2 Tone calibrations: friendly vs urgent vs concise", () => {
    const friendly = services.generateEmail(notes, { tone: "friendly", recipient: "Alex" })
    assert.ok(friendly.salutation.startsWith("Hi Alex"))
    assert.ok(friendly.signOff.includes("Warm") || friendly.signOff.includes("Best"))

    const urgent = services.generateEmail(notes, { tone: "urgent", recipient: "Team" })
    assert.ok(urgent.salutation.includes("Attention Team"))

    const concise = services.generateEmail(notes, { tone: "concise", recipient: "David" })
    assert.ok(concise.bodyParagraphs.some((p) => p.includes("•") || p.includes("Highlights")))
  })

  await t.test("8.3 Purpose adaptations: proposal, thank-you, status-update", () => {
    const proposal = services.generateEmail(notes, { purpose: "proposal" })
    assert.ok(proposal.openingHook.toLowerCase().includes("proposal") || proposal.openingHook.toLowerCase().includes("initiative"))

    const thankYou = services.generateEmail(notes, { purpose: "thank-you" })
    assert.ok(thankYou.openingHook.toLowerCase().includes("thank you") || thankYou.openingHook.toLowerCase().includes("gratitude"))

    const status = services.generateEmail(notes, { purpose: "status-update" })
    assert.ok(status.openingHook.toLowerCase().includes("status") || status.openingHook.toLowerCase().includes("progress"))
  })

  await t.test("8.4 Fallback defaults for missing parameters", () => {
    const fallback = services.generateEmail("")
    assert.ok(fallback.recipient === "Colleague")
    assert.ok(fallback.subject.length > 0)
    assert.ok(fallback.fullDraft.length > 0)
  })
})

// ============================================================================
// SUITE 9: React Route Mounting & Interactive UI Options Panel Verification
// ============================================================================

test("Suite 9: React Route Mounting & UI Options Panel Verification", async (t) => {
  const aiTools = [
    {
      hash: "summarize",
      name: "Summarize Document",
      actionVerb: "Summarize Document",
      panelExpectations: ["Length Mode", "Summary Length", "Output Format", "Sentence Count", "Document Percentage"],
    },
    {
      hash: "rewrite",
      name: "Rewrite Content",
      actionVerb: "Rewrite Content",
      panelExpectations: ["Target Tone & Voice", "Professional & Polished", "Concise & Direct", "Casual & Conversational"],
    },
    {
      hash: "translate",
      name: "Translate Text",
      actionVerb: "Translate Text",
      panelExpectations: ["Source Language", "Target Language", "Auto-Detect", "Spanish (Español)", "French (Français)"],
    },
    {
      hash: "ask",
      name: "Ask Document AI",
      actionVerb: "Ask Document AI",
      panelExpectations: ["Question to Ask Document", "Suggested:", "What is the main summary?", "What are the deadlines?"],
    },
    {
      hash: "keywords",
      name: "Extract Keywords",
      actionVerb: "Extract Keywords",
      panelExpectations: ["Maximum Keywords", "Top 10 Keywords (Standard)", "Include 2-word collocations"],
    },
    {
      hash: "sentiment",
      name: "Analyze Sentiment",
      actionVerb: "Analyze Sentiment",
      panelExpectations: ["Show detailed word-by-word valence ratings"],
    },
    {
      hash: "compare",
      name: "Compare Texts",
      actionVerb: "Compare Texts",
      panelExpectations: ["Diff Granularity", "Line by Line", "Ignore Whitespace Differences", "Comparison Text (Version B)", "Base Text (Version A)"],
    },
    {
      hash: "email",
      name: "Generate an Email",
      actionVerb: "Generate Email",
      panelExpectations: ["Email Purpose", "Tone & Style", "Recipient or Audience", "Subject Topic", "Call to Action"],
    },
  ]

  for (const item of aiTools) {
    await t.test(`Route #${item.hash} renders active options panel and action button '${item.actionVerb}'`, () => {
      const { load } = createDOMEnv(item.hash)
      const App = load("App").default
      const html = renderToStaticMarkup(React.createElement(App))

      // No 404 and no coming soon
      assert.ok(!html.includes("404 · A SMALL DETOUR"), `Route #${item.hash} must not render 404`)
      assert.ok(!html.includes("Coming soon"), `Route #${item.hash} must not show 'Coming soon'`)

      // Verify tool name and action verb
      const escapedName = item.name.replace(/&/g, "&amp;")
      assert.ok(
        html.includes(item.name) || html.includes(escapedName),
        `Route #${item.hash} must render header with tool name '${item.name}'`,
      )
      assert.ok(
        html.includes(item.actionVerb),
        `Route #${item.hash} must render dedicated action button '${item.actionVerb}'`,
      )

      // Verify dual-input document upload bar
      assert.ok(
        html.includes("Load text from file (.txt, .md, .pdf)"),
        `Route #${item.hash} must render document uploader bar`,
      )

      // Verify tool-specific options panel controls
      for (const expectation of item.panelExpectations) {
        const escaped = expectation.replace(/&/g, "&amp;")
        assert.ok(
          html.includes(expectation) || html.includes(escaped),
          `Route #${item.hash} options panel must render '${expectation}'`,
        )
      }
    })
  }
})
