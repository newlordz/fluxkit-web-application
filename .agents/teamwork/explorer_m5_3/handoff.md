# Handoff Report: UI Integration & Test Suite Specifications for Milestone 5 (AI Text Suite)

**Explorer ID**: Explorer M5-3 (UI & Tests Explorer M5)  
**Working Directory**: `.agents/teamwork/explorer_m5_3`  
**Milestone**: M5 (Client-Side AI Text Suite — Tools #26 to #33)  
**Parent Conversation ID**: `ad378d05-93af-44c8-ae5d-36eca3e4e3dc`  
**Target Files Analyzed**:
- `src/ToolPage.tsx` (Current UI layout, option inputs, action buttons, results cards)
- `src/services.ts` (Existing PDF extraction service `extractPDFPages` and processing pipelines)
- `src/config.ts` (Tool definitions, categories, icon mappings)
- `tests/*.test.cjs` (Existing test suite architecture and VM runner harness)

---

## 1. Observation

### 1.1 Existing UI Handling for AI Text Tools in `src/ToolPage.tsx`
- **Execution Logic** (`src/ToolPage.tsx:576-796, 1226-1232`):
  ```tsx
  // src/ToolPage.tsx lines 1226-1232
  else if (tool.category === "AI text tools") {
    if (!value.trim())
      throw new Error("Enter some text or document content to process.")
    const output = executeAIProcessing(value)
    setTextOutput(output)
  }
  ```
  `executeAIProcessing` is currently an internal synchronous helper embedded directly in `ToolPage.tsx` lines 576–796. It contains naive implementations with limited dictionary mappings (4 languages, 2 tones, basic frequency counting, naive line-by-line diff).

- **Current Input Panels** (`src/ToolPage.tsx:1723-1813`):
  For all AI tools (`tool.category === "AI text tools"`), the UI currently only presents:
  - If `rewrite`: Tone dropdown (`Professional`, `Concise`, `Casual`, `Persuasive`).
  - If `translate`: Single Target Language dropdown (`Spanish`, `French`, `German`, `Japanese`). Missing source language dropdown and missing languages (Italian, Portuguese, Chinese).
  - If `email`: Recipient input (`optionA`) and Subject input (`extra`). Missing purpose dropdown, tone selector, key points structure, and CTA.
  - If `ask`: Question input (`extra`). Missing suggested prompt chips and search mode.
  - If `compare`: Textarea for Version B (`extra`) and Textarea for Version A (`value`).
  - **Missing Option Panels**:
    - `summarize`: Has NO options panel at all! Just a plain textarea. Missing sentence count / length slider and bullet vs paragraph mode.
    - `keywords`: Has NO options panel at all! Missing max keywords slider and n-gram selector.
    - `sentiment`: Has NO options panel at all! Missing analysis granularity and lexicon controls.

- **Source Document Upload Deficiency**:
  Currently, `tool.category === "AI text tools"` does NOT render a file dropzone or file upload input (`src/ToolPage.tsx:1841-1869` is only rendered in the `else` branch for File tools). Users are forced to manually copy/paste text from outside the browser; they cannot upload `.txt`, `.md`, or `.pdf` files.
  However, `src/services.ts:1022` already provides `extractPDFPages(pdfBytes)` which extracts full text from PDF streams client-side.

- **Action Button Labels** (`src/ToolPage.tsx:3095-3148`):
  In `src/ToolPage.tsx:3147`, all 8 AI tools fall through to the default ternary branch:
  ```tsx
  : `Run ${tool.name}`
  ```
  This renders generic labels like `"Run Summarize Document"`, `"Run Rewrite Content"`, `"Run Translate Text"` instead of active, contextual verbs (`"Summarize Document"`, `"Rewrite Content"`, `"Translate Text"`, `"Ask Document AI"`, `"Extract Keywords"`, `"Analyze Sentiment"`, `"Compare Texts"`, `"Generate Email"`).

- **Result Presentation Panels** (`src/ToolPage.tsx:3167-3220`):
  When `textOutput` is populated, `ToolPage.tsx` renders a basic monospace pre-wrap block with standard "Copy Text" and "Download" buttons.
  It lacks specialized visual representations:
  - No sentiment polarity gauge or mood pill for `sentiment`.
  - No color-coded inline or side-by-side diff renderer for `compare`.
  - No interactive tag cloud / ranked keyword table for `keywords`.
  - No highlighted answer card with source citation passage for `ask`.
  - No styled email client preview card with "Copy Subject" and "Copy Body" buttons for `email`.

### 1.2 Test Harness Patterns in `tests/*.test.cjs`
- Automated test runner: `node --test tests/*.test.cjs` running on Node 22 (`package.json:16`).
- Test execution currently passes 100% of existing tests: **357 tests passing across all test files**.
- Existing milestone suites (`m2-pdf-tools.test.cjs`, `m3-conversions.test.cjs`, `m4-pipelines.test.cjs`):
  - Use `node:test` (`test(...)`, `t.test(...)`) and `node:assert/strict`.
  - Dynamic transpiler with `ts.transpileModule(raw, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } })`.
  - Mock DOM context (`createDOMEnv(hash)`) for `localStorage`, `sessionStorage`, `document`, `window`, and `Blob`.
  - Component static rendering using `react-dom/server`'s `renderToStaticMarkup(React.createElement(App))`.
  - Service loading: all suites load `src/services.ts`.

---

## 2. Logic Chain

```
Observation 1: AI tools currently lack document upload (.txt, .pdf) in ToolPage.tsx
         +
Observation 2: src/services.ts already exports extractPDFPages() for in-browser PDF text extraction
         ↓
Logic Step 1: ToolPage.tsx can provide a dual input experience: users can either type/paste directly into the textarea OR drop/upload a .txt/.pdf file. Dropping a file reads text (via file.text() or extractPDFPages) and populates the input textarea with source badge.

Observation 3: 4 tools have zero option panels; the other 4 have incomplete controls
         ↓
Logic Step 2: Implement dedicated, tool-specific option panels in ToolPage.tsx:
  - summarize: Length slider / presets (3, 5, 10 sentences) + format mode (Bullets vs Paragraph)
  - rewrite: 5 tone profiles (Professional, Casual, Academic, Concise, Persuasive) + preserve length toggle
  - translate: Source language (Auto-Detect, EN, ES, FR, DE, IT, PT, ZH, JA) + Target language + Swap button
  - ask: Search question input + suggested prompt chips + source passage citation
  - keywords: Max keywords slider (5 to 30) + N-gram selector (Unigram vs Bigram) + Stopword filter
  - sentiment: Granularity toggle (Overall vs Sentence) + Lexicon sensitivity
  - compare: Dual textareas (Original vs Modified) + diff mode (Line, Word, Char) + ignore whitespace
  - email: Purpose dropdown (Follow-up, Update, Proposal, Thank You, Inquiry, Apology) + Tone + Recipient + Key Points + CTA

Observation 4: Generic button text `Run ${tool.name}` is rendered for all 8 tools
         ↓
Logic Step 3: Map each tool.id to dedicated action verbs in ToolPage submit button.

Observation 5: Current results view is just a plain text block
         ↓
Logic Step 4: Implement bespoke result presentation cards with visual gauges (sentiment), side-by-side diffs (compare), keyword tags & frequency bars (keywords), answer citations (ask), and email preview cards (email).

Observation 6: All existing tests use node:test with ts.transpileModule and loadServices()
         ↓
Logic Step 5: Design tests/m5-ai-text.test.cjs structured into 9 suites matching the exact harness conventions: 8 suites for algorithm unit/boundary/edge cases + 1 suite for React route & UI panel mounting assertions.
```

---

## 3. Caveats

1. **Pure Client-Side Constraint (Requirement R3)**:
   - All AI text operations must execute strictly in-browser without network calls, remote API keys, or backend services.
   - Algorithms must be deterministic, fast (<50ms for normal texts, <200ms for large documents), and resilient to hostile inputs (0-byte text, unicode, malformed syntax).
2. **Bundle Size & Dependencies**:
   - Do NOT add heavy external NLP packages (like heavy Pyodide or gigabyte-sized WASM models).
   - Use client-side algorithmic techniques: TF-IDF frequency scoring, AFINN-165 valence lexicons, Myers/LCS diff arrays, and linguistic template engines.
3. **PDF Text Extraction Asynchronous Loading**:
   - Text files (.txt, .md, .csv) read instantly via `file.text()`.
   - PDFs read via `extractPDFPages()`, which is `async`. When a user drops a PDF, ToolPage should display a brief loading state (`"Extracting text from PDF..."`) while populating the textarea.
4. **Export Location**:
   - While NLP helper logic can be cleanly organized in `src/aiTextService.ts`, all public functions and types MUST be re-exported from `src/services.ts` so that `loadServices()` in test suites can access them without breaking changes.

---

## 4. Conclusion & Implementation Blueprint

### 4.1 UI Layout & Option Panels Specification for `src/ToolPage.tsx`

#### A. Dual Input Component (Textarea + Document Loader)
Place a compact document import toolbar immediately above the primary textarea for AI tools:
```tsx
{tool.category === "AI text tools" && (
  <div className="document-uploader-bar">
    <label className="document-upload-trigger">
      <Upload size={14} />
      <span>Load from .txt or .pdf file</span>
      <input
        type="file"
        accept=".txt,.text,.md,.csv,.pdf,application/pdf"
        onChange={handleDocumentUpload}
        style={{ display: "none" }}
      />
    </label>
    {loadedDocumentName && (
      <div className="loaded-doc-pill">
        <FileText size={12} />
        <span>{loadedDocumentName}</span>
        <button type="button" onClick={clearLoadedDocument}><X size={12} /></button>
      </div>
    )}
  </div>
)}
```
`handleDocumentUpload` reads plain text directly or calls `extractPDFPages(await file.arrayBuffer())`, joining page texts with newlines.

---

#### B. Tool-Specific Option Panels

| Tool ID | State Variables | UI Controls & Form Elements |
|---|---|---|
| `summarize` | `summaryLength`: `"3"` \| `"5"` \| `"10"`<br>`summaryFormat`: `"bullets"` \| `"paragraph"` | - **Summary Length**: Segmented pills or slider: `"Short (3 sentences)"`, `"Medium (5 sentences)"`, `"Detailed (10 sentences)"`<br>- **Output Format**: Segmented toggle: `"Bullet Points"` vs `"Executive Paragraph"` |
| `rewrite` | `rewriteTone`: `"Professional"` \| `"Casual"` \| `"Academic"` \| `"Concise"` \| `"Persuasive"`<br>`preserveLength`: boolean | - **Target Tone**: Dropdown or styled radio pills covering all 5 tones.<br>- **Preserve Length**: Checkbox toggle. |
| `translate` | `sourceLang`: `"auto"` \| `"English"` \| `"Spanish"` \| ...<br>`targetLang`: `"Spanish"` \| `"French"` \| `"German"` \| `"Italian"` \| `"Portuguese"` \| `"Chinese"` \| `"Japanese"` \| `"English"` | - **Source Language**: Dropdown with `"Auto-Detect"` default.<br>- **Swap Button**: `<button type="button"><ArrowRightLeft size={14} /></button>`<br>- **Target Language**: Dropdown with 8 major languages.<br>- **Preserve Formatting**: Checkbox toggle. |
| `ask` | `question`: string<br>`searchMode`: `"semantic"` \| `"exact"` | - **Question Input**: Prominent search input with `<Search size={16} />` icon.<br>- **Quick Prompt Chips**: Clickable buttons: `"What is the summary?"`, `"What are the key deadlines?"`, `"Who are the stakeholders?"`<br>- **Search Mode**: Select between `"Extractive Semantic Match"` and `"Exact Keyword"`. |
| `keywords` | `maxKeywords`: number (5-30, default 10)<br>`ngramMode`: `"unigram"` \| `"bigram"` \| `"phrases"`<br>`filterStopwords`: boolean | - **Max Keywords**: Range slider (`5` to `30`) with live counter pill.<br>- **Keyword Granularity**: Dropdown/radio: `"Single Words"`, `"2-Word Phrases"`, `"Multi-Word Keyphrases"`.<br>- **Filter Stopwords**: Checkbox (default checked). |
| `sentiment` | `sentimentGranularity`: `"document"` \| `"sentences"`<br>`lexiconSensitivity`: `"standard"` \| `"strict"` | - **Analysis Scope**: Select `"Entire Document"` or `"Sentence Breakdown"`.<br>- **Valence Model**: Select `"AFINN-165 General"` or `"Strict Polarity"`. |
| `compare` | `diffMode`: `"lines"` \| `"words"` \| `"chars"`<br>`ignoreWhitespace`: boolean<br>`extra`: string (Version B) | - **Dual Textareas**: Two stacked or side-by-side textareas (`Base Version A` and `Modified Version B`).<br>- **Diff Mode**: Radio pills: `"Line by Line"`, `"Word by Word"`, `"Character"`.<br>- **Ignore Whitespace**: Checkbox toggle. |
| `email` | `emailPurpose`: string<br>`emailTone`: string<br>`emailRecipient`: string<br>`emailSubject`: string<br>`emailCTA`: string | - **Email Purpose**: Dropdown (`Follow-up`, `Project Update`, `Business Proposal`, `Thank You`, `Inquiry`, `Apology`).<br>- **Tone**: Dropdown (`Professional & Formal`, `Friendly & Warm`, `Urgent & Direct`, `Persuasive`).<br>- **Recipient**: Text input (e.g., `"Sarah Connor"`).<br>- **Subject Line**: Auto-generated or editable text input.<br>- **Call to Action (CTA)**: Text input (e.g., `"Confirm approval by Friday 5 PM"`). |

---

#### C. Action Button Copy Mapping
In `src/ToolPage.tsx`, map tool action buttons:
```tsx
tool.id === "summarize" ? "Summarize Document" :
tool.id === "rewrite" ? "Rewrite Content" :
tool.id === "translate" ? "Translate Text" :
tool.id === "ask" ? "Ask Document AI" :
tool.id === "keywords" ? "Extract Keywords" :
tool.id === "sentiment" ? "Analyze Sentiment" :
tool.id === "compare" ? "Compare Texts" :
tool.id === "email" ? "Generate Email" :
```

---

#### D. Specialized Result Presentation Cards

1. **`summarize`**:
   - Compression banner: `Reduced by 55% · 450 words → 190 words · 3 key takeaways`
   - Formatted list of bullets or clean executive paragraph.
   - Quick action: "Copy Summary", "Download TXT".

2. **`rewrite`**:
   - Side-by-side or tabs: "Original" vs "Rewritten ({tone})".
   - Difference highlight or polished text view.
   - Quick action: "Copy Rewritten Text".

3. **`translate`**:
   - Header with detected language badge: `Detected: English → Translated to: Spanish`.
   - Translated text block with preserve whitespace.
   - Quick action: "Copy Translation", "Download TXT".

4. **`ask`**:
   - **Answer Card**: Large prominent callout with the direct answer.
   - **Citation Card**: Exact source sentence quote with matched keywords highlighted.
   - Confidence pill: `Confidence: High (92%) · Matched in Sentence 4, Paragraph 2`.

5. **`keywords`**:
   - **Document Stats**: Word Count, Reading Time, Term Density.
   - **Interactive Tags**: Tag cloud with frequency badges (e.g. `ALGORITHM ×8`, `PERFORMANCE ×5`).
   - **Ranked Table**: Ranked list with rank, keyword, count, and TF-IDF relevance bar.

6. **`sentiment`**:
   - **Visual Gauge Bar**: Color scale from -1.0 (crimson) through 0.0 (gray) to +1.0 (emerald) with arrow pointer positioned at score.
   - **Polarity Badge**: Large badge: `POSITIVE (+0.64) — Optimistic & Confident`.
   - **Term Breakdown**: Two columns: Positive terms list (green tags) vs Negative terms list (red tags).

7. **`compare`**:
   - **Diff Stats Header**: `+14 Additions` (green), `-6 Deletions` (red), `=28 Unchanged` (gray).
   - **Visual Diff Container**: Unified or side-by-side viewer where lines with `+` have green tint, lines with `-` have red tint and strikethrough.

8. **`email`**:
   - **Styled Email Card**:
     - `To:` field
     - `Subject:` line with dedicated "Copy Subject" button.
     - `Body:` clean formatting with greeting, structured paragraphs, CTA, and formal sign-off.
     - "Copy Full Email" and "Download .txt".

---

### 4.2 Automated Test Specifications for `tests/m5-ai-text.test.cjs`

The test suite will be created as `tests/m5-ai-text.test.cjs` containing 9 comprehensive suites:

```js
// tests/m5-ai-text.test.cjs outline
const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

// 1. Suite 1: Pure Client-Side Extractive Summarizer (Tool #26: summarize)
//    - 1.1 TF-IDF sentence frequency extraction
//    - 1.2 Configurable sentence count (1, 3, 5, 10 sentences)
//    - 1.3 Ratio length mode (25%, 50%)
//    - 1.4 Output formatting: Bullet points vs executive paragraph
//    - 1.5 Edge cases: Empty input throws, single sentence, repetitive tokens, 5000+ words stress

// 2. Suite 2: Linguistic Content Rewriting Engine (Tool #27: rewrite)
//    - 2.1 Professional tone transformation (colloquial -> formal business, contraction expansion)
//    - 2.2 Casual tone transformation (formal -> conversational, contractions applied)
//    - 2.3 Academic tone transformation (scholarly vocabulary, passive/analytical framing)
//    - 2.4 Concise tone transformation (elimination of wordy padding phrases)
//    - 2.5 Persuasive tone transformation (rhetorical emphasis and compelling CTAs)
//    - 2.6 Casing, punctuation, and structure preservation
//    - 2.7 Edge cases: Empty input throws, text without matching words, special chars

// 3. Suite 3: Multilingual Lexicon Translation Engine (Tool #28: translate)
//    - 3.1 Lexicon translations for English -> Spanish, French, German, Italian, Portuguese, Chinese, Japanese
//    - 3.2 Reverse translations (Target -> English)
//    - 3.3 Language detection heuristic (identifies Spanish, French, German markers)
//    - 3.4 Capitalization preservation (Welcome -> Bienvenido)
//    - 3.5 Unknown words passthrough and punctuation preservation
//    - 3.6 Edge cases: Empty input throws, numbers/symbols intact

// 4. Suite 4: Document QA Semantic Search Engine (Tool #29: ask)
//    - 4.1 BM25 / TF-IDF passage retrieval answering factual questions
//    - 4.2 Structured response: answer, confidence score, citation quote, matched terms
//    - 4.3 Multi-paragraph distractor rejection
//    - 4.4 Edge cases: Empty question throws, empty document throws, irrelevant questions return graceful low confidence

// 5. Suite 5: TF-IDF Keyword & Keyphrase Extractor (Tool #30: keywords)
//    - 5.1 Tokenization, stopword filtering, and frequency ranking
//    - 5.2 N-gram extraction (Unigram, Bigram, Keyphrase)
//    - 5.3 Max keywords parameter (5, 10, 20)
//    - 5.4 Document metrics calculation (total words, reading time, unique terms)
//    - 5.5 Edge cases: Stopwords-only text, punctuation stripping, empty text throws

// 6. Suite 6: Valence Sentiment Analysis Engine (Tool #31: sentiment)
//    - 6.1 AFINN-inspired valence score calculation (-1.0 to +1.0)
//    - 6.2 Polarity categorization: Positive, Negative, Neutral
//    - 6.3 Negation handling ("not good", "never happy")
//    - 6.4 Positive and Negative term extraction with mood descriptors
//    - 6.5 Edge cases: Empty text throws, zero-sentiment factual text scores 0.00 Neutral

// 7. Suite 7: Myers / LCS Text Diff Highlighter (Tool #32: compare)
//    - 7.1 Line-level diff: additions (+), deletions (-), unchanged ( )
//    - 7.2 Summary stats: additions count, deletions count, similarity percentage
//    - 7.3 Word-level diff granularity
//    - 7.4 Whitespace and case-sensitivity flags
//    - 7.5 Edge cases: Identical texts (100% similarity), disjoint texts (0%), one text empty

// 8. Suite 8: Structured Email Composer Engine (Tool #33: email)
//    - 8.1 Purpose templates: Follow-up, Project Update, Proposal, Thank You, Inquiry, Apology
//    - 8.2 Tone styles: Formal, Friendly, Urgent, Persuasive
//    - 8.3 Structured composition: Recipient salutation, Subject line, Key points integration, CTA, Sign-off
//    - 8.4 Edge cases: Missing recipient fallback, missing CTA graceful omission, empty key points fallback

// 9. Suite 9: React Route Mounting & UI Options Panel Verification
//    - 9.1 Route #summarize renders active options panel (length, format) & "Summarize Document" button
//    - 9.2 Route #rewrite renders active options panel (5 tones) & "Rewrite Content" button
//    - 9.3 Route #translate renders active options panel (languages, swap) & "Translate Text" button
//    - 9.4 Route #ask renders active options panel (question input, prompt chips) & "Ask Document AI" button
//    - 9.5 Route #keywords renders active options panel (max keywords, n-gram) & "Extract Keywords" button
//    - 9.6 Route #sentiment renders active options panel & "Analyze Sentiment" button
//    - 9.7 Route #compare renders dual textareas & "Compare Texts" button
//    - 9.8 Route #email renders form fields (purpose, recipient, CTA) & "Generate Email" button
//    - 9.9 Result panel controls: Copy to clipboard and Download buttons verified
```

---

## 5. Verification Method

### 5.1 Independent Test Commands
To verify the implementation once executed by the Worker agent:
```bash
# 1. Run all tests including existing 357 tests + new M5 suite
npm test

# 2. Run M5 AI Text suite specifically
node --test tests/m5-ai-text.test.cjs

# 3. Check for TypeScript compilation errors
npx vite build
```

### 5.2 UI Visual & Static Mounting Verification
1. Route verification:
   Mount routes `#summarize`, `#rewrite`, `#translate`, `#ask`, `#keywords`, `#sentiment`, `#compare`, `#email`. Verify:
   - No 404 detour panel (`/404 · A SMALL DETOUR/`).
   - No `"Coming soon"` or `"ON THE HORIZON"` placeholder.
   - Dedicated action buttons and option inputs present in rendered static HTML.
2. Invalidation criteria:
   - If any tool falls back to `Run ${tool.name}` instead of the dedicated action verb.
   - If any tool lacks its specified option panel.
   - If `tests/m5-ai-text.test.cjs` fails any unit, boundary, or mounting assertion.
   - If `npm test` regresses any of the 357 passing tests from M1-M4.
