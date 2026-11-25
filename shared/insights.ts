export const FUNNEL_STAGES = [
  "tool_opened",
  "file_added",
  "result_ready",
  "download_started",
] as const

export type FunnelStage = (typeof FUNNEL_STAGES)[number]

export const FEEDBACK_SENTIMENTS = [
  "works-well",
  "could-be-easier",
  "found-a-problem",
] as const

export type FeedbackSentiment = (typeof FEEDBACK_SENTIMENTS)[number]

export const TOOL_IDS = [
  "merge-pdf",
  "merge-word",
  "split-pdf",
  "compress",
  "pdf-to-word",
  "pdf-to-ppt",
  "pdf-to-excel",
  "image-to-excel",
  "passport-photo",
  "word-to-pdf",
  "ppt-to-pdf",
  "excel-to-pdf",
  "edit-pdf",
  "pdf-to-jpg",
  "jpg-to-pdf",
  "sign-pdf",
  "watermark",
  "rotate-pdf",
  "organize-pdf",
  "page-numbers-pdf",
  "redact-pdf",
  "metadata-pdf",
  "crop-pdf",
  "flatten-pdf",
  "markdown-pdf",
  "text-pdf",
  "qr",
  "qr-scanner",
  "qr-vcard",
  "qr-batch",
  "qr-event",
  "audio-text",
  "ocr",
  "password",
  "zip",
  "convert",
  "edi-convert",
  "csv-convert",
  "batch-convert",
  "convert-compress",
  "merge-compress",
  "split-compress",
  "summarize",
  "rewrite",
  "translate",
  "ask",
  "keywords",
  "sentiment",
  "compare",
  "email",
  "humanizer",
  "documents",
  "activity",
  "meetings",
  "whiteboards",
  "visitor-pass",
] as const

export type ToolId = (typeof TOOL_IDS)[number]

export interface FunnelPayload {
  visitId: string
  toolId: ToolId
  stage: FunnelStage
  sequence: number
}

export interface FeedbackPayload {
  visitId: string
  toolId: ToolId | null
  sentiment: FeedbackSentiment
}

const toolIds = new Set<string>(TOOL_IDS)
const stages = new Set<string>(FUNNEL_STAGES)
const sentiments = new Set<string>(FEEDBACK_SENTIMENTS)
const visitIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isToolId(value: unknown): value is ToolId {
  return typeof value === "string" && toolIds.has(value)
}

export function isFunnelStage(value: unknown): value is FunnelStage {
  return typeof value === "string" && stages.has(value)
}

export function isFeedbackSentiment(value: unknown): value is FeedbackSentiment {
  return typeof value === "string" && sentiments.has(value)
}

export function isVisitId(value: unknown): value is string {
  return typeof value === "string" && visitIdPattern.test(value)
}

function hasExactKeys(value: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

export function parseFunnelPayload(value: unknown): FunnelPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  if (!hasExactKeys(body, ["visitId", "toolId", "stage", "sequence"])) return null
  if (!isVisitId(body.visitId) || !isToolId(body.toolId) || !isFunnelStage(body.stage)) return null
  if (!Number.isInteger(body.sequence) || (body.sequence as number) < 1 || (body.sequence as number) > 1000) return null
  return {
    visitId: body.visitId,
    toolId: body.toolId,
    stage: body.stage,
    sequence: body.sequence as number,
  }
}

export function parseFeedbackPayload(value: unknown): FeedbackPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const body = value as Record<string, unknown>
  if (!hasExactKeys(body, ["visitId", "toolId", "sentiment"])) return null
  if (!isVisitId(body.visitId) || !isFeedbackSentiment(body.sentiment)) return null
  if (body.toolId !== null && !isToolId(body.toolId)) return null
  return {
    visitId: body.visitId,
    toolId: body.toolId as ToolId | null,
    sentiment: body.sentiment,
  }
}
