// .agents/teamwork/worker_m5_1/m5_toolpage_patch.cjs
// Script to apply Milestone 5 UI integrations, option panels, and result presentation in src/ToolPage.tsx

const fs = require("fs");
const path = require("path");

const toolPagePath = path.resolve("src", "ToolPage.tsx");
let content = fs.readFileSync(toolPagePath, "utf8");

// 1. Add ArrowLeftRight to lucide-react imports if not present
if (!content.includes("ArrowLeftRight,")) {
  content = content.replace(
    '  ArrowDown,\n',
    '  ArrowDown,\n  ArrowLeftRight,\n'
  );
}

// 2. Add M5 Service Imports to services import block
const oldServiceImports = `  splitAndCompress,
  detectFileType,
  type JobStatus,
  type OutputResult,
  type ExtractedZipFile,
  type OCRResult,
  type PipelineMetricsResult,
} from "./services"`;

const newServiceImports = `  splitAndCompress,
  detectFileType,
  extractPDFPages,
  summarizeDocument,
  rewriteContent,
  translateText,
  detectLanguage,
  askDocumentAI,
  extractKeywords,
  analyzeSentiment,
  compareTexts,
  generateEmail,
  type SummarizeResult,
  type RewriteResult,
  type TranslationResult,
  type AskDocumentResult,
  type KeywordResult,
  type SentimentResult,
  type CompareResult,
  type EmailResult,
  type SupportedLanguage,
  type RewriteTone,
  type EmailPurpose,
  type EmailTone,
  type JobStatus,
  type OutputResult,
  type ExtractedZipFile,
  type OCRResult,
  type PipelineMetricsResult,
} from "./services"`;

if (content.includes(oldServiceImports)) {
  content = content.replace(oldServiceImports, newServiceImports);
} else {
  console.log("Service imports block already modified or not found as exact match.");
}

// 3. Add Milestone 5 State Variables
const stateHookTarget = `  const [stripMeta, setStripMeta] = useState(true)
  const [copiedText, setCopiedText] = useState(false)`;

const m5StateHooks = `  const [stripMeta, setStripMeta] = useState(true)
  const [copiedText, setCopiedText] = useState(false)

  // Milestone 5 AI Text Suite State
  const [summaryMode, setSummaryMode] = useState<"sentences" | "percentage">("sentences")
  const [summaryLength, setSummaryLength] = useState(3)
  const [summaryFormat, setSummaryFormat] = useState<"bullet" | "narrative" | "executive">("bullet")
  const [rewriteTone, setRewriteTone] = useState<RewriteTone>("Professional")
  const [transSourceLang, setTransSourceLang] = useState<SupportedLanguage | "auto">("auto")
  const [transTargetLang, setTransTargetLang] = useState<SupportedLanguage>("Spanish")
  const [askQuestion, setAskQuestion] = useState("")
  const [keywordMax, setKeywordMax] = useState(10)
  const [keywordNgrams, setKeywordNgrams] = useState(true)
  const [sentimentDetailed, setSentimentDetailed] = useState(false)
  const [compareGranularity, setCompareGranularity] = useState<"lines" | "words" | "characters">("lines")
  const [compareIgnoreWhitespace, setCompareIgnoreWhitespace] = useState(false)
  const [emailPurpose, setEmailPurpose] = useState<EmailPurpose>("follow-up")
  const [emailTone, setEmailTone] = useState<EmailTone>("professional")
  const [emailRecipient, setEmailRecipient] = useState("")
  const [emailSubject, setEmailSubject] = useState("")
  const [emailCTA, setEmailCTA] = useState("")
  const [loadedDocName, setLoadedDocName] = useState("")
  const [extractingPdf, setExtractingPdf] = useState(false)

  // Rich AI text results state
  const [aiSummarizeResult, setAiSummarizeResult] = useState<SummarizeResult | null>(null)
  const [aiRewriteResult, setAiRewriteResult] = useState<RewriteResult | null>(null)
  const [aiTranslationResult, setAiTranslationResult] = useState<TranslationResult | null>(null)
  const [aiAskResult, setAiAskResult] = useState<AskDocumentResult | null>(null)
  const [aiKeywordResult, setAiKeywordResult] = useState<KeywordResult | null>(null)
  const [aiSentimentResult, setAiSentimentResult] = useState<SentimentResult | null>(null)
  const [aiCompareResult, setAiCompareResult] = useState<CompareResult | null>(null)
  const [aiEmailResult, setAiEmailResult] = useState<EmailResult | null>(null)`;

