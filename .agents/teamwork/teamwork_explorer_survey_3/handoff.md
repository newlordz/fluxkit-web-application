# Survey Report: Build & Test Infrastructure and 37-Tool Verification Strategy

## 1. Observation

### 1.1 Package & Build Infrastructure
- **`package.json`**:
  - Scripts (lines 6–12):
    ```json
    "scripts": {
      "dev": "vite",
      "build": "vite build",
      "preview": "vite preview",
      "format": "oxfmt src",
      "test": "node --test tests/*.test.cjs"
    }
    ```
  - Runtime Dependencies (lines 13–19): `lucide-react` (^1.59.0), `pdf-lib` (^1.17.1), `qrcode` (^1.5.4), `react` (^19.0.0), `react-dom` (^19.0.0).
  - Dev Dependencies (lines 20–31): `@tailwindcss/vite` (^4.0.0), `@types/node` (^22.0.0), `@types/qrcode` (^1.5.6), `@types/react` (^19.0.0), `@types/react-dom` (^19.0.0), `@vitejs/plugin-react` (^6.0.0), `oxfmt` (^0.2.0), `tailwindcss` (^4.0.0), `typescript` (^5.7.0), `vite` (^8.0.5).
- **`vite.config.ts`**:
  - Vite 8.3.4 with plugins: `@vitejs/plugin-react`, `@tailwindcss/vite`, `figmaSiteConfiguration`, `figmaErrorOverlayReplay`, `figmaReactRefreshBoundaryFallback`, `figmaMakeKitPlugin`.
  - Default dev server port: `8443` (configurable via `process.env.PORT`).
  - Path alias: `@` resolves to `./src`.
- **`tsconfig.json`**:
  - Configures `ES2020` target, `ESNext` module resolution, `bundler` resolution, `"paths": { "@/*": ["./src/*"] }`, `skipLibCheck: true`, and `noEmit: true`.

### 1.2 Build & Execution Status
- Command: `npm run build`
  - Result: **SUCCESS** (Exit code 0, completed in ~784ms).
  - Output:
    ```text
    ✓ 2134 modules transformed.
    dist/robots.txt                   0.02 kB │ gzip:   0.04 kB
    dist/index.html                   1.24 kB │ gzip:   0.57 kB
    dist/assets/index-Dxpc5hJt.css   88.44 kB │ gzip:  17.58 kB
    dist/assets/index-hh3RKBRZ.js   776.91 kB │ gzip: 285.38 kB
    ✓ built in 784ms
    ```
  - Warnings: Vite config uses features not supported in future native config mode (`__dirname` at line 31:27 and unflagged JSON import `./.figma/make/site.json` at line 6:31); JS chunk is > 500 kB after minification.
- Command: `npm test`
  - Result: **SUCCESS** (Exit code 0, 22 tests passing, duration 4.13s).
  - Test runner: Node.js built-in runner (`node --test tests/*.test.cjs`).
  - Execution summary:
    ```text
    ✔ Google / Gmail sign-in creates user account and manages session (834.1475ms)
    ✔ Google auth derives formatted display names from email prefixes (35.7112ms)
    ✔ authentication cannot succeed without a server adapter (130.9438ms)
    ✔ catalog routes are unique and audio is a distinct backend-dependent category (108.9106ms)
    ✔ route renders: overview (454.2123ms)
    ✔ route renders: all (299.1158ms)
    ✔ route renders: files (211.2786ms)
    ✔ route renders: qr-tools (175.3755ms)
    ✔ route renders: ai (176.2798ms)
    ✔ route renders: audio (141.1467ms)
    ✔ route renders: documents (149.1314ms)
    ✔ route renders: activity (155.8385ms)
    ✔ route renders: settings (180.2963ms)
    ✔ route renders: help (156.1264ms)
    ✔ route renders: qr (252.0385ms)
    ✔ route renders: merge-pdf (168.0858ms)
    ✔ route renders: text-pdf (158.7009ms)
    ✔ route renders: audio-text (166.4707ms)
    ✔ route renders: sign-in (170.5888ms)
    ✔ route renders: sign-up (127.4112ms)
    ✔ route renders: reset-password (145.3516ms)
    ✔ route renders: unknown-route (132.708ms)
    ℹ tests 22 pass 22 fail 0
    ```
