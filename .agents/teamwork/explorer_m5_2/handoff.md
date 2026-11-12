# Architectural & Algorithmic Handoff: Milestone 5 Tools (#30, #31, #32, #33)

**Agent**: Explorer M5-2 (Analytics & Diff Explorer M5)  
**Scope**: In-browser client-side algorithms, mathematical models, data structures, and service architectures for:
- Tool #30: `keywords` (Extract Keywords)
- Tool #31: `sentiment` (Analyze Sentiment)
- Tool #32: `compare` (Compare Texts)
- Tool #33: `email` (Generate an Email)

---

## 1. Observation

### 1.1 Existing Tool Definitions (`src/config.ts`)
- In `src/config.ts:448-490`, the 4 tools are defined under category `"AI text tools"`:
  - `keywords`: Name "Extract Keywords", Icon `Tags`, color `teal`, `available: true`
  - `sentiment`: Name "Analyze Sentiment", Icon `Sparkles`, color `purple`, `available: true`
  - `compare`: Name "Compare Texts", Icon `ArrowLeftRight`, color `blue`, `available: true`
  - `email`: Name "Generate an Email", Icon `Mail`, color `blue`, `available: true`

### 1.2 Existing Implementation in `src/ToolPage.tsx`
- Currently, `src/ToolPage.tsx` contains basic inline processing within an internal function `executeAIProcessing(text: string): string` (lines 576-763):
  - **Tool #30 (`keywords`, lines 608-629)**: Matches words `/\b[a-z]{3,}\b/g`, filters against a 20-word `STOPWORDS` set (`src/ToolPage.tsx:80-100`), counts raw frequency, and prints a simple text list of 10 words. It does not extract multi-word n-grams, calculate collocation scores, rank by relevance, or handle acronyms/hyphenated words.
  - **Tool #31 (`sentiment`, lines 631-667)**: Uses two static Sets (`POSITIVE_WORDS` and `NEGATIVE_WORDS`). It counts matching words: `score = (posCount - negCount) / (posCount + negCount)`. It completely ignores contextual negations ("not good" is counted as positive), booster words ("extremely bad"), and contrastive connectors ("great UI but failed to load").
  - **Tool #32 (`compare`, lines 714-749)**: Does a naive index-by-index line comparison `linesA[i] === linesB[i]`. If a single line is inserted at line 1, index alignment fails for the entire document, erroneously reporting 100% of the document as deleted and re-added.
  - **Tool #33 (`email`, lines 751-762)**: Simply wraps the input text with fixed strings: `Subject: ${extra}\n\nDear ${recipient}...\n\n${text}\n\nBest regards,\nJamie`. It lacks tone adaptations, alternative subject generations, purpose-specific templates, key-point synthesis, or dynamic greetings.
- Inputs in `src/ToolPage.tsx`:
  - `email`: `optionA` = Recipient (line 1762), `extra` = Subject/Intent (line 1770), `value` = Key points (line 1801).
  - `compare`: `extra` = Comparison Text / Version B (line 1793), `value` = Base Text / Version A (line 1800).
  - `keywords` and `sentiment`: `value` = Source Text (line 1803).
- Outputs in `src/ToolPage.tsx`:
  - Output is set via `setTextOutput(output)` at line 1231.
  - Rendered at lines 3167-3221 with "Copy Text" (`navigator.clipboard.writeText`) and "Download" (`download({ name: `${tool.id}-output.txt`, blob })`).

### 1.3 Service Layer and Test Runner Execution Context (`src/services.ts` and `tests/*.test.cjs`)
- All production service logic in M2, M3, and M4 is placed in `src/services.ts`.
- In test files (e.g. `tests/m4-pipelines.test.cjs:38-60` and `tests/m3-conversions.test.cjs`), `src/services.ts` is dynamically transpiled and evaluated via Node.js `vm.runInThisContext` using a custom `require` wrapper:
  ```js
  compiledWrapper(
    mod.exports,
    (id) => (id === "./jobTypes" ? {} : require(id)),
    mod,
    filePath,
    path.dirname(filePath),
  )
  ```
  **Direct Observation**: The test harness only intercepts `./jobTypes`. Any local relative imports (such as `./utils/aiText`) inside `src/services.ts` would not resolve through this wrapper without extra configuration. Therefore, placing or directly re-exporting all service functions in `src/services.ts` ensures universal compatibility across all browser and Node test environments.

