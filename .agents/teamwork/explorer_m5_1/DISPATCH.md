# DISPATCH: Explorer M5-1 (Client-Side NLP Engine Architecture)

## Mission
Investigate and design pure client-side algorithms and architectures for the first 4 Milestone 5 AI text tools in the FluxKit web application:
1. Tool #26: `summarize` (Summarize Document)
2. Tool #27: `rewrite` (Rewrite Content)
3. Tool #28: `translate` (Translate Text)
4. Tool #29: `ask` (Ask Document AI)

## Authoritative Reference Documents
- Authoritative User Request: `c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\ORIGINAL_REQUEST.md`
- Global Project Scope: `c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\orchestrator\PROJECT.md`

## Specific Investigation Focus
1. **Tool #26 (`summarize`)**:
   - Pure client-side extractive summarization algorithm.
   - Tokenization, sentence splitting, stop-word filtering, term frequency calculation, and sentence scoring.
   - Configurable summary modes: sentence count (e.g. 3, 5, 10 sentences) and percentage length (e.g. 25%, 50%).
   - Support both direct text input and document uploads (.txt, .pdf using existing `extractPDFPages`).
2. **Tool #27 (`rewrite`)**:
   - Rule-based client-side linguistic rewriting engine.
   - Tone mapping profiles: Professional/Formal, Casual, Academic, Concise/Executive, Persuasive.
   - Vocabulary synonym mapping, contraction expansion/contraction, and sentence restructuring.
3. **Tool #28 (`translate`)**:
   - In-browser multilingual lexicon and phrase translation engine for major languages (English, Spanish, French, German, Italian, Portuguese, Chinese, Japanese).
   - Word and idiom mapping, punctuation preservation, and language detection heuristic.
4. **Tool #29 (`ask`)**:
   - In-browser semantic search and passage retrieval over document text.
   - BM25 or TF-IDF passage ranking, relevance scoring, and extractive answer generation with source passage citations.
5. **Code Architecture**:
   - Modular placement in `src/services.ts` or `src/utils/aiText.ts`.
   - Function signatures, return types, and zero external API dependencies (satisfying Requirement R3).

## Output
Write your comprehensive architectural report to `handoff.md` in `.agents/teamwork/explorer_m5_1/`. Notify parent orchestrator upon completion.


## 2026-11-10T22:14:40Z
You are Explorer M5-1 (NLP & Summarization Explorer M5).
Your working directory is: c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\explorer_m5_1
Read your dispatch instructions at: c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\explorer_m5_1\DISPATCH.md
Read the authoritative user request at: c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\ORIGINAL_REQUEST.md
Read the global project scope at: c:\Users\Enoch Essel\Downloads\Documents\Build FluxKit web application\.agents\teamwork\orchestrator\PROJECT.md

Investigate pure client-side algorithms and architecture for tools:
- `summarize` (Summarize Document)
- `rewrite` (Rewrite Content)
- `translate` (Translate Text)
- `ask` (Ask Document AI)

DO NOT write implementation code or modify source files.
Write your full blueprint and report to `handoff.md` in your working directory and notify me via send_message.
