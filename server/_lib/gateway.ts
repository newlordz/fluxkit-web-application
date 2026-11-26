import type { IncomingMessage, ServerResponse } from "node:http"
import { requireActiveUser, type AuthUser } from "./auth.ts"
import { json, queryAuthoritative, readBody } from "./db.ts"
import { isProviderOutOfQuota } from "./providers.ts"

// A 25 MB document becomes ~34 MB of JSON once base64-encoded, which is the
// largest body any of these proxies can usefully forward. Reading further would
// only grow the invocation's memory before the provider rejects it.
const MAX_PAID_BODY_BYTES = 40 * 1024 * 1024

/**
 * Adobe, iLovePDF and OCR.space are billed to this project, so the decision to
 * spend their quota cannot be left to the browser: the client-side pool state is
 * editable localStorage and never saw another visitor's requests.
 */
export async function requireToolAccess(
  user: AuthUser,
  res: ServerResponse,
  toolId: string,
): Promise<boolean> {
  if (user.role === "admin") return true

  try {
    const [tool] = await queryAuthoritative<{ tier: string }>(`select tier from tools where key = $1`, [toolId])
    const requiresPro = (tool?.tier || "standard") === "pro"
    const entitled =
      !requiresPro ||
      (user.subscription_tier === "pro" && user.pro_status === "active") ||
      user.unlocked_tools?.includes(toolId)
    if (entitled) return true
  } catch {
    json(res, 503, {
      ok: false,
      error: "Tool access is temporarily unavailable. Please try again shortly.",
      code: "tool_access_unavailable",
    })
    return false
  }

  json(res, 403, {
    ok: false,
    error: "This tool requires Pro or an individual unlock.",
    code: "tool_access_required",
  })
  return false
}

export async function requirePaidAccess(
  req: IncomingMessage,
  res: ServerResponse,
  provider: string,
  toolId?: string,
): Promise<AuthUser | null> {
  let user: AuthUser | null = null

  try {
    user = await requireActiveUser(req)
  } catch {
    // Without the ledger this request cannot be attributed or counted, so it is
    // refused rather than charged to whoever else tries while the database is down.
    json(res, 503, {
      ok: false,
      error: "Account check is unavailable, so cloud processing is paused. The built-in engine still works.",
      code: "session_unavailable",
    })
    return null
  }

  if (!user) {
    json(res, 401, {
      ok: false,
      error: "Sign in to process this document in the cloud. The built-in engine runs without an account.",
      code: "sign_in_required",
    })
    return null
  }

  if (toolId && !(await requireToolAccess(user, res, toolId))) return null

  if (await isProviderOutOfQuota(provider)) {
    json(res, 429, {
      ok: false,
      error: "This month's cloud processing quota is used up. The built-in engine will handle your file instead.",
      code: "quota_exhausted",
    })
    return null
  }

  return user
}

export async function readPaidBody(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<any | null> {
  try {
    return await readBody(req, MAX_PAID_BODY_BYTES)
  } catch {
    json(res, 413, {
      ok: false,
      error: "That document is larger than cloud processing accepts. Try the built-in engine.",
      code: "payload_too_large",
    })
    return null
  }
}
