# Handoff Report: Client-Side AI & NLP Engine Architecture (Milestone 5 — Part 1)

**Agent**: Explorer M5-1 (`explorer_m5_1`)  
**Target Subsystem**: Client-Side AI Text Suite (`summarize`, `rewrite`, `translate`, `ask`)  
**Date**: 2026-11-10T22:21:00Z  
**Recipient**: Orchestrator Parent (`ad378d05-93af-44c8-ae5d-36eca3e4e3dc`)

---

## 1. Observation

### 1.1 Existing Codebase & Architecture
1. **Catalog Registration**:
   In `src/config.ts` (lines 398–446):
   - `summarize` (Tool #26): Category `"AI text tools"`, icon `ScanText`, `available: true`, `badge: "AI"`.
   - `rewrite` (Tool #27): Category `"AI text tools"`, icon `PenLine`, `available: true`, `badge: "AI"`.
   - `translate` (Tool #28): Category `"AI text tools"`, icon `Languages`, `available: true`, `badge: "AI"`.
   - `ask` (Tool #29): Category `"AI text tools"`, icon `MessageSquare`, `available: true`, `badge: "AI"`.
2. **Current ToolPage Implementation**:
   In `src/ToolPage.tsx`:
   - Lines 576–606 (`summarize`): Naive term frequency normalized by token count. Slices top `Math.min(3, scored.length)` sentences. Orders them by score descending, destroying natural document chronology. No mode selection (count vs. percentage), no formatting presets, no file upload support (.txt/.pdf).
   - Lines 669–692 (`rewrite`): Contains 8 replacements for "Professional" and 4 replacements for "Concise". Casual, Academic, and Persuasive tones are unhandled stubs that return original text without changes (`Rewritten in ${tone} Tone:\n\n${t}`).
   - Lines 694–712 (`translate`): Uses `TRANSLATION_MAPS` containing only 4 languages (Spanish, French, German, Japanese) with ~20 vocabulary words each. Chinese, Italian, and Portuguese are missing. Multi-word phrases and idioms are not handled, causing fragmented literal translations.
   - Lines 764–793 (`ask`): Uses a single substring match count (`matchCount`) against sentences. Picks the first sentence with maximum match count. Lacks BM25/TF-IDF scoring, passage context, question type parsing, and verifiable citations.
   - Lines 1227–1232: Form submit calls `executeAIProcessing(value)` synchronously on textarea string only. Uploaded files (`files`) are ignored for AI text tools!
3. **Existing PDF & Extraction Infrastructure**:
   In `src/services.ts` (lines 1022–1045):
   - `extractPDFPages(pdfBytes: ArrayBuffer | Uint8Array): Promise<ExtractedPage[]>` is already fully implemented and exported. Each `ExtractedPage` contains `pageNumber`, `lines: string[]`, `fullText: string`, `width`, and `height`.
4. **Test Runner & Sandbox Execution Model**:
   In `tests/*.test.cjs` (e.g., `tests/m4-pipelines.test.cjs` lines 38–60):
   ```javascript
   function loadServices() {
     const filePath = path.resolve("src", "services.ts")
     const raw = fs.readFileSync(filePath, "utf8")
     const code = ts.transpileModule(raw, { ... }).outputText
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
   ```
   The Node test harness loads `services.ts` directly and executes it in a VM where custom local TS module imports (e.g. `import ... from "./utils/aiText"`) would fail unless handled or co-located.
5. **Project Baseline Health**:
   - `npm test`: 357 passing tests across all test suites, 0 failures.
   - `npm run build`: Vite 8 production build succeeds in 1.07s with 0 errors.

---

## 2. Logic Chain

1. **Requirement R3 (Client-side interactive processing)** requires every tool to operate 100% in-browser without external remote APIs or models.
2. Because the test runners (`tests/*.test.cjs`) compile `src/services.ts` in isolation via `ts.transpileModule` with a restricted `require` stub, exporting all core AI text functions directly from `src/services.ts` guarantees zero loader failures and seamless test integration across existing and new test suites.
3. For **Tool #26 (`summarize`)**:
   - Document summarization requires extractive sentence scoring. Using a **TF-ISF (Term Frequency - Inverse Sentence Frequency)** formulation paired with sentence position weighting (lead sentence boost: 1.35x, paragraph opener: 1.2x) and factual entity boosts (numbers/dates: 1.1x) accurately identifies high-value content.
   - Length normalization using $\sqrt{\text{tokenCount}}$ prevents bias against short informative sentences.
   - Crucially, after selecting the top $K$ scoring sentences, they must be **re-sorted chronologically** by their original document index so the resulting summary reads coherently from start to finish.
   - Supporting both direct text and file upload (.txt, .pdf via `extractPDFPages`) allows users to drop entire PDFs or documents and receive instant summaries.
4. For **Tool #27 (`rewrite`)**:
   - Rule-based text transformation requires multi-stage execution order:
     a) Contraction processing: expansion for Formal/Academic, contraction for Casual.
     b) Multi-word phrase substitutions executed *before* single-word replacements to prevent substring corruption.
     c) Tone-specific lexicons across all 5 required tones: Professional, Casual, Academic, Concise, Persuasive.
     d) Case-preservation engine (`applyCasing`) so TitleCase and UPPERCASE tokens retain their intended presentation.
