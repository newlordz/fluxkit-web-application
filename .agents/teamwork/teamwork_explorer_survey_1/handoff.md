# Handoff Report: Survey Phase (Tools and UI Inventory)

## 1. Observation

### 1.1 Codebase & Configuration Direct Observations

- **File**: `src/config.ts` (lines 100–533)
  Defines an array `tools: Tool[]` containing exactly **37 tools** across **5 distinct categories**:
  - `File tools`: 23 tools
  - `QR tools`: 1 tool
  - `AI text tools`: 8 tools
  - `Audio tools`: 1 tool
  - `Workspace`: 4 tools

- **Availability flags in `src/config.ts`**:
  Only **6 tools** have `available: true`:
  - `merge-pdf` (line 106)
  - `rotate-pdf` (line 274)
  - `text-pdf` (line 288)
  - `qr` (line 300)
  - `audio-text` (line 313, with `integrationRequired: true` at line 319)
  - `activity` (line 509)
  The other **31 tools** have `available: false`.

- **Navigation & Routing in `src/App.tsx`** (lines 823–868):
  Tool rendering dispatch logic:
  ```tsx
  823:  ) : page === "audio-text" ? (
  824:    <AudioToText ... />
  838:  ) : selected?.available &&
  839:    ["qr", "merge-pdf", "text-pdf", "rotate-pdf"].includes(page) ? (
  840:    <ToolPage key={page} tool={selected} ... />
  856:  ) : !selected && page !== "help" ? (
  857:    <section className="panel coming-soon page-enter">
  858:      <div className="eyebrow">404 · A SMALL DETOUR</div>
  859:      <h1>This page isn’t in the toolkit.</h1>
  ...
  869:  ) : (
  870:    <div className="page-enter">
  871:      <button className="text-button" onClick={() => navigate("all")}>
  872:        <ChevronLeft size={16} /> Back to tools
  873:      </button>
  874:      <section className="panel coming-soon">
  875:        <span className="coming-icon">...</span>
  882:        <span className="eyebrow">{page === "help" ? "A LITTLE GUIDANCE" : "ON THE HORIZON"}</span>
  884:        <h1>{selected?.name || "Help & resources"}</h1>
  885:        <p>{...} This feature is coming soon and is not connected to a processing service yet.</p>
  ```

- **Current Component Coverage in `src/`**:
  - `ToolPage.tsx`: Handles `qr` (via `generateQR`), `merge-pdf` (via `mergePDFs`), `rotate-pdf` (via `rotatePDF`), and `text-pdf` (via `textToPDF`). All four run client-side using `pdf-lib` and `qrcode`.
  - `AudioToText.tsx`: Dedicated audio transcription UI. Line 69 returns early if `!apiBaseUrl?.trim()`, causing line 152 `if (!file || !capabilities || busy) return` to block execution. Shows banner: `"Backend not connected"`.
  - `App.tsx` inline handler (lines 689–714): Handles `activity` session feed display.
  - `Overview.tsx`: Main dashboard and quick-launcher with drag-and-drop file detection (routes `.pdf` -> `merge-pdf`, images -> `jpg-to-pdf`, audio -> `audio-text`, office docs -> respective `to-pdf` tools).
  - Remaining 31 tools: Route directly to fallback `<section className="panel coming-soon">` with no interactive inputs or processing logic.

- **Automated Tests & Build Status**:
  - `npm test`: Executes `node --test tests/*.test.cjs` (22 tests passing). Smoke tests routes including `overview`, `all`, `files`, `qr-tools`, `ai`, `audio`, `documents`, `activity`, `settings`, `help`, `qr`, `merge-pdf`, `text-pdf`, `audio-text`.
  - `npm run build`: Bundles successfully in ~740ms with Vite and Tailwind v4.

---

### 1.2 Comprehensive Inventory Table of All 37 Tools

