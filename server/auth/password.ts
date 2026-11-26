import type { IncomingMessage, ServerResponse } from "node:http"
import { cors, json, queryAuthoritative, readBody } from "../_lib/db.ts"
import { applyNewPassword, changePasswordWithCurrent, createSession, currentUser } from "../_lib/auth.ts"

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" })

  try {
    const actor = await currentUser(req)
    if (!actor) return json(res, 401, { ok: false, error: "Sign-in required" })

    const body = await readBody(req, 16 * 1024)
    const currentPassword = typeof body?.currentPassword === "string" ? body.currentPassword : ""
    const newPassword = typeof body?.newPassword === "string" ? body.newPassword : ""
    const targetId =
      typeof body?.userId === "string" ? body.userId :
      typeof body?.userEmail === "string" ? body.userEmail :
      actor.id

    if (newPassword.length < 12 || newPassword.length > 1024) {
      return json(res, 400, { ok: false, error: "Password must be between 12 and 1024 characters." })
    }

    const self = targetId === actor.id || targetId.toLowerCase() === actor.email.toLowerCase()
    if (!self && (actor.role !== "admin" || actor.must_reset_password)) {
      return json(res, 403, { ok: false, error: "Administrator sign-in required" })
    }

    const [row] = await queryAuthoritative<{
      id: string
      email: string
      must_reset_password: boolean
    }>(
      `select id, email, must_reset_password from users where id = $1 or lower(email) = lower($1)`,
      [targetId],
    )
    if (!row) return json(res, 404, { ok: false, error: "Account not found." })

    const rootEmail = row.email.trim().toLowerCase()
    const rootTarget =
      row.id === "usr_admin_default" ||
      rootEmail === "admin@masterfilepro.com" ||
      rootEmail === "admin@fluxkit.com"
    if (!self && rootTarget) {
      return json(res, 403, { ok: false, error: "Only the root administrator can change this account's password." })
    }

    const needsCurrent = self && !row.must_reset_password && !actor.must_reset_password
    if (needsCurrent) {
      if (!(await changePasswordWithCurrent(row.id, currentPassword, newPassword))) {
        return json(res, 401, { ok: false, error: "Current password is incorrect." })
      }
    } else {
      await applyNewPassword(row.id, newPassword, self ? "auth.password.change" : "auth.password.admin_reset", actor.id)
    }

    const refreshedSession = self ? await createSession(row.id) : null
    return json(res, 200, {
      ok: true,
      message: refreshedSession ? "Password updated." : "Password updated. The account must sign in again.",
      ...(refreshedSession ? { token: refreshedSession.token, expiresAt: refreshedSession.expiresAt.toISOString() } : {}),
    })
  } catch (err) {
    console.error("Password change failed", err)
    return json(res, 500, { ok: false, error: "Password update is temporarily unavailable. Please try again." })
  }
}