5. For **Tool #28 (`translate`)**:
   - Word-by-word replacement fails on natural language idioms. The translation engine must first match 40+ multi-word phrases and idioms (e.g., "good morning", "thank you very much", "as soon as possible", "project manager") across all 8 target languages (English, Spanish, French, German, Italian, Portuguese, Chinese, Japanese).
   - Remaining word tokens are translated using curated 150+ word lexicons with script/accent detection (CJK detection, kana detection, Latin diacritics, language-specific stopword frequency) for automatic source language identification.
   - Reverse translation and English-pivot translation enable cross-language translation between any pair.
6. For **Tool #29 (`ask`)**:
   - Real document Q&A requires probabilistic information retrieval. The **Okapi BM25** algorithm ($k_1 = 1.2, b = 0.75$) with inverse document frequency provides superior passage ranking over paragraph/sentence chunks.
   - Combining BM25 with Question Intent Classification (Temporal, Quantitative, Entity, Locative, Causal, Definitional) allows the engine to pinpoint the exact answering sentence within the top passage and provide verifiable paragraph/page citations.

---

## 3. Caveats

1. **Lexicon Scale**: Pure client-side dictionary translation is intended for common conversational, business, and document vocabulary (~150 core words + 40 idioms per language). Complex domain-specific jargon or rare morphology will gracefully pass through untouched with coverage reporting, rather than attempting broken literal morphology.
2. **Tokenization Scope**: CJK scripts (Chinese and Japanese) do not use whitespace word separators. For Chinese and Japanese targets, phrase matching and character-level segmentation provide clean translations; for CJK source text, character n-grams and stop-character sets provide robust language detection and keyword indexing.
3. **File Extraction**: PDF extraction relies on `extractPDFPages`. Scanned bitmap PDFs without embedded text streams require OCR, which is handled by Tool #19 (`ocr`). For text-based PDFs, `extractPDFPages` extracts lines and fullText seamlessly.

---

## 4. Conclusion & Complete Architectural Blueprint

### 4.1 Service Function Signatures for `src/services.ts`

```typescript
// ============================================================================
// 1. Tool #26: Summarize Document (Extractive TF-ISF Engine)
// ============================================================================

export interface SummarizeOptions {
  mode?: "sentences" | "percentage" // default: "sentences"
  targetLength?: number // count (e.g. 3, 5, 10) or percent (e.g. 25, 50); default: 3
  format?: "bullet" | "narrative" | "executive" // default: "bullet"
  title?: string
}

export interface SummarizeResult {
  summary: string
  originalSentenceCount: number
  summarySentenceCount: number
  originalWordCount: number
  summaryWordCount: number
  reductionPercentage: number
  keyThemes: string[]
}

export function summarizeDocument(
  text: string,
  options?: SummarizeOptions
): SummarizeResult

// ============================================================================
// 2. Tool #27: Rewrite Content (Multi-Tone Linguistic Engine)
// ============================================================================

export type RewriteTone =
  | "Professional"
  | "Casual"
  | "Academic"
  | "Concise"
  | "Persuasive"

export interface RewriteOptions {
  tone: RewriteTone
  preserveFormatting?: boolean
}

export interface RewriteResult {
  rewrittenText: string
  tone: RewriteTone
  replacementsCount: number
  originalWordCount: number
  newWordCount: number
  appliedTransforms: string[]
}

export function rewriteContent(
  text: string,
  options: RewriteOptions
): RewriteResult

// ============================================================================
// 3. Tool #28: Translate Text (Multilingual Lexicon & Phrase Engine)
// ============================================================================

export type SupportedLanguage =
  | "English"
  | "Spanish"
  | "French"
  | "German"
  | "Italian"
  | "Portuguese"
  | "Chinese"
  | "Japanese"

export interface TranslationOptions {
  targetLanguage: SupportedLanguage
  sourceLanguage?: SupportedLanguage | "auto"
}

export interface TranslationResult {
  translatedText: string
  sourceLanguage: SupportedLanguage
  targetLanguage: SupportedLanguage
  wordCount: number
  translatedWordCount: number
  coveragePercentage: number
  detectedConfidence: number
}

export function detectLanguage(text: string): {
  language: SupportedLanguage
  confidence: number
}

export function translateText(
  text: string,
  options: TranslationOptions
): TranslationResult

// ============================================================================
// 4. Tool #29: Ask Document AI (BM25 Semantic Retrieval & QA Engine)
// ============================================================================

export type QuestionIntent =
  | "temporal"
  | "quantitative"
  | "entity"
  | "locative"
  | "causal"
  | "definition"
  | "general"

export interface DocumentPassage {
  id: number
  paragraphNumber: number
  text: string
  score: number
  matchedTerms: string[]
  primaryAnswerSentence: string
}

export interface AskDocumentOptions {
  question: string
  topPassagesCount?: number // default: 3
}

export interface AskDocumentResult {
  question: string
  questionIntent: QuestionIntent
  primaryAnswer: string
  confidenceScore: number // 0 to 100
  confidenceRating: "High" | "Moderate" | "Contextual" | "Low"
  topPassages: DocumentPassage[]
  totalDocumentPassages: number
  relevantTermsFound: string[]
  formattedReport: string
}

export function askDocumentAI(
  documentText: string,
  options: AskDocumentOptions
): AskDocumentResult
```

