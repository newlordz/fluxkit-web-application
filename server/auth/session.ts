import type { IncomingMessage, ServerResponse } from "node:http"
import { cors, json } from "../_lib/db"
import { currentUser, revokeSession } from "../_lib/auth"

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})

  try {
    if (req.method === "DELETE") {
      const token = (req.headers.authorization || "").replace(/^Bearer /, "").trim()
      if (token) await revokeSession(token)
      return json(res, 200, { ok: true })
    }

    const user = await currentUser(req)
    if (!user) return json(res, 401, { ok: false, error: "Not signed in" })
    return json(res, 200, { ok: true, user })
  } catch (err: any) {
    return json(res, 500, { ok: false, error: err?.message || "Internal server error" })
  }
}
