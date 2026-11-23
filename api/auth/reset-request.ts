import type { IncomingMessage, ServerResponse } from "node:http"
import { cors, json, query, readBody } from "../_lib/db"
import { activeResetCodeCount, createResetCode } from "../_lib/auth"

const MAX_ACTIVE_PER_EMAIL = 3

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" })

  try {
    const body = await readBody(req)
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { ok: false, error: "Please enter a valid email address." })
    }

    const [account] = await query<{ id: string }>(`select id from users where email = $1`, [email])
    const sentMessage = "If that address is registered, a reset code has been sent."

    // Same answer whether or not the address exists, so this cannot enumerate accounts.
    if (!account) return json(res, 200, { ok: true, message: sentMessage })

    if ((await activeResetCodeCount(email)) >= MAX_ACTIVE_PER_EMAIL) {
      return json(res, 429, { ok: false, error: "Too many reset codes requested. Please try again in 15 minutes." })
    }

    const code = await createResetCode(email)

    await query(
      `insert into audit_log (actor_user_id, action, target, metadata)
       values ($1, 'auth.password.reset_requested', $1, '{}'::jsonb)`,
      [account.id],
    )

    // No mail transport is configured yet, so local runs return the code the
    // server just stored. Production responses never include it.
    const debug = process.env.NODE_ENV !== "production" && process.env.VERCEL_ENV !== "production"

    return json(res, 200, {
      ok: true,
      message: sentMessage,
      ...(debug ? { devCode: code, devNote: "Code expires in 15 minutes." } : {}),
    })
  } catch (err: any) {
    return json(res, 500, { ok: false, error: err?.message || "Internal server error" })
  }
}
