# BRIEFING — 2026-11-10T22:20:00Z

## Mission
Investigate and design pure client-side algorithms and architecture for tools: summarize, rewrite, translate, and ask.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigator, architect, synthesizer
- Working directory: c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\explorer_m5_1
- Original parent: ad378d05-93af-44c8-ae5d-36eca3e4e3dc
- Milestone: M5 (Client-Side AI Text Suite - Part 1)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement
- Do NOT modify source files or project files outside working directory
- Write full blueprint and report to handoff.md in working directory
- Notify orchestrator parent via send_message

## Current Parent
- Conversation ID: ad378d05-93af-44c8-ae5d-36eca3e4e3dc
- Updated: 2026-11-10T22:20:00Z

## Investigation State
- **Explored paths**:
  - `src/config.ts`: Tool declarations for tools #26 (`summarize`), #27 (`rewrite`), #28 (`translate`), #29 (`ask`).
  - `src/ToolPage.tsx`: Existing naive stubs in `executeAIProcessing` and UI input controls.
  - `src/services.ts`: Existing architecture, PDF text extractor `extractPDFPages`, and dependency loading model.
  - `tests/*.test.cjs`: Test suite execution model (transpilation via `ts.transpileModule` in vm context with restricted requires).
  - Production build: `npm run build` verifies Vite 8 compilation in ~1.07s; `npm test` runs 357 passing tests.
- **Key findings**:
  1. `tests/*.test.cjs` loads `src/services.ts` directly in a custom Node `vm` context where `require` does NOT resolve arbitrary `.ts` sub-files unless exported from `services.ts`. Co-locating or exporting all NLP functions through `services.ts` avoids test runner breakage.
  2. `summarize`: Currently uses crude word-frequency sentence ranking without position weighting, length normalization, MMR deduplication, or chronological sentence re-sorting. Needs configurable sentence count and percentage modes, format styles (bullets, narrative, executive), and document upload (.txt/.pdf via `extractPDFPages`).
  3. `rewrite`: Currently has 8 replacements for "Professional" and 4 for "Concise". Casual, Academic, and Persuasive are completely missing. Needs multi-tier architecture: contractions expansion/collapse, multi-word phrase substitution, vocabulary transformation by tone, and case preservation.
  4. `translate`: Currently only supports 4 languages with 20 words each. Needs expansion to 8 languages (EN, ES, FR, DE, IT, PT, ZH, JA), 40+ multi-word phrases/idioms, 150+ vocabulary words per language, language detection heuristic, casing preservation, and reverse/pivot translation.
  5. `ask`: Currently only does single-word sentence match. Needs BM25 probabilistic passage ranking, question type classification (temporal, quantitative, entity, locative, causal, definitional), extractive primary answer pinpointing, surrounding context citation, and confidence scoring.
- **Unexplored areas**: None. Full architecture and verification plan mapped.

## Key Decisions Made
- Architecture decision: Place core NLP engine functions and types directly in `src/services.ts` (or importable through it without unhandled module resolution) to ensure complete compatibility with test harnesses and Vite bundler.
- Algorithmic decision: Use TF-ISF with position and factual weighting for `summarize`; BM25 with intent classification for `ask`; multi-word prioritized rule transformation with contraction handling for `rewrite`; and multi-word phrase matching + 150-word lexicons with script/stopword detection for `translate`.

## Artifact Index
- DISPATCH.md — Dispatch instructions and prompt history
- BRIEFING.md — Persistent working memory
- progress.md — Heartbeat and activity log
- handoff.md — Final 5-component handoff report
