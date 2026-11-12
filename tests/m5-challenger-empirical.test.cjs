const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

// ============================================================================
// Independent Dynamic Loader for TypeScript Services
// ============================================================================

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

const services = loadServices()

// ============================================================================
// SUITE 1: Tool #26 summarizeDocument (Extractive Sentence & Chronology Fidelity)
// ============================================================================

test("Suite 1 [Adversarial]: Tool #26 summarizeDocument", async (t) => {
  const corpus = [
    "Quantum computing leverages superposition and entanglement to solve intractable computational problems.",
    "Classical supercomputers require weeks to simulate molecular bonds that a quantum processor resolves in seconds.",
    "Security researchers caution that Shor's algorithm will eventually compromise existing RSA-2048 encryption.",
    "Post-quantum cryptography standards established by NIST provide lattice-based defense against future quantum attacks.",
    "Global venture investment in quantum hardware surpassed $3.8 billion in 2025 across North America and Europe.",
    "Commercial viability remains contingent upon reaching fault tolerance with physical qubit error rates below 0.1 percent.",
    "Cloud providers are now deploying hybrid quantum-classical compute pipelines for enterprise optimization.",
    "The ongoing transition marks a fundamental paradigm shift in cryptographic infrastructure and computational biology.",
  ].join(" ")

  await t.test("1.1 Strict Extractive Sentence Retention (No Hallucination)", () => {
    const res = services.summarizeDocument(corpus, {
      mode: "sentences",
      targetLength: 3,
      format: "bullet",
    })

    assert.equal(res.summarySentenceCount, 3)
    const bulletSentences = res.summary
      .split("\n\n")
      .map((s) => s.replace(/^•\s*/, "").trim())

    assert.equal(bulletSentences.length, 3)
    bulletSentences.forEach((sentence) => {
      assert.ok(
        corpus.includes(sentence),
        `Extracted sentence "${sentence}" must exist verbatim in source corpus`,
      )
    })
  })

  await t.test("1.2 Chronological Invariant (Sentences never reorder backwards)", () => {
    const res = services.summarizeDocument(corpus, {
      mode: "sentences",
      targetLength: 4,
      format: "narrative",
    })

    const rawSentences = corpus.split(/(?<=[.?!])\s+/).map((s) => s.trim())
    const summarySentences = res.summary
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())

    let lastIdx = -1
    summarySentences.forEach((s) => {
      const idx = rawSentences.findIndex((orig) => orig.includes(s) || s.includes(orig))
      assert.ok(idx > lastIdx, `Chronological order violated: idx ${idx} must be > lastIdx ${lastIdx}`)
      lastIdx = idx
    })
  })

  await t.test("1.3 Percentage Bounding & Exact Sentence Targets", () => {
    // 8 total sentences: 25% of 8 = 2 sentences
    const res25 = services.summarizeDocument(corpus, {
      mode: "percentage",
      targetLength: 25,
    })
    assert.equal(res25.summarySentenceCount, 2)

    // 50% of 8 = 4 sentences
    const res50 = services.summarizeDocument(corpus, {
      mode: "percentage",
      targetLength: 50,
    })
    assert.equal(res50.summarySentenceCount, 4)

    // Requesting more than available sentences caps at max sentences without crashing
    const resOver = services.summarizeDocument(corpus, {
      mode: "sentences",
      targetLength: 99,
    })
    assert.equal(resOver.summarySentenceCount, 8)
  })

  await t.test("1.4 Format Output Variants & Custom Titles", () => {
    const bullet = services.summarizeDocument(corpus, { format: "bullet", targetLength: 2 })
    assert.ok(bullet.summary.startsWith("• "))
    assert.ok(bullet.summary.includes("\n\n• "))

    const narrative = services.summarizeDocument(corpus, { format: "narrative", targetLength: 2 })
    assert.ok(!narrative.summary.startsWith("• "))

    const exec = services.summarizeDocument(corpus, {
      format: "executive",
      targetLength: 2,
      title: "Quantum Defense 2026",
    })
    assert.ok(exec.summary.includes("Quantum Defense 2026 — Executive Summary"))
    assert.ok(exec.summary.includes("Key Takeaways:"))
    assert.ok(exec.summary.includes("• "))
  })

  await t.test("1.5 Numerical and Financial Entity Scoring Boost (1.1x Multiplier)", () => {
    const testDoc = [
      "Introductory sentence number one provides context.",
      "Second sentence outlining overall enterprise scope.",
      "Middle operational activity without any numbers.",
      "Middle operational activity with 45% performance increase.",
      "Final concluding sentence of this quarterly report.",
    ].join(" ")

    // Request top 4 sentences from 5.
    // idx 0, 1, and 4 get positional prominence (1.35x, 1.2x, 1.15x).
    // Between middle sentences idx 2 (1.0x) and idx 3 (1.0x * 1.1x = 1.1x),
    // idx 3 must beat idx 2 because of the numerical/percentage boost.
    const res = services.summarizeDocument(testDoc, { targetLength: 4 })
    assert.ok(
      res.summary.includes("45%"),
      "Sentence with numerical percentage must be prioritized by factual boost over non-numeric peer",
    )
    assert.ok(
      !res.summary.includes("Middle operational activity without any numbers"),
      "Non-numeric peer sentence should be omitted in favor of the boosted numeric sentence",
    )
  })

  await t.test("1.6 Edge Cases: 1-sentence input, diverse punctuation, error on empty", () => {
    assert.throws(() => services.summarizeDocument(""), /Enter some text/)
    assert.throws(() => services.summarizeDocument("   \t\n  "), /Enter some text/)

    const single = services.summarizeDocument("This is an isolated single statement.")
    assert.equal(single.originalSentenceCount, 1)
    assert.equal(single.summarySentenceCount, 1)
    assert.equal(single.reductionPercentage, 0)

    const exclamatory = services.summarizeDocument("System initialized! Diagnostic complete? All services operational.")
    assert.equal(exclamatory.originalSentenceCount, 3)

    assert.equal(services.summarizeText, services.summarizeDocument)
  })

  await t.test("1.7 Large Text Performance Stress (500+ Sentences)", () => {
    const largeSentences = []
    for (let i = 1; i <= 500; i++) {
      largeSentences.push(`Automated pipeline step ${i} completed data verification for batch ${i * 10} with high fidelity.`)
    }
    const largeDoc = largeSentences.join(" ")
    const start = Date.now()
    const res = services.summarizeDocument(largeDoc, { mode: "percentage", targetLength: 10 })
    const elapsed = Date.now() - start
    assert.ok(elapsed < 2000, `Summarization of 500 sentences should finish in < 2000ms, took ${elapsed}ms`)
    assert.equal(res.summarySentenceCount, 50)
  })
})

