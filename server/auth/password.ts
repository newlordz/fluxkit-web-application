import type { IncomingMessage, ServerResponse } from "node:http"
import { cors, json, query, readBody } from "../_lib/db"
import { applyNewPassword, currentUser, verifyPassword } from "../_lib/auth"

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" })

  try {
    const actor = await currentUser(req)
    if (!actor) return json(res, 401, { ok: false, error: "Sign-in required" })

    const body = await readBody(req)
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : ""
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : ""
    const targetId =
      typeof body?.userId === "string" ? body.userId :
      typeof body?.userEmail === "string" ? body.userEmail :
      actor.id

    if (newPassword.length < 12) {
      return json(res, 400, { ok: false, error: "Password must be at least 12 characters." })
    }

    // Changing your own password proves you know the old one; changing someone
    // else's is an administrator action and is recorded as such.
    const self = targetId === actor.id || targetId.toLowerCase() === actor.email.toLowerCase()
    if (!self && actor.role !== "admin") {
      return json(res, 403, { ok: false, error: "Administrator sign-in required" })
    }

    const [row] = await query<{
      id: string
      password_salt: string | null
      password_hash: string | null
      must_reset_password: boolean
    }>(
      `select id, password_salt, password_hash, must_reset_password from users
       where id = $1 or lower(email) = lower($1)`,
      [targetId],
    )
    if (!row) return json(res, 404, { ok: false, error: "Account not found." })

    // An administrator-set initial password arrives as must_reset_password, and
    // the user is not expected to know it yet.
    const needsCurrent = self && !row.must_reset_password && !actor.must_reset_password
    if (needsCurrent && !(await verifyPassword(row, currentPassword))) {
      return json(res, 401, { ok: false, error: "Current password is incorrect." })
    }

    await applyNewPassword(row.id, newPassword, self ? "auth.password.change" : "auth.password.admin_reset", actor.id)

    return json(res, 200, { ok: true, message: "Password updated. Please sign in again." })
  } catch (err: any) {
    return json(res, 500, { ok: false, error: err?.message || "Internal server error" })
  }
}