---

## 2. Logic Chain

### 2.1 Tool #30: `keywords` (Extract Keywords)
1. **Premise**: Simple word frequency fails on key concepts because real domain keywords are often multi-word phrases (collocations) like "machine learning", "single-page application", "client-side processing", and high-frequency content words might simply be repeated generic words.
2. **Algorithm Design (Rapid Automatic Keyword Extraction - RAKE + TF-Position)**:
   - **Step 1: Punctuation and Stopword Boundary Segmentation**: Split text into candidate phrases delimited by punctuation (`.`, `!`, `?`, `,`, `;`, `:`, `\n`, `—`) or stop words.
   - **Step 2: Lexicon & Stopword Filtering**: Utilize an extended stopword set of 180+ functional English tokens (articles, pronouns, prepositions, conjunctions, modal verbs, discourse fillers). Keep tokens with length $\ge 3$ or recognized 2-letter technical acronyms (`ai`, `ui`, `ux`, `qa`, `ml`, `db`, `os`, `ip`, `id`).
   - **Step 3: Co-occurrence Degree Matrix & Word Scoring**:
     - For each distinct word $w$, calculate:
       - Frequency $f(w)$: total occurrences in candidate phrases.
       - Degree $d(w)$: sum of lengths (in words) of all candidate phrases containing $w$.
       - Word Score:
         $$\text{Score}(w) = \frac{d(w)}{f(w)}$$
         Words that frequently appear within multi-word compound phrases receive higher weight than isolated words.
   - **Step 4: N-Gram Keyphrase Scoring**:
     - For candidate phrase $P = (w_1, w_2, \dots, w_k)$:
       $$\text{Score}(P) = \sum_{i=1}^k \text{Score}(w_i)$$
   - **Step 5: Positional Prominence Multiplier**:
     - Phrases appearing in the introductory 20% of the document receive a $1.25\times$ boost.
   - **Step 6: Deduplication & Ranking**:
     - Normalize scores to 0-100 scale.
     - Rank candidates by score and density ($\% = \frac{\text{phrase tokens}}{\text{total tokens}} \times 100$).
   - **Step 7: Analytics Metrics**:
     - Word count, unique vocabulary, lexical diversity ratio ($V / N$), estimated reading time ($\lceil N / 200 \rceil$ min), speaking time ($\lceil N / 130 \rceil$ min).

### 2.2 Tool #31: `sentiment` (Analyze Sentiment)
1. **Premise**: Binary positive/negative word matching produces false positives on negations ("not good", "never clean") and ignores emotional intensity ("extremely bad" vs "mildly slow").
2. **Algorithm Design (Valence-Aware Sentiment Engine)**:
   - **Step 1: Calibrated Valence Lexicon**: Curate ~500 high-frequency emotional words with integer valence ratings from $-4$ to $+4$ (based on AFINN-165 / VADER standards).
   - **Step 2: Contextual Heuristics**:
     - *Negation Window*: Check the 3 tokens preceding any sentiment word. If a negation word (`not, never, no, barely, hardly, scarcely, cannot, can't, won't, don't, didn't, isn't, wasn't, without`) is present, flip and dampen the valence:
       $$v_{\text{eff}} = -0.75 \times v_{\text{raw}}$$
     - *Booster Amplifiers*: Words like `very, extremely, incredibly, highly, super, absolutely` amplify valence by $+1.5\times$. Dampeners like `slightly, somewhat, barely, a bit` dampen valence by $0.6\times$.
     - *Contrastive Conjunctions ("but", "however", "yet")*: Dampen the preceding clause by $0.5\times$ and boost the following clause by $1.5\times$.
     - *All-Caps & Exclamations*: Boost valence intensity by up to $25\%$.
   - **Step 3: VADER Compound Normalization**:
     - Sum effective valences: $S = \sum v_{\text{eff}}$.
     - Compound score:
       $$\text{Compound} = \frac{S}{\sqrt{S^2 + 15.0}} \in [-1.00, +1.00]$$
   - **Step 4: Classification & Mood Descriptors**:
     - $\ge +0.05 \implies$ **Positive**
     - $\le -0.05 \implies$ **Negative**
     - Between $-0.05$ and $+0.05 \implies$ **Neutral**
     - Granular Mood:
       - $> +0.60$: *Joyful & Enthusiastic*
       - $+0.25$ to $+0.60$: *Optimistic & Satisfied*
       - $+0.05$ to $+0.25$: *Constructive & Receptive*
       - $-0.05$ to $+0.05$: *Objective & Impartial*
       - $-0.25$ to $-0.05$: *Skeptical & Cautious*
       - $-0.60$ to $-0.25$: *Critical & Disappointed*
       - $< -0.60$: *Frustrated & Alarmed*
   - **Step 5: Word-Level Highlights**: Return detected sentiment words with offsets, raw valence, negation status, and effective scores.