| # | Tool ID | Name | Category | Icon | Badge Icon / Color | Available in Config | Inputs & Outputs | Current UI Mounting Status in `App.tsx` |
|---|---|---|---|---|---|---|---|---|
| 1 | `merge-pdf` | Merge PDF | File tools | `Combine` | `merge` / red | `true` | In: 2+ PDF files<br>Out: Single merged PDF (`merged-document.pdf`) | **Mounted & Functional** (`ToolPage.tsx` via `pdf-lib`) |
| 2 | `split-pdf` | Split PDF | File tools | `Scissors` | `split` / red | `false` | In: 1 PDF file, page range/selection<br>Out: Extracted PDF page(s) | **Placeholder** ("Coming soon / On the horizon") |
| 3 | `compress` | Compress PDF | File tools | `Minimize2` | `compress` / emerald | `false` | In: 1 PDF file, compression quality preset<br>Out: Compressed PDF file | **Placeholder** ("Coming soon / On the horizon") |
| 4 | `pdf-to-word` | PDF to Word | File tools | `FileText` | `word` / blue | `false` | In: 1 PDF file<br>Out: Editable Word DOCX / formatted text doc | **Placeholder** ("Coming soon / On the horizon") |
| 5 | `pdf-to-ppt` | PDF to PowerPoint | File tools | `Presentation` | `powerpoint` / orange | `false` | In: 1 PDF file<br>Out: PPTX presentation slideshow | **Placeholder** ("Coming soon / On the horizon") |
| 6 | `pdf-to-excel` | PDF to Excel | File tools | `FileSpreadsheet` | `excel` / emerald | `false` | In: 1 PDF file with table data<br>Out: Excel spreadsheet (.xlsx / .csv) | **Placeholder** ("Coming soon / On the horizon") |
| 7 | `word-to-pdf` | Word to PDF | File tools | `FileText` | `word-pdf` / blue | `false` | In: Word document (.doc, .docx, .txt)<br>Out: Clean PDF document | **Placeholder** ("Coming soon / On the horizon") |
| 8 | `ppt-to-pdf` | PowerPoint to PDF | File tools | `Presentation` | `ppt-pdf` / orange | `false` | In: Slideshow (.ppt, .pptx, images)<br>Out: PDF document presentation | **Placeholder** ("Coming soon / On the horizon") |
| 9 | `excel-to-pdf` | Excel to PDF | File tools | `FileSpreadsheet` | `excel-pdf` / emerald | `false` | In: Spreadsheet (.xls, .xlsx, .csv)<br>Out: Formatted printable PDF | **Placeholder** ("Coming soon / On the horizon") |
| 10 | `edit-pdf` | Edit PDF | File tools | `FilePenLine` | `edit` / purple | `false` | In: PDF file + annotations, text overlay, shapes<br>Out: Modified annotated PDF | **Placeholder** ("Coming soon / On the horizon") |
| 11 | `pdf-to-jpg` | PDF to JPG | File tools | `Image` | `pdf-jpg` / amber | `false` | In: PDF file, page selection<br>Out: JPG image file(s) / ZIP | **Placeholder** ("Coming soon / On the horizon") |
| 12 | `jpg-to-pdf` | JPG to PDF | File tools | `Image` | `jpg-pdf` / amber | `false` | In: Image files (JPG, PNG)<br>Out: PDF document with fitted pages | **Placeholder** ("Coming soon / On the horizon") |
| 13 | `sign-pdf` | Sign PDF | File tools | `PenTool` | `sign` / blue | `false` | In: PDF file + drawn/typed signature stamp<br>Out: Signed PDF document | **Placeholder** ("Coming soon / On the horizon") |
| 14 | `watermark` | Watermark | File tools | `Stamp` | `watermark` / purple | `false` | In: PDF file + watermark text/image, opacity, angle<br>Out: Watermarked PDF document | **Placeholder** ("Coming soon / On the horizon") |
| 15 | `rotate-pdf` | Rotate PDF | File tools | `RotateCw` | `rotate` / purple | `true` | In: 1+ PDF files, rotation angle (90/180/270)<br>Out: Rotated PDF (`rotated-[filename].pdf`) | **Mounted & Functional** (`ToolPage.tsx` via `pdf-lib`) |
| 16 | `text-pdf` | Text to PDF | File tools | `FileText` | `text` / blue | `true` | In: Document title, plain text body<br>Out: Formatted PDF (`fluxkit-document.pdf`) | **Mounted & Functional** (`ToolPage.tsx` via `pdf-lib`) |
| 17 | `qr` | QR Code Studio | QR tools | `QrCode` | `qr` / teal | `true` | In: Type (URL, Text, WhatsApp, Wi-Fi, Email), inputs<br>Out: QR code PNG image (`fluxkit-qr.png`) | **Mounted & Functional** (`ToolPage.tsx` via `qrcode`) |
| 18 | `audio-text` | Audio to Text | Audio tools | `AudioLines` | `audio` / amber | `true` (`integrationRequired`) | In: Audio recording file (MP3, WAV, etc.)<br>Out: Transcribed editable text & transcript download | **Mounted but Blocked** (`AudioToText.tsx` requires backend adapter) |
| 19 | `ocr` | OCR Scanner | File tools | `FileScan` | `scan` / teal | `false` | In: Image or scanned PDF file<br>Out: Extracted editable text / searchable document | **Placeholder** ("Coming soon / On the horizon") |
| 20 | `password` | PDF Security & Unlock | File tools | `FileLock2` | `lock` / purple | `false` | In: PDF file + password (encrypt or decrypt)<br>Out: Password-protected or unlocked PDF | **Placeholder** ("Coming soon / On the horizon") |
| 21 | `zip` | ZIP and Unzip | File tools | `Archive` | None / teal | `false` | In: Multiple files to zip OR .zip archive to unzip<br>Out: Generated .zip archive OR extracted file list | **Placeholder** ("Coming soon / On the horizon") |
| 22 | `convert` | Convert Formats | File tools | `ArrowLeftRight` | None / teal | `false` | In: Source document/image/audio + target format<br>Out: Converted file in target format | **Placeholder** ("Coming soon / On the horizon") |
| 23 | `convert-compress` | Convert & Compress | File tools | `Workflow` | None / emerald | `false` | In: File + target format + compression level<br>Out: Converted and compressed output file | **Placeholder** ("Coming soon / On the horizon") |
| 24 | `merge-compress` | Merge & Compress | File tools | `Layers` | None / emerald | `false` | In: Multiple PDF documents<br>Out: Merged and compressed single PDF | **Placeholder** ("Coming soon / On the horizon") |
| 25 | `split-compress` | Split & Compress | File tools | `Files` | None / emerald | `false` | In: PDF document + page range<br>Out: Extracted pages as compressed PDF | **Placeholder** ("Coming soon / On the horizon") |
| 26 | `summarize` | Summarize Document | AI text tools | `ScanText` | `ai` / purple | `false` | In: Text or document + length preset (brief/detailed)<br>Out: Bulleted key takeaways and executive summary | **Placeholder** ("Coming soon / On the horizon") |
| 27 | `rewrite` | Rewrite Content | AI text tools | `PenLine` | `ai` / purple | `false` | In: Draft text + tone (professional, casual, persuasive)<br>Out: Rewritten text variations | **Placeholder** ("Coming soon / On the horizon") |
| 28 | `translate` | Translate Text | AI text tools | `Languages` | `ai` / teal | `false` | In: Text + target language selection (50+ languages)<br>Out: Translated text with copy action | **Placeholder** ("Coming soon / On the horizon") |
| 29 | `ask` | Ask Document AI | AI text tools | `MessageSquare` | `ai` / purple | `false` | In: Document/text + user question/prompt<br>Out: Interactive Q&A chat response with citations | **Placeholder** ("Coming soon / On the horizon") |
| 30 | `keywords` | Extract Keywords | AI text tools | `Tags` | `ai` / teal | `false` | In: Document / text content<br>Out: Ranked keywords, key phrases, frequency distribution | **Placeholder** ("Coming soon / On the horizon") |
| 31 | `sentiment` | Analyze Sentiment | AI text tools | `Sparkles` | `ai` / purple | `false` | In: Text (customer review, message, article)<br>Out: Sentiment classification, polarity score, tone breakdown | **Placeholder** ("Coming soon / On the horizon") |
| 32 | `compare` | Compare Texts | AI text tools | `ArrowLeftRight` | `ai` / blue | `false` | In: Original text (A) and revised text (B)<br>Out: Visual side-by-side diff (additions, deletions) | **Placeholder** ("Coming soon / On the horizon") |
| 33 | `email` | Generate an Email | AI text tools | `Mail` | `ai` / blue | `false` | In: Email purpose, recipient, key bullet points, tone<br>Out: Drafted subject line and email body | **Placeholder** ("Coming soon / On the horizon") |
| 34 | `documents` | My Documents | Workspace | `FileArchive` | None / blue | `false` | In: User session processed files list<br>Out: File management view, download/view/delete actions | **Placeholder** ("Coming soon / On the horizon") |
| 35 | `activity` | Activity Feed | Workspace | `Workflow` | None / teal | `true` | In: Real-time session events from completed tools<br>Out: Timeline feed of completed jobs with clear action | **Mounted & Functional** (inline in `App.tsx`) |
| 36 | `meetings` | Video Meetings | Workspace | `Video` | None / blue | `false` | In: Room title, participant name, mic/camera toggle<br>Out: In-browser interactive meeting room / simulated video canvas | **Placeholder** ("Coming soon / On the horizon") |
| 37 | `whiteboards` | Whiteboards | Workspace | `WandSparkles` | None / purple | `false` | In: Drawing tools (pen, shapes, text, sticky notes)<br>Out: Infinite canvas with export to PNG/PDF | **Placeholder** ("Coming soon / On the horizon") |

