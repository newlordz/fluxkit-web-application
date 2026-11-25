import { isIP } from "node:net"
import { lookup } from "node:dns/promises"
import { requireAdmin } from "../../server/_lib/auth.ts"

// Range checks are done on the parsed address rather than the hostname text, so
// 0x7f000001, 127.1, [::1] and an IPv4-mapped IPv6 literal all land in the same
// bucket instead of slipping past a string comparison.
export function isPrivateAddress(input: string): boolean {
  const ip = input.replace(/^\[|\]$/g, "").toLowerCase()

  // A control character is never part of a real host, and a name built only from
  // digits and dots (127.1, 2130706433) is an address this parser will not read but
  // some resolvers still dial, so both are refused rather than probed.
  if (/[\u0000-\u0020]/.test(input)) return true

  if (isIP(ip) === 0 && /^(?:[0-9.]+|0x[0-9a-f]+|[0-9]+)$/.test(ip)) return true

  const version = isIP(ip)

  if (version === 4) {
    const [a, b] = ip.split(".").map(Number)

    if (a === 0 || a === 10 || a === 127) return true

    if (a === 169 && b === 254) return true

    if (a === 172 && b >= 16 && b <= 31) return true

    if (a === 192 && b === 168) return true

    if (a === 192 && b === 0) return true

    if (a === 100 && b >= 64 && b <= 127) return true

    if (a === 198 && (b === 18 || b === 19)) return true

    return a >= 224
  }

  if (version === 6) {
    if (ip === "::" || ip === "::1") return true

    // fe80::/10 link-local and fc00::/7 unique local.
    if (ip.startsWith("fe8") || ip.startsWith("fe9") || ip.startsWith("fea") || ip.startsWith("feb")) {
      return true
    }

    if (ip.startsWith("fc") || ip.startsWith("fd")) return true

    // Both ::ffff:127.0.0.1 and the 64:ff9b::/96 NAT64 prefix leave their IPv4 at the
    // tail, so it is read from there instead of per-spelling slicing.
    const embedded = ip.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/)

    if (embedded) return isPrivateAddress(embedded[1])

    return false
  }

  return false
}

async function probe(
  url: string,
  method: string,
  headers: Record<string, string> = {},
  body?: string,
) {
  const controller = new AbortController()

  const timer = setTimeout(() => controller.abort(), 5000)

  try {
    // Redirects are never followed: a public host answering 302 to an internal
    // address would otherwise be fetched by this server on its owner's advice.
    const res = await fetch(url, {
      method,
      headers,
      body,
      redirect: "manual",
      signal: controller.signal,
    })

    return { status: res.status, timedOut: false, error: "" }
  } catch (err: any) {
    return {
      status: 0,
      timedOut: err?.name === "AbortError",
      error: err?.cause?.code || err?.message || "unreachable",
    }
  } finally {
    clearTimeout(timer)
  }
}

interface ProviderSpec {
  label: string
  hostSuffix: string
  needsClientSecret?: boolean
  buildRequest: (
    parsedUrl: URL,
    apiKey: string,
    clientSecret: string,
  ) => { url: string; method: string; headers?: Record<string, string>; body?: string }
  isAccepted: (status: number, hasKey: boolean) => boolean
}

