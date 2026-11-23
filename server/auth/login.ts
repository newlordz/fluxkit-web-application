import type { IncomingMessage, ServerResponse } from "node:http"
import { cors, json, readBody } from "../_lib/db"
import {
  clearFailedAttempts,
  createSession,
  findUserByEmail,
  isLocked,
  registerFailedAttempt,
  verifyPassword,
} from "../_lib/auth"

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" })

  try {
    const body = await readBody(req)
    const email = typeof body?.email === "string" ? body.email : ""
    const password = typeof body?.password === "string" ? body.password : ""
    if (!email || !password) return json(res, 400, { ok: false, error: "Email and password are required" })

    const user = await findUserByEmail(email)
    // Same response for unknown email and bad password: no account enumeration.
    if (!user) return json(res, 401, { ok: false, error: "Invalid email or password" })

    if (isLocked(user)) {
      return json(res, 423, { ok: false, error: "Account temporarily locked after repeated failed sign-ins" })
    }

    if (!(await verifyPassword(user, password))) {
      await registerFailedAttempt(user.id)
      return json(res, 401, { ok: false, error: "Invalid email or password" })
    }

    await clearFailedAttempts(user.id)
    const { token, expiresAt } = await createSession(user.id)

    return json(res, 200, {
      ok: true,
      token,
      expiresAt: expiresAt.toISOString(),
      mustResetPassword: user.must_reset_password,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        subscriptionTier: user.subscription_tier,
        proStatus: user.pro_status,
        unlockedTools: user.unlocked_tools,
      },
    })
  } catch (err: any) {
    return json(res, 500, { ok: false, error: err?.message || "Internal server error" })
  }
}
