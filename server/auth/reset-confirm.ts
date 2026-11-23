import type { IncomingMessage, ServerResponse } from "node:http"
import { cors, json, query, readBody } from "../_lib/db.ts"
import { resetPasswordWithCode } from "../_lib/auth.ts"

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" })

  try {
    const body = await readBody(req)
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    const code = typeof body?.code === "string" ? body.code.trim() : ""
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : ""

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { ok: false, error: "Please enter a valid email address." })
    }
    if (!/^\d{6}$/.test(code)) {
      return json(res, 400, { ok: false, error: "Enter the 6-digit verification code." })
    }
    if (newPassword.length < 12) {
      return json(res, 400, { ok: false, error: "Password must be at least 12 characters." })
    }

    const result = await resetPasswordWithCode(email, code, newPassword)
    if (!result.ok) return json(res, 400, { ok: false, error: result.error })

    const [user] = await query<any>(
      `select id, email, name, role, subscription_tier, pro_status, unlocked_tools from users where id = $1`,
      [result.userId],
    )

    return json(res, 200, {
      ok: true,
      message: "Your password has been reset. Sign in with your new password.",
      user: user
        ? {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            subscriptionTier: user.subscription_tier,
            proStatus: user.pro_status,
            unlockedTools: user.unlocked_tools,
          }
        : null,
    })
  } catch (err: any) {
    return json(res, 500, { ok: false, error: err?.message || "Internal server error" })
  }
}
