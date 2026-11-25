import {
  isFeedbackSentiment,
  isFunnelStage,
  isToolId,
  type FeedbackSentiment,
  type FeedbackPayload,
  type FunnelPayload,
  type FunnelStage,
} from "../shared/insights"

const configured =
  typeof process !== "undefined"
    ? process.env?.VITE_ENABLE_PRODUCT_INSIGHTS
    : undefined
const enabled = configured !== "false"

let visitId = ""
let sequence = 0
let transportQueue: Promise<unknown> = Promise.resolve()
const recorded = new Set<string>()

function createVisitId(): string {
  if (typeof globalThis.crypto?.getRandomValues !== "function") return ""
  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function currentVisitId(): string {
  if (!visitId) visitId = createVisitId()
  return visitId
}

function post(path: string, payload: FunnelPayload | FeedbackPayload): Promise<boolean> {
  const request = transportQueue.then(async () => {
    if (!enabled || typeof fetch !== "function" || !currentVisitId()) return false
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)
    try {
      const response = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "omit",
        cache: "no-store",
        keepalive: true,
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      })
      return response.ok
    } catch {
      return false
    } finally {
      clearTimeout(timeout)
    }
  })
  transportQueue = request.catch(() => false)
  return request
}

export function trackToolEvent(stage: FunnelStage, toolId: string): void {
  if (!enabled || !isFunnelStage(stage) || !isToolId(toolId)) return
  const key = `${toolId}:${stage}`
  if (stage !== "download_started" && recorded.has(key)) return
  recorded.add(key)
  const id = currentVisitId()
  if (!id || sequence >= 1000) return
  sequence += 1
  const payload: FunnelPayload = { visitId: id, toolId, stage, sequence }
  void post("/api/db/insights", payload)
}

export interface LocalFeedbackEntry {
  id: number
  toolId: string
  sentiment: FeedbackSentiment
  comment: string | null
  createdAt: string
}

const LOCAL_FEEDBACK_KEY = "fluxkit-local-feedback"

export function getLocalFeedbackEntries(): LocalFeedbackEntry[] {
  try {
    if (typeof window === "undefined" || !window.localStorage) return []
    const raw = window.localStorage.getItem(LOCAL_FEEDBACK_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveLocalFeedbackEntry(
  sentiment: FeedbackSentiment,
  toolId: string | null,
  comment?: string,
): boolean {
  try {
    if (typeof window === "undefined" || !window.localStorage) return false
    const existing = getLocalFeedbackEntries()
    const cleanComment = comment?.trim().slice(0, 500) || null
    const entry: LocalFeedbackEntry = {
      id: Date.now(),
      toolId: toolId || "general",
      sentiment,
      comment: cleanComment,
      createdAt: new Date().toISOString(),
    }
    const next = [entry, ...existing].slice(0, 100)
    window.localStorage.setItem(LOCAL_FEEDBACK_KEY, JSON.stringify(next))
    return true
  } catch {
    return false
  }
}

export async function submitProductFeedback(
  sentiment: FeedbackSentiment,
  toolId: string | null,
  comment?: string,
): Promise<boolean> {
  if (!enabled || !isFeedbackSentiment(sentiment) || (toolId !== null && !isToolId(toolId))) return false
  const id = currentVisitId()
  if (!id) return false
  const cleanComment = typeof comment === "string" ? comment.trim().slice(0, 500) : ""
  const payload: FeedbackPayload = cleanComment
    ? { visitId: id, toolId, sentiment, comment: cleanComment }
    : { visitId: id, toolId, sentiment }
  return post("/api/db/insights", payload)
}