// ============================================================================
// SUITE 2: Tool #27 rewriteContent (5-Tone Linguistic Differentiation)
// ============================================================================

test("Suite 2 [Adversarial]: Tool #27 rewriteContent", async (t) => {
  const inputColloquial = "I can't fix this bug right now because we don't have enough time, but I'll tell the team to start anyway."
  const inputWordy = "In order to complete the project on schedule, due to the fact that we have a large number of tasks, we should act at the present time."

  await t.test("2.1 Professional Tone: Expands contractions & upgrades colloquial terms", () => {
    const res = services.rewriteContent(inputColloquial, { tone: "Professional" })
    assert.equal(res.tone, "Professional")
    assert.ok(res.replacementsCount > 0)
    assert.ok(res.rewrittenText.includes("cannot"))
    assert.ok(res.rewrittenText.includes("do not"))
    assert.ok(!res.rewrittenText.includes("can't"))
    assert.ok(!res.rewrittenText.includes("don't"))
    assert.ok(res.rewrittenText.includes("resolve") || res.rewrittenText.includes("rectify"))
    assert.ok(res.rewrittenText.includes("inform") || res.rewrittenText.includes("notify"))
    assert.ok(res.rewrittenText.includes("commence"))
  })

  await t.test("2.2 Casual Tone: Collapses contractions & simplifies vocabulary", () => {
    const formalInput = "We cannot commence the deployment because we do not have approval to purchase the hardware."
    const res = services.rewriteContent(formalInput, { tone: "Casual" })
    assert.equal(res.tone, "Casual")
    assert.ok(res.rewrittenText.includes("can't"))
    assert.ok(res.rewrittenText.includes("don't"))
    assert.ok(res.rewrittenText.includes("start") || res.rewrittenText.includes("kick off"))
    assert.ok(res.rewrittenText.includes("buy"))
  })

  await t.test("2.3 Academic Tone: Introduces scholarly discourse transitions", () => {
    const plainInput = "We don't know the exact answer, but this shows that the theory is clear. We will look into the evidence to prove our hypothesis."
    const res = services.rewriteContent(plainInput, { tone: "Academic" })
    assert.equal(res.tone, "Academic")
    assert.ok(res.rewrittenText.includes("do not"))
    // Academic vocabulary: shows -> illustrates, answer -> resolution, clear -> evident, look into -> investigate, prove -> substantiate
    assert.ok(res.rewrittenText.includes("illustrates"))
    assert.ok(res.rewrittenText.includes("resolution"))
    assert.ok(res.rewrittenText.includes("evident"))
    assert.ok(res.rewrittenText.includes("investigate"))
    assert.ok(res.rewrittenText.includes("substantiate"))
  })

  await t.test("2.4 Concise Tone: Prunes redundant verbiage", () => {
    const res = services.rewriteContent(inputWordy, { tone: "Concise" })
    assert.equal(res.tone, "Concise")
    // "In order to" -> "To", "due to the fact that" -> "because", "a large number of" -> "many", "at the present time" -> "currently"
    assert.ok(res.rewrittenText.startsWith("To"))
    assert.ok(res.rewrittenText.toLowerCase().includes("because"))
    assert.ok(res.rewrittenText.toLowerCase().includes("many"))
    assert.ok(res.rewrittenText.toLowerCase().includes("currently"))
    assert.ok(!res.rewrittenText.toLowerCase().includes("due to the fact that"))
    assert.ok(res.newWordCount < res.originalWordCount)
  })

  await t.test("2.5 Persuasive Tone: Amplifies impact adjectives & urgency", () => {
    const flatInput = "We have a good opportunity to improve our product, solve this problem, and get better results for our clients."
    const res = services.rewriteContent(flatInput, { tone: "Persuasive" })
    assert.equal(res.tone, "Persuasive")
    // good -> exceptional, improve -> transform, problem -> critical bottleneck, better -> superior
    assert.ok(res.rewrittenText.includes("exceptional"))
    assert.ok(res.rewrittenText.includes("transform"))
    assert.ok(res.rewrittenText.includes("critical bottleneck"))
    assert.ok(res.rewrittenText.includes("superior"))
  })

  await t.test("2.6 Casing Preservation (TitleCase, UPPERCASE, lowercase)", () => {
    const resUpper = services.rewriteContent("WE CANNOT COMMENCE UNTIL WE BUY THE SERVERS.", { tone: "Casual" })
    assert.ok(resUpper.rewrittenText.includes("CAN'T"))
    assert.ok(resUpper.rewrittenText.includes("START"))

    const resTitle = services.rewriteContent("In Order To proceed, Fix The Issue.", { tone: "Concise" })
    assert.ok(resTitle.rewrittenText.startsWith("To"))
  })

  await t.test("2.7 Edge cases: error handling and aliases", () => {
    assert.throws(() => services.rewriteContent("", { tone: "Professional" }), /Enter some text/)
    assert.throws(() => services.rewriteContent("   ", { tone: "Professional" }), /Enter some text/)
    assert.equal(services.rewriteText, services.rewriteContent)
  })
})

