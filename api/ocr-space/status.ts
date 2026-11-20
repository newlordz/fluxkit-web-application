import { setCorsHeaders } from "../_cloudUtils"

export default async function handler(req: any, res: any) {
  setCorsHeaders(res)
  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  const payload = {
    ok: true,
    service: "OCR.space Free OCR API",
    freeQuota: 25000,
    status: 200,
  }
  res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
}
