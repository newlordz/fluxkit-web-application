import { query } from "../server/_lib/db.ts"
import { requireAdmin } from "../server/_lib/auth.ts"

const DEFAULT_USD_TO_GHS_RATE = 11.78
let baseCurrency = "USD"

// In-memory cache for live market rate with 10-minute TTL
let cachedLiveRate: { rate: number; timestamp: number } | null = null
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

async function getSettings(): Promise<{ exchangeRate?: number; customExchangeRate?: number }> {
  try {
    const rows = await query<{ key: string; value: any }>(`select key, value from settings where key = any($1)`, [
      ["exchange_rate", "custom_exchange_rate"],
    ])
    const out: { exchangeRate?: number; customExchangeRate?: number } = {}
    for (const row of rows) {
      if (row.key === "exchange_rate") out.exchangeRate = Number(row.value?.rate) || undefined
      if (row.key === "custom_exchange_rate") out.customExchangeRate = Number(row.value?.rate) || undefined
    }
    return out
  } catch {
    return {}
  }
}

async function saveSetting(key: string, value: unknown): Promise<void> {
  await query(
    `insert into settings (key, value, updated_at) values ($1, $2::jsonb, now())
     on conflict (key) do update set value = excluded.value, updated_at = now()`,
    [key, JSON.stringify(value)],
  )
}

async function fetchLiveMarketRate(): Promise<number | null> {
  // Use in-memory cache if fresh
  if (cachedLiveRate && Date.now() - cachedLiveRate.timestamp < CACHE_TTL_MS) {
    return cachedLiveRate.rate
  }

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 4000)
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      signal: controller.signal,
    })
    clearTimeout(timer)

    if (res.ok) {
      const data = await res.json()
      const liveGhs = data?.rates?.GHS
      if (typeof liveGhs === "number" && liveGhs > 0) {
        const rounded = Math.round(liveGhs * 100) / 100
        cachedLiveRate = { rate: rounded, timestamp: Date.now() }
        return rounded
      }
    }
  } catch {}

  return null
}

async function resolveActiveRate(): Promise<{ rate: number; isLive: boolean; liveRate: number | null }> {
  const db = await getSettings()
  const live = await fetchLiveMarketRate()

  // If admin explicitly saved a custom override rate
  if (typeof db.customExchangeRate === "number" && db.customExchangeRate > 0) {
    return {
      rate: db.customExchangeRate,
      isLive: false,
      liveRate: live,
    }
  }

  // Otherwise, use real-time market rate
  if (live && live > 0) {
    return {
      rate: live,
      isLive: true,
      liveRate: live,
    }
  }

  // Fallback to stored rate or default
  const storedRate = typeof db.exchangeRate === "number" ? db.exchangeRate : DEFAULT_USD_TO_GHS_RATE
  return {
    rate: storedRate,
    isLive: false,
    liveRate: null,
  }
}

export interface CurrencyData {
  base: string
  rate: number
  isLive: boolean
  liveMarketRate: number | null
  currencies: {
    USD: { code: string; symbol: string; name: string; rateFromUSD: number }
    GHS: { code: string; symbol: string; name: string; rateFromUSD: number }
  }
  updatedAt: string
}

export function calculateConversion(
  amount: number,
  from: string,
  to: string,
  customRate?: number,
  fallbackRate = DEFAULT_USD_TO_GHS_RATE,
) {
  const rate = typeof customRate === "number" && customRate > 0 ? customRate : fallbackRate
  const cleanAmount = isNaN(Number(amount)) ? 0 : Number(amount)
  const normFrom = (from || "USD").toUpperCase()
  const normTo = (to || "GHS").toUpperCase()

  let converted = cleanAmount

  if (normFrom === "USD" && normTo === "GHS") {
    converted = Math.round(cleanAmount * rate * 100) / 100
  } else if (normFrom === "GHS" && normTo === "USD") {
    converted = Math.round((cleanAmount / rate) * 100) / 100
  } else {
    converted = cleanAmount
  }

  const formattedOriginal =
    normFrom === "GHS"
      ? `GH₵ ${cleanAmount.toFixed(2)} GHS`
      : `$${cleanAmount.toFixed(2)} USD`

  const formattedConverted =
    normTo === "GHS"
      ? `GH₵ ${converted.toFixed(2)} GHS`
      : `$${converted.toFixed(2)} USD`

  return {
    success: true,
    from: normFrom,
    to: normTo,
    originalAmount: cleanAmount,
    convertedAmount: converted,
    exchangeRate: rate,
    formattedOriginal,
    formattedConverted,
    timestamp: new Date().toISOString(),
  }
}