// ============================================================================
// SUITE 3: Tool #28 translateText & detectLanguage (8 Languages & Multilingual Idioms)
// ============================================================================

test("Suite 3 [Adversarial]: Tool #28 translateText & detectLanguage", async (t) => {
  const languages = [
    { lang: "English", sample: "The project team will deliver the quarterly report tomorrow morning." },
    { lang: "Spanish", sample: "Los resultados del proyecto son excelentes para el equipo de desarrollo." },
    { lang: "French", sample: "Le rapport pour les directeurs avec les détails importants et merci pour tout." },
    { lang: "German", sample: "Das Projekt ist sehr gut und nicht schwer mit dem Team und danke." },
    { lang: "Italian", sample: "Il progetto è molto importante per il lavoro e grazie per l'aiuto." },
    { lang: "Portuguese", sample: "O relatório do projeto da nossa equipe é muito bom, obrigado pelo apoio." },
    { lang: "Chinese", sample: "我们的团队在今天完成了这个非常重要的项目报告。" },
    { lang: "Japanese", sample: "私たちのチームは本日プロジェクトレポートを完了しました。" },
  ]

  await t.test("3.1 Language Detection Accuracy Across All 8 Languages", () => {
    languages.forEach(({ lang, sample }) => {
      const detected = services.detectLanguage(sample)
      assert.equal(
        detected.language,
        lang,
        `Expected sample "${sample}" to be detected as ${lang}, got ${detected.language} (confidence: ${detected.confidence}%)`,
      )
      assert.ok(detected.confidence >= 60, `Detection confidence should be >= 60% for ${lang}`)
    })
  })

  await t.test("3.2 Portuguese vs Spanish Differentiation Check", () => {
    const ptSample = "O sucesso do projeto da nossa empresa é muito bom. Obrigado você."
    const ptResult = services.detectLanguage(ptSample)
    assert.equal(ptResult.language, "Portuguese", "Must detect Portuguese without confusing with Spanish")

    const esSample = "El éxito del proyecto de nuestra empresa es muy bueno. Gracias."
    const esResult = services.detectLanguage(esSample)
    assert.equal(esResult.language, "Spanish", "Must detect Spanish")
  })

  await t.test("3.3 Multi-Word Business Idioms Translation Across All 8 Languages", () => {
    const idiomEn = "Good morning. Please find attached the quarterly invoice. Thank you very much, Best regards."

    const targets = ["Spanish", "French", "German", "Italian", "Portuguese", "Chinese", "Japanese"]

    targets.forEach((targetLang) => {
      const res = services.translateText(idiomEn, {
        sourceLanguage: "English",
        targetLanguage: targetLang,
      })

      assert.equal(res.targetLanguage, targetLang)
      assert.ok(res.coveragePercentage > 0, `Coverage in ${targetLang} should be > 0%`)
      assert.notEqual(res.translatedText, idiomEn, `Translation to ${targetLang} must alter the text`)

      if (targetLang === "Spanish") {
        assert.ok(res.translatedText.includes("Buenos días") || res.translatedText.includes("buenos días"))
        assert.ok(res.translatedText.includes("Muchas gracias") || res.translatedText.includes("muchas gracias"))
        assert.ok(res.translatedText.includes("Saludos cordiales") || res.translatedText.includes("factura"))
      } else if (targetLang === "French") {
        assert.ok(res.translatedText.includes("Bonjour") || res.translatedText.includes("bonjour"))
        assert.ok(res.translatedText.includes("Merci beaucoup") || res.translatedText.includes("merci beaucoup"))
      } else if (targetLang === "German") {
        assert.ok(res.translatedText.includes("Guten Morgen") || res.translatedText.includes("guten morgen"))
        assert.ok(res.translatedText.includes("Vielen Dank") || res.translatedText.includes("vielen dank"))
      } else if (targetLang === "Portuguese") {
        assert.ok(res.translatedText.includes("Bom dia") || res.translatedText.includes("bom dia"))
        assert.ok(res.translatedText.includes("Muito obrigado") || res.translatedText.includes("muito obrigado"))
      }
    })
  })

  await t.test("3.4 Identity / No-op Translation (Source equals Target)", () => {
    const text = "This sentence should remain strictly identical."
    const res = services.translateText(text, {
      sourceLanguage: "English",
      targetLanguage: "English",
    })
    assert.equal(res.translatedText, text)
    assert.equal(res.coveragePercentage, 100)
    assert.ok(res.formattedReport.includes("Source and target are identical"))
  })

  await t.test("3.5 Casing Preservation Across Lexicon Terms", () => {
    const resTitle = services.translateText("Company Project Team", {
      sourceLanguage: "English",
      targetLanguage: "Spanish",
    })
    assert.ok(resTitle.translatedText.includes("Empresa") || resTitle.translatedText.includes("Proyecto") || resTitle.translatedText.includes("Equipo"))
  })

  await t.test("3.6 Edge cases: error handling", () => {
    assert.throws(() => services.translateText("", { targetLanguage: "Spanish" }), /Enter some text/)
    assert.throws(() => services.translateText("   ", { targetLanguage: "Spanish" }), /Enter some text/)
  })
})