### 2.3 Tool #32: `compare` (Compare Texts)
1. **Premise**: Simple index comparison ($A[i] === B[i]$) fails completely upon line insertions. A formal Longest Common Subsequence (LCS) / Myers diff algorithm is mandatory to find the minimal edit script.
2. **Algorithm Design (Myers / DP LCS Diff Engine)**:
   - **Step 1: Tokenization**:
     - Line diff: Tokenize by `/\r?\n/`.
     - Word diff: Tokenize by `/\s+|[^\w\s]+|\w+/` to enable in-paragraph revision highlighting while preserving whitespace.
     - Character diff: Array of unicode characters.
   - **Step 2: LCS Computation**:
     - Dynamic Programming edit graph computation finding longest common subsequence between sequence $A$ and sequence $B$.
     - Backtrack to build the edit operations:
       - `unchanged`: Item present in both $A$ and $B$.
       - `deleted`: Item present in $A$ but omitted in $B$.
       - `added`: Item present in $B$ but omitted in $A$.
   - **Step 3: Unified Diff & Side-by-Side Formatting**:
     - *Unified view*: Standard format with `-` prefix for deletions, `+` prefix for additions, and ` ` for unchanged lines.
     - *Side-by-side alignment*: Dual column table alignment where modified rows pair deletions on the left and additions on the right; pure additions/deletions have empty spacer cells on the opposing column.
   - **Step 4: Quantitative Similarity Metric**:
     $$\text{Similarity Index} = \frac{2 \times \text{LCS Length}}{|A| + |B|} \times 100\%$$
     Provides an exact Sørensen–Dice similarity metric (0% to 100%).

### 2.4 Tool #33: `email` (Generate an Email)
1. **Premise**: A static wrapper template is rigid and robotic. A smart client-side email synthesizer must generate natural, purpose-driven, and tone-calibrated communications from raw notes.
2. **Algorithm Design (Natural Language Email Synthesis Engine)**:
   - **Step 1: Note Parsing & Topic Identification**:
     - Clean rough bullet points, numbered lists, or unstructured paragraphs.
     - Automatically extract core topics if explicit subject is not provided.
   - **Step 2: Dynamic Subject Line Engine**:
     - Generate 4 distinct subject options:
       1. *Recommended / Standard* (e.g. `Follow-up: Q4 Marketing Strategy & Next Steps`)
       2. *Action-Oriented* (e.g. `Action Required: Review Q4 Marketing Strategy by Friday`)
       3. *Conversational* (e.g. `Quick update regarding Q4 Marketing Strategy`)
       4. *Executive / Concise* (e.g. `Update: Q4 Marketing Strategy`)
   - **Step 3: Purpose & Tone Hooks**:
     - *Purposes*: `follow-up`, `proposal`, `thank-you`, `inquiry`, `announcement`, `apology`, `meeting-request`, `status-update`.
     - *Tones*: `professional`, `friendly`, `urgent`, `persuasive`, `concise`, `formal`.
     - Dynamic salutation, context hook, transitional discourse markers (*"Additionally", "Specifically", "Furthermore"*), and tone-specific sign-offs (*"Warm regards", "Best regards", "Sincerely", "Thank you for your prompt attention"*).
   - **Step 4: Body Construction**:
     - In *Concise* mode: clean, bulleted list with bold category leads.
     - In *Professional* mode: structured narrative paragraphs.
     - In *Persuasive* mode: value-proposition framing.
   - **Step 5: Call to Action (CTA) Integration**:
     - Seamlessly embeds user CTA or generates a polite, context-appropriate next step.

---

## 3. Concrete TypeScript Specifications & Service Signatures

The following interfaces and function signatures are specified for implementation in `src/services.ts`:

