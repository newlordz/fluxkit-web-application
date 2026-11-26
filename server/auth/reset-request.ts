import type { IncomingMessage, ServerResponse } from "node:http"
import { cors, json, queryAuthoritative, readBody } from "../_lib/db.ts"
import { createResetCode } from "../_lib/auth.ts"
import { passwordRecoveryConfigured, sendPasswordResetEmail } from "../_lib/mail.ts"

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" })

  try {
    const body = await readBody(req, 16 * 1024)
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : ""

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return json(res, 400, { ok: false, error: "Please enter a valid email address." })
    }

    if (!passwordRecoveryConfigured()) {
      return json(res, 503, { ok: false, error: "Password recovery email is not configured. Please contact support." })
    }

    const [account] = await queryAuthoritative<{ id: string }>(`select id from users where email = $1`, [email])
    const sentMessage = "If that address is registered, a reset code has been sent by email."

    if (!account) return json(res, 200, { ok: true, message: sentMessage })

    const code = await createResetCode(account.id, email)
    try {
      await sendPasswordResetEmail(email, code)
    } catch (mailError) {
      await queryAuthoritative(`update password_resets set used_at = now() where user_id = $1 and used_at is null`, [account.id])
      console.error("Password recovery email failed", mailError)
      return json(res, 502, { ok: false, error: "Password recovery is temporarily unavailable. Please try again." })
    }
    await queryAuthoritative(
      `insert into audit_log (actor_user_id, action, target, metadata)
       values ($1, 'auth.password.reset_requested', $1, '{}'::jsonb)`,
      [account.id],
    )

    return json(res, 200, { ok: true, message: sentMessage })
  } catch (err) {
    console.error("Password reset request failed", err)
    return json(res, 500, { ok: false, error: "Password reset is temporarily unavailable. Please try again." })
  }
}