// ============================================================================
// SUITE 4: Tool #29 askDocumentAI (Okapi BM25 Ranking & Intent Classification)
// ============================================================================

test("Suite 4 [Adversarial]: Tool #29 askDocumentAI", async (t) => {
  const documentText = `
    The financial budget for Project Nebula was officially ratified at $4,500,000 for fiscal year 2026. Capital expenditure reserves account for 35% of total allocation, with operational expenditures capped at $2,900,000.

    Dr. Evelyn Cross serves as Chief Scientific Officer and principal architect of the quantum algorithm suite. Marcus Holloway leads enterprise client relations and regulatory compliance across European jurisdictions.

    The primary launch milestone is scheduled for November 18, 2026, following alpha validation in August. The public beta release deadline is strictly enforced for September 30, 2026.

    Global engineering headquarters are situated in Zurich, Switzerland, within the Technopark campus. Secondary satellite offices operate in Tokyo, Japan, and Austin, Texas.
  `.trim()

  await t.test("4.1 Intent Classification Engine across Diverse Question Types", () => {
    const questions = [
      { q: "When is the launch milestone scheduled?", expected: "temporal" },
      { q: "What is the total budget for Project Nebula?", expected: "quantitative" },
      { q: "Who is the Chief Scientific Officer?", expected: "entity" },
      { q: "Where are the engineering headquarters located?", expected: "locative" },
      { q: "Why did the committee decide to approve the initiative?", expected: "causal" },
      { q: "What is the definition of Project Nebula?", expected: "definition" },
    ]

    questions.forEach(({ q, expected }) => {
      const res = services.askDocumentAI(documentText, { question: q })
      assert.equal(res.questionIntent, expected, `Question "${q}" must classify as ${expected}, got ${res.questionIntent}`)
    })
  })

  await t.test("4.2 BM25 Retrieval & Targeted Answer Pinpointing", () => {
    // Temporal Query -> Paragraph 3
    const resTemporal = services.askDocumentAI(documentText, {
      question: "When is the public beta release deadline?",
    })
    assert.ok(resTemporal.topPassages.length > 0)
    assert.ok(resTemporal.topPassages[0].text.includes("November 18, 2026") || resTemporal.topPassages[0].text.includes("September 30, 2026"))
    assert.ok(resTemporal.primaryAnswer.includes("September 30, 2026") || resTemporal.primaryAnswer.includes("deadline"))
    assert.ok(resTemporal.confidenceScore >= 50)

    // Quantitative Query -> Paragraph 1
    const resBudget = services.askDocumentAI(documentText, {
      question: "What is the capital expenditure budget allocation?",
    })
    assert.ok(resBudget.topPassages[0].text.includes("$4,500,000") || resBudget.topPassages[0].text.includes("35%"))
    assert.ok(resBudget.primaryAnswer.includes("$4,500,000") || resBudget.primaryAnswer.includes("35%"))

    // Entity Query -> Paragraph 2
    const resEntity = services.askDocumentAI(documentText, {
      question: "Who leads enterprise client relations and regulatory compliance?",
    })
    assert.ok(resEntity.topPassages[0].text.includes("Marcus Holloway"))
    assert.ok(resEntity.primaryAnswer.includes("Marcus Holloway"))

    // Locative Query -> Paragraph 4
    const resLoc = services.askDocumentAI(documentText, {
      question: "Where is the global headquarters campus situated?",
    })
    assert.ok(resLoc.topPassages[0].text.includes("Zurich, Switzerland"))
    assert.ok(resLoc.primaryAnswer.includes("Zurich") || resLoc.primaryAnswer.includes("Technopark"))
  })

  await t.test("4.3 Single Paragraph Auto-Chunking", () => {
    const singlePara = "First sentence talks about alpha test. Second sentence gives date May 2026. Third sentence mentions beta test. Fourth sentence describes production launch in December."
    const res = services.askDocumentAI(singlePara, {
      question: "When is the beta test?",
    })
    assert.ok(res.totalDocumentPassages >= 2, "Single paragraph must chunk into multiple passages")
    assert.ok(res.primaryAnswer.includes("beta test") || res.primaryAnswer.includes("May 2026"))
  })

  await t.test("4.4 Zero-Match Query Fallback (Graceful Degradation)", () => {
    const res = services.askDocumentAI(documentText, {
      question: "What is the recipe for chocolate chip cookies?",
    })
    assert.ok(res.primaryAnswer.length > 0)
    assert.ok(res.confidenceScore <= 40)
  })

  await t.test("4.5 Edge cases: missing parameters error handling", () => {
    assert.throws(() => services.askDocumentAI("", { question: "Who?" }), /Enter document text/)
    assert.throws(() => services.askDocumentAI(documentText, { question: "" }), /enter a question/)
  })
})