if (content.includes(stateHookTarget)) {
  content = content.replace(stateHookTarget, m5StateHooks);
}

// 4. Update executeAIProcessing to call genuine M5 service engines
const aiProcessingStart = "  // --- Client-Side AI & NLP Engine ---";
const aiProcessingEnd = "  // --- Interactive Form Submit ---";

const startIdx = content.indexOf(aiProcessingStart);
const endIdx = content.indexOf(aiProcessingEnd);

if (startIdx !== -1 && endIdx !== -1) {
  const newAIProcessing = `  // --- Client-Side AI & NLP Engine ---
  async function handleDocumentUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      setExtractingPdf(true)
      setLoadedDocName(file.name)
      if (file.name.toLowerCase().endsWith(".pdf")) {
        const pages = await extractPDFPages(await file.arrayBuffer())
        const fullText = pages.map((p) => p.fullText).filter(Boolean).join("\\n\\n")
        if (!fullText.trim()) {
          notify("No embedded text found in PDF. Scanned PDFs require OCR Scanner (#ocr).", "warning")
        } else {
          setValue(fullText)
          notify.success(\`Extracted text from \${file.name} (\${pages.length} pages).\`)
        }
      } else {
        const text = await file.text()
        setValue(text)
        notify.success(\`Loaded text from \${file.name}.\`)
      }
    } catch (err: any) {
      notify(err?.message || "Failed to extract document text.", "error")
    } finally {
      setExtractingPdf(false)
    }
  }

  function executeAIProcessing(text: string): string {
    const t = text.trim()
    if (!t) return ""

    if (tool.id === "summarize") {
      const res = summarizeDocument(t, {
        mode: summaryMode,
        targetLength: summaryLength,
        format: summaryFormat,
      })
      setAiSummarizeResult(res)
      return res.formattedReport
    }

    if (tool.id === "rewrite") {
      const toneToUse = (optionA as RewriteTone) || rewriteTone || "Professional"
      const res = rewriteContent(t, {
        tone: toneToUse,
      })
      setAiRewriteResult(res)
      return res.formattedReport
    }

    if (tool.id === "translate") {
      const targetLang = (optionA as SupportedLanguage) || transTargetLang || "Spanish"
      const res = translateText(t, {
        targetLanguage: targetLang,
        sourceLanguage: transSourceLang,
      })
      setAiTranslationResult(res)
      return res.formattedReport
    }

    if (tool.id === "ask") {
      const q = askQuestion.trim() || extra.trim()
      if (!q) throw new Error("Please enter a question to ask the document.")
      const res = askDocumentAI(t, { question: q })
      setAiAskResult(res)
      return res.formattedReport
    }

    if (tool.id === "keywords") {
      const res = extractKeywords(t, {
        maxKeywords: keywordMax,
        includeNgrams: keywordNgrams,
      })
      setAiKeywordResult(res)
      return res.formattedReport
    }

    if (tool.id === "sentiment") {
      const res = analyzeSentiment(t, {
        detailed: sentimentDetailed,
      })
      setAiSentimentResult(res)
      return res.formattedReport
    }

    if (tool.id === "compare") {
      const compText = extra !== undefined ? extra : ""
      const res = compareTexts(t, compText, {
        granularity: compareGranularity,
        ignoreWhitespace: compareIgnoreWhitespace,
      })
      setAiCompareResult(res)
      return res.formattedReport
    }

    if (tool.id === "email") {
      const res = generateEmail(t, {
        purpose: emailPurpose,
        tone: emailTone,
        recipient: emailRecipient || optionA || "Team",
        subjectTopic: emailSubject || extra,
        callToAction: emailCTA,
      })
      setAiEmailResult(res)
      return res.formattedReport
    }

    return t
  }

`;
  content = content.slice(0, startIdx) + newAIProcessing + content.slice(endIdx);
}

