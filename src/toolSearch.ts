export interface SearchableTool {
  id: string
  name: string
  description: string
  category: string
  formatBadge?: string
  popular?: boolean
}

export type SearchMatchField = "name" | "format" | "category" | "description"

export interface ToolSearchMatch<T extends SearchableTool> {
  tool: T
  score: number
  matchedOn: SearchMatchField
}

export interface HighlightSegment {
  text: string
  match: boolean
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "can",
  "do",
  "for",
  "how",
  "i",
  "in",
  "make",
  "me",
  "my",
  "need",
  "of",
  "on",
  "please",
  "the",
  "to",
  "tool",
  "tools",
  "want",
  "with",
  "you",
  "your",
])

const SYNONYM_GROUPS: string[][] = [
  ["merge", "combine", "join", "stitch"],
  ["split", "separate", "divide", "cut", "extract"],
  ["compress", "reduce", "shrink", "smaller", "optimize"],
  ["convert", "conversion", "transform", "export"],
  ["sign", "signature", "signing", "esign"],
  ["rotate", "rotation", "turn", "landscape", "portrait"],
  ["watermark", "stamp"],
  ["protect", "lock", "encrypt", "password", "secure", "security"],
  ["unlock", "decrypt"],
  ["ocr", "scan", "scanned", "searchable"],
  ["qr", "qrcode", "barcode"],
  ["image", "photo", "picture", "jpg", "jpeg", "png", "webp"],
  ["excel", "spreadsheet", "xlsx", "csv", "sheet"],
  ["powerpoint", "ppt", "pptx", "slides", "presentation"],
  ["word", "docx"],
  ["audio", "transcribe", "transcription", "speech", "recording", "mp3", "wav"],
  ["translate", "translation", "language"],
  ["summarize", "summary", "summarise", "condense"],
  ["edit", "editor", "modify"],
  ["organize", "reorder", "rearrange", "sort"],
  ["number", "numbering", "paginate", "pagination"],
  ["metadata", "properties"],
  ["redact", "redaction", "blackout", "censor"],
  ["crop", "trim", "resize", "scale"],
]

const SYNONYM_LOOKUP = new Map<string, string[]>()
for (const group of SYNONYM_GROUPS) {
  for (const word of group) {
    SYNONYM_LOOKUP.set(word, group.filter((entry) => entry !== word))
  }
}

const ALIAS_WEIGHT = 0.7
const LITERAL_BONUS = 22
const MAX_HIGHLIGHT_TERMS = 16

const NAME_EXACT = 260
const NAME_PREFIX = 195
const NAME_WORD = 160
const NAME_INCLUDES = 110
const FORMAT_INCLUDES = 70
const CATEGORY_INCLUDES = 55
const DESC_WORD = 40
const DESC_INCLUDES = 30

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function stemWord(word: string): string {
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word
}

function startsWord(text: string, term: string): boolean {
  let index = text.indexOf(term)
  while (index !== -1) {
    if (index === 0 || text[index - 1] === " ") return true
    index = text.indexOf(term, index + 1)
  }
  return false
}

function containsTerm(text: string, term: string): boolean {
  if (!term) return false
  return term.length <= 4 ? startsWord(text, term) : text.includes(term)
}

function scoreName(name: string, term: string): number {
  if (name === term) return NAME_EXACT
  if (name.startsWith(`${term} `)) return NAME_PREFIX
  if (startsWord(name, term)) return NAME_WORD
  return name.includes(term) ? NAME_INCLUDES : 0
}

function scoreTitleMatch(tool: SearchableTool, term: string): { score: number; field: SearchMatchField } {
  const name = normalizeText(tool.name)
  const nameScore = scoreName(name, term)
  if (nameScore) return { score: nameScore, field: "name" }

  const format = tool.formatBadge ? normalizeText(tool.formatBadge) : ""
  if (format && containsTerm(format, term)) return { score: FORMAT_INCLUDES, field: "format" }

  const category = normalizeText(tool.category)
  if (containsTerm(category, term)) return { score: CATEGORY_INCLUDES, field: "category" }

  const description = normalizeText(tool.description)
  if (startsWord(description, term)) return { score: DESC_WORD, field: "description" }
  if (containsTerm(description, term)) return { score: DESC_INCLUDES, field: "description" }

  return { score: 0, field: "description" }
}