// ============================================================================
// SUITE 5: Tool #30 extractKeywords (RAKE Keyphrase Degree Engine)
// ============================================================================

test("Suite 5 [Adversarial]: Tool #30 extractKeywords", async (t) => {
  const article = `
    Autonomous vehicle software requires high-performance perception systems and real-time sensor fusion.
    Machine learning models process multimodal lidar data and camera feeds to ensure pedestrian safety.
    Edge compute hardware executes deep neural networks with deterministic latency bounds in all weather conditions.
    Modern autonomous vehicle software architectures minimize end-to-end inference delays to prevent collisions.
    Sensor fusion algorithms synthesize radar telemetry with stereoscopic vision to construct dynamic spatial maps.
  `.trim()

  await t.test("5.1 RAKE Keyphrase Extraction (Unigrams, Bigrams, Trigrams)", () => {
    const res = services.extractKeywords(article, {
      maxKeywords: 8,
      includeNgrams: true,
    })

    assert.ok(res.keywords.length > 0 && res.keywords.length <= 8)
    const hasNgram = res.keywords.some((k) => k.type === "bigram" || k.type === "trigram")
    assert.ok(hasNgram, "RAKE extractor must detect multi-word keyphrases (bigrams or trigrams)")

    assert.equal(res.keywords[0].rank, 1)
    assert.equal(res.keywords[0].score, 100)

    for (let i = 1; i < res.keywords.length; i++) {
      assert.ok(res.keywords[i].rank === i + 1)
      assert.ok(res.keywords[i].score <= res.keywords[i - 1].score)
    }
  })

  await t.test("5.2 Lexical Diversity & Time Estimates", () => {
    const res = services.extractKeywords(article)
    assert.ok(res.totalWords > 40)
    assert.ok(res.uniqueWords > 20)
    assert.ok(res.lexicalDiversity > 0 && res.lexicalDiversity <= 1)
    assert.ok(res.readingTimeMinutes >= 1)
    assert.ok(res.speakingTimeMinutes >= 1)
  })

  await t.test("5.3 Options Constraints: maxKeywords and includeNgrams: false", () => {
    const unigramText = "Cats climb trees. Dogs chase birds. Fish swim rivers. Bears catch salmon."
    const resOnlyUnigrams = services.extractKeywords(unigramText, {
      includeNgrams: false,
      maxKeywords: 4,
    })

    assert.equal(resOnlyUnigrams.keywords.length, 4)
    resOnlyUnigrams.keywords.forEach((k) => {
      assert.equal(k.type, "unigram", `Keyword "${k.term}" must be unigram when includeNgrams=false`)
    })
  })

  await t.test("5.4 Edge cases: error handling", () => {
    assert.throws(() => services.extractKeywords(""), /Enter some text/)
    assert.throws(() => services.extractKeywords("   "), /Enter some text/)
  })
})