- Command: `npx oxfmt --check src README.md`
  - Result: Exit code 1. Reports format issues in `src/GoogleAuth.tsx` and `src/authService.ts`.
- Command: `npx tsc --noEmit`
  - Result: Exit code 1. Fails solely on syntax errors within `@types/node` declaration files in `node_modules` (e.g. `node_modules/@types/node/buffer.d.ts:3:57 error TS1005: ';' expected`), not within project source files. Note that `tsc` is not part of the standard `package.json` build/test scripts (`vite build` transpiles and bundles successfully).

### 1.3 Inventory of Existing Test Suites
- Only two test files exist in the entire repository:
  1. `tests/google-auth.test.cjs` (120 lines):
     - Uses `node:test`, `node:assert/strict`, `typescript.transpileModule`, and `vm.runInNewContext`.
     - Tests Google sign-in session creation, persistence, and display name derivation from email addresses.
  2. `tests/workspace.test.cjs` (132 lines):
     - Uses `node:test`, `node:assert/strict`, `typescript.transpileModule`, `vm.runInNewContext`, and `react-dom/server.renderToStaticMarkup`.
     - Tests authentication refusal when no server adapter exists.
     - Tests catalog uniqueness and audio categorization.
     - Tests route static rendering for 18 routes (`overview`, `all`, `files`, `qr-tools`, `ai`, `audio`, `documents`, `activity`, `settings`, `help`, `qr`, `merge-pdf`, `text-pdf`, `audio-text`, `sign-in`, `sign-up`, `reset-password`, `unknown-route`).

### 1.4 State of the 37 Tools in `src/config.ts` and `src/App.tsx`
- In `src/config.ts` (lines 98–533), exactly 37 tools are registered across 5 categories:
  - **File tools (19 tools)**: `merge-pdf`, `split-pdf`, `compress`, `pdf-to-word`, `pdf-to-ppt`, `pdf-to-excel`, `word-to-pdf`, `ppt-to-pdf`, `excel-to-pdf`, `edit-pdf`, `pdf-to-jpg`, `jpg-to-pdf`, `sign-pdf`, `watermark`, `rotate-pdf`, `text-pdf`, `ocr`, `password`, `zip`, `convert`, `convert-compress`, `merge-compress`, `split-compress`.
  - **QR tools (1 tool)**: `qr`.
  - **AI text tools (8 tools)**: `summarize`, `rewrite`, `translate`, `ask`, `keywords`, `sentiment`, `compare`, `email`.
  - **Audio tools (1 tool)**: `audio-text`.
  - **Workspace (4 tools)**: `documents`, `activity`, `meetings`, `whiteboards`.
- **Availability State**:
  - `available: true`: Only 5 tools (`merge-pdf`, `rotate-pdf`, `text-pdf`, `qr`, `audio-text`) plus `activity` in Workspace.
  - `available: false`: The remaining 31 tools.
- **Routing & Implementation State in `src/App.tsx`**:
  - Lines 838–840: Only `["qr", "merge-pdf", "text-pdf", "rotate-pdf"]` route to the active `ToolPage` component.
  - Lines 823–837: `audio-text` routes to `AudioToText` (renders "Backend not connected" unless `VITE_API_BASE_URL` is set).
  - Lines 856–913: All other 31 tools fall through to the "Coming soon" panel (`"This feature is coming soon and is not connected to a processing service yet."`).
- **Current Automated Test Coverage for the 37 Tools**:
  - Only 5 specific tool routes are tested for static rendering in `workspace.test.cjs`: `qr`, `merge-pdf`, `text-pdf`, `audio-text`, and `activity`.
  - `rotate-pdf` is **not** included in the tested routes list in `workspace.test.cjs`.
  - The remaining 31 tools have **zero** route render tests and **zero** logic/service unit tests.
  - In `src/services.ts`, the functions `mergePDFs`, `rotatePDF`, `textToPDF`, and `generateQR` have **zero direct unit tests** in `tests/`.

---

## 2. Logic Chain

