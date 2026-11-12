# FluxKit Test Infrastructure Documentation

## 1. Overview
The FluxKit test infrastructure provides dependency-free, headless end-to-end (E2E) and integration verification for the entire web application. Built natively on Node.js's built-in test runner (`node:test`) and assertion library (`node:assert/strict`), the test suite validates all 37 tools, routing logic, client-side PDF/QR engines, workspace services, and user authentication without requiring external server dependencies or heavyweight headless browsers.

---

## 2. Test Execution & Runner Configuration

### 2.1 Invocation Command
The entire automated test suite is invoked via `package.json`:
```bash
npm test
# Equivalent to: node --test tests/*.test.cjs
```

### 2.2 Suite Layout
Tests are located in `tests/`:
1. `tests/e2e-tools.test.cjs`: Comprehensive 4-tier E2E test suite covering all 37 tools, boundary conditions, cross-tool pipelines, and real-world workflows (58 tests).
2. `tests/workspace.test.cjs`: Baseline smoke tests for catalog integrity, authentication contracts, and primary application routes (20 tests).
3. `tests/google-auth.test.cjs`: Unit and integration tests for Google OAuth authentication, session storage, and name derivation (2 tests).

**Total Test Count**: 80 tests across 3 test suites, executing in ~5.4 seconds.

---

## 3. Headless In-Memory Evaluation Architecture

The test harness uses a custom `createLoader` engine designed to evaluate React 19 and TypeScript modules headlessly:

1. **TypeScript Transpilation**:
   Modules (`.ts` and `.tsx`) in `src/` are transpiled on the fly using `ts.transpileModule` with CommonJS target, React JSX emission (`ts.JsxEmit.ReactJSX`), and `esModuleInterop: true`.

2. **Global Transpilation Cache**:
   `transpileCache` caches transpiled code strings across tests to eliminate redundant compilation, allowing all 37 tool route evaluations to run in ~1.5 seconds.

3. **Context Isolation & Sandbox Environment (`node:vm`)**:
   Each test evaluation runs inside a sandboxed `vm.runInNewContext` environment equipped with web runtime globals:
   - Modern Web Standards: `Blob`, `File`, `URL`, `FormData`, `Uint8Array`, `ArrayBuffer`.
   - Browser Storage: `localStorage` emulation backed by a localized key-value `Map`.
   - Navigation: `location` with dynamic hash routing (`#overview`, `#${tool.id}`, etc.).
   - DOM Emulation: Lightweight `document` and `window` event bus for `CustomEvent`, `addEventListener`, `removeEventListener`, and `dispatchEvent`.
   - Anchor Click Emulation: Simulated `<a>` tags with `href`, `download`, and `click()` to verify file export lifecycles.
   - Server Rendering: `react-dom/server` (`renderToStaticMarkup`) renders the fully instantiated `<App />` and `<ToolPage />` components to static HTML strings for opaque-box assertions.

---

## 4. Systematic 4-Tier Test Architecture

The E2E suite (`tests/e2e-tools.test.cjs`) is structured into four progressive tiers:

### Tier 1: Feature Coverage (All 37 Tools & Navigation Shell)
- **Catalog Integrity**: Asserts that `config.ts` exports exactly 37 tools across the 5 official categories (`File tools`, `QR tools`, `AI text tools`, `Audio tools`, `Workspace`), all IDs are unique, and every tool is marked `available: true`.
- **Per-Tool Route Rendering**: Systematically mounts every one of the 37 tools via `#${tool.id}` and asserts:
  - Output length exceeds 500 characters.
  - No 404 detour panels (`404 · A SMALL DETOUR` / `This page isn’t in the toolkit`).
  - No fallthrough to placeholder panels (`ON THE HORIZON` / `This feature is coming soon`).
  - Rendered DOM contains the exact tool name (with HTML entity escaping support).
  - Interactive controls (input panels, file dropzones, action buttons, or workspace views) are actively mounted.
- **Navigation Shell**: Validates top-level workspace views (`overview`, `all`, `files`, `qr-tools`, `ai`, `audio`, `documents`, `activity`, `settings`, `help`).