// ============================================================================
// SUITE 6: Tool #31 analyzeSentiment (AFINN-165 Valence & VADER Compound)
// ============================================================================

test("Suite 6 [Adversarial]: Tool #31 analyzeSentiment", async (t) => {
  await t.test("6.1 High-Positive Valence & Mood Profile", () => {
    const text = "Outstanding achievement! The team delivered an excellent, brilliant, and wonderful product that exceeded all expectations with magnificent success."
    const res = services.analyzeSentiment(text)
    assert.equal(res.polarity, "Positive")
    assert.ok(res.compound >= 0.7, `Expected compound >= 0.7, got ${res.compound}`)
    assert.equal(res.mood, "Joyful & Enthusiastic")
    assert.ok(res.positiveWords.length >= 3)
    assert.equal(res.negativeWords.length, 0)
  })

  await t.test("6.2 High-Negative Valence & Mood Profile", () => {
    const text = "Catastrophic failure. The system encountered a terrible, horrible crash resulting in disastrous data loss and severe damage."
    const res = services.analyzeSentiment(text)
    assert.equal(res.polarity, "Negative")
    assert.ok(res.compound <= -0.7, `Expected compound <= -0.7, got ${res.compound}`)
    assert.equal(res.mood, "Frustrated & Alarmed")
    assert.ok(res.negativeWords.length >= 3)
    assert.equal(res.positiveWords.length, 0)
  })

  await t.test("6.3 Neutral Objective Content", () => {
    const text = "The scheduled background worker executed at 04:00 UTC and verified data integrity across three partitions."
    const res = services.analyzeSentiment(text)
    assert.equal(res.polarity, "Neutral")
    assert.ok(Math.abs(res.compound) < 0.05)
    assert.equal(res.mood, "Objective & Impartial")
  })

  await t.test("6.4 Negation Reversal Inversion Logic", () => {
    const normalGood = services.analyzeSentiment("The results are good.")
    assert.ok(normalGood.compound > 0)

    const negatedGood = services.analyzeSentiment("The results are not good.")
    assert.ok(negatedGood.compound < 0, `Expected 'not good' to be negative, got ${negatedGood.compound}`)

    const negatedBad = services.analyzeSentiment("The performance was not bad.")
    assert.ok(negatedBad.compound > 0, `Expected 'not bad' to be positive, got ${negatedBad.compound}`)
  })

  await t.test("6.5 Modifiers: Amplifiers, Dampeners, and ALL-CAPS", () => {
    const baseline = services.analyzeSentiment("The report is good.")
    const amplified = services.analyzeSentiment("The report is extremely good.")
    const dampened = services.analyzeSentiment("The report is slightly good.")
    const shouted = services.analyzeSentiment("The report is GOOD.")

    assert.ok(amplified.compound > baseline.compound, "Amplifier should increase positive score")
    assert.ok(dampened.compound < baseline.compound, "Dampener should decrease positive score")
    assert.ok(shouted.compound > baseline.compound, "ALL-CAPS should boost valence score")
  })

  await t.test("6.6 Contrastive Conjunction Clause Weighting ('..., but ...')", () => {
    const text = "The presentation was great, but the actual execution was terrible and awful."
    const res = services.analyzeSentiment(text)
    assert.equal(res.polarity, "Negative", "Post-'but' negative clause should dominate")
    assert.ok(res.compound < 0)
  })

  await t.test("6.7 Edge cases: error handling", () => {
    assert.throws(() => services.analyzeSentiment(""), /Enter some text/)
    assert.throws(() => services.analyzeSentiment("   "), /Enter some text/)
  })
})