// 5. Update AI text tools submit completion around line 1227
const oldAISubmit = `      // 3. AI Text Tools
      else if (tool.category === "AI text tools") {
        if (!value.trim())
          throw new Error("Enter some text or document content to process.")
        const output = executeAIProcessing(value)
        setTextOutput(output)
      }`;

const newAISubmit = `      // 3. AI Text Tools
      else if (tool.category === "AI text tools") {
        if (!value.trim())
          throw new Error("Enter some text or document content to process.")
        const output = executeAIProcessing(value)
        setTextOutput(output)
        setStatus("completed")
        return
      }`;

if (content.includes(oldAISubmit)) {
  content = content.replace(oldAISubmit, newAISubmit);
}

// 6. Update AI Text Tools Input Controls (Option Panels)
const oldInputsTarget = `            ) : tool.category === "AI text tools" ? (
              /* 2. AI Text Tools Inputs */
              <>
                {tool.id === "rewrite" && (
                  <label>
                    Target Tone
                    <select
                      value={optionA}
                      onChange={(e) => setOptionA(e.target.value)}
                    >
                      <option value="Professional">
                        Professional & Polished
                      </option>
                      <option value="Concise">Concise & Direct</option>
                      <option value="Casual">Casual & Conversational</option>
                      <option value="Persuasive">Persuasive & Engaging</option>
                    </select>
                  </label>
                )}
                {tool.id === "translate" && (
                  <label>
                    Target Language
                    <select
                      value={optionA}
                      onChange={(e) => setOptionA(e.target.value)}
                    >
                      <option value="Spanish">Spanish (Español)</option>
                      <option value="French">French (Français)</option>
                      <option value="German">German (Deutsch)</option>
                      <option value="Japanese">Japanese (日本語)</option>
                    </select>
                  </label>
                )}
                {tool.id === "email" && (
                  <>
                    <label>
                      Recipient or Audience
                      <input
                        placeholder="e.g. Sarah Connor / Client Project Team"
                        value={optionA}
                        onChange={(e) => setOptionA(e.target.value)}
                      />
                    </label>
                    <label>
                      Subject / Intent
                      <input
                        placeholder="e.g. Project Delivery & Milestone Update"
                        value={extra}
                        onChange={(e) => setExtra(e.target.value)}
                      />
                    </label>
                  </>
                )}
                {tool.id === "ask" && (
                  <label>
                    Question to Ask Document
                    <input
                      required
                      placeholder="e.g. What is the project deadline?"
                      value={extra}
                      onChange={(e) => setExtra(e.target.value)}
                    />
                  </label>
                )}
                {tool.id === "compare" && (
                  <label>
                    Comparison Text (Version B)
                    <textarea
                      rows={5}
                      placeholder="Paste second version of text to compare…"
                      value={extra}
                      onChange={(e) => setExtra(e.target.value)}
                    />
                  </label>
                )}
                <label>
                  {tool.id === "compare"
                    ? "Base Text (Version A)"
                    : tool.id === "email"
                      ? "Key points to cover"
                      : "Source Text or Document Content"}
                  <textarea
                    required
                    rows={8}
                    maxLength={50000}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="Enter or paste text here…"
                  />
                </label>
              </>
            ) :`;

