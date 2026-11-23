import type { ServerResponse } from "node:http"
import { cors, json, type ApiRequest } from "../server/_lib/db.ts"
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
  login,
  register,
  password,
  "reset-request": resetRequest,
  "reset-confirm": resetConfirm,
  session,
}

export default async function handler(req: ApiRequest, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})

  const action =
    new URL(req.url || "/", "http://localhost").searchParams.get("action") || req.query?.action || ""
  const route = HANDLERS[action]
  if (!route) return json(res, 404, { ok: false, error: `Unknown auth action "${action}"` })

  return route(req, res)
}
