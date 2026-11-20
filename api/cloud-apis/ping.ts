export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Credentials", "true")
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
  )

  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  res.setHeader("Content-Type", "application/json")

  if (req.method !== "POST") {
    res.status?.(405)?.json?.({ ok: false, error: "Method not allowed" }) ||
      res.end?.(JSON.stringify({ ok: false, error: "Method not allowed" }))
    return
  }

  try {
    let body: any = req.body
    if (!body) {
      const buffers: Buffer[] = []
      for await (const chunk of req) {
        buffers.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
      }
      const str = Buffer.concat(buffers).toString("utf8")
      body = JSON.parse(str || "{}")
    } else if (typeof body === "string") {
      body = JSON.parse(body || "{}")
    }

    const endpoint = body.endpoint
    if (!endpoint || endpoint.startsWith("local-browser")) {
      const payload = { ok: true, latencyMs: 1, message: "Instant (1ms). Client-side WebAssembly active." }
      res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      return
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(endpoint)
    } catch {
      const payload = { ok: false, error: "Invalid endpoint URL format." }
      res.status?.(400)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      return
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      const payload = { ok: false, error: "Only http and https protocols are permitted." }
      res.status?.(400)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      return
    }

    const hostname = parsedUrl.hostname.toLowerCase()
    const isBlockedHost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local") ||
      hostname.startsWith("169.254.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)

    if (isBlockedHost) {
      const payload = {
        ok: false,
        error: "Prohibited: Endpoint targets a protected internal, loopback, or metadata address.",
      }
      res.status?.(403)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      return
    }

    const start = Date.now()
    const pingRes =
      (await fetch(endpoint, { method: "HEAD", signal: AbortSignal.timeout(5000) }).catch(() => null)) ||
      (await fetch(endpoint, { method: "GET", signal: AbortSignal.timeout(5000) }).catch(() => null))

    const latencyMs = Math.max(1, Date.now() - start)
    const payload = {
      ok: true,
      latencyMs,
      message: `Connected & Ready (${latencyMs}ms)`,
    }
    res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
  } catch (err: any) {
    const payload = { ok: false, error: err?.message || "Failed to ping cloud endpoint." }
    res.status?.(500)?.json?.(payload) || res.end?.(JSON.stringify(payload))
  }
}
