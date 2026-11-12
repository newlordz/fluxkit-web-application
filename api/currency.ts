import type { IncomingMessage, ServerResponse } from "node:http"

// In-memory exchange rate store (persists across warm serverless invocations)
let exchangeRateUsdToGhs = 15.50
let baseCurrency = "USD"

export interface CurrencyData {
  base: string
  rate: number
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
) {
  const rate = typeof customRate === "number" && customRate > 0 ? customRate : exchangeRateUsdToGhs
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
    if (req.method === "GET") {
      const url = new URL(req.url || "", `http://${req.headers?.host || "localhost"}`)
      const amountParam = url.searchParams.get("amount")
      const fromParam = url.searchParams.get("from")
      const toParam = url.searchParams.get("to")

      // If query parameters are provided for conversion: /api/currency?amount=10&from=USD&to=GHS
      if (amountParam !== null) {
        const result = calculateConversion(
          parseFloat(amountParam),
          fromParam || "USD",
          toParam || "GHS",
        )
        res.setHeader("Content-Type", "application/json")
        res.status?.(200)?.json?.(result) ||
          res.end?.(JSON.stringify(result))
        return
      }

      // Default GET: return system currency info & current exchange rates
      const data: CurrencyData = {
        base: baseCurrency,
        rate: exchangeRateUsdToGhs,
        currencies: {
          USD: { code: "USD", symbol: "$", name: "US Dollar", rateFromUSD: 1 },
          GHS: { code: "GHS", symbol: "GH₵", name: "Ghanaian Cedi", rateFromUSD: exchangeRateUsdToGhs },
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
      if (typeof body === "string") {
        try {
          body = JSON.parse(body)
        } catch {
          body = {}
        }
      }

      // If updating the backend exchange rate
      if (body?.action === "set_rate" && typeof body?.rate === "number" && body.rate > 0) {
        exchangeRateUsdToGhs = Math.round(body.rate * 100) / 100
        const resp = {
          success: true,
          message: `Backend exchange rate updated to 1 USD = ${exchangeRateUsdToGhs} GHS.`,
          rate: exchangeRateUsdToGhs,
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
      const customRate = body?.rate ? Number(body.rate) : undefined

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