### Tier 2: Boundary & Corner Cases
- **QR Code Studio**:
  - Empty input rejection (`"Enter content for your QR code."`).
  - Scheme validation: enforces HTTP/HTTPS and rejects unsupported protocols (`ftp://`, `file:///`, `javascript:`).
  - WhatsApp phone number bounds: enforces 7–15 digits, rejects malformed numbers, and verifies URL-encoded query strings with special characters and emojis.
  - Wi-Fi WPA format: validates RFC-compliant escaping for `;`, `:`, `\`, and `"`.
  - Email format validation: validates regex pattern and mailto URL generation.
  - High-density stress: encodes 1,000-character URL payloads into valid high-density PNG QR matrices.
- **Text to PDF (`textToPDF`)**:
  - Untitled fallback: defaults empty title to `"Untitled document"`.
  - Pagination boundary: verifies 120 paragraphs trigger page breaks when `y < 55`, generating multi-page PDFs.
  - Word chunking: tokenizes long unbroken strings (>65 chars) into safe chunk lengths.
  - Special characters: verifies quotes, ampersands, brackets, and accented characters preserve PDF syntax.
- **Rotate PDF (`rotatePDF`)**:
  - Modular rotation arithmetic: validates 90°, 180°, 270°, and full 360° rotation (modulo wrapping to 0°).
  - Multi-page rotation: asserts that every page in a multi-page document receives the rotation transform.
- **Merge PDF (`mergePDFs`)**:
  - Multi-file merge: validates that combining multiple documents produces a document with page count equal to the exact sum of the inputs.
- **File Dropzone & Upload Filter**:
  - Validates rejection of non-PDF file extensions (`.docx`, `.png`, `.xlsx`).
  - Validates rejection of files exceeding the 25 MB limit.
  - Validates acceptance of valid PDF files and mixed upload batch handling.

### Tier 3: Cross-Feature Combinations
- **PDF Lifecycle Pipeline**: Executes an end-to-end multi-step document workflow:
  `textToPDF` (Document A) -> `rotatePDF` (90° clockwise) -> `textToPDF` (Document B) -> `mergePDFs` (Rotated A + Standard B) -> validates with `PDFDocument.load()` that Page 0 has rotation 90° and Page 1 has rotation 0°.
- **QR Studio -> Download Lifecycle**: Generates QR code, decodes base64 payload, verifies standard PNG magic bytes (`0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A`), and verifies anchor creation and click dispatch via `download()`.
- **Workspace Activity Stream**: Emulates multiple sequential tool executions and verifies the activity log renders them in reverse-chronological order with timestamps and `"Completed"` badges.

### Tier 4: Real-World Application Scenarios
- **Scenario 1: Conference Asset Publishing**: Full simulation of an event coordinator creating an agenda, landscape floor plan, merged attendee booklet, Wi-Fi badge QR, and feedback QR.
- **Scenario 2: Authenticated Session Continuity**: Google OAuth sign-in flow (`signInWithGoogle`), local storage persistence, display name derivation (`formatNameFromEmail`), and clean sign-out transition.
- **Scenario 3: Complete Navigation Loop & 404 Resilient Routing**: Sequentially traverses 12 valid routes followed by an unrecognized route (`non-existent-tool-xyz`), verifying that only the unknown route renders the 404 detour.
- **Scenario 4: Error Recovery & Form Self-Healing**: Validates interactive error feedback: empty input -> error -> invalid input -> error -> valid input -> success and error clearing.

---

## 5. Verification & Test Commands

| Command | Purpose | Expected Output |
|---|---|---|
| `npm test` | Runs all 80 automated unit, integration, and E2E tests | 80 passed, 0 failed (~5.4s) |
| `npm run build` | Compiles application bundle with Vite | Successful build with 0 TypeScript/bundling errors (~650ms) |
| `node --test tests/e2e-tools.test.cjs` | Runs the 58 E2E tool tests exclusively | 58 passed, 0 failed (~1.7s) |

---

## 6. Maintenance & Extensibility Guidelines
- When adding new client-side tools to `src/config.ts`, include `available: true` and configure their interactive route in `src/App.tsx`.
- All tests in `tests/e2e-tools.test.cjs` dynamically read `config.tools`, automatically including any newly registered tools in Tier 1 route rendering and catalog integrity checks.