// ============================================================================
// SUITE 7: Tool #32 compareTexts (LCS Dynamic Programming Diff)
// ============================================================================

test("Suite 7 [Adversarial]: Tool #32 compareTexts", async (t) => {
  await t.test("7.1 Identical Texts (100% Similarity)", () => {
    const text = "First line of text\nSecond line of text\nThird line of text"
    const res = services.compareTexts(text, text, { granularity: "lines" })
    assert.equal(res.stats.similarityPercentage, 100)
    assert.equal(res.stats.additions, 0)
    assert.equal(res.stats.deletions, 0)
    assert.equal(res.stats.unchanged, 3)
    assert.ok(res.segments.every((s) => s.type === "unchanged"))
  })

  await t.test("7.2 Disjoint Texts (0% Similarity)", () => {
    const res = services.compareTexts("Alpha", "Beta", { granularity: "lines" })
    assert.equal(res.stats.similarityPercentage, 0)
    assert.equal(res.stats.deletions, 1)
    assert.equal(res.stats.additions, 1)
    assert.equal(res.stats.unchanged, 0)
  })

  await t.test("7.3 Granularities: lines, words, characters", () => {
    const orig = "The swift red fox"
    const mod = "The swift brown fox"

    // Words granularity
    const resWords = services.compareTexts(orig, mod, { granularity: "words" })
    assert.ok(resWords.stats.similarityPercentage > 70)
    assert.ok(resWords.segments.some((s) => s.type === "deleted" && s.value === "red"))
    assert.ok(resWords.segments.some((s) => s.type === "added" && s.value === "brown"))

    // Characters granularity
    const resChars = services.compareTexts("cat", "bat", { granularity: "chars" })
    assert.ok(resChars.segments.some((s) => s.type === "deleted" && s.value === "c"))
    assert.ok(resChars.segments.some((s) => s.type === "added" && s.value === "b"))
  })

  await t.test("7.4 Options: ignoreWhitespace and ignoreCase", () => {
    const a = "Hello   World"
    const b = "hello world"

    // Default without ignore options
    const resDefault = services.compareTexts(a, b, { granularity: "words" })
    assert.notEqual(resDefault.stats.similarityPercentage, 100)

    // With ignoreWhitespace and ignoreCase
    const resIgnored = services.compareTexts(a, b, {
      granularity: "words",
      ignoreWhitespace: true,
      ignoreCase: true,
    })
    assert.equal(resIgnored.stats.similarityPercentage, 100)
    assert.equal(resIgnored.stats.additions, 0)
    assert.equal(resIgnored.stats.deletions, 0)
  })

  await t.test("7.5 Unified Diff Header & Structure", () => {
    const res = services.compareTexts("Line 1\nLine 2", "Line 1\nLine Modified", { granularity: "lines" })
    assert.ok(res.unifiedDiffText.startsWith("--- a/original\n+++ b/modified"))
    assert.ok(res.unifiedDiffText.includes("  Line 1"))
    assert.ok(res.unifiedDiffText.includes("- Line 2"))
    assert.ok(res.unifiedDiffText.includes("+ Line Modified"))
  })

  await t.test("7.6 Edge cases: both empty, one empty", () => {
    const emptyBoth = services.compareTexts("", "")
    assert.equal(emptyBoth.stats.similarityPercentage, 100)
    assert.equal(emptyBoth.stats.additions, 0)
    assert.equal(emptyBoth.stats.deletions, 0)

    const oneEmpty = services.compareTexts("Some content", "")
    assert.equal(oneEmpty.stats.similarityPercentage, 0)
    assert.ok(oneEmpty.stats.deletions > 0)
  })
})

// ============================================================================
// SUITE 8: Tool #33 generateEmail (8 Purposes & 6 Tones Matrix)
// ============================================================================