export default async function handler(req: any, res: any) {
  // CORS Headers
  res.setHeader("Access-Control-Allow-Credentials", "true")
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,PATCH,DELETE,POST,PUT")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version",
  )

  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  try {
    const { rate: activeRate, isLive, liveRate } = await resolveActiveRate()

    if (req.method === "GET") {
      const url = new URL(req.url || "", `http://${req.headers?.host || "localhost"}`)
      const amountParam = url.searchParams.get("amount")
      const fromParam = url.searchParams.get("from")
      const toParam = url.searchParams.get("to")
      const forceLive = url.searchParams.get("live") === "true"

      let rateToUse = activeRate
      if (forceLive) {
        const freshLive = await fetchLiveMarketRate()
        if (freshLive) rateToUse = freshLive
      }

      // If query parameters are provided for conversion: /api/currency?amount=10&from=USD&to=GHS
      if (amountParam !== null) {
        const result = calculateConversion(
          parseFloat(amountParam),
          fromParam || "USD",
          toParam || "GHS",
          rateToUse,
        )
        res.setHeader("Content-Type", "application/json")
        res.status?.(200)?.json?.(result) ||
          res.end?.(JSON.stringify(result))
        return
      }

      // Default GET: return system currency info & current exchange rates
      const data: CurrencyData = {
        base: baseCurrency,
        rate: rateToUse,
        isLive,
        liveMarketRate: liveRate,
        currencies: {
          USD: { code: "USD", symbol: "$", name: "US Dollar", rateFromUSD: 1 },
          GHS: { code: "GHS", symbol: "GH₵", name: "Ghanaian Cedi", rateFromUSD: rateToUse },
        },
        updatedAt: new Date().toISOString(),
      }

      res.setHeader("Content-Type", "application/json")
      res.status?.(200)?.json?.(data) ||
        res.end?.(JSON.stringify(data))
      return
    }

    if (req.method === "POST") {
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

      // Both POST actions change platform pricing inputs, so they are admin-only.
      const actor = await requireAdmin(req)
      if (!actor) {
        const denied = { success: false, message: "Administrator sign-in required." }
        res.setHeader("Content-Type", "application/json")
        res.status?.(403)?.json?.(denied) || res.end?.(JSON.stringify(denied))
        return
      }

      // Action: Force refresh live market rate
      if (body?.action === "fetch_live" || body?.action === "sync_live") {
        cachedLiveRate = null // clear cache
        const freshLive = await fetchLiveMarketRate()
        const targetRate = freshLive || activeRate

        // Reset any custom override so live market tracking resumes
        await saveSetting("custom_exchange_rate", { rate: null })
        await saveSetting("exchange_rate", { rate: targetRate })

        const resp = {
          success: true,
          rate: targetRate,
          isLive: true,
          liveMarketRate: targetRate,
          message: `Synchronized with live foreign exchange market: 1 USD = ${targetRate} GHS.`,
          updatedAt: new Date().toISOString(),
        }
        res.setHeader("Content-Type", "application/json")
        res.status?.(200)?.json?.(resp) ||
          res.end?.(JSON.stringify(resp))
        return
      }

      // Action: Updating/customizing the exchange rate
      if (body?.action === "set_rate" && typeof body?.rate === "number" && body.rate > 0) {
        const cleanRate = Math.round(body.rate * 100) / 100
        await saveSetting("custom_exchange_rate", { rate: cleanRate })
        await saveSetting("exchange_rate", { rate: cleanRate })

        const resp = {
          success: true,
          message: `Backend exchange rate set to 1 USD = ${cleanRate} GHS.`,
          rate: cleanRate,
          isLive: false,
          liveMarketRate: liveRate,
          updatedAt: new Date().toISOString(),
        }
        res.setHeader("Content-Type", "application/json")
        res.status?.(200)?.json?.(resp) ||
          res.end?.(JSON.stringify(resp))
        return
      }

      // Standard conversion request: { amount: 4.99, from: "USD", to: "GHS" }
      const amount = Number(body?.amount ?? 0)
      const from = body?.from || "USD"
      const to = body?.to || "GHS"
      const customRate = body?.rate ? Number(body.rate) : activeRate

      const result = calculateConversion(amount, from, to, customRate)
      res.setHeader("Content-Type", "application/json")
      res.status?.(200)?.json?.(result) ||
        res.end?.(JSON.stringify(result))
      return
    }

    res.status?.(405)?.json?.({ error: "Method not allowed" }) ||
      res.end?.(JSON.stringify({ error: "Method not allowed" }))
  } catch (err: any) {
    res.status?.(500)?.json?.({ error: err?.message || "Internal server error" }) ||
      res.end?.(JSON.stringify({ error: err?.message || "Internal server error" }))
  }
}