### 4.2 UI Integration in `src/ToolPage.tsx`
1. **Dropzone / Document Support**:
   For `summarize`, `rewrite`, `translate`, and `ask`, permit users to upload `.txt` or `.pdf` files.
   - When a file is dropped or selected:
     - If `.txt`: read `await file.text()` and populate `value`.
     - If `.pdf`: call `extractPDFPages(await file.arrayBuffer())`, join `page.fullText`, and populate `value`.
2. **Active Input Controls**:
   - `summarize`:
     - Mode selector: "Sentences" vs. "Percentage of Document".
     - Target length input/slider: 3, 5, 10 sentences or 20%, 35%, 50%.
     - Format style selector: "Bulleted Key Takeaways", "Executive Paragraph", "Full Executive Report".
   - `rewrite`:
     - Target Tone selector with all 5 options: "Professional & Polished", "Concise & Direct", "Casual & Conversational", "Academic & Scholarly", "Persuasive & Engaging".
   - `translate`:
     - Target Language dropdown with all 8 options: Spanish, French, German, Italian, Portuguese, Chinese, Japanese, English.
     - Auto-detected source language badge.
   - `ask`:
     - Question input field with clear suggestions ("What is the main finding?", "When is the deadline?", "Who leads the team?").
3. **Formatted Result View**:
   - Render structured AI results in `result-ready` container with:
     - Copy to Clipboard button.
     - Download as Text / Markdown file (`download({ name: `${tool.id}-result.txt`, blob })`).
     - Clear metrics badges (Compression ratio, Coverage percentage, Confidence score, Passages cited).

---

## 5. Verification Method

### 5.1 Test Suite Verification Commands
Run the full test suite and verify build integrity:
```powershell
npm test
npm run build
```

### 5.2 Specific Automated Test Suite for M5 (`tests/m5-ai-text-suite.test.cjs`)
A dedicated Node test suite must be created by the implementation agent verifying:
1. **`summarizeDocument`**:
   - Sentence count mode (extract exactly 3 or 5 top sentences from multi-paragraph text).
   - Percentage mode (extract ~25% or ~50% of sentences).
   - Chronological sentence order preservation.
   - Format variations (`bullet`, `narrative`, `executive`).
   - Graceful handling of single-sentence and empty inputs.
2. **`rewriteContent`**:
   - Contraction expansion in Professional and Academic tones ("can't" -> "cannot", "don't" -> "do not").
   - Contraction collapse in Casual tone ("do not" -> "don't", "it is" -> "it's").
   - Vocabulary substitutions across all 5 tones (Professional, Casual, Academic, Concise, Persuasive).
   - Fluff and redundancy removal in Concise tone ("in order to" -> "to", "at the present time" -> "currently").
   - TitleCase and UPPERCASE casing preservation.
3. **`detectLanguage` & `translateText`**:
   - Detection of Spanish, French, German, Italian, Portuguese, Japanese, Chinese, English.
   - Translation of 40+ multi-word idioms across all 8 target languages.
   - Vocabulary translation coverage calculation.
   - Reverse and pivot translations (e.g. Spanish -> English -> German).
4. **`askDocumentAI`**:
   - BM25 passage ranking on multi-paragraph documents.
   - Intent classification (temporal, quantitative, entity, locative, causal, definitional).
   - Primary answer sentence pinpointing with surrounding context citations.
   - Zero-match handling with informative fallback guidance.
5. **Interactive UI Routing**:
   - Verify `#summarize`, `#rewrite`, `#translate`, `#ask` render interactive controls, dropdowns, and buttons without "Coming soon" or errors.

### 5.3 Invalidation Conditions
The blueprint is invalidated if:
- Any implementation requires remote network calls or external API keys (violating Requirement R3).
- The test harness (`tests/*.test.cjs`) fails to load service functions due to unresolved local imports.
- Summarized sentences appear out of chronological order.
- Any of the 357 baseline tests regress.
