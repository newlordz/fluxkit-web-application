import { getILovePdfCredentials, setCorsHeaders } from "../_cloudUtils"

export default async function handler(req: any, res: any) {
  setCorsHeaders(res)
  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  try {
    const { publicKey } = getILovePdfCredentials()
    const authRes = await fetch("https://api.ilovepdf.com/v1/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_key: publicKey }),
    })
    const data = (await authRes.json()) as any
    if (data.token) {
      const payload = {
        ok: true,
        service: "iLovePDF API",
        status: 200,
        freeQuota: 250,
        tokenType: "JWT",
      }
      res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
    } else {
      res.status?.(401)?.json?.({ ok: false, error: data.name || "Invalid iLovePDF Key" }) ||
        res.end?.(JSON.stringify({ ok: false, error: data.name || "Invalid iLovePDF Key" }))
    }
  } catch (err: any) {
    res.status?.(500)?.json?.({ ok: false, error: err.message }) ||
      res.end?.(JSON.stringify({ ok: false, error: err.message }))
  }
}
