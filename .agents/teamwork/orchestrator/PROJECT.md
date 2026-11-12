# Project: FluxKit Web Application — 37 Tools Sequential Verification & Interactive Implementation

## Architecture
FluxKit is a React 19 + Vite 8 + Tailwind CSS v4 single-page web application.
All 37 tools are configured in `src/config.ts` and managed through `src/App.tsx`.
To satisfy user requirements R1, R2, and R3:
- Every tool must be accessible and interactively usable in the browser.
- Every tool must operate 100% in-browser using client-side engines or robust client-side fallbacks/simulations without requiring external servers or remote backend APIs.
- Existing regression tests in `tests/*.test.cjs` (22 tests) must continue to pass without failure.
- New unit tests and route rendering tests must verify each tool systematically.

### Subsystem Boundaries
1. **Core Configuration & Router**: `src/config.ts`, `src/App.tsx`, `src/Overview.tsx`. Sets `available: true` and routes all 37 tool IDs to interactive pages.
2. **PDF Engine**: `src/services.ts` (using `pdf-lib` and HTML5 Canvas) for PDF creation, merging, splitting, compression, editing, rotation, signing, watermarking, password protection, and image conversion.
3. **Format Conversion & Archiving**: Document XML/ZIP generation, CSV/XLSX generation, Canvas rasterization, PK zip packaging.
4. **Client-Side AI & NLP Engine**: Tokenization, TF-IDF summarization, linguistic rewrite dictionaries, multilingual lexicon mapping, BM25 QA matching, keyword scoring, AFINN sentiment polarity, Myers text diff, and email templating.
5. **Audio & Collaboration Workspace**: Client-side Web Speech / audio analysis fallback for `audio-text`, in-browser session document store (`documents`), interactive meeting room simulator (`meetings`), and HTML5 canvas whiteboard (`whiteboards`).

---

## Feature Inventory
Every one of the 37 tools from `src/config.ts` is inventoried below with its assigned milestone:

| # | Tool ID | Name | Category | Milestone | Description | Source |
|---|---|---|---|---|---|---|
| 1 | `merge-pdf` | Merge PDF | File tools | M2 | Merge 2+ PDF files into one combined PDF | config.ts #1 |
| 2 | `split-pdf` | Split PDF | File tools | M2 | Split PDF by page ranges or extract individual pages | config.ts #2 |
| 3 | `compress` | Compress PDF | File tools | M2 | In-browser PDF stream and structure optimization | config.ts #3 |
| 4 | `pdf-to-word` | PDF to Word | File tools | M3 | Extract text/structure and generate editable .docx document | config.ts #4 |
| 5 | `pdf-to-ppt` | PDF to PowerPoint | File tools | M3 | Convert PDF pages into presentation slides (.pptx package) | config.ts #5 |
| 6 | `pdf-to-excel` | PDF to Excel | File tools | M3 | Extract tabular data into .xlsx workbook and .csv format | config.ts #6 |
| 7 | `word-to-pdf` | Word to PDF | File tools | M3 | Render DOCX/formatted text to formatted PDF document | config.ts #7 |
| 8 | `ppt-to-pdf` | PowerPoint to PDF | File tools | M3 | Convert presentation slides into landscape/standard PDF | config.ts #8 |
| 9 | `excel-to-pdf` | Excel to PDF | File tools | M3 | Render spreadsheet grid data to printable PDF table | config.ts #9 |
| 10 | `edit-pdf` | Edit PDF | File tools | M2 | Add text annotations, highlights, notes to PDF pages | config.ts #10 |
| 11 | `pdf-to-jpg` | PDF to JPG | File tools | M3 | Rasterize PDF pages into high-resolution JPG images | config.ts #11 |
| 12 | `jpg-to-pdf` | JPG to PDF | File tools | M3 | Convert images (JPG/PNG) into multi-page PDF document | config.ts #12 |
| 13 | `sign-pdf` | Sign PDF | File tools | M2 | Draw/upload digital signature and stamp onto PDF pages | config.ts #13 |
| 14 | `watermark` | Watermark | File tools | M2 | Add custom text/stamp watermark with opacity and rotation | config.ts #14 |
| 15 | `rotate-pdf` | Rotate PDF | File tools | M2 | Rotate PDF pages by 90°, 180°, or 270° increments | config.ts #15 |
| 16 | `text-pdf` | Text to PDF | File tools | M2 | Convert plain text and document title to formatted PDF | config.ts #16 |
| 17 | `qr` | QR Code Studio | QR tools | M1 | Generate custom QR codes for URLs, WiFi, VCard, Text | config.ts #17 |
| 18 | `audio-text` | Audio to Text | Audio tools | M6 | Client-side audio transcription with browser speech fallback | config.ts #18 |
| 19 | `ocr` | OCR Scanner | File tools | M4 | Client-side text recognition from scanned images/PDFs | config.ts #19 |
| 20 | `password` | PDF Security & Unlock | File tools | M2 | Set or unlock PDF encryption and permissions | config.ts #20 |
| 21 | `zip` | ZIP and Unzip | File tools | M4 | Pure client-side PK zip packaging and archive extraction | config.ts #21 |
| 22 | `convert` | Convert Formats | File tools | M4 | Universal format converter across documents and images | config.ts #22 |
| 23 | `convert-compress` | Convert & Compress | File tools | M4 | Two-in-one format conversion and size compression pipeline | config.ts #23 |
| 24 | `merge-compress` | Merge & Compress | File tools | M4 | Combined multi-PDF merge and compression pipeline | config.ts #24 |
| 25 | `split-compress` | Split & Compress | File tools | M4 | Combined PDF page split and compression pipeline | config.ts #25 |
| 26 | `summarize` | Summarize Document | AI text tools | M5 | In-browser NLP text and document summarizer | config.ts #26 |
| 27 | `rewrite` | Rewrite Content | AI text tools | M5 | In-browser tone-based text rewriter | config.ts #27 |
| 28 | `translate` | Translate Text | AI text tools | M5 | In-browser multilingual translation dictionary engine | config.ts #28 |
| 29 | `ask` | Ask Document AI | AI text tools | M5 | Client-side semantic search and QA over documents | config.ts #29 |
| 30 | `keywords` | Extract Keywords | AI text tools | M5 | TF-IDF and n-gram keyword & keyphrase extractor | config.ts #30 |
| 31 | `sentiment` | Analyze Sentiment | AI text tools | M5 | Valence lexicon sentiment analyzer with polarity & mood | config.ts #31 |
| 32 | `compare` | Compare Texts | AI text tools | M5 | Myers diff side-by-side text difference highlighter | config.ts #32 |
| 33 | `email` | Generate an Email | AI text tools | M5 | Purpose and tone-guided email composer and subject generator | config.ts #33 |
| 34 | `documents` | My Documents | Workspace | M6 | Local session document library with view, download, delete | config.ts #34 |
| 35 | `activity` | Activity Feed | Workspace | M1 | Session activity feed recording processed tool actions | config.ts #35 |
| 36 | `meetings` | Video Meetings | Workspace | M6 | In-browser meeting room with media preview & controls | config.ts #36 |
| 37 | `whiteboards` | Whiteboards | Workspace | M6 | Infinite drawing canvas with shapes, notes, and export | config.ts #37 |

