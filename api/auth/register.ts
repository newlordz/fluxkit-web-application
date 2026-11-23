import type { IncomingMessage, ServerResponse } from "node:http"
import crypto from "node:crypto"
import { cors, json, query, readBody } from "../_lib/db"
import { createSession, generateSalt, hashPassword } from "../_lib/auth"

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" })

  try {
    const body = await readBody(req)
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    const name = typeof body?.name === "string" ? body.name.trim() : ""
    const password = typeof body?.password === "string" ? body.password : ""

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { ok: false, error: "Please enter a valid email address." })
    }
    if (password.length < 12) {
      return json(res, 400, { ok: false, error: "Password must be at least 12 characters." })
    }

    const existing = await query<{ id: string }>(`select id from users where email = $1`, [email])
    if (existing.length) {
      return json(res, 409, { ok: false, error: "An account with this email already exists." })
    }

    // Role is never taken from the request: a visitor cannot register as admin.
    const id = `usr_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`
    const salt = generateSalt()
    await query(
      `insert into users (id, email, name, provider, role, subscription_tier, pro_status, password_salt, password_hash)
       values ($1, $2, $3, 'email', 'user', 'standard', 'none', $4, $5)`,
      [id, email, name || email.split("@")[0], salt, hashPassword(password, salt)],
    )

    const { token, expiresAt } = await createSession(id)
    const [user] = await query<any>(
      `select id, email, name, role, subscription_tier, pro_status, unlocked_tools from users where id = $1`,
      [id],
    )

    return json(res, 201, {
      ok: true,
      token,
      expiresAt: expiresAt.toISOString(),
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