const newInputsReplacement = `            ) : tool.category === "AI text tools" ? (
              /* 2. AI Text Tools Inputs */
              <>
                {/* Document Upload Bar */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    background: "var(--card-bg, rgba(255, 255, 255, 0.05))",
                    borderRadius: "8px",
                    border: "1px dashed var(--border)",
                    marginBottom: "12px",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "var(--primary, #3b82f6)",
                      margin: 0,
                    }}
                  >
                    <Upload size={15} />
                    <span>{extractingPdf ? "Extracting text from PDF..." : "Load text from file (.txt, .md, .pdf)"}</span>
                    <input
                      type="file"
                      accept=".txt,.text,.md,.csv,.pdf,application/pdf"
                      onChange={handleDocumentUpload}
                      style={{ display: "none" }}
                    />
                  </label>
                  {loadedDocName && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        fontSize: "12px",
                        padding: "3px 8px",
                        borderRadius: "12px",
                        background: "var(--badge-bg, rgba(59, 130, 246, 0.15))",
                      }}
                    >
                      <FileText size={12} />
                      <span>{loadedDocName}</span>
                      <button
                        type="button"
                        onClick={() => { setLoadedDocName(""); setValue(""); }}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        <X size={12} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Tool #26: Summarize Document Options */}
                {tool.id === "summarize" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                    <label>
                      Summary Length
                      <select
                        value={summaryLength}
                        onChange={(e) => setSummaryLength(Number(e.target.value))}
                      >
                        <option value={3}>Short (3 key sentences)</option>
                        <option value={5}>Standard (5 key sentences)</option>
                        <option value={10}>Comprehensive (10 key sentences)</option>
                      </select>
                    </label>
                    <label>
                      Output Format
                      <select
                        value={summaryFormat}
                        onChange={(e) => setSummaryFormat(e.target.value as any)}
                      >
                        <option value="bullet">Bullet Points</option>
                        <option value="narrative">Executive Paragraph</option>
                        <option value="executive">Full Executive Report</option>
                      </select>
                    </label>
                  </div>
                )}

                {/* Tool #27: Rewrite Content Options */}
                {tool.id === "rewrite" && (
                  <label>
                    Target Tone & Voice
                    <select
                      value={optionA || rewriteTone}
                      onChange={(e) => {
                        setOptionA(e.target.value);
                        setRewriteTone(e.target.value as RewriteTone);
                      }}
                    >
                      <option value="Professional">Professional & Polished</option>
                      <option value="Concise">Concise & Direct</option>
                      <option value="Casual">Casual & Conversational</option>
                      <option value="Academic">Academic & Scholarly</option>
                      <option value="Persuasive">Persuasive & Engaging</option>
                    </select>
                  </label>
                )}

                {/* Tool #28: Translate Text Options */}
                {tool.id === "translate" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "8px", alignItems: "end", marginBottom: "12px" }}>
                    <label>
                      Source Language
                      <select
                        value={transSourceLang}
                        onChange={(e) => setTransSourceLang(e.target.value as any)}
                      >
                        <option value="auto">Auto-Detect</option>
                        <option value="English">English</option>
                        <option value="Spanish">Spanish (Español)</option>
                        <option value="French">French (Français)</option>
                        <option value="German">German (Deutsch)</option>
                        <option value="Italian">Italian (Italiano)</option>
                        <option value="Portuguese">Portuguese (Português)</option>
                        <option value="Chinese">Chinese (中文)</option>
                        <option value="Japanese">Japanese (日本語)</option>
                      </select>
                    </label>
                    <button
                      type="button"
                      title="Swap Languages"
                      onClick={() => {
                        if (transSourceLang !== "auto") {
                          const prevSrc = transSourceLang;
                          const prevTgt = (optionA as SupportedLanguage) || transTargetLang;
                          setTransSourceLang(prevTgt);
                          setTransTargetLang(prevSrc);
                          setOptionA(prevSrc);
                        }
                      }}
                      style={{
                        padding: "10px",
                        borderRadius: "8px",
                        border: "1px solid var(--border)",
                        background: "var(--card-bg)",
                        cursor: "pointer",
                        marginBottom: "2px",
                      }}
                    >
                      <ArrowLeftRight size={16} />
                    </button>
                    <label>
                      Target Language
                      <select
                        value={optionA || transTargetLang}
                        onChange={(e) => {
                          setOptionA(e.target.value);
                          setTransTargetLang(e.target.value as SupportedLanguage);
                        }}
                      >
                        <option value="Spanish">Spanish (Español)</option>
                        <option value="French">French (Français)</option>
                        <option value="German">German (Deutsch)</option>
                        <option value="Italian">Italian (Italiano)</option>
                        <option value="Portuguese">Portuguese (Português)</option>
                        <option value="Chinese">Chinese (中文)</option>
                        <option value="Japanese">Japanese (日本語)</option>
                        <option value="English">English</option>
                      </select>
                    </label>
                  </div>
                )}

                {/* Tool #29: Ask Document AI Options */}
                {tool.id === "ask" && (
                  <div style={{ marginBottom: "12px" }}>
                    <label>
                      Question to Ask Document
                      <input
                        required
                        placeholder="e.g. What is the project deadline and key deliverables?"
                        value={askQuestion || extra}
                        onChange={(e) => {
                          setAskQuestion(e.target.value);
                          setExtra(e.target.value);
                        }}
                      />
                    </label>
                    <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" }}>
                      <span style={{ fontSize: "11px", color: "var(--muted)", alignSelf: "center" }}>Suggested:</span>
                      {[
                        "What is the main summary?",
                        "What are the deadlines?",
                        "Who leads the team?",
                        "What are the key metrics?",
                      ].map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => {
                            setAskQuestion(prompt);
                            setExtra(prompt);
                          }}
                          style={{
                            fontSize: "11px",
                            padding: "3px 8px",
                            borderRadius: "12px",
                            border: "1px solid var(--border)",
                            background: "var(--badge-bg, rgba(255,255,255,0.06))",
                            cursor: "pointer",
                          }}
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Tool #30: Extract Keywords Options */}
                {tool.id === "keywords" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                    <label>
                      Maximum Keywords
                      <select
                        value={keywordMax}
                        onChange={(e) => setKeywordMax(Number(e.target.value))}
                      >
                        <option value={5}>Top 5 Keywords</option>
                        <option value={10}>Top 10 Keywords (Standard)</option>
                        <option value={15}>Top 15 Keywords</option>
                        <option value={20}>Top 20 Keywords (Detailed)</option>
                      </select>
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "24px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={keywordNgrams}
                        onChange={(e) => setKeywordNgrams(e.target.checked)}
                      />
                      <span>Include 2-word collocations</span>
                    </label>
                  </div>
                )}

                {/* Tool #31: Analyze Sentiment Options */}
                {tool.id === "sentiment" && (
                  <div style={{ marginBottom: "12px" }}>
                    <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={sentimentDetailed}
                        onChange={(e) => setSentimentDetailed(e.target.checked)}
                      />
                      <span>Show detailed word-by-word valence ratings & context breakdown</span>
                    </label>
                  </div>
                )}

                {/* Tool #32: Compare Texts Options */}
                {tool.id === "compare" && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "12px" }}>
                      <label>
                        Diff Granularity
                        <select
                          value={compareGranularity}
                          onChange={(e) => setCompareGranularity(e.target.value as any)}
                        >
                          <option value="lines">Line by Line (Recommended)</option>
                          <option value="words">Word by Word (Detailed)</option>
                          <option value="characters">Character by Character</option>
                        </select>
                      </label>
                      <label style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "24px", cursor: "pointer" }}>
                        <input
                          type="checkbox"
                          checked={compareIgnoreWhitespace}
                          onChange={(e) => setCompareIgnoreWhitespace(e.target.checked)}
                        />
                        <span>Ignore Whitespace Differences</span>
                      </label>
                    </div>
                    <label>
                      Comparison Text (Version B)
                      <textarea
                        rows={5}
                        placeholder="Paste second version of text to compare…"
                        value={extra}
                        onChange={(e) => setExtra(e.target.value)}
                      />
                    </label>
                  </>
                )}

                {/* Tool #33: Generate Email Options */}
                {tool.id === "email" && (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "8px" }}>
                      <label>
                        Email Purpose
                        <select
                          value={emailPurpose}
                          onChange={(e) => setEmailPurpose(e.target.value as EmailPurpose)}
                        >
                          <option value="follow-up">Follow-up</option>
                          <option value="proposal">Business Proposal</option>
                          <option value="thank-you">Thank You</option>
                          <option value="inquiry">Inquiry / Question</option>
                          <option value="announcement">Announcement</option>
                          <option value="meeting-request">Meeting Request</option>
                          <option value="status-update">Project Status Update</option>
                          <option value="apology">Formal Apology</option>
                        </select>
                      </label>
                      <label>
                        Tone & Style
                        <select
                          value={emailTone}
                          onChange={(e) => setEmailTone(e.target.value as EmailTone)}
                        >
                          <option value="professional">Professional & Balanced</option>
                          <option value="friendly">Friendly & Warm</option>
                          <option value="urgent">Urgent & Direct</option>
                          <option value="persuasive">Persuasive & Engaging</option>
                          <option value="concise">Concise & Bulleted</option>
                          <option value="formal">Formal & Traditional</option>
                        </select>
                      </label>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "8px" }}>
                      <label>
                        Recipient or Audience
                        <input
                          placeholder="e.g. Sarah Connor / Project Team"
                          value={emailRecipient || optionA}
                          onChange={(e) => {
                            setEmailRecipient(e.target.value);
                            setOptionA(e.target.value);
                          }}
                        />
                      </label>
                      <label>
                        Subject Topic
                        <input
                          placeholder="e.g. Q4 Deliverables & Next Steps"
                          value={emailSubject || extra}
                          onChange={(e) => {
                            setEmailSubject(e.target.value);
                            setExtra(e.target.value);
                          }}
                        />
                      </label>
                    </div>
                    <label style={{ marginBottom: "8px" }}>
                      Call to Action (Optional)
                      <input
                        placeholder="e.g. Please confirm your availability by Friday 5 PM"
                        value={emailCTA}
                        onChange={(e) => setEmailCTA(e.target.value)}
                      />
                    </label>
                  </>
                )}

                <label>
                  {tool.id === "compare"
                    ? "Base Text (Version A)"
                    : tool.id === "email"
                      ? "Key points or notes to include"
                      : "Source Text or Document Content"}
                  <textarea
                    required
                    rows={8}
                    maxLength={50000}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={
                      tool.id === "email"
                        ? "Enter notes or bullet points to synthesize into an email…"
                        : "Enter or paste text, or load a document from file above…"
                    }
                  />
                </label>
              </>
            ) :`;