---

## 2. Logic Chain

1. **Premise 1**: The user requirement R1 specifies: *"Iterate through all 37 tools defined in the application one by one. For each tool, inspect its functionality, UI state, and user interactions to verify whether it works as intended."*
2. **Premise 2**: In `src/config.ts`, exactly 37 tools are configured. 31 of them have `available: false`.
3. **Premise 3**: In `src/App.tsx` (lines 838–839), only tools explicitly in `["qr", "merge-pdf", "text-pdf", "rotate-pdf"]` that have `selected.available === true` are mounted into `ToolPage`.
4. **Premise 4**: For `audio-text`, `AudioToText.tsx` is mounted, but because `apiBaseUrl` is undefined, `capabilities` is never populated, disabling the upload/transcription submission flow.
5. **Premise 5**: Requirement R3 explicitly states: *"For tools requiring external services or backend APIs (such as AI text tools, audio transcription, or document format conversions), implement client-side functionality or in-browser fallback/simulated processing so that every tool operates interactively within the web app."*
6. **Deduction**:
   - Currently, only 4 tools (`merge-pdf`, `rotate-pdf`, `text-pdf`, `qr`) and 1 workspace view (`activity`) are interactively usable.
   - `audio-text` requires a client-side fallback (e.g., using Web Speech API `webkitSpeechRecognition` / in-browser audio decoding / simulated smart transcript) to operate without external server dependencies.
   - 31 tools require active UI implementations and client-side processing engines (using `pdf-lib`, Canvas, client-side NLP / heuristics, or modular tool runners).
   - `src/App.tsx` routing must be updated to route each of the 37 tools to an active interactive UI instead of falling through to the placeholder branch.