1. **Test Runner Selection**:
   - `package.json` specifies `"test": "node --test tests/*.test.cjs"`.
   - The test infrastructure uses Node's native test runner (`node:test`), which requires no external dependencies (no Vitest, Jest, Playwright, or JSDOM required).
   - The `sourceLoader` pattern in `tests/workspace.test.cjs` and `tests/google-auth.test.cjs` transpiles TypeScript and TSX files on the fly via `typescript.transpileModule` and evaluates them in a controlled Node `vm` context with mocked browser globals (`localStorage`, `location`, `window`, `Blob`, `AbortSignal`).
   - For UI smoke tests, `renderToStaticMarkup(React.createElement(App))` produces full HTML markup, enabling assertion of rendered headers, forms, inputs, error messages, and buttons in under 200ms per route.
   - Therefore, the recommended verification architecture should build upon this proven, zero-overhead harness.

2. **Sequential Verification Architecture for All 37 Tools**:
   - For each of the 37 tools, verification must confirm two distinct layers:
     - **Layer 1: Engine/Service Unit Tests**: Direct programmatic invocation of the underlying processing functions (in `services.ts` or modular service files) with valid, invalid, and boundary inputs.
     - **Layer 2: Component & Route Interaction Tests**: Verification that navigating to `#<tool-id>` renders an active interactive UI (not the "Coming soon" screen), displays proper form controls, triggers validation on empty/invalid input, and succeeds upon valid input.

3. **Handling Backend-Dependent Tools (R3 Requirement)**:
   - R3 requires: *"For tools requiring external services or backend APIs (such as AI text tools, audio transcription, or document format conversions), implement client-side functionality or in-browser fallback/simulated processing so that every tool operates interactively within the web app."*
   - Currently, `AudioToText` and AI text tools lack client-side processing fallbacks.
   - For `audio-text`: Implement a client-side simulated transcription engine (e.g. browser Web Speech API / audio duration and waveform analyzer / deterministic audio-to-text fallback) that produces realistic editable transcripts with timestamps when no remote backend URL is provided.
   - For AI text tools (`summarize`, `rewrite`, `translate`, `ask`, `keywords`, `sentiment`, `compare`, `email`): Implement deterministic, high-quality client-side NLP processors (TF-IDF summarization, linguistic tone rewrite rules, multilingual dictionary mapping, BM25 semantic QA matching, stop-word keyword extractors, AFINN sentiment scoring, LCS text diffing, and template email synthesis).
   - This ensures 100% interactive operability and deterministic automated testability without external API dependencies.

---

## 3. Tool-by-Tool Verification Strategy (All 37 Tools)

Below is the verification blueprint for every tool, categorized by functional domain:

### Domain 1: PDF Core & Manipulation (9 Tools)

| Tool ID | Name | Category | Service Function / Unit Test Target | Mock Input & Verification Assertion | Edge & Failure Cases |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `merge-pdf` | Merge PDF | File tools | `mergePDFs(files: File[])` | Input: 2 valid PDF buffers created via `PDFDocument.create()`. Output: valid PDF blob, page count = sum of input pages. | < 2 files throws error; corrupted PDF throws error. |
| `split-pdf` | Split PDF | File tools | `splitPDF(file: File, options: { mode, pages })` | Input: 3-page PDF, extract page 2. Output: 1-page PDF blob containing original page 2 content. | Out-of-bounds page numbers (e.g. page 10 of 3); 0-byte file. |
| `compress` | Compress PDF | File tools | `compressPDF(file: File, level)` | Input: PDF buffer. Output: valid PDF blob with `%PDF-` signature and stream optimization. | Corrupted PDF stream handled gracefully. |
| `rotate-pdf` | Rotate PDF | File tools | `rotatePDF(file: File, angle)` | Input: 1-page PDF at 0°. Rotate by 90°. Output: page rotation property equals 90°. | Angle normalization (e.g. 450° -> 90°); 180° and 270° rotations. |
| `edit-pdf` | Edit PDF | File tools | `editPDF(file: File, annotations)` | Input: PDF buffer + text annotation `{ text: "Review", x: 50, y: 500, page: 0 }`. Output: saved PDF with annotation. | Coordinates outside page dimensions; empty annotations array. |
| `watermark` | Watermark | File tools | `watermarkPDF(file: File, options)` | Input: 3-page PDF + text "CONFIDENTIAL". Output: all 3 pages contain watermark with specified opacity/rotation. | Empty watermark string validation error. |
| `sign-pdf` | Sign PDF | File tools | `signPDF(file: File, signatureDataUrl, pos)` | Input: PDF buffer + 1x1 transparent PNG data URL. Output: valid PDF with embedded signature image. | Invalid base64 signature image; invalid target page. |
| `password` | PDF Security & Unlock | File tools | `protectPDF(file, pwd)` & `unlockPDF(file, pwd)` | Input: PDF buffer + password "secret123". Output: encrypted PDF; verify unlock with correct password succeeds and wrong password fails. | Blank password rejection; already unencrypted file. |
| `ocr` | OCR Scanner | File tools | `runOCR(file: File)` | Input: Sample image/scanned PDF buffer with text. Output: extracted text string and confidence score > 0. | Blank image returns empty string with warning; non-image rejected. |