if (content.includes(oldInputsTarget)) {
  content = content.replace(oldInputsTarget, newInputsReplacement);
} else {
  console.log("oldInputsTarget not matched directly.");
}

// 7. Update Action Button Labels
const oldButtonLabels = `: tool.id ===
                                                            "split-compress"
                                                          ? "Split & Compress PDF"
                                                          : \`Run \${tool.name}\`}`;

const newButtonLabels = `: tool.id ===
                                                            "split-compress"
                                                          ? "Split & Compress PDF"
                                                          : tool.id === "summarize"
                                                            ? "Summarize Document"
                                                            : tool.id === "rewrite"
                                                              ? "Rewrite Content"
                                                              : tool.id === "translate"
                                                                ? "Translate Text"
                                                                : tool.id === "ask"
                                                                  ? "Ask Document AI"
                                                                  : tool.id === "keywords"
                                                                    ? "Extract Keywords"
                                                                    : tool.id === "sentiment"
                                                                      ? "Analyze Sentiment"
                                                                      : tool.id === "compare"
                                                                        ? "Compare Texts"
                                                                        : tool.id === "email"
                                                                          ? "Generate Email"
                                                                          : \`Run \${tool.name}\`}`;

if (content.includes(oldButtonLabels)) {
  content = content.replace(oldButtonLabels, newButtonLabels);
}