---

## 3. Caveats

1. **Existing Test Assertions**: `tests/workspace.test.cjs` has smoke tests that assert specific text:
   - Line 129: `if (route === "audio-text") assert.match(html, /Backend not connected/)`
   - Line 122: `if (["sign-in", "sign-up", "reset-password"].includes(route)) assert.match(html, /Authentication not connected/)`
   Any changes to `AudioToText` or routes must preserve or satisfy these test expectations to prevent breaking `npm test`.
2. **External Backend APIs**: There is no live remote backend configured in `.env` (`VITE_API_BASE_URL` is empty). All tools must be completely functional client-side.
3. **Memory Limits for Client-side PDF & Image Processing**: Processing large files (>25 MB) inside the browser using `pdf-lib` and canvas operates within browser heap constraints.

---

## 4. Conclusion

- The application defines a clear, unified architecture with 37 distinct tools in `src/config.ts`.
- Currently, **4 of 37 tools** have functional client-side processing (`merge-pdf`, `rotate-pdf`, `text-pdf`, `qr`), and **1 workspace view** (`activity`) is active.
- **1 tool** (`audio-text`) has a mounted UI but is non-operational due to an external backend expectation.
- **31 tools** are completely unmounted and render a static "Coming Soon / On the horizon" card.
- To fulfill the project objectives sequentially (R1, R2, R3), each tool should be equipped with client-side interactive processing and mounted in the UI, tested one by one with verified inputs and downloadable outputs.

---

## 5. Verification Method

To independently verify these findings:

1. **Check Tool Count & Definitions**:
   Inspect `src/config.ts` (lines 98–533) to verify that `tools.length === 37`.
   Command:
   ```powershell
   node -e 'const { tools } = require("./tests/workspace.test.cjs"); console.log("Loaded tools count");'
   ```
   Or run the test suite:
   ```powershell
   npm test
   ```
   Note that test `catalog routes are unique and audio is a distinct backend-dependent category` verifies the tool count matches unique IDs.

2. **Verify Route Mounting in `App.tsx`**:
   Inspect lines 823–868 in `src/App.tsx`. Notice the condition:
   `["qr", "merge-pdf", "text-pdf", "rotate-pdf"].includes(page)` — any other tool ID falls to the "coming-soon" section.

3. **Verify Build Health**:
   ```powershell
   npm run build
   ```
   Expect exit code 0 and successful bundle output.
