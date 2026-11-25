/**
 * MasterfilePro Humanizer engine.
 *
 * Deterministic, offline, rule-based editing built on one structural promise:
 * facts cannot be edited. Numbers, dates, money, units, names, acronyms, quotes,
 * addresses and web addresses are frozen as protected spans before a single
 * word is considered, and the rebuild path only ever rewrites material that
 * sits between those frozen spans. After the work it re-checks itself.
 *
 * Every change carries a plain-English reason and a confidence. Changes that
 * could shift meaning (deletions, hedges, passive-to-active, sentence joins)
 * are surfaced as flagged suggestions and are never applied by default.
 *
 * No network, no randomness, no timers, no storage, no browser globals.
 */

export type EditKind =
  | "filler"
  | "word-choice"
  | "transition"
  | "tone"
  | "voice"
  | "rhythm"
  | "punctuation"
  | "repetition"

export type Confidence = "high" | "medium" | "low"

export type HumanizerGoal = "natural" | "plainer" | "warmer" | "tighter" | "formal-lite"

export type HumanizerIntensity = "light" | "standard" | "full"

export type EditOp = "replace" | "split" | "merge"

export interface HumanizerOptions {
  goal?: HumanizerGoal
  intensity?: HumanizerIntensity
  /** A sample of the writer's own prose, used only to aim the rhythm. */
  voiceSample?: string
}

export interface Edit {
  id: string
  kind: EditKind
  confidence: Confidence
  /** Low-confidence edits wait in the review list instead of entering the draft. */
  autoApply: boolean
  reason: string
  /** Present when the edit needs the writer's judgement. */
  risk?: string
  op: EditOp
  unitId: number
  /** Word positions in the unit, used for grouping and display. */
  from: number
  to: number
  /** Absolute char range in the source that this edit consumes. */
  startOffset: number
  endOffset: number
  /** Rhythm edits also change the case of the following word. */
  caseNext?: "raise" | "lower"
  words: string[]
  before: string
  after: string
}

export interface Fidelity {
  protectedSpans: number
  protectedSpansIntact: boolean
  numbersPreserved: boolean
  namesPreserved: boolean
  wordsBefore: number
  wordsAfter: number
  sentencesBefore: number
  sentencesAfter: number
  meanLengthBefore: number
  meanLengthAfter: number
  spreadBefore: number
  spreadAfter: number
  readabilityBefore: number
  readabilityAfter: number
  stockPhrasesBefore: number
  stockPhrasesAfter: number
  hedgesBefore: number
  hedgesAfter: number
  voiceDriftBefore: number
  voiceDriftAfter: number
  voiceReference: "sample" | "this text"
}

export interface HumanizerRun {
  source: string
  goal: HumanizerGoal
  intensity: HumanizerIntensity
  edits: Edit[]
  notes: string[]
  fidelity: Fidelity
  truncated: boolean
  languageOk: boolean
  /** The default draft: every auto-apply edit, and nothing the writer must check. */
  text: string
}

export interface Decisions {
  off: string[]
  on: string[]
}

export type SegmentState = "applied" | "reverted" | "suggested" | "declined"

export interface Segment {
  text: string
  editId?: string
  kind?: EditKind
  confidence?: Confidence
  state?: SegmentState
}

interface Tok {
  start: number
  end: number
  raw: string
  lower: string
  word: boolean
  frozen: boolean
}

interface Unit {
  id: number
  start: number
  end: number
  text: string
  toks: Tok[]
  /** Indexes into toks for word tokens only. */
  words: number[]
  paragraphEnd: boolean
}

interface VoiceProfile {
  sentences: number
  words: number
  meanLength: number
  spread: number
  longSentences: number
  longestUniformRun: number
}

export const HUMANIZER_LIMITS = {
  maxChars: 50000,
  maxEditsPerUnit: 6,
  maxEdits: 800,
  longSentence: { light: 46, standard: 36, full: 32 } as Record<HumanizerIntensity, number>,
}

const NO_DECISIONS: Decisions = { off: [], on: [] }

// ---------------------------------------------------------------------------
// Protected spans: the facts the engine may not touch
// ---------------------------------------------------------------------------

