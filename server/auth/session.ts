import type { IncomingMessage, ServerResponse } from "node:http"
import { cors, json } from "../_lib/db.ts"
import { currentUser, revokeSession } from "../_lib/auth.ts"

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
    return json(res, 200, {
      ok: true,
      mustResetPassword: user.must_reset_password,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        provider: user.provider,
        role: user.role,
        subscriptionTier: user.subscription_tier,
        proStatus: user.pro_status,
        unlockedTools: user.unlocked_tools,
      },
    })
  } catch (err) {
    console.error("Session check failed", err)
    return json(res, 500, { ok: false, error: "Session check is temporarily unavailable. Please try again." })
  }
}
