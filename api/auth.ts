import type { ServerResponse } from "node:http"
import { cors, json, type ApiRequest } from "../server/_lib/db.ts"
import { consumeAuthRateLimit } from "../server/_lib/auth.ts"
import google from "../server/auth/google.ts"
import login from "../server/auth/login.ts"
import password from "../server/auth/password.ts"
import register from "../server/auth/register.ts"
import resetConfirm from "../server/auth/reset-confirm.ts"
import resetRequest from "../server/auth/reset-request.ts"
import session from "../server/auth/session.ts"

type AuthHandler = (req: ApiRequest, res: ServerResponse) => Promise<unknown>

// The auth routes share one entry point because Vercel Hobby caps a deployment at
// 12 functions; vercel.json rewrites map /api/auth/<action> to ?action=<action>, so
// the public URLs stay unchanged.
const HANDLERS: Record<string, AuthHandler> = {
  google,
  login,
  register,
  password,
  "reset-request": resetRequest,
  "reset-confirm": resetConfirm,
  session,
}

const RATE_LIMITS: Record<string, { limit: number; windowSeconds: number }> = {
  google: { limit: 30, windowSeconds: 900 },
  login: { limit: 30, windowSeconds: 900 },
  password: { limit: 10, windowSeconds: 900 },
  register: { limit: 5, windowSeconds: 3600 },
  "reset-request": { limit: 5, windowSeconds: 3600 },
  "reset-confirm": { limit: 20, windowSeconds: 900 },
}

export default async function handler(req: ApiRequest, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})

  const action =
    new URL(req.url || "/", "http://localhost").searchParams.get("action") || req.query?.action || ""
  const route = HANDLERS[action]
  if (!route) return json(res, 404, { ok: false, error: `Unknown auth action "${action}"` })

  const limit = req.method === "POST" ? RATE_LIMITS[action] : undefined
  if (limit) {
    try {
      const result = await consumeAuthRateLimit(req, action, limit.limit, limit.windowSeconds)
      if (!result.allowed) {
        res.setHeader("Retry-After", String(result.retryAfterSeconds))
        return json(res, 429, { ok: false, error: "Too many attempts. Please try again later." })
      }
    } catch (err) {
      console.error("Authentication rate limit check failed", err)
      return json(res, 503, { ok: false, error: "Authentication is temporarily unavailable. Please try again." })
    }
  }

  return route(req, res)
}