### Domain 2: Document & Format Conversions (8 Tools)

| Tool ID | Name | Category | Service Function / Unit Test Target | Mock Input & Verification Assertion | Edge & Failure Cases |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `pdf-to-word` | PDF to Word | File tools | `pdfToWord(file: File)` | Input: Text PDF buffer. Output: `.docx` blob (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) containing extracted text. | PDF without text extracts available metadata or layout; corrupt file. |
| `pdf-to-ppt` | PDF to PowerPoint | File tools | `pdfToPPT(file: File)` | Input: 2-page PDF. Output: presentation blob (`.pptx`) containing 2 slides matching PDF pages. | Single-page PDF handling; empty document. |
| `pdf-to-excel` | PDF to Excel | File tools | `pdfToExcel(file: File)` | Input: PDF containing tabular text. Output: CSV/XLSX blob with delimited columns and rows. | Non-tabular text formatted into structured single-column rows. |
| `word-to-pdf` | Word to PDF | File tools | `wordToPDF(file: File)` | Input: `.docx` or structured text file. Output: valid `%PDF-` document rendered via `pdf-lib`. | Unsupported binary format rejected with user-friendly error. |
| `ppt-to-pdf` | PowerPoint to PDF | File tools | `pptToPDF(file: File)` | Input: Presentation file buffer. Output: multi-page PDF document. | 0-slide file error. |
| `excel-to-pdf` | Excel to PDF | File tools | `excelToPDF(file: File)` | Input: CSV/spreadsheet data buffer. Output: formatted PDF table grid rendered across pages. | Extreme column count pagination; empty spreadsheet. |
| `pdf-to-jpg` | PDF to JPG | File tools | `pdfToJPG(file: File)` | Input: 2-page PDF. Output: Array of 2 JPEG blobs (`image/jpeg`) or zip archive. | Zero pages error. |
| `jpg-to-pdf` | JPG to PDF | File tools | `jpgToPDF(files: File[])` | Input: Array of JPEG image buffers. Output: valid PDF where page dimensions match image aspect ratio. | Non-image file in input array rejected. |

### Domain 3: Pipeline & Multi-Action Utilities (5 Tools)

| Tool ID | Name | Category | Service Function / Unit Test Target | Mock Input & Verification Assertion | Edge & Failure Cases |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `zip` | ZIP and Unzip | File tools | `createZip(files)` & `extractZip(file)` | Input: 3 text files. Output: ZIP buffer with `PK\x03\x04` header. Extracting ZIP returns original 3 files. | Corrupted ZIP archive; empty file list. |
| `convert` | Convert Formats | File tools | `convertFormat(file, targetFormat)` | Input: JSON text -> target "csv". Output: valid CSV formatted string and blob. | Unsupported format conversion throws clear error. |
| `convert-compress` | Convert & Compress | File tools | `convertAndCompress(file, target)` | Input: Document file. Output: Converted and optimized/compressed blob. | Already compressed format. |
| `merge-compress` | Merge & Compress | File tools | `mergeAndCompress(files)` | Input: 2 PDF files. Output: Single merged and stream-compressed PDF blob. | < 2 input files. |
| `split-compress` | Split & Compress | File tools | `splitAndCompress(file, pages)` | Input: Multi-page PDF + page range. Output: Extracted pages as compressed PDF blob. | Out-of-bounds page range. |

