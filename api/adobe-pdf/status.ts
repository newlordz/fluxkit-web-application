import { getAdobeCredentials, setCorsHeaders } from "../_cloudUtils"

export default async function handler(req: any, res: any) {
  setCorsHeaders(res)
  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  try {
    const { clientId, clientSecret } = getAdobeCredentials()

    const tokenRes = await fetch("https://pdf-services.adobe.io/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret }),
    })
    const tokenData = (await tokenRes.json()) as any
    if (tokenData.access_token) {
      const payload = {
        ok: true,
        service: "Adobe PDF Services API",
        credential: "active",
        tokenType: tokenData.token_type,
        expiresIn: tokenData.expires_in,
        freeQuota: 500,
      }
      res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
    } else {
      res.status?.(401)?.json?.({
        ok: false,
        error: tokenData.error_description || "Invalid Adobe credentials",
      }) ||
        res.end?.(
          JSON.stringify({
            ok: false,
            error: tokenData.error_description || "Invalid Adobe credentials",
          }),
        )
    }
  } catch (err: any) {
    res.status?.(500)?.json?.({ ok: false, error: err.message }) ||
      res.end?.(JSON.stringify({ ok: false, error: err.message }))
  }
}
