import type { IncomingMessage, ServerResponse } from "node:http"
import crypto from "node:crypto"
import { cors, json, queryAuthoritative, readBody } from "../_lib/db.ts"
import { createSession, findUserByEmail } from "../_lib/auth.ts"

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  cors(req, res)
  if (req.method === "OPTIONS") return json(res, 200, {})
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "Method not allowed" })

  try {
    const body = await readBody(req, 16 * 1024)
    const accessToken = typeof body?.accessToken === "string" ? body.accessToken.trim() : ""
    if (!accessToken) return json(res, 400, { ok: false, error: "Google access token is required" })

    const expectedClientId = process.env.GOOGLE_CLIENT_ID?.trim()
    if (!expectedClientId) {
      return json(res, 503, { ok: false, error: "Google sign-in is not configured." })
    }

    const tokenResponse = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
      { signal: AbortSignal.timeout(8000) },
    )
    const tokenInfo = await tokenResponse.json().catch(() => null)
    const email = typeof tokenInfo?.email === "string" ? tokenInfo.email.trim().toLowerCase() : ""
    const googleSub = typeof tokenInfo?.sub === "string" ? tokenInfo.sub.trim() : ""
    if (
      !tokenResponse.ok ||
      tokenInfo?.aud !== expectedClientId ||
      Number(tokenInfo?.exp || 0) * 1000 <= Date.now() ||
      (tokenInfo?.email_verified !== true && tokenInfo?.email_verified !== "true") ||
      !email || email.length > 254 || !googleSub || googleSub.length > 255
    ) {
      return json(res, 401, { ok: false, error: "Google sign-in could not be verified for this application." })
    }

    let profile: any = null
    try {
      const response = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(8000),
      })
      if (response.ok) profile = await response.json()
    } catch {}
    if (profile?.sub !== googleSub) profile = null

    let user = await findUserByEmail(email)
    if (!user) {
      const id = `usr_${Date.now().toString(36)}_${crypto.randomBytes(8).toString("hex")}`
      const name = typeof profile?.name === "string" ? profile.name.trim().slice(0, 120) : ""
      const avatar =
        typeof profile?.picture === "string" && /^https:\/\//i.test(profile.picture)
          ? profile.picture.slice(0, 2048)
          : null
      await queryAuthoritative(
        `insert into users (id, email, name, avatar, google_sub, provider, role, subscription_tier, pro_status)
         values ($1, $2, $3, $4, $5, 'google', 'user', 'standard', 'none')
         on conflict (email) do nothing`,
        [id, email, name || email.split("@")[0], avatar, googleSub],
      )
      user = await findUserByEmail(email)
    }
    if (!user) return json(res, 500, { ok: false, error: "Could not create the Google account" })
    if (user.provider !== "google") {
      return json(res, 409, {
        ok: false,
        error: "This email is registered to an email account. Sign in with email instead; Google is not linked automatically.",
      })
    }
    if (user.google_sub && user.google_sub !== googleSub) {
      return json(res, 409, { ok: false, error: "This Google account is not linked to that email address." })
    }
    if (!user.google_sub) {
      await queryAuthoritative(`update users set google_sub = $2, updated_at = now() where id = $1`, [user.id, googleSub])
    }

    await queryAuthoritative(`update users set last_login_at = now() where id = $1`, [user.id])
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
        avatar: user.avatar ?? undefined,
        provider: "google",
        role: user.role,
        subscriptionTier: user.subscription_tier,
        proStatus: user.pro_status,
        unlockedTools: user.unlocked_tools,
      },
    })
  } catch (err) {
    console.error("Google sign-in failed", err)
    return json(res, 502, { ok: false, error: "Google sign-in is temporarily unavailable. Please try again." })
  }
}