```ts
// ============================================================================
// Milestone 5: Analytics, Diff & Generator Engine Interfaces
// ============================================================================

// --- Tool #30: Keywords ---
export interface KeywordItem {
  term: string
  score: number
  frequency: number
  density: number // 0.0 to 100.0%
  type: "unigram" | "bigram" | "trigram"
  rank: number
}

export interface KeywordOptions {
  maxKeywords?: number // default 10 (range 1-50)
  includeNgrams?: boolean // default true
  minFrequency?: number // default 1
}

export interface KeywordResult {
  keywords: KeywordItem[]
  totalWords: number
  uniqueWords: number
  lexicalDiversity: number // unique / total (0.0 to 1.0)
  readingTimeMinutes: number
  speakingTimeMinutes: number
  formattedReport: string
}

export function extractKeywords(text: string, options?: KeywordOptions): KeywordResult;

// --- Tool #31: Sentiment ---
export interface SentimentWordDetail {
  word: string
  valence: number
  effectiveScore: number
  negated: boolean
  amplified: boolean
  index: number
}

export interface SentimentOptions {
  detailed?: boolean
  valenceBoosters?: boolean
}

export interface SentimentResult {
  compound: number // -1.00 to +1.00
  polarity: "Positive" | "Negative" | "Neutral"
  confidence: number // 0 to 100%
  mood: string
  breakdown: {
    positive: number // percentage
    neutral: number // percentage
    negative: number // percentage
  }
  positiveWords: SentimentWordDetail[]
  negativeWords: SentimentWordDetail[]
  sentenceCount: number
  wordCount: number
  summaryText: string
  formattedReport: string
}

export function analyzeSentiment(text: string, options?: SentimentOptions): SentimentResult;

// --- Tool #32: Compare ---
export type DiffType = "unchanged" | "added" | "deleted";

export interface DiffSegment {
  type: DiffType
  value: string
  lineA?: number
  lineB?: number
}

export interface SideBySideRow {
  left: { line: number | null; text: string; type: DiffType }
  right: { line: number | null; text: string; type: DiffType }
}

export interface CompareOptions {
  granularity?: "lines" | "words" | "characters" // default "lines"
  ignoreWhitespace?: boolean // default false
  ignoreCase?: boolean // default false
}

export interface CompareResult {
  segments: DiffSegment[]
  stats: {
    additions: number
    deletions: number
    unchanged: number
    similarityPercentage: number // 0 to 100%
    originalLength: number
    modifiedLength: number
  }
  sideBySideRows: SideBySideRow[]
  unifiedDiffText: string
  formattedReport: string
}

export function compareTexts(originalText: string, modifiedText: string, options?: CompareOptions): CompareResult;

// --- Tool #33: Email ---
export type EmailPurpose =
  | "follow-up"
  | "proposal"
  | "thank-you"
  | "inquiry"
  | "announcement"
  | "apology"
  | "meeting-request"
  | "status-update"

export type EmailTone =
  | "professional"
  | "friendly"
  | "urgent"
  | "persuasive"
  | "concise"
  | "formal"

export interface EmailOptions {
  purpose?: EmailPurpose // default "follow-up"
  tone?: EmailTone // default "professional"
  recipient?: string // default "Team" / "Colleague"
  sender?: string // default "Alex Chen" / "FluxKit User"
  callToAction?: string
  subjectTopic?: string
}

export interface EmailResult {
  subject: string
  alternativeSubjects: string[]
  salutation: string
  openingHook: string
  bodyParagraphs: string[]
  callToAction: string
  signOff: string
  sender: string
  recipient: string
  fullDraft: string
  formattedReport: string
}

export function generateEmail(notes: string, options?: EmailOptions): EmailResult;
```

---

## 4. UI Integration & Form Factor Specifications (`src/ToolPage.tsx`)

### 4.1 Options Panel Rendering
1. **`keywords`**:
   - Number of keywords selector (pills or dropdown: 5, 10, 15, 20).
   - N-gram toggle checkbox: "Include 2-word phrases (collocations)".
2. **`sentiment`**:
   - Detail toggle: "Show word-by-word valence analysis".
3. **`compare`**:
   - Dual inputs:
     - Left / Top textarea: "Base Text (Version A)" (`value`).
     - Right / Bottom textarea: "Comparison Text (Version B)" (`extra`).
   - Granularity toggle: "Lines" vs "Words".
