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

async function probe(url: string, method: string) {
  const controller = new AbortController()

  const timer = setTimeout(() => controller.abort(), 5000)

  try {
    // Redirects are never followed: a public host answering 302 to an internal
    // address would otherwise be fetched by this server on its owner's advice.
    const res = await fetch(url, { method, redirect: "manual", signal: controller.signal })

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

    let verdict = await probe(parsedUrl.toString(), "HEAD")

    if (verdict.status === 0 && !verdict.timedOut) {
      verdict = await probe(parsedUrl.toString(), "GET")
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

    const accepted = verdict.status >= 200 && verdict.status < 400

    send(200, {
      ok: accepted,
      latencyMs,
      httpStatus: verdict.status,
      message: accepted
        ? `Connected & Ready (${latencyMs}ms)`
        : `Reached the host, but it returned HTTP ${verdict.status} (${latencyMs}ms).`,
    })
  } catch (err: any) {
    send(500, { ok: false, error: err?.message || "Failed to ping cloud endpoint." })
  }
}
