import type { IncomingMessage, ServerResponse } from "node:http"
import { cors, json, readBody } from "../_lib/db.ts"
import { authenticatePassword } from "../_lib/auth.ts"

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" })

  try {
    const body = await readBody(req, 16 * 1024)
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    const password = typeof body?.password === "string" ? body.password : ""
    if (!email || !password) return json(res, 400, { ok: false, error: "Email and password are required" })
    if (email.length > 254 || password.length > 1024) {
      return json(res, 400, { ok: false, error: "Invalid email or password" })
    }

    const result = await authenticatePassword(email, password)
    if (result.status === "locked" || result.status === "invalid") {
      return json(res, 401, { ok: false, error: "Invalid email or password" })
    }

    return json(res, 200, {
      ok: true,
      token: result.token,
      expiresAt: result.expiresAt.toISOString(),
      mustResetPassword: result.user.must_reset_password,
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name,
        provider: result.user.provider || "email",
        role: result.user.role,
        subscriptionTier: result.user.subscription_tier,
        proStatus: result.user.pro_status,
        unlockedTools: result.user.unlocked_tools,
      },
    })
  } catch (err) {
    console.error("Sign-in failed", err)
    return json(res, 500, { ok: false, error: "Sign-in is temporarily unavailable. Please try again." })
  }
}
