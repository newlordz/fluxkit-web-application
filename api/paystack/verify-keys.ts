export default async function handler(req: any, res: any) {
  res.setHeader("Access-Control-Allow-Credentials", "true")
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization")

  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  res.setHeader("Content-Type", "application/json")

  if (req.method !== "POST") {
    const payload = { ok: false, message: "Method not allowed" }
    res.status?.(405)?.json?.(payload) || res.end?.(JSON.stringify(payload))
    return
  }

  try {
    let body: any = req.body
    if (!body) {
      const buffers: Buffer[] = []
      for await (const chunk of req) {
        buffers.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk)
      }
      const data = Buffer.concat(buffers).toString("utf-8")
      if (data) {
        try {
          body = JSON.parse(data)
        } catch {}
      }
    } else if (typeof body === "string") {
      try {
        body = JSON.parse(body)
      } catch {}
    }

    const secretKey = (body?.secretKey || "").trim()
    const publicKey = (body?.publicKey || "").trim()

    if (!secretKey || !publicKey) {
      const payload = {
        ok: false,
        message: "Both Secret Key and Public Key are required.",
      }
      res.status?.(400)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      return
    }

    if (!secretKey.startsWith("sk_test_") && !secretKey.startsWith("sk_live_")) {
      const payload = {
        ok: false,
        message:
          "Invalid Paystack Secret Key format. Must start with sk_test_ or sk_live_.",
      }
      res.status?.(400)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      return
    }

    // Call official Paystack API to verify the secret key
    const startTime = Date.now()
    const paystackRes = await fetch(
      "https://api.paystack.co/transaction?perPage=1",
      {
        headers: {
          Authorization: `Bearer ${secretKey}`,
          "Content-Type": "application/json",
        },
      },
    )
    const latencyMs = Date.now() - startTime
    const paystackData: any = await paystackRes.json().catch(() => ({}))

    if (paystackRes.ok && paystackData.status) {
      const isTest = secretKey.startsWith("sk_test_")
      const payload = {
        ok: true,
        latencyMs,
        message: `Paystack API connected successfully (${latencyMs}ms). Authentication verified in ${isTest ? "TEST" : "LIVE"} mode.`,
      }
      res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      return
    } else {
      const msg =
        paystackData?.message ||
        "Paystack authorization failed with provided keys."
      const payload = { ok: false, message: msg }
      res.status?.(401)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      return
    }
  } catch (err: any) {
    const payload = {
      ok: false,
      message: `Failed to reach Paystack server: ${err?.message || "network error"}`,
    }
    res.status?.(500)?.json?.(payload) || res.end?.(JSON.stringify(payload))
  }
}