### Domain 4: Standouts & QR Studio (2 Tools)

| Tool ID | Name | Category | Service Function / Unit Test Target | Mock Input & Verification Assertion | Edge & Failure Cases |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `text-pdf` | Text to PDF | File tools | `textToPDF(text, title)` | Input: Title "Spec" + 100 lines of text. Output: Multi-page PDF blob, Helvetica font, page count > 1. | Empty text throws "Add some text to create your document." |
| `qr` | QR Code Studio | QR tools | `generateQR(content)` | Input: `https://example.com`, WhatsApp phone, WiFi credentials, Email mailto. Output: `data:image/png;base64,...` data URL. | Invalid URL protocol; invalid email address format; invalid phone number. |

### Domain 5: AI Text Tools (Client-Side NLP) (8 Tools)

| Tool ID | Name | Category | Service Function / Unit Test Target | Mock Input & Verification Assertion | Edge & Failure Cases |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `summarize` | Summarize Document | AI text tools | `summarizeText(text, length)` | Input: 5-paragraph text. Output: `{ summary, bulletPoints }` where summary length < input length. | Short text (< 30 words) handled without error. |
| `rewrite` | Rewrite Content | AI text tools | `rewriteText(text, tone)` | Input: Sentence + tone 'professional'. Output: Rewritten sentence with professional vocabulary. | Empty input validation. |
| `translate` | Translate Text | AI text tools | `translateText(text, targetLang)` | Input: "Hello, welcome to our office" -> target "es". Output: translated text in Spanish with target language code. | Target language identical to detected source. |
| `ask` | Ask Document AI | AI text tools | `askDocument(text, question)` | Input: Document text + question matching paragraph 2. Output: Accurate answer citing paragraph 2. | Question unrelated to document text returns polite fallback. |
| `keywords` | Extract Keywords | AI text tools | `extractKeywords(text, count)` | Input: Article on cloud computing. Output: Ranked keyword list containing "cloud", "computing", excluding stop words. | Text containing only stop words or numbers. |
| `sentiment` | Analyze Sentiment | AI text tools | `analyzeSentiment(text)` | Input: "Outstanding, fast, reliable" vs "Terrible, broken, failed". Output: Score > 0 ('positive') vs Score < 0 ('negative'). | Neutral objective statement scores ~0 ('neutral'). |
| `compare` | Compare Texts | AI text tools | `compareTexts(textA, textB)` | Input: "The quick brown fox" vs "The fast brown fox". Output: `{ diffs, similarity: ~0.8 }` with "quick" removed, "fast" added. | Identical texts (1.0 similarity, 0 diffs); completely disjoint texts. |
| `email` | Generate an Email | AI text tools | `generateEmail(prompt)` | Input: `{ purpose: "Schedule demo", tone: "Professional" }`. Output: structured `{ subject, body }` with greeting, body, and sign-off. | Blank purpose validation. |

### Domain 6: Audio & Multimedia (2 Tools)

| Tool ID | Name | Category | Service Function / Unit Test Target | Mock Input & Verification Assertion | Edge & Failure Cases |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `audio-text` | Audio to Text | Audio tools | `transcribeAudio(file, opts)` | Input: Audio file. Output: `{ text, segments, language }` with timestamps and editable transcript in-browser. | Non-audio file rejection; 0-byte file rejection; fallback when backend absent. |
| `meetings` | Video Meetings | Workspace | `createMeeting(options)` | Input: `{ roomName: "Design Sprint" }`. Output: valid meeting room ID, join URL, interactive mic/camera control state. | Empty room name generates random unique room ID. |

### Domain 7: Workspace & Collaboration (3 Tools)