Feature Inventory Verification: All 37 tools are assigned to exactly one milestone (M1 to M6). No unassigned features.

---

## Milestones

| # | Milestone Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Universal Router & Standalone Foundations | Router update in `App.tsx` and `config.ts` (`available: true`), ToolPage dispatch, verify `qr` and `activity` | none | DONE (37 tools available & mounted, 84 tests pass, build 0 errors) |
| M2 | PDF Core & Page Manipulation | `merge-pdf`, `rotate-pdf`, `text-pdf`, `split-pdf`, `compress`, `edit-pdf`, `watermark`, `sign-pdf`, `password` | M1 | DONE (9 PDF tools implemented, UI controls active, URL fix verified, 155 tests pass, build 0 errors) |
| M3 | Document & Format Conversions | `pdf-to-word`, `pdf-to-ppt`, `pdf-to-excel`, `word-to-pdf`, `ppt-to-pdf`, `excel-to-pdf`, `pdf-to-jpg`, `jpg-to-pdf` | M2 | DONE (8 conversion tools implemented, pure client-side OpenXML/PDF/image engines, 249 tests pass, build 0 errors) |
| M4 | Multi-Action Pipelines, OCR & Archiving | `zip`, `ocr`, `convert`, `convert-compress`, `merge-compress`, `split-compress` | M3 | DONE (6 tools implemented, pure client-side ZIP/OCR/pipeline engines, 349 tests pass, build 0 errors, Forensic Auditor CLEAN) |
| M5 | Client-Side AI Text Suite | `summarize`, `rewrite`, `translate`, `ask`, `keywords`, `sentiment`, `compare`, `email` | M1 | DONE (8 AI text tools implemented, pure client-side NLP engines, 495 tests pass, build 0 errors, Forensic Auditor CLEAN) |
| M6 | Audio Transcription & Collaboration Workspace | `audio-text` (with browser speech fallback), `documents`, `meetings`, `whiteboards` | M1 | DONE (4 workspace tools active, client-side speech/audio decoding, canvas studio, 555 tests pass, build 0 errors, Forensic Auditor CLEAN) |
| M7 | Final E2E Test Suite Pass & Adversarial Hardening | Pass 100% of E2E test suite (Tiers 1-4) and Tier 5 adversarial coverage hardening | M2, M3, M4, M5, M6 | PLANNED |

---

## Interface Contracts

### Router ↔ Tool Pages
- Route path: `#<tool-id>` (e.g. `#merge-pdf`, `#summarize`, `#audio-text`).
- Props passed to tool components:
  - `tool: Tool` (metadata from `src/config.ts`)
  - `onComplete: (name: string, description: string, fileData?: Blob) => void` (adds entry to session activity and document store)
  - `onNavigate: (route: string) => void`
- Component output: Rendered interactive form/canvas with action buttons, status indicator, and downloadable artifact.

### Service Layer ↔ UI Components
- Service functions are pure async functions or synchronous processors in `src/services.ts` or modular helper files in `src/utils/`.
- Function return type: `{ blob: Blob, filename: string }` or structured result object `{ text: string, ... }`.
- Error handling: Never throw unhandled exceptions to UI. All service functions return clean errors or reject with descriptive user-facing messages.

---

## Code Layout
- `src/config.ts`: Canonical tool definitions, categories, icon mappings, availability flags.
- `src/App.tsx`: Navigation, top-level routing, shell layout, activity tracking.
- `src/ToolPage.tsx`: Dynamic tool container for file/PDF/conversion tools.
- `src/AudioToText.tsx`: Audio transcription view with both remote API support and in-browser fallback engine.
- `src/services.ts`: Core processing functions (PDF manipulation, QR generation, conversion engines).
- `src/services/` or `src/utils/`: Modular helper utilities (AI NLP engines, zip utilities, format converters).
- `tests/*.test.cjs`: Automated Node test suites.
