import type { IncomingMessage, ServerResponse } from "node:http"
import crypto from "node:crypto"
import { cors, json, queryAuthoritative, readBody } from "../_lib/db.ts"
import { createSession, generateSalt, hashPasswordScrypt } from "../_lib/auth.ts"

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" })

  try {
    const body = await readBody(req, 16 * 1024)
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""
    const name = typeof body?.name === "string" ? body.name.trim() : ""
    const password = typeof body?.password === "string" ? body.password : ""

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return json(res, 400, { ok: false, error: "Please enter a valid email address." })
    }
    if (name.length > 120) return json(res, 400, { ok: false, error: "Name must be 120 characters or fewer." })
    if (password.length < 12 || password.length > 1024) {
      return json(res, 400, { ok: false, error: "Password must be between 12 and 1024 characters." })
    }

    const id = `usr_${Date.now().toString(36)}_${crypto.randomBytes(8).toString("hex")}`
    const salt = generateSalt()
    const inserted = await queryAuthoritative<{ id: string }>(
      `insert into users (id, email, name, provider, role, subscription_tier, pro_status, password_salt, password_hash)
       values ($1, $2, $3, 'email', 'user', 'standard', 'none', $4, $5)
       on conflict (email) do nothing
       returning id`,
      [id, email, name || email.split("@")[0], salt, await hashPasswordScrypt(password, salt)],
    )
    if (!inserted.length) {
      return json(res, 409, { ok: false, error: "Unable to create an account with those details." })
    }

    const { token, expiresAt } = await createSession(id)
    const [user] = await queryAuthoritative<any>(
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
        provider: "email",
        role: user.role,
        subscriptionTier: user.subscription_tier,
        proStatus: user.pro_status,
        unlockedTools: user.unlocked_tools,
      },
    })
  } catch (err: any) {
    if (err?.code === "23505") {
      return json(res, 409, { ok: false, error: "Unable to create an account with those details." })
    }
    console.error("Registration failed", err)
    return json(res, 500, { ok: false, error: "Account creation is temporarily unavailable. Please try again." })
  }
}