function getSynonyms(word: string): string[] {
  return SYNONYM_LOOKUP.get(word) || SYNONYM_LOOKUP.get(stemWord(word)) || []
}

export function tokenizeSearchQuery(query: string): string[] {
  const words = normalizeText(query).split(" ").filter(Boolean)
  const meaningful: string[] = []
  for (const word of words) {
    const stemmed = stemWord(word)
    if (STOP_WORDS.has(word) || STOP_WORDS.has(stemmed)) continue
    if (!meaningful.includes(stemmed)) meaningful.push(stemmed)
  }
  return meaningful.length > 0 ? meaningful : Array.from(new Set(words))
}

export function expandSearchTerms(query: string): string[] {
  const seen = new Set<string>()
  for (const token of tokenizeSearchQuery(query)) {
    seen.add(token)
    for (const synonym of getSynonyms(token)) seen.add(synonym)
  }
  return Array.from(seen)
}

export function rankToolSearch<T extends SearchableTool>(source: T[], query: string): ToolSearchMatch<T>[] {
  const tokens = tokenizeSearchQuery(query)
  if (tokens.length === 0) return []
  const phrase = normalizeText(query)

  const matches: ToolSearchMatch<T>[] = []
  for (const tool of source) {
    let total = 0
    let topFieldScore = 0
    let matchedOn: SearchMatchField = "description"
    let matchedEveryToken = true

    for (const token of tokens) {
      const variants: Array<{ value: string; weight: number }> = [{ value: token, weight: 1 }]
      for (const synonym of getSynonyms(token)) variants.push({ value: synonym, weight: ALIAS_WEIGHT })

      let bestScore = 0
      let bestField: SearchMatchField = "description"
      for (const variant of variants) {
        const result = scoreTitleMatch(tool, variant.value)
        const weighted = result.score * variant.weight
        if (weighted > bestScore) {
          bestScore = weighted
          bestField = result.field
        }
      }

      if (bestScore === 0) {
        matchedEveryToken = false
        break
      }

      // Prefer tools that contain the literal word the user typed over alias-only matches
      const literal = scoreTitleMatch(tool, token)
      total += bestScore + (literal.score > 0 ? LITERAL_BONUS : 0)
      if (bestScore > topFieldScore) {
        topFieldScore = bestScore
        matchedOn = bestField
      }
    }

    if (!matchedEveryToken) continue

    if (phrase) {
      const name = normalizeText(tool.name)
      const description = normalizeText(tool.description)
      if (name.includes(phrase)) total += 90
      else if (description.includes(phrase)) total += 12
    }
    if (tool.popular) total += 6

    matches.push({ tool, score: Math.round(total * 10) / 10, matchedOn })
  }

  return matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    if (Boolean(a.tool.popular) !== Boolean(b.tool.popular)) return a.tool.popular ? -1 : 1
    return a.tool.name.localeCompare(b.tool.name)
  })
}

export function getHighlightTerms(query: string): string[] {
  return expandSearchTerms(query)
    .filter((term) => term.length > 1)
    .sort((a, b) => b.length - a.length)
    .slice(0, MAX_HIGHLIGHT_TERMS)
}

export function highlightSegments(text: string, terms: string[]): HighlightSegment[] {
  const usable = Array.from(new Set(terms.filter(Boolean)))
  if (!text || usable.length === 0) return [{ text, match: false }]

  const pattern = usable
    .sort((a, b) => b.length - a.length)
    .map((term) => (term.length <= 4 ? `\\b${escapeRegExp(term)}` : escapeRegExp(term)))
    .join("|")
  const matcher = new RegExp(`(?:${pattern})`, "gi")

  const segments: HighlightSegment[] = []
  let lastIndex = 0
  for (const found of text.matchAll(matcher)) {
    const index = found.index ?? 0
    if (index > lastIndex) segments.push({ text: text.slice(lastIndex, index), match: false })
    segments.push({ text: found[0], match: true })
    lastIndex = index + found[0].length
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), match: false })
  return segments.length > 0 ? segments : [{ text, match: false }]
}