// 8. Update Result Panel to include Rich Result Visualizations
const resultPreTarget = `            {textOutput ? (
              <div className="result-ready">
                <div
                  style={{
                    textAlign: "left",
                    width: "100%",
                    maxHeight: "360px",
                    overflowY: "auto",
                    background: "var(--bg)",
                    padding: "16px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    whiteSpace: "pre-wrap",
                    fontFamily: "inherit",
                    fontSize: "12px",
                    lineHeight: "1.7",
                  }}
                >
                  {textOutput}
                </div>`;

const newResultPresentation = `            {textOutput ? (
              <div className="result-ready">
                {/* --- Tool-Specific Visual Cards --- */}
                {tool.id === "sentiment" && aiSentimentResult && (
                  <div
                    style={{
                      width: "100%",
                      padding: "14px",
                      borderRadius: "8px",
                      background: "var(--card-bg, rgba(255,255,255,0.04))",
                      border: "1px solid var(--border)",
                      marginBottom: "12px",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                      <span
                        style={{
                          fontSize: "13px",
                          fontWeight: 700,
                          padding: "3px 10px",
                          borderRadius: "12px",
                          background:
                            aiSentimentResult.polarity === "Positive"
                              ? "rgba(16, 185, 129, 0.2)"
                              : aiSentimentResult.polarity === "Negative"
                                ? "rgba(239, 68, 68, 0.2)"
                                : "rgba(107, 114, 128, 0.2)",
                          color:
                            aiSentimentResult.polarity === "Positive"
                              ? "#10b981"
                              : aiSentimentResult.polarity === "Negative"
                                ? "#ef4444"
                                : "#9ca3af",
                        }}
                      >
                        {aiSentimentResult.polarity.toUpperCase()} ({aiSentimentResult.compound.toFixed(2)})
                      </span>
                      <span style={{ fontSize: "12px", color: "var(--muted)" }}>{aiSentimentResult.mood}</span>
                    </div>

                    {/* Horizontal Valence Gauge (-1.00 to +1.00) */}
                    <div style={{ position: "relative", height: "8px", background: "linear-gradient(to right, #ef4444, #9ca3af, #10b981)", borderRadius: "4px", margin: "14px 0 6px" }}>
                      <div
                        style={{
                          position: "absolute",
                          top: "-4px",
                          left: \`\${Math.max(2, Math.min(98, ((aiSentimentResult.compound + 1) / 2) * 100))}%\`,
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          background: "#fff",
                          border: "2px solid #0f172a",
                          transform: "translateX(-50%)",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
                        }}
                      />
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: "var(--muted)" }}>
                      <span>-1.00 (Negative)</span>
                      <span>0.00 (Neutral)</span>
                      <span>+1.00 (Positive)</span>
                    </div>
                  </div>
                )}

                {tool.id === "keywords" && aiKeywordResult && (
                  <div
                    style={{
                      width: "100%",
                      padding: "12px",
                      borderRadius: "8px",
                      background: "var(--card-bg, rgba(255,255,255,0.04))",
                      border: "1px solid var(--border)",
                      marginBottom: "12px",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", gap: "12px", fontSize: "11px", color: "var(--muted)", marginBottom: "8px" }}>
                      <span>Words: {aiKeywordResult.totalWords}</span>
                      <span>•</span>
                      <span>Reading Time: ~{aiKeywordResult.readingTimeMinutes} min</span>
                      <span>•</span>
                      <span>Diversity: {aiKeywordResult.lexicalDiversity}</span>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {aiKeywordResult.keywords.map((k) => (
                        <span
                          key={k.rank + k.term}
                          style={{
                            fontSize: "11px",
                            padding: "3px 8px",
                            borderRadius: "6px",
                            background: "var(--badge-bg, rgba(59, 130, 246, 0.15))",
                            color: "var(--primary, #3b82f6)",
                            fontWeight: 500,
                          }}
                        >
                          #{k.rank} {k.term} ({k.frequency}x)
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {tool.id === "ask" && aiAskResult && (
                  <div
                    style={{
                      width: "100%",
                      padding: "14px",
                      borderRadius: "8px",
                      background: "var(--card-bg, rgba(59, 130, 246, 0.08))",
                      border: "1px solid var(--primary, #3b82f6)",
                      marginBottom: "12px",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", color: "var(--primary, #3b82f6)" }}>
                        Direct Answer • Confidence: {aiAskResult.confidenceScore}% ({aiAskResult.confidenceRating})
                      </span>
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: 600, lineHeight: "1.5", marginBottom: "8px" }}>
                      "{aiAskResult.primaryAnswer}"
                    </div>
                  </div>
                )}

                {/* Standard Full Formatted Output Block */}
                <div
                  style={{
                    textAlign: "left",
                    width: "100%",
                    maxHeight: "360px",
                    overflowY: "auto",
                    background: "var(--bg)",
                    padding: "16px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    whiteSpace: "pre-wrap",
                    fontFamily: "inherit",
                    fontSize: "12px",
                    lineHeight: "1.7",
                  }}
                >
                  {textOutput}
                </div>`;

if (content.includes(resultPreTarget)) {
  content = content.replace(resultPreTarget, newResultPresentation);
}

fs.writeFileSync(toolPagePath, content, "utf8");
console.log("Successfully updated src/ToolPage.tsx with Milestone 5 features!");
