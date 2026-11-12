# DISPATCH: Worker M5 (Client-Side AI Text Suite Implementation)

## Objective
Implement authentic client-side AI & NLP engines, interactive UI option panels, and comprehensive automated test coverage for all 8 Milestone 5 tools:
1. Tool #26: `summarize` (Summarize Document)
2. Tool #27: `rewrite` (Rewrite Content)
3. Tool #28: `translate` (Translate Text)
4. Tool #29: `ask` (Ask Document AI)
5. Tool #30: `keywords` (Extract Keywords)
6. Tool #31: `sentiment` (Analyze Sentiment)
7. Tool #32: `compare` (Compare Texts)
8. Tool #33: `email` (Generate an Email)

## Authoritative Reference Documents
- Authoritative User Request: `c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\ORIGINAL_REQUEST.md`
- Global Project Scope: `c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\orchestrator\PROJECT.md`
- Explorer Blueprints:
  1. `c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\explorer_m5_1\handoff.md` (NLP Engines: Summarize, Rewrite, Translate, Ask)
  2. `c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\explorer_m5_2\handoff.md` (Analytics & Diff: Keywords, Sentiment, Compare, Email)
  3. `c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\explorer_m5_3\handoff.md` (UI Integration in ToolPage.tsx & Tests in tests/m5-ai-text.test.cjs)

## Exclusive Write Boundaries
- `src/services.ts`
- `src/ToolPage.tsx`
- `tests/m5-ai-text.test.cjs`

Do NOT touch files owned by other modules without reason. Preserve all existing M1, M2, M3, and M4 services and tests.
**Critical Architecture Requirement**: All service functions for M5 must be implemented in or directly re-exported from `src/services.ts` to ensure compatibility with Node VM test transpilation.

## Implementation Tasks
1. **Service Layer in `src/services.ts`**:
   - `summarizeText(text, options)`: TF-ISF extractive sentence scoring with length controls and bullet/paragraph format.
   - `rewriteText(text, options)`: Multi-tier rule-based rewriting across 5 tones (Professional, Casual, Academic, Concise, Persuasive) with contraction handling and vocabulary substitution.
   - `translateText(text, options)`: Multilingual phrase & lexicon mapping across 8 languages (EN, ES, FR, DE, IT, PT, ZH, JA) with auto-detection.
   - `askDocumentAI(text, question, options)`: Okapi BM25 semantic passage retrieval with intent classification, confidence scores, and citation quotes.
   - `extractKeywords(text, options)`: RAKE + TF-position algorithm with unigrams, bigram collocations, stopword removal, and reading/speaking metrics.
   - `analyzeSentiment(text, options)`: Valence lexicon engine (~500 lemmas) with negation flipping, amplifiers, compound score (-1.0 to +1.0), and 7 mood descriptors.
   - `compareTexts(originalText, modifiedText, options)`: Longest Common Subsequence (LCS) / Myers diff on lines, words, characters with Sørensen-Dice similarity.
   - `generateEmail(promptOrOptions, options)`: Structured email synthesis with 8 purposes, 6 tones, alternative subject lines, and body generation.
2. **UI Integration in `src/ToolPage.tsx`**:
   - Dual-input architecture: support direct typing/pasting AND document uploads (.txt/.pdf via existing `extractPDFPages`).
   - Dedicated interactive option panels for each of the 8 tools.
   - Rich result cards: polarity gauge, side-by-side diff viewer, tag cloud, citation quote box, styled email preview.
   - Contextual action button verbs (`"Summarize Document"`, `"Rewrite Content"`, `"Translate Text"`, `"Ask Document AI"`, `"Extract Keywords"`, `"Analyze Sentiment"`, `"Compare Texts"`, `"Generate Email"`).
   - Error boundaries and non-blocking state handling.
3. **Automated Test Suite in `tests/m5-ai-text.test.cjs`**:
   - Author comprehensive test suite covering all 8 tools across deterministic inputs, edge cases (empty strings, single words, unicode, 5000+ words stress), and React route mounting assertions.
4. **Verification**:
   - Run `npx oxfmt --check src/services.ts src/ToolPage.tsx`
   - Run `npm run build` (must pass with 0 errors)
   - Run `node --test tests/m5-ai-text.test.cjs` (all M5 tests must pass)
   - Run `npm test` (all 349 existing tests + M5 tests must pass with 0 regressions)
5. **Handoff Report**:
   - Write full handoff report in `.agents/teamwork/worker_m5_1/handoff.md` with verbatim logs and signed authenticity attestation.
   - Update `.agents/teamwork/worker_m5_1/progress.md`.
   - Message parent upon completion.

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## 2026-11-10T22:36:56Z
**Context**: Safety check at T+11m
**Content**: Checking in on implementation progress for Milestone 5 (8 AI Text Tools).
**Action**: Please update your \`progress.md\` with your current status and continue with your service/UI implementation and tests.