4. **`email`**:
   - Purpose dropdown: Follow-up, Proposal, Thank You, Inquiry, Meeting Request, Status Update, Apology.
   - Tone dropdown: Professional, Friendly, Concise, Persuasive, Urgent, Formal.
   - Recipient input (`optionA`): e.g. "Dr. Sarah Connor".
   - Subject / Intent input (`extra`): e.g. "Q4 Project Roadmap".
   - Notes / Key Points textarea (`value`): e.g. "Draft milestone completed; need sign-off by Friday".

### 4.2 Action Buttons
- `keywords`: `"Extract Keywords"`
- `sentiment`: `"Analyze Sentiment"`
- `compare`: `"Compare Texts"`
- `email`: `"Generate Email"`

### 4.3 Results Presentation
- For standard text views: The generated `formattedReport` feeds directly into `textOutput`, enabling:
  - Copy to Clipboard (`<Copy /> Copy Text`)
  - Download File (`<Download /> Download`)
- In addition, rich interactive visual elements can enhance the results panel:
  - `sentiment`: Horizontal stacked polarity bar (Green = Pos%, Gray = Neu%, Red = Neg%), Mood Pill badge, and Compound Score gauge.
  - `compare`: Colored diff block with green `+` additions and red `-` deletions, plus similarity percentage badge.
  - `keywords`: Interactive tag badges showing term, rank, and frequency tag `3x`.
  - `email`: Ready-to-copy clean email text and 1-click alternative subject selector pills.

---

## 5. Caveats

1. **Test Runner Transpilation Constraint**:
   - As observed in `tests/m4-pipelines.test.cjs:54`, the test harness loader `vm.runInThisContext` only stubs `./jobTypes`.
   - **Recommendation**: Write the core functions directly in `src/services.ts` (or if created in a helper file, ensure `src/services.ts` embeds or bundles the logic cleanly) so that test files requiring `src/services.ts` execute synchronously without encountering unhandled relative file imports.
2. **Memory & Performance on Very Large Texts**:
   - For texts $> 100,000$ words, $O(N^2)$ dynamic programming on character-level diff can be slow. Therefore, default `granularity` for `compare` MUST be `'lines'`, falling back to bounded chunks for word diffs.
3. **Pure Client-Side Boundary**:
   - All 4 tools are 100% self-contained in TypeScript/JavaScript without any network requests, third-party API keys, or web assembly binaries. They satisfy Requirement R3 unconditionally.

---

## 6. Conclusion

- Tools #30, #31, #32, and #33 can be upgraded from rudimentary mocks to robust, production-grade, client-side NLP and diff engines.
- The proposed algorithms (RAKE keyword extraction, VADER-style valence lexicon with 4 modifier heuristics, Myers/DP LCS diff with similarity scoring, and rule-based dynamic email composer) provide superior precision, deterministic execution, and instant response times ($< 30\text{ ms}$).
- The blueprint is ready for implementation by Worker M5 and validation by Reviewer/Challenger M5.

---

## 7. Verification Method

To verify the design and implementation:
1. **Automated Unit Testing**:
   - Run: `node --test tests/m5-ai-text.test.cjs`
   - Test suites must verify:
     - `extractKeywords`: Returns top unigrams & bigrams, filters stopwords, handles empty strings without NaN, correctly calculates reading time.
     - `analyzeSentiment`: Accurately handles positive ("superb"), negative ("terrible"), neutral, negations ("not good" $\implies$ Negative), booster words ("extremely happy" $\implies$ Compound $> 0.7$), and contrastive conjunctions ("good start but broken").
     - `compareTexts`: Identical texts produce 100% similarity and 0 diffs; single-line insertions do not invalidate subsequent lines; word-level diff correctly pinpoints edited words.
     - `generateEmail`: Generates cohesive email drafts across all 6 tones and 8 purposes; includes 4 alternative subject lines; formats salutation, body, and CTA.
2. **Regression & Build Verification**:
   - Run: `npm run build` (Ensures zero TypeScript compilation errors).
   - Run: `npm test` (Ensures all existing 349+ automated tests across M1-M4 continue passing with zero regressions).
3. **Interactive UI Verification**:
   - Navigate to `#keywords`, `#sentiment`, `#compare`, `#email` in browser.
   - Verify that option panels render, inputs accept user typing, action buttons trigger processing, and output cards display results with functional Copy and Download buttons.