| Tool ID | Name | Category | Service Function / Unit Test Target | Mock Input & Verification Assertion | Edge & Failure Cases |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `documents` | My Documents | Workspace | `documentStore` operations | Input: Save 2 processed files. Output: Listing returns 2 files; delete 1 file leaves 1 file. | Clear all files; duplicate file name handling. |
| `activity` | Activity Feed | Workspace | `activityStore` operations | Input: Record 3 completed operations. Output: Activity feed renders 3 items with timestamps in reverse order. | Clear activity resets feed to empty state. |
| `whiteboards` | Whiteboards | Workspace | `whiteboardStore` operations | Input: Add pen stroke and rectangle shape. Output: Canvas state holds 2 elements; export generates PNG data URL. | Clear canvas resets elements; undo/redo with empty history. |

---

## 4. Caveats

1. **Read-Only Investigation**: As an explorer subagent, no code changes were made to source files or test files during this survey.
2. **TypeScript CLI vs. Vite Transpilation**: `npx tsc --noEmit` reports errors in `@types/node` declaration files in `node_modules` (syntax issues in type definition files). The actual production build (`npm run build`) uses Vite's esbuild/rolldown transpilation pipeline which succeeds with zero errors in 784ms.
3. **Audio to Text Backend Dependency**: Currently, `src/AudioToText.tsx` explicitly checks `if (!apiBaseUrl?.trim()) return` and renders "Backend not connected". Fulfilling R3 will require introducing a client-side in-browser transcription simulator/fallback while preserving the ability to connect a real backend when `VITE_API_BASE_URL` is set.
4. **Existing Test Scope**: The current 22 tests in `npm test` do not test service algorithms directly; they test Google auth and 18 route static renders. Any new test suite should complement, not break, these 22 passing tests.

---

## 5. Conclusion

1. **Build & Infrastructure Health**: The workspace build and test systems are fast, lightweight, and healthy. `npm test` passes 22/22 tests in 4.13s, and `npm run build` succeeds in 784ms.
2. **Current Deficit**: 31 of the 37 tools are currently disabled (`available: false`) and render a static "Coming soon" screen. Only 4 tools (`merge-pdf`, `rotate-pdf`, `text-pdf`, `qr`) plus `audio-text` have dedicated UI views.
3. **Test Infrastructure Recommendation**:
   - Retain Node.js built-in `node:test` (`npm test`) to avoid introducing complex testing dependencies (Jest/Vitest/Playwright).
   - In `tests/`, add dedicated test suites matching `tests/*.test.cjs` (e.g., `tests/tools-pdf.test.cjs`, `tests/tools-conversions.test.cjs`, `tests/tools-ai.test.cjs`, `tests/tools-workspace.test.cjs`, and `tests/tools-routes.test.cjs`).
   - Use the `sourceLoader` pattern to transpile TypeScript in memory and execute pure service logic as well as component rendering.
   - For route verification, expand the loop in `tests/workspace.test.cjs` from 18 routes to include all 37 tool route IDs, asserting that each renders its active tool header and controls rather than the 404 or "Coming soon" fallback.

---

## 6. Verification Method

To independently verify these findings, execute the following commands in the project workspace:

1. **Verify Existing Tests**:
   ```powershell
   npm test
   ```
   *Expected*: 22 tests pass, 0 fail, exit code 0.

2. **Verify Production Build**:
   ```powershell
   npm run build
   ```
   *Expected*: Vite builds `dist/` successfully with exit code 0 in under 2 seconds.

3. **Verify Tool Count & Availability in `src/config.ts`**:
   ```powershell
   node -e "const ts = require('typescript'); const fs = require('fs'); const code = ts.transpileModule(fs.readFileSync('src/config.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText; const exp = {}; eval(code); console.log('Total tools:', exp.tools.length); console.log('Available tools:', exp.tools.filter(t => t.available).map(t => t.id));"
   ```
   *Expected*: Total tools: 37. Available tools: `['merge-pdf', 'rotate-pdf', 'text-pdf', 'qr', 'audio-text', 'activity']`.

4. **Verify Existing Test Files**:
   ```powershell
   Get-ChildItem -Path tests -Filter *.test.cjs | Select-Object Name, Length
   ```
   *Expected*: Only `google-auth.test.cjs` and `workspace.test.cjs`.
