import { authHeaders, getSessionToken } from "./sessionService"
import type { VisitorRecord } from "./VisitorPassStudio"

// The visitor log is facility data: reception issues a pass on one device and
// verifies it on another, so the server is the source of truth and localStorage
// is only the offline cache.

async function request(init: RequestInit): Promise<Response | null> {
  try {
    return await fetch("/api/visitor", init)
  } catch {
    return null
  }
}

export interface VisitorLoadResult {
  ok: boolean
  records: VisitorRecord[]
}

export async function fetchVisitorLog(): Promise<VisitorLoadResult> {
  if (!getSessionToken()) return { ok: false, records: [] }

  const res = await request({ headers: authHeaders() })
  if (!res || !res.ok) return { ok: false, records: [] }

  try {
    const data = await res.json()
    return {
      ok: true,
      records: Array.isArray(data?.records) ? data.records : [],
    }
  } catch {
    return { ok: false, records: [] }
  }
}

export function diffVisitorLog(
  previous: VisitorRecord[],
  next: VisitorRecord[],
): { saved: VisitorRecord[] ; removed: string[] } {
  const before = new Map(
    previous.map((record) => [record.id, JSON.stringify(record)]),
  )
  const after = new Set(next.map((record) => record.id))

  return {
    saved: next.filter(
      (record) => before.get(record.id) !== JSON.stringify(record),
    ),
    removed: previous.map((record) => record.id).filter((id) => !after.has(id)),
  }
}

/** Pushes a log mutation to Postgres. Returns false when the change is cached only. */
export async function pushVisitorLogChanges(
  previous: VisitorRecord[],
  next: VisitorRecord[],
): Promise<boolean> {
  if (!getSessionToken()) return false

  const { saved, removed } = diffVisitorLog(previous, next)
  let synced = saved.length === 0 && removed.length === 0

  for (const record of saved) {
    const res = await request({
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "save", record }),
    })
    if (res?.ok) synced = true
  }

  for (const id of removed) {
    const res = await request({
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "remove", id }),
    })
    if (res?.ok) synced = true
  }

  return synced
}

/** Reads one pass from the server so a scanner on another device can verify it. */
export async function fetchVisitorRecord(
  id: string,
): Promise<VisitorRecord | null> {
  const { ok, records } = await fetchVisitorLog()
  if (!ok) return null
  return records.find((record) => record.id === id) || null
}