const SPAN_PATTERNS: RegExp[] = [
  /https?:\/\/[^\s<>"']+/gi,
  /www\.[^\s<>"']+/gi,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  /(?:[A-Za-z0-9_-]+\/){1,}[A-Za-z0-9._-]+/g,
  /\b[A-Za-z0-9_ -]+\.(?:pdf|docx?|xlsx?|pptx?|csv|tsv|json|xml|txt|md|zip|png|jpe?g|webp|avif|heic|gif|svg|mp3|wav|m4a|mov|mp4)\b/gi,
  /\b[a-z0-9][a-z0-9-]*\.(?:com|org|net|io|dev|co|edu|gov|ai|uk|de|fr|es|ng|gh|ca|au|jp)\b/gi,
  /`[^`]+`/g,
  /\{\{[^{}]{1,80}\}\}|\{\d{1,3}\}|%[sd]\b/g,
  /<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]{0,160})?\/?>/g,
  /"[^"\n]{1,400}"/g,
  /“[^”\n]{1,400}”/g,
  /«[^»\n]{1,200}»/g,
  /'[^'\n]{1,60}'|‘[^’\n]{1,60}’/g,
  // money, percent, measures, ratios, scaled quantities
  /(?:US|GB|EU|NG|GH)?[$€£¥₹]\s?-?\d[\d,\s]*(?:\.\d+)?(?:\s?(?:million|billion|trillion|k|m|bn))?\b/gi,
  /\b-?\d[\d,]*(?:\.\d+)?\s?%/g,
  /\b-?\d[\d,]*(?:\.\d+)?\s?(?:percent|per\s?cent)\b/gi,
  /\b\d[\d,]*(?:\.\d+)?\s?(?:mm|cm|km|kg|mg|ml|lit(?:er|re)s?|sq\s?ft|ft|mps|mph|kw|kwh|gb|tb|mb|hz|rpm|ppi|dpi|°[cf])\b/gi,
  /\b\d[\d,]*(?:\.\d+)?\s?(?:million|billion|thousand|tonnes?|pounds?|euros?|dollars?|days?|weeks?|months?|years?|hours?|minutes?)\b/gi,
  /\b\d+(?:\.\d+)?\s?[x×:]\s?\d+(?:\.\d+)?\b/g,
  // dates, times, fiscal markers
  /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s?\d{0,2}(?:st|nd|rd|th)?(?:,?\s?\d{2,4})?\b/gi,
  /\b\d{1,2}(?:st|nd|rd|th)?\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:,?\s?\d{2,4})?\b/gi,
  /\b\d{4}-\d{2}-\d{2}\b|\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g,
  /\b(?:q[1-4]|h[12])\s?\d{4}\b|\bq[1-4]\b/gi,
  /\b\d{1,2}(?::\d{2})?\s?(?:am|pm)\b/gi,
  /\b(?:circa|ca\.?)\s?\d{3,4}\b/gi,
  /\b(?:mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\b/gi,
  // identifiers, phones, versions, hashes
  /\b\d[\d\s-]{6,20}\d\b/g,
  /\b[A-Z]{2,4}-\d{2,10}\b/g,
  /\b[a-z]?\d+(?:\.\d+)+\b/g,
  /\b[0-9a-f]{8}-[0-9a-f-]{27}\b/gi,
  /\b[A-Z][A-Za-z]*[A-Z][A-Za-z]*\d*\b/g,
  /\b[A-Z]{2,}s?\b/g,
  /\b(?:[A-Z]\.){2,}/g,
  // headings, list markers, symbols
  /^[ \t]*#{1,6}\s/gm,
  /^[ \t]*(?:[-*•]\s+|\d+[.)]\s+)/gm,
  /[™®°±×÷→←↑↓✓✔✗§¶†‡]/g,
  /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,
]

const COMMON_CAPITALS = new Set([
  "the", "this", "that", "these", "those", "a", "an", "our", "your", "his", "her", "its",
  "their", "i", "we", "you", "he", "she", "it", "they", "if", "when", "while", "because",
  "although", "however", "but", "and", "or", "so", "yet", "then", "there", "here", "what",
  "which", "who", "how", "why", "where", "all", "any", "each", "every", "both", "few",
  "more", "most", "other", "such", "some", "no", "nor", "not", "only", "own", "same",
  "too", "very", "can", "will", "just", "should", "now", "after", "before", "during",
  "with", "without", "for", "from", "by", "about", "into", "over", "under", "again",
  "once", "also", "beyond", "up", "down", "out", "off", "through", "between", "thanks",
  "yes", "note", "remember", "finally", "first", "second", "third", "next", "overall",
  "in", "on", "at", "as", "please", "good", "new", "summary", "meanwhile", "separately",
  "specifically", "additionally", "furthermore", "moreover", "therefore", "consequently",
])

function freezeSpans(text: string): boolean[] {
  const frozen = new Array<boolean>(text.length).fill(false)
  for (const pattern of SPAN_PATTERNS) {
    const re = new RegExp(pattern.source, pattern.flags)
    let match: RegExpExecArray | null
    while ((match = re.exec(text)) !== null) {
      if (!match[0]) {
        re.lastIndex += 1
        continue
      }
      for (let i = match.index; i < match.index + match[0].length; i += 1) frozen[i] = true
    }
  }
  return frozen
}

function extractSpans(text: string): string[] {
  const frozen = freezeSpans(text)
  const spans: string[] = []
  let current = ""
  for (let i = 0; i < text.length; i += 1) {
    if (frozen[i]) current += text[i]
    else if (current) {
      if (current.trim().length > 1 && /[\p{L}\p{N}]/u.test(current)) spans.push(current.trim())
      current = ""
    }
  }
  if (current.trim().length > 1 && /[\p{L}\p{N}]/u.test(current)) spans.push(current.trim())
  return spans
}

// ---------------------------------------------------------------------------
// Lexing and sentence units
// ---------------------------------------------------------------------------

const LEXER = /(\s+)|([^\s]+)/gu
const LEAD = /^[^\p{L}\p{N}]*/u
const TRAIL = /[^\p{L}\p{N}$€£¥₹%]+$/u

/**
 * Turns a unit into tokens that concatenate back to the unit text exactly. A
 * word carries no punctuation of its own: "  “Report,"  becomes lead + word +
 * trail, so a replacement can never quietly delete one of the writer's marks.
 */
function lexUnit(text: string, frozen: boolean[], offset: number): Tok[] {
  const toks: Tok[] = []
  const push = (start: number, end: number, word: boolean, frozenToken: boolean) => {
    const raw = text.slice(start - offset, end - offset)
    toks.push({
      start,
      end,
      raw,
      lower: raw.toLowerCase(),
      word,
      frozen: frozenToken,
    })
  }
  LEXER.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = LEXER.exec(text)) !== null) {
    const raw = match[0]
    const chunkStart = offset + match.index
    const chunkEnd = chunkStart + raw.length
    if (match[1]) {
      push(chunkStart, chunkEnd, false, false)
      continue
    }
    const lead = raw.match(LEAD)![0].length
    const body = raw.slice(lead)
    const trailMatch = body.match(TRAIL)
    const trail = trailMatch ? trailMatch[0].length : 0
    const core = body.slice(0, body.length - trail)
    const coreStart = chunkStart + lead
    const coreEnd = coreStart + core.length
    if (lead > 0) push(chunkStart, coreStart, false, isFrozen(frozen, chunkStart, coreStart))
    if (core.length > 0) {
      const isWord = /[\p{L}\p{N}]/u.test(core)
      push(coreStart, coreEnd, isWord, !isWord || isFrozen(frozen, coreStart, coreEnd))
    }
    if (trail > 0) push(coreEnd, chunkEnd, false, isFrozen(frozen, coreEnd, chunkEnd))
  }
  return toks
}

function isFrozen(frozen: boolean[], start: number, end: number): boolean {
  for (let i = start; i < end; i += 1) if (frozen[i]) return true
  return false
}

const ABBREVIATIONS = new Set([
  "mr", "mrs", "ms", "dr", "prof", "st", "jr", "sr", "vs", "etc", "eg", "ie", "no", "approx",
  "dept", "est", "fig", "inc", "ltd", "co", "corp", "ave", "blvd", "rd", "mt", "govt", "vol",
  "pp", "ch", "sec", "para", "art", "ref", "tel", "sq", "mi", "hr", "jan", "feb", "mar",
  "apr", "jun", "jul", "aug", "sep", "sept", "oct", "nov", "dec", "vs", "al",
])

function isAbbreviation(text: string, index: number): boolean {
  const before = text.slice(Math.max(0, index - 16), index)
  const match = before.match(/([A-Za-z]+)\.?$/)
  if (!match) return false
  const word = match[1].toLowerCase()
  return ABBREVIATIONS.has(word) || word.length === 1
}

/** Splits text into sentence/line units without cutting inside a protected span. */
function splitUnits(text: string, frozen: boolean[]): Array<{ start: number; end: number; paragraphEnd: boolean }> {
  const units: Array<{ start: number; end: number; paragraphEnd: boolean }> = []
  let start = 0
  const push = (end: number, paragraphEnd: boolean) => {
    if (text.slice(start, end).trim().length > 0) units.push({ start, end, paragraphEnd })
    start = end
  }
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === "\n") {
      let j = i
      while (j < text.length && text[j] === "\n") j += 1
      const paragraphEnd = j - i > 1
      push(i, paragraphEnd)
      start = j
      i = j - 1
      continue
    }
    if (char !== "." && char !== "!" && char !== "?") continue
    if (frozen[i] || isAbbreviation(text, i)) continue
    let k = i + 1
    while (k < text.length && /[\])”’"]/.test(text[k])) k += 1
    let space = k
    while (space < text.length && text[space] === " ") space += 1
    const next = text[space]
    const boundary =
      space < text.length &&
      next !== undefined &&
      (next === next.toUpperCase() || "([\"“#-•".includes(next) || /\d/.test(next))
    if (space >= text.length) {
      push(i + 1, false)
      break
    }
    if (boundary) {
      i = k - 1
      push(i + 1, false)
    }
  }
  if (start < text.length) push(text.length, false)
  return units
}

function buildUnits(text: string, frozen: boolean[]): Unit[] {
  const units = splitUnits(text, frozen).map((boundary, index) => {
    const slice = text.slice(boundary.start, boundary.end)
    const toks = lexUnit(slice, frozen, boundary.start)
    return {
      id: index,
      start: boundary.start,
      end: boundary.end,
      text: slice,
      toks,
      words: toks.map((token, position) => (token.word ? position : -1)).filter((position) => position >= 0),
      paragraphEnd: boundary.paragraphEnd,
    } satisfies Unit
  })
  for (const unit of units) {
    let seenWord = false
    for (const token of unit.toks) {
      if (!token.word) continue
      const core = token.lower.replace(/[^a-z]/g, "")
      const possessive = /['’][a-z]$/.test(token.raw)
      if (
        seenWord &&
        /^[A-Z]/.test(token.raw) &&
        core.length > 1 &&
        !COMMON_CAPITALS.has(core) &&
        !token.frozen
      ) {
        token.frozen = true
      }
      if (possessive && token.frozen === false && seenWord && !COMMON_CAPITALS.has(core)) token.frozen = true
      seenWord = true
    }
  }
  return units
}

function unitText(unit: Unit): string {
  return unit.text.trim()
}

function isCapitalized(raw: string): boolean {
  return /^[^A-Za-z$€£¥₹]*[A-Z]/.test(raw)
}

function raise(word: string): string {
  return word.length ? word.charAt(0).toUpperCase() + word.slice(1) : word
}

function lower(word: string): string {
  return word.length ? word.charAt(0).toLowerCase() + word.slice(1) : word
}

// ---------------------------------------------------------------------------
// Word knowledge
// ---------------------------------------------------------------------------

const FUNCTION_WORDS = new Set([
  "the", "be", "to", "of", "and", "in", "that", "have", "it", "for", "not", "on", "with",
  "as", "you", "do", "this", "but", "by", "from", "they", "we", "her", "she", "or", "an",
  "will", "my", "one", "all", "would", "there", "their", "what", "so", "up", "out", "if",
  "about", "who", "which", "is", "are", "was", "were", "been", "has", "had", "did", "can",
  "could", "should", "any", "also", "into", "than", "then", "them", "these", "those", "over",
  "after", "because", "how", "when", "while", "our", "his", "its", "more", "most", "other",
])

/** Words that set how strong, big or certain a claim is. Never edited silently. */
const CERTAINTY_WORDS = new Set([
  "may", "might", "could", "must", "should", "shall", "would", "will", "cannot", "can",
  "likely", "unlikely", "possibly", "probably", "approximately", "roughly", "nearly",
  "almost", "only", "ever", "never", "always", "often", "sometimes", "rarely", "generally",
  "usually", "some", "several", "many", "few", "most", "all", "any", "each", "every", "both",
  "either", "neither", "half", "partly", "mainly", "largely", "entirely", "fully", "somewhat",
  "slightly", "moderately", "assumed", "believed", "reported", "apparently", "seems", "seem",
  "seemed", "appear", "appears", "unless", "whether", "not", "no", "nor", "than", "more",
  "less", "fewer", "enough", "sufficient", "insufficient", "required", "mandatory",
  "optional", "permitted", "prohibited", "allowed", "granted", "conditional", "at", "least",
  "maximum", "minimum", "exactly", "precisely", "literally", "effectively", "virtually",
])

const CONTRACTED: Record<string, string[]> = {
  "don't": ["do", "not"], "doesn't": ["does", "not"], "didn't": ["did", "not"],
  "isn't": ["is", "not"], "aren't": ["are", "not"], "wasn't": ["was", "not"],
  "weren't": ["were", "not"], "hasn't": ["has", "not"], "haven't": ["have", "not"],
  "hadn't": ["had", "not"], "can't": ["cannot"], "won't": ["will", "not"],
  "wouldn't": ["would", "not"], "shouldn't": ["should", "not"], "needn't": ["need", "not"],
  "it's": ["it", "is"], "that's": ["that", "is"], "there's": ["there", "is"],
  "here's": ["here", "is"], "what's": ["what", "is"], "let's": ["let", "us"],
  "i'm": ["i", "am"], "we're": ["we", "are"], "you're": ["you", "are"],
  "they're": ["they", "are"], "i've": ["i", "have"], "we've": ["we", "have"],
  "i'll": ["i", "will"], "we'll": ["we", "will"], "you'll": ["you", "will"],
  "they'll": ["they", "will"], "i'd": ["i", "would"], "we'd": ["we", "would"],
}

function expand(word: string): string[] {
  const smart = word.replace(/’/g, "'")
  return CONTRACTED[smart] || [word]
}

function certaintyTouched(before: string[], after: string[]): string | undefined {
  const beforeSet = new Set(before.flatMap(expand))
  const afterSet = new Set(after.flatMap(expand))
  for (const word of beforeSet) {
    if (!afterSet.has(word) && CERTAINTY_WORDS.has(word)) return word
  }
  for (const word of afterSet) {
    if (!beforeSet.has(word) && CERTAINTY_WORDS.has(word)) return word
  }
  return undefined
}

const HEDGE_PHRASES = [
  "in my opinion", "i think", "i believe", "i feel", "it seems", "as far as i know",
  "to my knowledge", "arguably", "presumably", "supposedly", "reportedly", "i suspect",
  "it appears", "could be", "might be", "may be", "not necessarily", "perhaps", "maybe",
  "i am not sure", "i'm not sure", "from what i can tell", "as i understand it",
]

const STOCK_PHRASES = [
  "delve", "delving", "tapestry", "seamless", "robust", "holistic", "leverage", "utilize",
  "utilizing", "commence", "ascertain", "facilitate", "subsequently", "prior to",
  "aforementioned", "methodology", "paradigm", "synergy", "in today's fast-paced world",
  "it is important to note", "it should be noted", "it is worth noting", "navigating the",
  "unlock the potential", "testament to", "crucial role", "in a timely manner", "foster",
  "cultivate", "ever-evolving", "fast-paced", "myriad", "multifaceted", "underpin",
  "cornerstone", "harness", "streamline", "game-changer", "cutting-edge", "state-of-the-art",
  "rest assured", "it goes without saying", "needless to say", "at the end of the day",
  "embark", "delve into", "rich tapestry", "vast landscape", "exciting journey",
]

const INTENSIFIERS = new Set([
  "very", "really", "quite", "extremely", "absolutely", "totally", "completely", "basically",
  "literally", "actually", "simply", "truly", "genuinely", "deeply",
])

const COORDINATORS = new Set(["and", "but", "or", "so", "yet", "nor"])
const SUBORDINATORS = new Set(["because", "although", "though", "while", "since", "unless", "which", "whereas", "when"])

interface PhraseRule {
  from: string[]
  to: string[]
  kind: EditKind
  confidence: Confidence
  reason: string
}

const FILLER_RULES: PhraseRule[] = [
  { from: ["in", "order", "to"], to: ["to"], kind: "filler", confidence: "high", reason: "Three words were doing the job of “to”." },
  { from: ["due", "to", "the", "fact", "that"], to: ["because"], kind: "filler", confidence: "high", reason: "Five words replaced by “because”, which means the same thing." },
  { from: ["for", "the", "reason", "that"], to: ["because"], kind: "filler", confidence: "high", reason: "Shortened to the word that carries the reason." },
  { from: ["in", "the", "event", "that"], to: ["if"], kind: "filler", confidence: "high", reason: "“If” already means “in the event that”." },
  { from: ["in", "spite", "of", "the", "fact", "that"], to: ["although"], kind: "filler", confidence: "high", reason: "Six words replaced by the one that carries the contrast." },
  { from: ["despite", "the", "fact", "that"], to: ["although"], kind: "filler", confidence: "high", reason: "Same contrast, two fewer words." },
  { from: ["at", "this", "point", "in", "time"], to: ["now"], kind: "filler", confidence: "high", reason: "“Now” is the whole meaning of that phrase." },
  { from: ["in", "close", "proximity", "to"], to: ["near"], kind: "filler", confidence: "high", reason: "“Near” says it in one word." },
  { from: ["a", "large", "number", "of"], to: ["many"], kind: "filler", confidence: "high", reason: "Wordiness removed; the size of the claim is unchanged." },
  { from: ["the", "majority", "of"], to: ["most"], kind: "filler", confidence: "high", reason: "“Most” keeps the claim and drops the padding." },
  { from: ["a", "majority", "of"], to: ["most"], kind: "filler", confidence: "high", reason: "“Most” keeps the claim and drops the padding." },
  { from: ["on", "a", "daily", "basis"], to: ["daily"], kind: "filler", confidence: "high", reason: "The four-word version adds nothing to “daily”." },
  { from: ["each", "and", "every"], to: ["every"], kind: "filler", confidence: "high", reason: "“Every” already covers “each”." },
  { from: ["has", "the", "ability", "to"], to: ["can"], kind: "filler", confidence: "high", reason: "The ability is the same claim stated once." },
  { from: ["have", "the", "ability", "to"], to: ["can"], kind: "filler", confidence: "high", reason: "The ability is the same claim stated once." },
  { from: ["is", "able", "to"], to: ["can"], kind: "filler", confidence: "high", reason: "Same ability, two fewer words." },
  { from: ["are", "able", "to"], to: ["can"], kind: "filler", confidence: "high", reason: "Same ability, two fewer words." },
  { from: ["made", "a", "decision", "to"], to: ["decided", "to"], kind: "filler", confidence: "high", reason: "The noun version delays a verb you already have." },
  { from: ["give", "consideration", "to"], to: ["consider"], kind: "filler", confidence: "high", reason: "One verb instead of a noun phrase." },
  { from: ["provide", "assistance", "to"], to: ["help"], kind: "filler", confidence: "high", reason: "“Help” is the same act in one word." },
  { from: ["with", "regard", "to"], to: ["about"], kind: "filler", confidence: "high", reason: "“About” means the same thing." },
  { from: ["in", "regard", "to"], to: ["about"], kind: "filler", confidence: "high", reason: "“About” means the same thing." },
  { from: ["as", "regards"], to: ["about"], kind: "filler", confidence: "high", reason: "“About” means the same thing." },
  { from: ["with", "reference", "to"], to: ["about"], kind: "filler", confidence: "high", reason: "“About” means the same thing." },
  { from: ["on", "the", "grounds", "that"], to: ["because"], kind: "filler", confidence: "high", reason: "Five words for “because”." },
  { from: ["in", "the", "absence", "of"], to: ["without"], kind: "filler", confidence: "high", reason: "“Without” is the same condition." },
  { from: ["for", "the", "purpose", "of"], to: ["to"], kind: "filler", confidence: "medium", reason: "Purpose usually needs only “to”." },
  { from: ["whether", "or", "not"], to: ["whether"], kind: "filler", confidence: "medium", reason: "“Whether” already leaves both options open." },
  { from: ["the", "question", "of", "whether"], to: ["whether"], kind: "filler", confidence: "medium", reason: "The question is the word." },
  { from: ["in", "the", "near", "future"], to: ["soon"], kind: "filler", confidence: "medium", reason: "“Soon” is the same promise said plainly." },
  { from: ["in", "a", "timely", "manner"], to: ["promptly"], kind: "filler", confidence: "medium", reason: "Business phrasing replaced with the plain adverb." },
  { from: ["it", "is", "important", "to", "note", "that"], to: ["note", "that"], kind: "filler", confidence: "medium", reason: "Announcing importance is not the same as stating the point." },
  { from: ["it", "should", "be", "noted", "that"], to: ["note", "that"], kind: "filler", confidence: "medium", reason: "The note survives without the announcement." },
  { from: ["it", "is", "worth", "noting", "that"], to: ["note", "that"], kind: "filler", confidence: "medium", reason: "The note survives without the announcement." },
  { from: ["first", "and", "foremost"], to: ["first"], kind: "filler", confidence: "high", reason: "The second half repeats the first." },
  { from: ["past", "history"], to: ["history"], kind: "filler", confidence: "high", reason: "History is past by definition." },
  { from: ["future", "plans"], to: ["plans"], kind: "filler", confidence: "high", reason: "Plans are future by definition." },
  { from: ["final", "outcome"], to: ["outcome"], kind: "filler", confidence: "high", reason: "An outcome is already the final one." },
  { from: ["end", "result"], to: ["result"], kind: "filler", confidence: "high", reason: "A result is already the end of it." },
  { from: ["basic", "fundamentals"], to: ["fundamentals"], kind: "filler", confidence: "high", reason: "Fundamentals are basic by definition." },
  { from: ["unexpected", "surprise"], to: ["surprise"], kind: "filler", confidence: "high", reason: "Surprise is unexpected by definition." },
  { from: ["advance", "planning"], to: ["planning"], kind: "filler", confidence: "high", reason: "Planning happens in advance." },
  { from: ["completely", "eliminate"], to: ["eliminate"], kind: "filler", confidence: "high", reason: "Eliminate is already total." },
  { from: ["totally", "eliminate"], to: ["eliminate"], kind: "filler", confidence: "high", reason: "Eliminate is already total." },
  { from: ["absolutely", "essential"], to: ["essential"], kind: "filler", confidence: "high", reason: "Essential is already absolute." },
  { from: ["very", "unique"], to: ["unique"], kind: "filler", confidence: "high", reason: "Unique does not take a degree." },
  { from: ["collaborate", "together"], to: ["collaborate"], kind: "filler", confidence: "high", reason: "Collaborating is doing it together." },
  { from: ["revert", "back"], to: ["revert"], kind: "filler", confidence: "high", reason: "Revert already means back." },
  { from: ["return", "back"], to: ["return"], kind: "filler", confidence: "high", reason: "Return already means back." },
  { from: ["repeat", "again"], to: ["repeat"], kind: "filler", confidence: "high", reason: "Repeat already means again." },
  { from: ["merge", "together"], to: ["merge"], kind: "filler", confidence: "high", reason: "Merge is the togetherness." },
  { from: ["join", "together"], to: ["join"], kind: "filler", confidence: "high", reason: "Join is the togetherness." },
  { from: ["free", "gift"], to: ["gift"], kind: "filler", confidence: "medium", reason: "A gift is free; keep “free” only if you were contrasting it with a paid one." },
  { from: ["personally", "i", "think"], to: ["i", "think"], kind: "filler", confidence: "low", reason: "“I think” is already the personal frame." },
  {
    from: ["to", "be", "honest", "with", "you"],
    to: ["honestly"],
    kind: "filler",
    confidence: "low",
    reason: "Five words introduce one opinion. “Honestly” says the same, if you want the shorter version.",
  },
  { from: ["to", "be", "honest"], to: [], kind: "filler", confidence: "low", reason: "Deleting this implies the rest was not honest — keep it if the hedge was deliberate." },
  { from: ["at", "the", "end", "of", "the", "day"], to: [], kind: "filler", confidence: "low", reason: "A stock opener; removing it changes how the sentence lands." },
  { from: ["needless", "to", "say"], to: [], kind: "filler", confidence: "low", reason: "If it is needless the sentence usually survives without it." },
  { from: ["it", "goes", "without", "saying", "that"], to: [], kind: "filler", confidence: "low", reason: "The claim stays, the throat-clearing goes — check that is what you meant." },
  { from: ["that", "that"], to: ["that"], kind: "filler", confidence: "high", reason: "“That” was written twice in a row." },
  { from: ["of", "of"], to: ["of"], kind: "filler", confidence: "high", reason: "“Of” was written twice in a row." },
  { from: ["the", "the"], to: ["the"], kind: "filler", confidence: "high", reason: "“The” was written twice in a row." },
]

const CHOICE_RULES: PhraseRule[] = [
  { from: ["utilize"], to: ["use"], kind: "word-choice", confidence: "high", reason: "“Use” is the word people actually say." },
  { from: ["utilizes"], to: ["uses"], kind: "word-choice", confidence: "high", reason: "“Uses” is the plain form." },
  { from: ["utilized"], to: ["used"], kind: "word-choice", confidence: "high", reason: "“Used” is the plain form." },
  { from: ["utilizing"], to: ["using"], kind: "word-choice", confidence: "high", reason: "“Using” is the plain form." },
  { from: ["leverage"], to: ["use"], kind: "word-choice", confidence: "medium", reason: "“Leverage” as a verb is corporate shorthand for “use”." },
  { from: ["leveraging"], to: ["using"], kind: "word-choice", confidence: "medium", reason: "“Using” says the same thing without the jargon." },
  { from: ["commence"], to: ["start"], kind: "word-choice", confidence: "medium", reason: "“Start” is the everyday word." },
  { from: ["commenced"], to: ["started"], kind: "word-choice", confidence: "medium", reason: "“Started” is the everyday word." },
  { from: ["terminate"], to: ["end"], kind: "word-choice", confidence: "low", reason: "“End” is plainer, but in contracts and employment “terminate” is often the deliberate term." },
  { from: ["ascertain"], to: ["find", "out"], kind: "word-choice", confidence: "medium", reason: "“Find out” is what it means." },
  { from: ["facilitate"], to: ["help"], kind: "word-choice", confidence: "medium", reason: "“Help” carries it without the meeting-room tone." },
  { from: ["subsequently"], to: ["later"], kind: "word-choice", confidence: "medium", reason: "“Later” is the plain sequence word." },
  { from: ["prior", "to"], to: ["before"], kind: "word-choice", confidence: "medium", reason: "“Before” means the same and reads faster." },
  { from: ["aforementioned"], to: ["this"], kind: "word-choice", confidence: "medium", reason: "Legal Latin replaced with the ordinary pointer." },
  { from: ["sufficient"], to: ["enough"], kind: "word-choice", confidence: "medium", reason: "“Enough” is the plain word." },
  { from: ["insufficient"], to: ["not", "enough"], kind: "word-choice", confidence: "medium", reason: "“Not enough” is the plain words." },
  { from: ["attempt", "to"], to: ["try", "to"], kind: "word-choice", confidence: "medium", reason: "“Try to” is lighter and means the same." },
  { from: ["endeavour", "to"], to: ["try", "to"], kind: "word-choice", confidence: "medium", reason: "“Try to” is the everyday phrase." },
  { from: ["endeavor", "to"], to: ["try", "to"], kind: "word-choice", confidence: "medium", reason: "“Try to” is the everyday phrase." },
  { from: ["purchase"], to: ["buy"], kind: "word-choice", confidence: "low", reason: "“Buy” is plainer; on an invoice or clause “purchase” may be the defined word." },
  { from: ["individual"], to: ["person"], kind: "word-choice", confidence: "low", reason: "“Person” is plainer; in some documents “individual” is the defined term." },
  { from: ["individuals"], to: ["people"], kind: "word-choice", confidence: "low", reason: "“People” is plainer; in some documents “individuals” is the defined term." },
  { from: ["methodology"], to: ["method"], kind: "word-choice", confidence: "low", reason: "Usually just “method” — unless you meant the study of methods." },
  { from: ["delve", "into"], to: ["dig", "into"], kind: "word-choice", confidence: "medium", reason: "“Delve into” has become a tell of machine-written prose." },
  { from: ["seamless"], to: ["smooth"], kind: "word-choice", confidence: "low", reason: "“Seamless” is marketing language; “smooth” is something a reader can check." },
  { from: ["robust"], to: ["solid"], kind: "word-choice", confidence: "low", reason: "Pick the quality you actually mean instead of the all-purpose adjective." },
  { from: ["holistic"], to: ["whole"], kind: "word-choice", confidence: "low", reason: "“Whole” is the plain word if that is what you meant." },
  { from: ["foster"], to: ["encourage"], kind: "word-choice", confidence: "low", reason: "“Encourage” is the plainer verb." },
  { from: ["cultivate"], to: ["build"], kind: "word-choice", confidence: "low", reason: "“Build” is the plainer verb." },
  { from: ["harness"], to: ["use"], kind: "word-choice", confidence: "low", reason: "“Use” says it without the flourish." },
  { from: ["streamline"], to: ["simplify"], kind: "word-choice", confidence: "low", reason: "“Simplify” is the everyday word — keep “streamline” if speed is the specific point." },
  { from: ["myriad"], to: ["many"], kind: "word-choice", confidence: "medium", reason: "“Many” is the plain word." },
  { from: ["multifaceted"], to: ["varied"], kind: "word-choice", confidence: "low", reason: "“Varied” is plainer; check it still covers what you meant." },
  { from: ["underpin"], to: ["support"], kind: "word-choice", confidence: "low", reason: "“Support” is the plain word." },
  { from: ["cornerstone"], to: ["core"], kind: "word-choice", confidence: "low", reason: "“Core” is plainer; “cornerstone” is a metaphor you may want to keep." },
  { from: ["cutting-edge"], to: ["new"], kind: "word-choice", confidence: "low", reason: "“New” is checkable; “cutting-edge” is a claim." },
  { from: ["state-of-the-art"], to: ["modern"], kind: "word-choice", confidence: "low", reason: "“Modern” is checkable; the hyphenated phrase is a claim." },
  { from: ["in", "terms", "of"], to: ["for"], kind: "word-choice", confidence: "low", reason: "“In terms of” often hides what you actually mean — check the sentence still says it." },
  { from: ["as", "well", "as"], to: ["and"], kind: "word-choice", confidence: "low", reason: "“And” can flatten a distinction — keep “as well as” if the order mattered." },
  { from: ["play", "a", "crucial", "role", "in"], to: ["matter", "for"], kind: "word-choice", confidence: "low", reason: "The set phrase became the plain claim; check the strength is right." },
  { from: ["is", "a", "testament", "to"], to: ["shows"], kind: "word-choice", confidence: "low", reason: "The idiom became a verb; make sure the evidence still supports it." },
  { from: ["in", "today's", "fast-paced", "world"], to: [], kind: "word-choice", confidence: "low", reason: "Stock opener — deleting it changes how the sentence begins, so check it." },
  { from: ["due", "to"], to: ["because", "of"], kind: "word-choice", confidence: "low", reason: "“Due to” and “because of” are not always interchangeable — check the cause still holds." },
]

const TRANSITION_RULES: PhraseRule[] = [
  { from: ["moreover"], to: ["also"], kind: "transition", confidence: "medium", reason: "“Moreover” is the formal twin of “also”." },
  { from: ["furthermore"], to: ["also"], kind: "transition", confidence: "medium", reason: "“Furthermore” is a heavier “also”." },
  { from: ["additionally"], to: ["also"], kind: "transition", confidence: "medium", reason: "“Also” carries the addition without the ceremony." },
  { from: ["in", "addition"], to: ["also"], kind: "transition", confidence: "medium", reason: "“Also” carries the addition without the ceremony." },
  { from: ["firstly"], to: ["first"], kind: "transition", confidence: "high", reason: "“First” is the form people write and say." },
  { from: ["secondly"], to: ["second"], kind: "transition", confidence: "high", reason: "“Second” is the form people write and say." },
  { from: ["thirdly"], to: ["third"], kind: "transition", confidence: "high", reason: "“Third” is the form people write and say." },
  { from: ["lastly"], to: ["last"], kind: "transition", confidence: "high", reason: "“Last” is the form people write and say." },
  { from: ["thus"], to: ["so"], kind: "transition", confidence: "medium", reason: "“So” is the spoken consequence." },
  { from: ["hence"], to: ["so"], kind: "transition", confidence: "medium", reason: "“So” is the spoken consequence." },
  { from: ["therefore"], to: ["so"], kind: "transition", confidence: "medium", reason: "“So” carries the same consequence in one plain word." },
  { from: ["consequently"], to: ["so"], kind: "transition", confidence: "medium", reason: "“So” carries the same consequence in one plain word." },
  { from: ["nevertheless"], to: ["still"], kind: "transition", confidence: "medium", reason: "“Still” is the plain contrast." },
  { from: ["nonetheless"], to: ["still"], kind: "transition", confidence: "medium", reason: "“Still” is the plain contrast." },
  { from: ["however"], to: ["but"], kind: "transition", confidence: "medium", reason: "“But” is how the contrast is said out loud; keep “However” where the document stays formal." },
  { from: ["in", "conclusion"], to: ["overall"], kind: "transition", confidence: "medium", reason: "“Overall” wraps up without announcing an essay structure." },
  { from: ["to", "summarize"], to: ["in", "short"], kind: "transition", confidence: "medium", reason: "“In short” is the plainer sign-off." },
  { from: ["with", "that", "being", "said"], to: ["that", "said"], kind: "transition", confidence: "high", reason: "The shorter idiom says exactly the same thing." },
  { from: ["having", "said", "that"], to: ["that", "said"], kind: "transition", confidence: "high", reason: "The shorter idiom says exactly the same thing." },
  { from: ["it", "should", "also", "be", "noted", "that"], to: ["also"], kind: "transition", confidence: "low", reason: "A long hand-off collapsed to one word — check nothing you needed to signpost disappeared." },
]

const CONTRACTION_RULES: PhraseRule[] = [
  { from: ["do", "not"], to: ["don't"], kind: "tone", confidence: "high", reason: "Said out loud this phrase is one word, so it reads better as one." },
  { from: ["does", "not"], to: ["doesn't"], kind: "tone", confidence: "high", reason: "Said out loud this phrase is one word, so it reads better as one." },
  { from: ["did", "not"], to: ["didn't"], kind: "tone", confidence: "high", reason: "Said out loud this phrase is one word, so it reads better as one." },
  { from: ["is", "not"], to: ["isn't"], kind: "tone", confidence: "high", reason: "Said out loud this phrase is one word, so it reads better as one." },
  { from: ["are", "not"], to: ["aren't"], kind: "tone", confidence: "high", reason: "Said out loud this phrase is one word, so it reads better as one." },
  { from: ["was", "not"], to: ["wasn't"], kind: "tone", confidence: "high", reason: "Said out loud this phrase is one word, so it reads better as one." },
  { from: ["were", "not"], to: ["weren't"], kind: "tone", confidence: "high", reason: "Said out loud this phrase is one word, so it reads better as one." },
  { from: ["has", "not"], to: ["hasn't"], kind: "tone", confidence: "high", reason: "Said out loud this phrase is one word, so it reads better as one." },
  { from: ["have", "not"], to: ["haven't"], kind: "tone", confidence: "high", reason: "Said out loud this phrase is one word, so it reads better as one." },
  { from: ["had", "not"], to: ["hadn't"], kind: "tone", confidence: "medium", reason: "Contracted; in formal past-perfect writing some people keep it open." },
  { from: ["will", "not"], to: ["won't"], kind: "tone", confidence: "high", reason: "Said out loud this phrase is one word, so it reads better as one." },
  { from: ["would", "not"], to: ["wouldn't"], kind: "tone", confidence: "high", reason: "Said out loud this phrase is one word, so it reads better as one." },
  { from: ["should", "not"], to: ["shouldn't"], kind: "tone", confidence: "high", reason: "Said out loud this phrase is one word, so it reads better as one." },
  { from: ["cannot"], to: ["can't"], kind: "tone", confidence: "medium", reason: "Contracted — keep “cannot” when the impossibility itself is the point." },
  { from: ["it", "is"], to: ["it's"], kind: "tone", confidence: "medium", reason: "Contracted; keep it open if the stress was on “is”." },
  { from: ["that", "is"], to: ["that's"], kind: "tone", confidence: "medium", reason: "Contracted; “that is” is often deliberate emphasis." },
  { from: ["there", "is"], to: ["there's"], kind: "tone", confidence: "medium", reason: "Contracted because that is how the phrase is spoken." },
  { from: ["you", "are"], to: ["you're"], kind: "tone", confidence: "high", reason: "Contracted because that is how the phrase is spoken." },
  { from: ["we", "are"], to: ["we're"], kind: "tone", confidence: "high", reason: "Contracted because that is how the phrase is spoken." },
  { from: ["they", "are"], to: ["they're"], kind: "tone", confidence: "high", reason: "Contracted because that is how the phrase is spoken." },
  { from: ["i", "am"], to: ["i'm"], kind: "tone", confidence: "high", reason: "Contracted because that is how the phrase is spoken." },
  { from: ["i", "have"], to: ["i've"], kind: "tone", confidence: "medium", reason: "Contracted because that is how the phrase is spoken." },
  { from: ["we", "will"], to: ["we'll"], kind: "tone", confidence: "medium", reason: "Contracted; in a deadline or commitment some writers keep “will” visible." },
  { from: ["i", "will"], to: ["i'll"], kind: "tone", confidence: "medium", reason: "Contracted; in a promise some writers keep “will” visible on purpose." },
  { from: ["you", "will"], to: ["you'll"], kind: "tone", confidence: "low", reason: "Contracting “will” can soften an instruction — check the strength is still yours." },
  { from: ["let", "us"], to: ["let's"], kind: "tone", confidence: "medium", reason: "“Let us” is nearly always the invitation, and this is how it is said." },
]

const RULE_SETS: Record<HumanizerGoal, PhraseRule[][]> = {
  natural: [FILLER_RULES, CHOICE_RULES, TRANSITION_RULES, CONTRACTION_RULES],
  plainer: [FILLER_RULES, CHOICE_RULES, TRANSITION_RULES],
  warmer: [FILLER_RULES, CHOICE_RULES, TRANSITION_RULES, CONTRACTION_RULES],
  tighter: [FILLER_RULES, CHOICE_RULES, TRANSITION_RULES],
  "formal-lite": [FILLER_RULES, CHOICE_RULES, TRANSITION_RULES],
}

const FORMAL_SKIP_WORDS = new Set([
  "however", "therefore", "thus", "hence", "moreover", "furthermore", "additionally",
  "consequently", "nevertheless", "nonetheless", "in", "on",
])

const INTENSITY_KINDS: Record<HumanizerIntensity, EditKind[]> = {
  light: ["filler", "repetition", "punctuation"],
  standard: ["filler", "repetition", "punctuation", "word-choice", "transition", "rhythm"],
  full: ["filler", "repetition", "punctuation", "word-choice", "transition", "rhythm", "tone", "voice"],
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

function syllables(word: string): number {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "")
  if (!clean) return 0
  if (clean.length <= 3) return 1
  const trimmed = clean.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "")
  const groups = trimmed.match(/[aeiouy]{1,2}/g)
  return Math.max(1, groups ? groups.length : 1)
}

function wordList(text: string): string[] {
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).filter((word) => /[\p{L}\p{N}]/u.test(word))
}

function profile(text: string): VoiceProfile {
  const lengths = sentenceLengths(text)
  const words = wordList(text).length
  if (!lengths.length) {
    return { sentences: 0, words, meanLength: 0, spread: 0, longSentences: 0, longestUniformRun: 0 }
  }
  const mean = lengths.reduce((sum, n) => sum + n, 0) / lengths.length
  const variance = lengths.reduce((sum, n) => sum + (n - mean) * (n - mean), 0) / lengths.length
  const spread = mean ? Math.sqrt(variance) / mean : 0
  let run = 1
  let longest = 1
  for (let i = 1; i < lengths.length; i += 1) {
    if (Math.abs(lengths[i] - lengths[i - 1]) <= 2) {
      run += 1
      longest = Math.max(longest, run)
    } else run = 1
  }
  return {
    sentences: lengths.length,
    words,
    meanLength: Math.round(mean * 10) / 10,
    spread: Math.round(spread * 100) / 100,
    longSentences: lengths.filter((n) => n >= 34).length,
    longestUniformRun: longest,
  }
}

function sentenceLengths(text: string): number[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => /[\p{L}\p{N}]/u.test(part))
    .map((part) => wordList(part).length)
    .filter((n) => n > 0)
}

function readability(words: number, sentences: number, syllableCount: number): number {
  if (!words || !sentences) return 0
  const score = 206.835 - 1.015 * (words / sentences) - 84.6 * (syllableCount / words)
  return Math.round(Math.max(0, Math.min(120, score)))
}

function textMetrics(text: string): { words: number; sentences: number; syllables: number; profile: VoiceProfile } {
  const words = wordList(text)
  const lengths = sentenceLengths(text)
  let syllableCount = 0
  for (const word of words) syllableCount += syllables(word)
  return { words: words.length, sentences: lengths.length || 1, syllables: syllableCount, profile: profile(text) }
}

function voiceDistance(sample: VoiceProfile, other: VoiceProfile): number {
  if (!sample.sentences || !other.sentences) return 0
  return Math.round(Math.abs(sample.meanLength - other.meanLength) + Math.abs(sample.spread - other.spread) * 10)
}

function numberTokens(text: string): string[] {
  return (text.match(/-?\d[\d,]*(?:\.\d+)?/g) || []).map((value) => value.replace(/[ ,]/g, ""))
}

function countPhrases(text: string, phrases: string[]): number {
  const hay = " " + text.toLowerCase().replace(/\s+/g, " ") + " "
  let count = 0
  for (const phrase of phrases) {
    let index = hay.indexOf(phrase)
    while (index !== -1) {
      count += 1
      index = hay.indexOf(phrase, index + phrase.length)
    }
  }
  return count
}

function sameMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const counts = new Map<string, number>()
  for (const value of a) counts.set(value, (counts.get(value) || 0) + 1)
  for (const value of b) {
    const next = (counts.get(value) || 0) - 1
    if (next < 0) return false
    counts.set(value, next)
  }
  return true
}

function looksEnglish(text: string): boolean {
  const words = wordList(text).map((word) => word.toLowerCase())
  const real = words.filter((word) => word.length > 1)
  if (real.length < 12) return true
  let hits = 0
  for (const word of real) if (FUNCTION_WORDS.has(word)) hits += 1
  return hits / real.length > 0.06
}

function properNouns(text: string): string[] {
  const frozen = freezeSpans(text)
  const units = buildUnits(text, frozen)
  const names: string[] = []
  for (const unit of units) {
    for (const token of unit.toks) {
      if (token.word && token.frozen && /^[A-Z][A-Za-z]/.test(token.raw)) names.push(token.raw)
    }
  }
  return names
}

// ---------------------------------------------------------------------------
// Rule application
// ---------------------------------------------------------------------------

interface Candidate {
  from: number
  to: number
  /** Overrides the word-range span for edits that only touch whitespace. */
  startOffset?: number
  endOffset?: number
  words: string[]
  kind: EditKind
  confidence: Confidence
  reason: string
  risk?: string
}

function rangeIsClear(unit: Unit, from: number, to: number, blocked: boolean[]): boolean {
  for (let p = from; p < to; p += 1) {
    const token = unit.toks[unit.words[p]]
    if (!token || token.frozen) return false
    if (blocked[p]) return false
  }
  // A range may only cross plain single spaces, otherwise a replacement would
  // also eat the comma, bracket or quote that sits between the words.
  for (let p = from; p < to - 1; p += 1) {
    if (gapBetween(unit, p, p + 1) !== " ") return false
  }
  return true
}

function gapBetween(unit: Unit, left: number, right: number): string {
  const a = unit.toks[unit.words[left]]
  const b = unit.toks[unit.words[right]]
  if (!a || !b) return ""
  return unit.text.slice(a.end - unit.start, b.start - unit.start)
}

function phraseEdits(unit: Unit, rules: PhraseRule[], kinds: Set<EditKind>, formal: boolean, blocked: boolean[]): Candidate[] {
  const found: Candidate[] = []
  for (const rule of rules) {
    if (!kinds.has(rule.kind)) continue
    if (formal && rule.kind === "tone") continue
    if (formal && FORMAL_SKIP_WORDS.has(rule.from[0]) && rule.from.length === 1) continue
    if (rule.from.length > unit.words.length) continue
    for (let start = 0; start + rule.from.length <= unit.words.length; start += 1) {
      let matches = true
      for (let offset = 0; offset < rule.from.length; offset += 1) {
        const token = unit.toks[unit.words[start + offset]]
        if (!token || token.lower !== rule.from[offset]) {
          matches = false
          break
        }
      }
      if (!matches) continue
      const from = start
      const to = start + rule.from.length
      if (!rangeIsClear(unit, from, to, blocked)) continue
      const firstToken = unit.toks[unit.words[from]]
      const words = rule.to.map((word, index) => (index === 0 && isCapitalized(firstToken.raw) ? raise(word) : word))
      const before = rule.from
      const after = rule.to
      const certainty = certaintyTouched(before, after)
      let confidence = rule.confidence
      let risk: string | undefined
      if (certainty) {
        confidence = "low"
        risk = "This touches “" + certainty + "”, the word that sets how strong the claim is."
      } else if (rule.to.length === 0) {
        confidence = "low"
        risk = "Words are removed here — check nothing you meant to say went with them."
      } else if (before.length >= 4 && after.length === 1) {
        risk = "Several words collapsed into one — make sure the detail was not the point."
      }
      found.push({ from, to, words, kind: rule.kind, confidence, reason: rule.reason, risk })
      for (let p = from; p < to; p += 1) blocked[p] = true
    }
  }
  return found
}

function repetitionEdits(unit: Unit, kinds: Set<EditKind>, blocked: boolean[]): Candidate[] {
  if (!kinds.has("repetition")) return []
  const found: Candidate[] = []
  for (let p = 0; p + 1 < unit.words.length; p += 1) {
    if (blocked[p] || blocked[p + 1]) continue
    const a = unit.toks[unit.words[p]]
    const b = unit.toks[unit.words[p + 1]]
    if (a.frozen || b.frozen) continue
    if (a.lower !== b.lower || a.lower.replace(/[^a-z]/g, "").length < 2) continue
    if (gapBetween(unit, p, p + 1) !== " ") continue
    found.push({
      from: p,
      to: p + 2,
      words: [isCapitalized(a.raw) ? raise(a.lower) : a.lower],
      kind: "repetition",
      confidence: "high",
      reason: "“" + a.lower + "” came out twice in a row.",
    })
    blocked[p] = true
    blocked[p + 1] = true
    p += 1
  }
  return found
}

function spacingEdits(unit: Unit, kinds: Set<EditKind>, blocked: boolean[]): Candidate[] {
  if (!kinds.has("punctuation")) return []
  const found: Candidate[] = []
  const wordPosition = new Map<number, number>()
  for (let p = 0; p < unit.words.length; p += 1) wordPosition.set(unit.words[p], p)
  for (let i = 1; i < unit.toks.length - 1; i += 1) {
    const gap = unit.toks[i]
    if (gap.word || gap.raw === " " || gap.frozen || !/^[ \t]+$/.test(gap.raw)) continue
    const left = unit.toks[i - 1]
    const right = unit.toks[i + 1]
    if (!left.word || !right.word) continue
    const position = wordPosition.get(i + 1)
    if (position === undefined || position < 1) continue
    found.push({
      from: position - 1,
      to: position + 1,
      startOffset: gap.start,
      endOffset: gap.end,
      words: [" "],
      kind: "punctuation",
      confidence: "high",
      reason: "Two spaces in a row — most writing uses one.",
    })
    i += 1
  }
  return found
}

function intensifierEdits(unit: Unit, goal: HumanizerGoal, intensity: HumanizerIntensity, blocked: boolean[]): Candidate[] {
  if (goal === "formal-lite" || intensity === "light") return []
  if (unit.words.length < 8) return []
  const found: Candidate[] = []
  for (let p = 0; p < unit.words.length && found.length < 2; p += 1) {
    if (blocked[p]) continue
    const token = unit.toks[unit.words[p]]
    const next = unit.toks[unit.words[p + 1]]
    if (!token || !next || token.frozen || next.frozen) continue
    if (!INTENSIFIERS.has(token.lower)) continue
    found.push({
      from: p,
      to: p + 1,
      words: [],
      kind: "filler",
      confidence: "low",
      reason: "“" + token.lower + "” adds emphasis the next word can carry on its own.",
      risk: "“" + token.lower + "” sets how strong the claim sounds — deleting it is your call, not ours.",
    })
    blocked[p] = true
  }
  return found
}

/**
 * Passive → active, but only for the one shape that inverts without guessing:
 * a plain subject + "was approved by <agent>" that runs to the end of the
 * sentence. Anything with commas, hedges or a trailing agent stays alone.
 */
function voiceEdits(unit: Unit, kinds: Set<EditKind>, blocked: boolean[]): Candidate[] {
  if (!kinds.has("voice")) return []
  const total = unit.words.length
  if (total < 6 || total > 16) return []
  for (let p = 1; p + 4 < total; p += 1) {
    const aux = unit.toks[unit.words[p]]
    const participle = unit.toks[unit.words[p + 1]]
    const by = unit.toks[unit.words[p + 2]]
    if (!aux || !participle || !by) continue
    if (!/^(was|were|is|are|been|has|have|had)$/.test(aux.lower)) continue
    if (!/ed$/.test(participle.lower) || participle.lower === "needed" || participle.lower === "provided") continue
    if (by.lower !== "by") continue
    const agentLength = total - (p + 3)
    const objectLength = p
    if (agentLength < 1 || agentLength > 4 || objectLength < 1 || objectLength > 4) continue
    // The whole sentence has to be bare words with single spaces between them.
    if (!rangeIsClear(unit, 0, total, blocked)) continue
    const objectWords = unit.words.slice(0, objectLength).map((index) => unit.toks[index].raw)
    const agentWords = unit.words.slice(p + 3).map((index) => unit.toks[index].raw)
    const rebuilt = [
      raise(agentWords[0]),
      ...agentWords.slice(1),
      participle.raw,
      lower(objectWords[0]),
      ...objectWords.slice(1),
    ]
    return [
      {
        from: 0,
        to: total,
        words: rebuilt,
        kind: "voice",
        confidence: "low",
        reason: "The doer is hidden until the end. Naming it first is how people tell this kind of event.",
        risk: "This reorders the sentence and drops “by” — check the emphasis is still yours.",
      },
    ]
  }
  return []
}

function hedgeOverlap(unit: Unit, from: number, to: number): boolean {
  const slice = unit.text.slice(unit.toks[unit.words[from]].start - unit.start, unit.toks[unit.words[to - 1]].end - unit.start)
  const normalised = " " + slice.toLowerCase().replace(/\s+/g, " ") + " "
  for (const hedge of HEDGE_PHRASES) if (hedge.includes(" ") && normalised.includes(" " + hedge + " ")) return true
  return false
}

// ---------------------------------------------------------------------------
// Rhythm
// ---------------------------------------------------------------------------

/** Openers that still read correctly when the sentence before them is joined on. */
const MERGE_OPENERS = new Set([
  "it", "this", "that", "these", "those", "we", "they", "he", "she", "i", "you", "there",
  "so", "but", "and", "then", "all", "everything", "both", "which", "one", "nothing",
])

function gapSpan(unit: Unit, left: Tok, right: Tok): string {
  return unit.text.slice(left.end - unit.start, right.start - unit.start)
}

function breakableGap(consumed: string): boolean {
  return /^[.,;:][,.]?[ ]+$/.test(consumed)
}

function joinableStop(consumed: string): boolean {
  return /^\.[ ]+$/.test(consumed)
}

/** Long sentences are broken at the most balanced clause edge; choppy short ones are joined. */
function rhythmEdits(units: Unit[], source: string, intensity: HumanizerIntensity, target: number): Edit[] {
  const found: Edit[] = []
  const touched = new Set<number>()
  for (const unit of units) {
    const total = unit.words.length
    if (total <= target) continue
    let best = -1
    let bestScore = 0
    let bestKind: "semicolon" | "coordinator" | "subordinator" = "coordinator"
    for (let p = 2; p < total - 1; p += 1) {
      const word = unit.toks[unit.words[p]]
      const previous = unit.toks[unit.words[p - 1]]
      if (!word || !previous || word.frozen || previous.frozen) continue
      const consumed = gapSpan(unit, previous, word)
      if (!breakableGap(consumed)) continue
      const semicolon = /;/.test(consumed)
      const coordinator = COORDINATORS.has(word.lower) && /,/.test(consumed)
      const subordinator = SUBORDINATORS.has(word.lower)
      if (!semicolon && !coordinator && !subordinator) continue
      const before = p
      const after = total - p
      if (before < 6 || after < 4) continue
      if (!/^[a-z]+$/.test(word.raw)) continue
      const balance = Math.min(before, after) / Math.max(before, after)
      const weight = semicolon ? 1.25 : coordinator ? 1 : 0.7
      if (balance * weight > bestScore) {
        bestScore = balance * weight
        best = p
        bestKind = semicolon ? "semicolon" : coordinator ? "coordinator" : "subordinator"
      }
    }
    if (best < 0) continue
    const word = unit.toks[unit.words[best]]
    const previous = unit.toks[unit.words[best - 1]]
    found.push(
      rhythmEdit(
        unit,
        previous.end,
        word.start,
        ".",
        "raise",
        bestKind === "subordinator" ? "low" : "medium",
        "split",
        bestKind === "semicolon"
          ? "Two complete thoughts are held together by a semicolon. A full stop here gives the reader a breath."
          : total + " words in one sentence. Stopping in the middle lets the reader catch up before the next claim.",
        bestKind === "subordinator"
          ? "Starting a sentence with “" + word.lower + "” usually works, but it can read as a fragment — check both halves."
          : undefined,
      ),
    )
    touched.add(unit.id)
  }

  if (intensity !== "full") return found
  for (let index = 1; index < units.length; index += 1) {
    const unit = units[index]
    const previous = units[index - 1]
    if (unit.paragraphEnd || previous.paragraphEnd) continue
    if (touched.has(unit.id) || touched.has(previous.id)) continue
    const length = unit.words.length
    const previousLength = previous.words.length
    if (length < 2 || length > 5 || previousLength < 6 || previousLength > 14) continue
    const first = unit.toks[unit.words[0]]
    const last = previous.toks[previous.words[previous.words.length - 1]]
    if (!first || !last || first.frozen || last.frozen) continue
    if (!MERGE_OPENERS.has(first.lower)) continue
    if (!joinableStop(source.slice(last.end, first.start))) continue
    if (length > 1 && gapSpan(unit, first, unit.toks[unit.words[1]]) !== " ") continue
    found.push(
      rhythmEdit(
        unit,
        last.end,
        first.start,
        " —",
        "lower",
        "low",
        "merge",
        "A " + length + "-word sentence straight after a longer one can ride on its beat with a dash instead of stopping twice.",
        "Joining changes the pacing you chose — keep them apart if the short sentence was deliberate.",
      ),
    )
    touched.add(unit.id)
  }
  return found
}

function rhythmEdit(
  unit: Unit,
  startOffset: number,
  endOffset: number,
  insert: string,
  caseNext: "raise" | "lower",
  confidence: Confidence,
  op: EditOp,
  reason: string,
  risk?: string,
): Edit {
  return {
    id: "",
    kind: "rhythm",
    confidence,
    autoApply: false,
    reason,
    risk,
    op,
    unitId: unit.id,
    from: 0,
    to: 0,
    startOffset,
    endOffset,
    caseNext,
    words: [insert],
    before: op === "split" ? "one long sentence" : "two short sentences",
    after: op === "split" ? "two sentences" : "one sentence, joined with a dash",
  }
}

// ---------------------------------------------------------------------------
// Rebuild
// ---------------------------------------------------------------------------

function editState(edit: Edit, decisions: Decisions): SegmentState {
  if (decisions.off.includes(edit.id)) return "reverted"
  if (decisions.on.includes(edit.id)) return "applied"
  return edit.autoApply ? "applied" : "suggested"
}

function isActive(edit: Edit, decisions: Decisions): boolean {
  return editState(edit, decisions) === "applied"
}

interface BuilderEvent {
  start: number
  end: number
  text: string
  breakAfter?: string
  caseNext?: "raise" | "lower"
}

function eventsFor(run: HumanizerRun, decisions: Decisions): BuilderEvent[] {
  const list: BuilderEvent[] = []
  for (const edit of run.edits) {
    if (!isActive(edit, decisions)) continue
    if (edit.startOffset < 0 || edit.endOffset > run.source.length || edit.endOffset <= edit.startOffset) continue
    if (edit.op === "replace") {
      list.push({ start: edit.startOffset, end: edit.endOffset, text: edit.words.join(" ") })
    } else {
      const consumed = run.source.slice(edit.startOffset, edit.endOffset)
      list.push({
        start: edit.startOffset,
        end: edit.endOffset,
        text: edit.words[0],
        breakAfter: /\n/.test(consumed) ? "\n" : " ",
        caseNext: edit.caseNext,
      })
    }
  }
  return list.sort((a, b) => a.start - b.start || b.end - a.end)
}

function applyCase(chunk: string, mode: "raise" | "lower"): string {
  const match = chunk.match(/[A-Za-z]/)
  if (!match || match.index === undefined) return chunk
  const char = chunk[match.index]
  const next = mode === "raise" ? char.toUpperCase() : char.toLowerCase()
  if (next === char) return chunk
  return chunk.slice(0, match.index) + next + chunk.slice(match.index + 1)
}

/** One left-to-right pass: untouched text is copied, an active edit replaces its span. */
function applyEvents(source: string, events: BuilderEvent[]): string {
  let out = ""
  let pos = 0
  let pendingCase: "raise" | "lower" | undefined
  const emit = (chunk: string) => {
    out += pendingCase ? applyCase(chunk, pendingCase) : chunk
    pendingCase = undefined
  }
  for (const event of events) {
    if (event.start < pos) continue
    emit(source.slice(pos, event.start))
    if (event.breakAfter) {
      out = out.replace(/[ \t]+$/, "") + event.text + event.breakAfter
      pendingCase = event.caseNext
    } else {
      out += event.text
    }
    pos = event.end
  }
  emit(source.slice(pos))
  return out
}

function measure(run: HumanizerRun, voiceSample?: string): Fidelity {
  const original = run.source
  const output = run.text
  const spans = extractSpans(original)
  const before = textMetrics(original)
  const after = textMetrics(output)
  const sample = voiceSample && wordList(voiceSample).length > 25 ? profile(voiceSample) : null
  const reference = sample || before.profile
  return {
    protectedSpans: spans.length,
    protectedSpansIntact: spans.every((span) => output.includes(span)),
    numbersPreserved: sameMultiset(numberTokens(original), numberTokens(output)),
    namesPreserved: sameMultiset(properNouns(original), properNouns(output)),
    wordsBefore: before.words,
    wordsAfter: after.words,
    sentencesBefore: before.profile.sentences,
    sentencesAfter: after.profile.sentences,
    meanLengthBefore: before.profile.meanLength,
    meanLengthAfter: after.profile.meanLength,
    spreadBefore: before.profile.spread,
    spreadAfter: after.profile.spread,
    readabilityBefore: readability(before.words, before.profile.sentences, before.syllables),
    readabilityAfter: readability(after.words, after.profile.sentences, after.syllables),
    stockPhrasesBefore: countPhrases(original, STOCK_PHRASES),
    stockPhrasesAfter: countPhrases(output, STOCK_PHRASES),
    hedgesBefore: countPhrases(original, HEDGE_PHRASES),
    hedgesAfter: countPhrases(output, HEDGE_PHRASES),
    voiceDriftBefore: sample ? voiceDistance(reference, before.profile) : 0,
    voiceDriftAfter: sample ? voiceDistance(reference, after.profile) : 0,
    voiceReference: sample ? "sample" : "this text",
  }
}

export function humanize(source: string, options: HumanizerOptions = {}): HumanizerRun {
  const goal: HumanizerGoal = options.goal || "natural"
  const intensity: HumanizerIntensity = options.intensity || "standard"
  const raw = typeof source === "string" ? source : ""
  const truncated = raw.length > HUMANIZER_LIMITS.maxChars
  const text = truncated ? raw.slice(0, HUMANIZER_LIMITS.maxChars) : raw
  const notes: string[] = []
  const languageOk = looksEnglish(text)
  const kinds = enabledKinds(goal, intensity)
  const units = languageOk ? buildUnits(text, freezeSpans(text)) : []
  const edits: Edit[] = []
  let sequence = 0

  if (languageOk) {
    for (const unit of units) {
      if (unit.words.length === 0) continue
      const blocked = new Array<boolean>(unit.words.length).fill(false)
      const candidates: Candidate[] = []
      candidates.push(...repetitionEdits(unit, kinds, blocked))
      candidates.push(...spacingEdits(unit, kinds, blocked))
      candidates.push(...phraseEdits(unit, RULE_SETS[goal].flat(), kinds, goal === "formal-lite", blocked))
      candidates.push(...intensifierEdits(unit, goal, intensity, blocked))
      if (goal === "natural" || goal === "warmer" || goal === "plainer") {
        for (const candidate of voiceEdits(unit, kinds, blocked)) {
          if (!blocked.slice(candidate.from, candidate.to).some(Boolean)) candidates.push(candidate)
        }
      }
      candidates.sort((a, b) => a.from - b.from || a.to - b.to)
      let used = 0
      for (const candidate of candidates) {
        if (used >= HUMANIZER_LIMITS.maxEditsPerUnit || sequence >= HUMANIZER_LIMITS.maxEdits) break
        const firstToken = unit.toks[unit.words[candidate.from]]
        const lastToken = unit.toks[unit.words[candidate.to - 1]]
        if (!firstToken || !lastToken) continue
        if (candidate.confidence !== "low" && candidate.risk) candidate.confidence = "low"
        if (candidate.risk === undefined && hedgeOverlap(unit, candidate.from, candidate.to)) {
          candidate.confidence = "low"
          candidate.risk = "This sits inside a hedge (“I think”, “it seems”), so it touches how you qualified the claim."
        }
        let startOffset = candidate.startOffset ?? firstToken.start
        let endOffset = candidate.endOffset ?? lastToken.end
        if (candidate.words.length === 0 && candidate.startOffset === undefined) {
          // A deletion also takes one adjacent space so the sentence keeps its rhythm.
          if (text[endOffset] === " " && text[endOffset + 1] !== "\n") endOffset += 1
          else if (text[startOffset - 1] === " ") startOffset -= 1
        }
        sequence += 1
        used += 1
        edits.push({
          id: "e" + sequence,
          kind: candidate.kind,
          confidence: candidate.confidence,
          autoApply: candidate.confidence !== "low",
          reason: candidate.reason,
          risk: candidate.risk,
          op: "replace",
          unitId: unit.id,
          from: candidate.from,
          to: candidate.to,
          startOffset,
          endOffset,
          words: candidate.words,
          before: text.slice(startOffset, endOffset),
          after: candidate.words.join(" "),
        })
      }
    }
    for (const edit of rhythmEdits(units, text, intensity, HUMANIZER_LIMITS.longSentence[intensity])) {
      if (sequence >= HUMANIZER_LIMITS.maxEdits) break
      sequence += 1
      edit.id = "r" + sequence
      edits.push(edit)
    }
    edits.sort((a, b) => a.startOffset - b.startOffset)
  }

  const run: HumanizerRun = {
    source: text,
    goal,
    intensity,
    edits,
    notes,
    fidelity: emptyFidelity(),
    truncated,
    languageOk,
    text: "",
  }

  run.text = buildText(run)
  run.fidelity = measure(run, options.voiceSample)

  if (!run.fidelity.protectedSpansIntact || !run.fidelity.numbersPreserved || !run.fidelity.namesPreserved) {
    // Nothing that moved a fact may stay in the draft, even though the token
    // model says it cannot. Demote to suggestions, drop the rhythm edits, rebuild.
    let demoted = 0
    for (const edit of run.edits) {
      if (edit.op !== "replace") continue
      if (edit.autoApply) {
        edit.autoApply = false
        edit.risk = edit.risk || "This edit sits next to protected text, so it is a suggestion only."
        demoted += 1
      }
    }
    run.edits = run.edits.filter((edit) => edit.op === "replace")
    run.text = buildText(run)
    run.fidelity = measure(run, options.voiceSample)
    if (demoted) notes.push(demoted + " suggestion" + (demoted === 1 ? "" : "s") + " touched protected text and moved to the review list.")
    if (!run.fidelity.protectedSpansIntact) notes.push("A protected span still changed — copy from the original before using this draft.")
  }

  if (!languageOk) notes.push("The Humanizer is tuned for English prose, so nothing was changed. The Translate tool handles other languages.")
  if (truncated) notes.push("Only the first " + HUMANIZER_LIMITS.maxChars.toLocaleString("en-GB") + " characters were processed.")

  const applied = run.edits.filter((edit) => edit.autoApply).length
  const flagged = run.edits.length - applied
  if (run.languageOk && run.edits.length === 0 && run.fidelity.wordsBefore > 40) {
    notes.push("Nothing worth changing — this already reads like a person wrote it. That is a result, not a failure.")
  } else if (run.edits.length > 0) {
    notes.push(run.edits.length + " edits: " + applied + " applied, " + flagged + " waiting for your call.")
  }
  const original = profile(text)
  if (original.longestUniformRun >= 3) {
    notes.push(original.longestUniformRun + " sentences in a row are about the same length. Real writing alternates; the rhythm suggestions do that mechanically and nothing else.")
  }
  if (run.fidelity.voiceReference === "sample") {
    const closer = run.fidelity.voiceDriftAfter <= run.fidelity.voiceDriftBefore
    notes.push(closer ? "The draft sits closer to the rhythm of your sample." : "The draft is further from your sample than the original — revert the rhythm edits if that matters.")
  }
  if (run.fidelity.hedgesBefore > run.fidelity.hedgesAfter) {
    notes.push(run.fidelity.hedgesBefore + " hedging phrases in the original, " + run.fidelity.hedgesAfter + " left in the draft. Hedges carry your certainty; check them.")
  }
  notes.push("Rule-based engine, run on this device. Text was not uploaded, stored or sent anywhere.")
  return run
}

function enabledKinds(goal: HumanizerGoal, intensity: HumanizerIntensity): Set<EditKind> {
  const kinds = new Set<EditKind>(INTENSITY_KINDS[intensity])
  if (goal === "formal-lite" || goal === "plainer") kinds.delete("tone")
  if (goal === "warmer") kinds.add("tone")
  return kinds
}

function emptyFidelity(): Fidelity {
  return {
    protectedSpans: 0,
    protectedSpansIntact: true,
    numbersPreserved: true,
    namesPreserved: true,
    wordsBefore: 0,
    wordsAfter: 0,
    sentencesBefore: 0,
    sentencesAfter: 0,
    meanLengthBefore: 0,
    meanLengthAfter: 0,
    spreadBefore: 0,
    spreadAfter: 0,
    readabilityBefore: 0,
    readabilityAfter: 0,
    stockPhrasesBefore: 0,
    stockPhrasesAfter: 0,
    hedgesBefore: 0,
    hedgesAfter: 0,
    voiceDriftBefore: 0,
    voiceDriftAfter: 0,
    voiceReference: "this text",
  }
}

export function buildText(run: HumanizerRun, decisions: Decisions = NO_DECISIONS): string {
  return applyEvents(run.source, eventsFor(run, decisions))
}

/** Segments of the draft, so the writer can read the result with each edit marked. */
export function renderDraft(run: HumanizerRun, decisions: Decisions = NO_DECISIONS): Segment[] {
  const segments: Segment[] = []
  const byStart = new Map<number, Edit>()
  for (const edit of run.edits) {
    if (!isActive(edit, decisions)) continue
    if (edit.startOffset < 0 || edit.endOffset > run.source.length || edit.endOffset <= edit.startOffset) continue
    byStart.set(edit.startOffset, edit)
  }
  const events = eventsFor(run, decisions)
  let pos = 0
  let pendingCase: "raise" | "lower" | undefined
  for (const event of events) {
    if (event.start < pos) continue
    let plain = run.source.slice(pos, event.start)
    if (event.breakAfter) plain = plain.replace(/[ \t]+$/, "")
    if (pendingCase) {
      plain = applyCase(plain, pendingCase)
      pendingCase = undefined
    }
    if (plain) segments.push({ text: plain })
    const edit = byStart.get(event.start)
    if (!edit) continue
    const shown = event.breakAfter ? event.text + event.breakAfter : event.text
    segments.push({
      text: shown,
      editId: edit.id,
      kind: edit.kind,
      confidence: edit.confidence,
      state: editState(edit, decisions),
    })
    if (event.breakAfter) pendingCase = event.caseNext
    pos = event.end
  }
  let tail = run.source.slice(pos)
  if (pendingCase) tail = applyCase(tail, pendingCase)
  if (tail) segments.push({ text: tail })
  return segments
}

/** Segments of the original, with every span an edit touches marked. */
export function renderSegments(run: HumanizerRun, decisions: Decisions = NO_DECISIONS): Segment[] {
  const segments: Segment[] = []
  const text = run.source
  const marks = run.edits
    .filter((edit) => edit.op === "replace")
    .slice()
    .sort((a, b) => a.startOffset - b.startOffset)
  let cursor = 0
  for (const edit of marks) {
    if (edit.startOffset < cursor || edit.endOffset > text.length) continue
    if (edit.startOffset > cursor) segments.push({ text: text.slice(cursor, edit.startOffset) })
    segments.push({
      text: text.slice(edit.startOffset, edit.endOffset),
      editId: edit.id,
      kind: edit.kind,
      confidence: edit.confidence,
      state: editState(edit, decisions),
    })
    cursor = edit.endOffset
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) })
  return segments
}

export function splitMarkers(run: HumanizerRun, decisions: Decisions = NO_DECISIONS): Array<{ offset: number; editId: string; kind: "split" | "merge"; state: SegmentState }> {
  return run.edits
    .filter((edit) => edit.op === "split" || edit.op === "merge")
    .map((edit) => ({
      offset: edit.startOffset,
      editId: edit.id,
      kind: edit.op === "split" ? ("split" as const) : ("merge" as const),
      state: editState(edit, decisions),
    }))
    .sort((a, b) => a.offset - b.offset)
}

export function groupEdits(run: HumanizerRun, decisions: Decisions = NO_DECISIONS): { applied: Edit[]; flagged: Edit[]; reverted: Edit[] } {
  const applied: Edit[] = []
  const flagged: Edit[] = []
  const reverted: Edit[] = []
  for (const edit of run.edits) {
    const state = editState(edit, decisions)
    if (state === "suggested") flagged.push(edit)
    else if (state === "reverted" || state === "declined") reverted.push(edit)
    else applied.push(edit)
  }
  return { applied, flagged, reverted }
}

export function fidelityLines(run: HumanizerRun): string[] {
  const f = run.fidelity
  return [
    f.protectedSpans + " protected spans: " + (f.protectedSpansIntact ? "all unchanged" : "CHECK NEEDED"),
    "Numbers and names: " + (f.numbersPreserved && f.namesPreserved ? "unchanged" : "changed"),
    "Sentences: " + f.sentencesBefore + " → " + f.sentencesAfter,
    "Average length: " + f.meanLengthBefore + " → " + f.meanLengthAfter + " words",
    "Length variety: " + f.spreadBefore + " → " + f.spreadAfter,
    "Readability: " + f.readabilityBefore + " → " + f.readabilityAfter,
    "Stock phrases: " + f.stockPhrasesBefore + " → " + f.stockPhrasesAfter,
    "Hedges kept: " + f.hedgesAfter + " of " + f.hedgesBefore,
  ]
}

export function summarise(run: HumanizerRun, decisions: Decisions = NO_DECISIONS): string {
  const counts = new Map<string, number>()
  const groups = groupEdits(run, decisions)
  for (const edit of groups.applied) counts.set(edit.kind, (counts.get(edit.kind) || 0) + 1)
  const summary = Array.from(counts.entries())
    .map(([kind, count]) => count + " " + kind)
    .join(", ")
  return [
    "Humanized draft (" + run.goal + ", " + run.intensity + "):",
    "• " + groups.applied.length + " edits applied" + (summary ? " — " + summary : ""),
    "• " + groups.flagged.length + " suggestions left for you",
    "• " + run.fidelity.protectedSpans + " protected spans, " + (run.fidelity.protectedSpansIntact ? "all unchanged" : "changed"),
    "• Numbers and names " + (run.fidelity.numbersPreserved && run.fidelity.namesPreserved ? "unchanged" : "changed"),
    "• Average sentence " + run.fidelity.meanLengthBefore + " → " + run.fidelity.meanLengthAfter + " words",
    "",
    buildText(run, decisions),
  ].join("\n")
}

export function isHumanizerEnglish(text: string): boolean {
  return looksEnglish(text)
}

export const HUMANIZER_GOALS: Array<{ id: HumanizerGoal; label: string; hint: string }> = [
  { id: "natural", label: "Sound like a person", hint: "Cuts padding, relaxes stiff connectives, adds contractions where they fit." },
  { id: "plainer", label: "Say it plainly", hint: "Swaps jargon and business words for everyday ones. No contractions." },
  { id: "warmer", label: "Warmer", hint: "Contractions, softer connectives and rhythm that breathes." },
  { id: "tighter", label: "Tighter", hint: "Deletions and wordiness only; no tone or register changes." },
  { id: "formal-lite", label: "Formal, less robotic", hint: "Keeps the formal register: no contractions, keeps “however” and “therefore”." },
]

export const HUMANIZER_INTENSITIES: Array<{ id: HumanizerIntensity; label: string; hint: string }> = [
  { id: "light", label: "Light", hint: "Only obvious wordiness and slips." },
  { id: "standard", label: "Standard", hint: "Wordiness, jargon, connectives and long-sentence splits." },
  { id: "full", label: "Full", hint: "Adds tone, contractions, passive voice and short-sentence joins." },
]

export const HUMANIZER_DISCLAIMER =
  "This tool improves clarity, rhythm and plainness. It does not claim to make writing undetectable, to defeat AI detectors, or to hide who wrote something — no tool can promise that. Every edit is listed, explained and reversible, and the draft is yours to review."

export default humanize