const PROVIDER_SPECS: Record<string, ProviderSpec> = {
  google: {
    label: "Google AI Studio",
    hostSuffix: "generativelanguage.googleapis.com",
    buildRequest: (parsedUrl, apiKey) => {
      const basePath = parsedUrl.pathname.replace(/\/+$/, "") || "/v1beta"
      return {
        url: `${parsedUrl.origin}${basePath}/models`,
        method: "GET",
        headers: apiKey ? { "x-goog-api-key": apiKey } : undefined,
      }
    },
    isAccepted: (status) => status >= 200 && status < 400,
  },
  groq: {
    label: "Groq Cloud",
    hostSuffix: "api.groq.com",
    buildRequest: (parsedUrl, apiKey) => ({
      url: `${parsedUrl.origin}/openai/v1/models`,
      method: "GET",
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : undefined,
    }),
    isAccepted: (status) => status >= 200 && status < 400,
  },
  ilovepdf: {
    label: "iLovePDF",
    hostSuffix: "api.ilovepdf.com",
    buildRequest: (parsedUrl, apiKey) => ({
      url: `${parsedUrl.origin}/v1/auth`,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: apiKey ? JSON.stringify({ public_key: apiKey }) : undefined,
    }),
    isAccepted: (status) => status >= 200 && status < 400,
  },
  tinypng: {
    label: "TinyPNG",
    hostSuffix: "api.tinify.com",
    buildRequest: (parsedUrl, apiKey) => ({
      url: `${parsedUrl.origin}/shrink`,
      method: "POST",
      headers: apiKey
        ? { Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}` }
        : undefined,
    }),
    // TinyPNG returns 400 ("Input is empty") only after Basic auth succeeds; 401 means bad/missing key.
    isAccepted: (status, hasKey) => hasKey && (status === 400 || (status >= 200 && status < 400)),
  },
  ocrspace: {
    label: "OCR.space",
    hostSuffix: "api.ocr.space",
    buildRequest: (parsedUrl, apiKey) => ({
      url: `${parsedUrl.origin}/parse/image`,
      method: "POST",
      headers: apiKey ? { apikey: apiKey } : undefined,
    }),
    // OCR.space returns 403 for invalid apikey, and 200/400 when apikey passes gateway check.
    isAccepted: (status, hasKey) => hasKey && (status === 400 || (status >= 200 && status < 400)),
  },
  adobe: {
    label: "Adobe PDF Services",
    hostSuffix: "pdf-services.adobe.io",
    needsClientSecret: true,
    buildRequest: (parsedUrl, apiKey, clientSecret) => ({
      url: `${parsedUrl.origin}/token`,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:
        apiKey && clientSecret
          ? new URLSearchParams({ client_id: apiKey, client_secret: clientSecret }).toString()
          : undefined,
    }),
    isAccepted: (status) => status >= 200 && status < 400,
  },
}

export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Credentials", "true")
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization",
  )

  const send = (status: number, payload: any) => {
    res.setHeader("Content-Type", "application/json")

    res.status?.(status)?.json?.(payload) || res.end?.(JSON.stringify(payload))
  }

  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  if (req.method !== "POST") {
    send(405, { ok: false, error: "Method not allowed" })
    return
  }

  // This route reaches out to an address the caller chooses, so it is restricted
  // to the pool editor rather than being an open URL probe for anyone.
  const admin = await requireAdmin(req).catch(() => null)

  if (!admin) {
    send(401, { ok: false, error: "An administrator session is required to test an endpoint." })
    return
  }

  try {
    let body: any = req.body

    if (!body) {
      const buffers: Buffer[] = []

      for await (const chunk of req) {
        buffers.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
      }

      body = JSON.parse(Buffer.concat(buffers).toString("utf8") || "{}")
    } else if (typeof body === "string") {
      body = JSON.parse(body || "{}")
    }

    const endpoint = body.endpoint

    if (!endpoint || endpoint.startsWith("local-browser")) {
      send(200, { ok: true, latencyMs: 1, message: "Instant (1ms). Client-side WebAssembly active." })
      return
    }

    let parsedUrl: URL

    try {
      parsedUrl = new URL(endpoint)
    } catch {
      send(400, { ok: false, error: "Invalid endpoint URL format." })
      return
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      send(400, { ok: false, error: "Only http and https protocols are permitted." })
      return
    }

    const hostname = parsedUrl.hostname.toLowerCase()

    let addresses = [hostname]

    if (isIP(hostname) === 0) {
      try {
        const records = await lookup(hostname, { all: true })

        addresses = records.map((r) => r.address)
      } catch {
        send(200, { ok: false, error: `Could not resolve ${hostname}: the endpoint does not exist.` })
        return
      }

      if (addresses.length === 0) {
        send(200, { ok: false, error: `No address recorded for ${hostname}.` })
        return
      }
    }

    if (addresses.some(isPrivateAddress)) {
      send(403, {
        ok: false,
        error: "Prohibited: Endpoint targets a protected internal, loopback, or metadata address.",
      })
      return
    }

    const start = Date.now()

    let verdict: { status: number; timedOut: boolean; error: string }
    const spec =
      typeof body.provider === "string" &&
      PROVIDER_SPECS[body.provider] &&
      hostname.endsWith(PROVIDER_SPECS[body.provider].hostSuffix)
        ? PROVIDER_SPECS[body.provider]
        : null

    let hasCredentials = false

    if (spec) {
      const submittedKey = typeof body.apiKey === "string" ? body.apiKey.trim() : ""
      const submittedSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : ""
      let apiKey = submittedKey && !submittedKey.includes("••••") ? submittedKey : ""
      let clientSecret = submittedSecret && !submittedSecret.includes("••••") ? submittedSecret : ""

      if ((!apiKey || (spec.needsClientSecret && !clientSecret)) && typeof body.id === "string" && body.id.trim()) {
        const rows = await import("../../server/_lib/db.ts")
          .then(({ query }) =>
            query<{ api_key_secret: string | null; client_secret: string | null }>(
              `select api_key_secret, client_secret from api_keys where id = $1 limit 1`,
              [body.id.trim()],
            ),
          )
          .catch(() => [])
        if (!apiKey) apiKey = rows[0]?.api_key_secret || ""
        if (!clientSecret) clientSecret = rows[0]?.client_secret || ""
      }

      hasCredentials = spec.needsClientSecret ? !!(apiKey && clientSecret) : !!apiKey
      const reqSpec = spec.buildRequest(parsedUrl, apiKey, clientSecret)
      verdict = await probe(reqSpec.url, reqSpec.method, reqSpec.headers, reqSpec.body)
    } else {
      verdict = await probe(parsedUrl.toString(), "HEAD")

      if (verdict.status === 0 && !verdict.timedOut) {
        verdict = await probe(parsedUrl.toString(), "GET")
      }
    }

    const latencyMs = Math.max(1, Date.now() - start)

    if (verdict.timedOut) {
      send(200, { ok: false, error: `Endpoint did not answer within 5 seconds (${latencyMs}ms).` })
      return
    }

    if (verdict.status === 0) {
      send(200, { ok: false, error: `No route to endpoint (${verdict.error}).` })
      return
    }

    const accepted = spec ? spec.isAccepted(verdict.status, hasCredentials) : verdict.status >= 200 && verdict.status < 400
    const failureMessage = spec
      ? hasCredentials
        ? `${spec.label} rejected the API credentials (HTTP ${verdict.status}, ${latencyMs}ms).`
        : `${spec.label} endpoint is reachable, but API credentials are required (HTTP ${verdict.status}, ${latencyMs}ms).`
      : `Reached the host, but it returned HTTP ${verdict.status} (${latencyMs}ms).`

    send(200, {
      ok: accepted,
      latencyMs,
      httpStatus: verdict.status,
      message: accepted ? `Connected & Ready (${latencyMs}ms)` : failureMessage,
    })
  } catch (err: any) {
    send(500, { ok: false, error: err?.message || "Failed to ping cloud endpoint." })
  }
}