test("Suite 8 [Adversarial]: Tool #33 generateEmail", async (t) => {
  const notes = "Completed database migration on schedule. Security audit passed with zero vulnerabilities. Deployed v2.4 to production."

  await t.test("8.1 Complete Output Structure & 4 Alternative Subjects", () => {
    const res = services.generateEmail(notes, {
      purpose: "status-update",
      tone: "professional",
      recipient: "Sarah Jenkins",
      sender: "David Vance",
      subjectTopic: "Production Release v2.4",
      callToAction: "Please review the audit log attached.",
    })

    assert.ok(res.subject.includes("Production Release v2.4"))
    assert.equal(res.alternativeSubjects.length, 4)
    res.alternativeSubjects.forEach((s) => assert.ok(s.includes("Production Release v2.4")))
    assert.equal(res.salutation, "Dear Sarah Jenkins,")
    assert.ok(res.openingHook.length > 0)
    assert.ok(res.bodyParagraphs.length > 0)
    assert.equal(res.callToAction, "Please review the audit log attached.")
    assert.equal(res.signOff, "Best regards,")
    assert.equal(res.recipient, "Sarah Jenkins")
    assert.equal(res.sender, "David Vance")
    assert.ok(res.fullDraft.includes("Subject: "))
    assert.ok(res.fullDraft.includes("Dear Sarah Jenkins,"))
    assert.ok(res.fullDraft.includes("David Vance"))
  })

  await t.test("8.2 Tone Nuances across Salutation and Sign-Off", () => {
    const tones = [
      { tone: "formal", expectedSalutation: "Dear Colleague,", expectedSignOff: "Respectfully yours," },
      { tone: "friendly", expectedSalutation: "Hi Colleague,", expectedSignOff: "Warmly," },
      { tone: "urgent", expectedSalutation: "Attention Colleague:", expectedSignOff: "Thank you for your prompt attention," },
      { tone: "concise", expectedSalutation: "Hello Colleague,", expectedSignOff: "Best," },
      { tone: "persuasive", expectedSalutation: "Dear Colleague,", expectedSignOff: "Sincerely," },
      { tone: "professional", expectedSalutation: "Dear Colleague,", expectedSignOff: "Best regards," },
    ]

    tones.forEach(({ tone, expectedSalutation, expectedSignOff }) => {
      const res = services.generateEmail(notes, { purpose: "follow-up", tone })
      assert.equal(res.salutation, expectedSalutation, `Tone ${tone} expected salutation "${expectedSalutation}", got "${res.salutation}"`)
      assert.equal(res.signOff, expectedSignOff, `Tone ${tone} expected signOff "${expectedSignOff}", got "${res.signOff}"`)
    })
  })

  await t.test("8.3 Concise Tone produces bulleted paragraphs", () => {
    const res = services.generateEmail(notes, { purpose: "status-update", tone: "concise" })
    assert.ok(res.bodyParagraphs[0].includes("• "), "Concise tone must format notes into bullet items")
  })

  await t.test("8.4 Purpose Hooks Matrix (All 8 purposes)", () => {
    const purposes = [
      "follow-up",
      "proposal",
      "thank-you",
      "inquiry",
      "announcement",
      "apology",
      "meeting-request",
      "status-update",
    ]

    const observedHooks = new Set()
    purposes.forEach((purpose) => {
      const res = services.generateEmail(notes, { purpose, tone: "professional" })
      assert.ok(res.openingHook.length > 10)
      observedHooks.add(res.openingHook)
    })
    assert.equal(observedHooks.size, 8, "All 8 email purposes must provide distinct opening hooks")
  })

  await t.test("8.5 Edge Case: Empty notes produces polite fallback draft", () => {
    const res = services.generateEmail("", { purpose: "follow-up", tone: "professional" })
    assert.ok(res.bodyParagraphs.length > 0)
    assert.ok(res.fullDraft.includes("Subject:"))
    assert.ok(res.fullDraft.includes("Best regards,"))
  })
})


// ============================================================================
// SUITE 9: Adversarial UI Mounting & Options Panel Rendering Verification
// ============================================================================

const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

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

test("Suite 9 [Adversarial UI]: React Route Mounting & Option Panels", async (t) => {
  const tools = [
    { hash: "summarize", action: "Summarize Document" },
    { hash: "rewrite", action: "Rewrite Content" },
    { hash: "translate", action: "Translate Text" },
    { hash: "ask", action: "Ask Document AI" },
    { hash: "keywords", action: "Extract Keywords" },
    { hash: "sentiment", action: "Analyze Sentiment" },
    { hash: "compare", action: "Compare Texts" },
    { hash: "email", action: "Generate Email" },
  ]

  for (const tool of tools) {
    await t.test(`Tool #${tool.hash} mounts with action button '${tool.action}' without 404/Coming soon`, () => {
      const { load } = createDOMEnv(tool.hash)
      const App = load("App").default
      const html = renderToStaticMarkup(React.createElement(App))

      assert.ok(!html.includes("404 · A SMALL DETOUR"), `Route #${tool.hash} must not render 404`)
      assert.ok(!html.includes("Coming soon"), `Route #${tool.hash} must not show Coming soon`)
      assert.ok(html.includes(tool.action), `Route #${tool.hash} must include action button '${tool.action}'`)
      assert.ok(html.includes("Load text from file (.txt, .md, .pdf)"), `Route #${tool.hash} must render dual input file upload bar`)
    })
  }
})
