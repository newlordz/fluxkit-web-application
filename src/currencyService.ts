/**
 * FluxKit Currency & Backend Conversion Service
 * Manages currency selection (USD vs GHS / Ghanaian Cedi),
 * communicates with the backend conversion API (/api/currency and /api/convert),
 * and provides reactive updates across the entire application.
 */

export type SupportedCurrency = "USD" | "GHS"

export interface CurrencyConfig {
  code: SupportedCurrency
  symbol: string
  name: string
  flag: string
  rateFromUSD: number
}

export interface BackendConversionResult {
  success: boolean
  from: SupportedCurrency
  to: SupportedCurrency
  originalAmount: number
  convertedAmount: number
  exchangeRate: number
  formattedOriginal: string
  formattedConverted: string
  timestamp: string
  source: "backend" | "offline-fallback"
}

const ACTIVE_CURRENCY_KEY = "fluxkit-active-currency"
const EXCHANGE_RATE_KEY = "fluxkit-usd-ghs-rate"
const DEFAULT_USD_TO_GHS_RATE = 15.50 // 1 USD = 15.50 Ghanaian Cedis (GH₵)

export const CURRENCY_METADATA: Record<SupportedCurrency, CurrencyConfig> = {
  USD: {
    code: "USD",
    symbol: "$",
    name: "US Dollar",
    flag: "🇺🇸",
    rateFromUSD: 1,
  },
  GHS: {
    code: "GHS",
    symbol: "GH₵",
    name: "Ghanaian Cedi",
    flag: "🇬🇭",
    rateFromUSD: DEFAULT_USD_TO_GHS_RATE,
  },
}

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      return window.localStorage
    } catch {}
  }
  return null
}

let inMemoryActiveCurrency: SupportedCurrency = "USD"
let inMemoryExchangeRate: number = DEFAULT_USD_TO_GHS_RATE

/**
 * Returns the currently active currency ('USD' or 'GHS')
 */
export function getActiveCurrency(): SupportedCurrency {
  const storage = getStorage()
  if (storage) {
    try {
      const val = storage.getItem(ACTIVE_CURRENCY_KEY)
      if (val === "GHS" || val === "USD") {
        return val
      }
    } catch {}
  }
  return inMemoryActiveCurrency
}

/**
 * Changes the active display currency and broadcasts the change to all components
 */
export function setActiveCurrency(currency: SupportedCurrency): void {
  inMemoryActiveCurrency = currency
  const storage = getStorage()
  if (storage) {
    try {
      storage.setItem(ACTIVE_CURRENCY_KEY, currency)
    } catch {}
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("fluxkit-currency-changed", { detail: currency }),
    )
  }
}

/**
 * Returns current exchange rate (USD -> GHS)
 */
export function getExchangeRate(): number {
  const storage = getStorage()
  if (storage) {
    try {
      const stored = storage.getItem(EXCHANGE_RATE_KEY)
      if (stored) {
        const num = parseFloat(stored)
        if (!isNaN(num) && num > 0) return num
      }
    } catch {}
  }
  return inMemoryExchangeRate
}

/**
 * Sets the exchange rate and persists it
 */
export function setExchangeRate(rate: number): void {
  const clean = Math.max(0.01, Math.round(Number(rate) * 100) / 100)
  inMemoryExchangeRate = clean
  const storage = getStorage()
  if (storage) {
    try {
      storage.setItem(EXCHANGE_RATE_KEY, clean.toString())
    } catch {}
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("fluxkit-rate-changed", { detail: clean }),
    )
  }
}

/**
 * Perform backend currency conversion (Dollar <-> Cedi)
 * Sends request to backend /api/currency or /api/convert endpoint,
 * with deterministic offline fallback if server is unreachable.
 */
export async function convertCurrencyOnBackend(
  amount: number,
  from: SupportedCurrency,
  to: SupportedCurrency,
  customRate?: number,
): Promise<BackendConversionResult> {
  const cleanAmount = isNaN(Number(amount)) ? 0 : Number(amount)
  const currentRate = customRate || getExchangeRate()

  // Attempt backend API call
  try {
    const res = await fetch("/api/currency", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: cleanAmount,
        from,
        to,
        rate: currentRate,
      }),
    })

    if (res.ok) {
      const data = await res.json()
      if (data && typeof data.convertedAmount === "number") {
        return {
          ...data,
          source: "backend",
        }
      }
    } else {
      // Try GET query conversion route
      const getRes = await fetch(
        `/api/currency?amount=${cleanAmount}&from=${from}&to=${to}`,
      )
      if (getRes.ok) {
        const data = await getRes.json()
        if (data && typeof data.convertedAmount === "number") {
          return {
            ...data,
            source: "backend",
          }
        }
      }
    }
  } catch {
    // If backend endpoint is offline or running in mock test mode, continue to fallback
  }

  // Graceful, mathematically sound offline fallback
  let converted = cleanAmount
  if (from === "USD" && to === "GHS") {
    converted = Math.round(cleanAmount * currentRate * 100) / 100
  } else if (from === "GHS" && to === "USD") {
    converted = Math.round((cleanAmount / currentRate) * 100) / 100
  }

  const formattedOriginal =
    from === "GHS"
      ? `GH₵ ${cleanAmount.toFixed(2)} GHS`
      : `$${cleanAmount.toFixed(2)} USD`

  const formattedConverted =
    to === "GHS"
      ? `GH₵ ${converted.toFixed(2)} GHS`
      : `$${converted.toFixed(2)} USD`

  return {
    success: true,
    from,
    to,
    originalAmount: cleanAmount,
    convertedAmount: converted,
    exchangeRate: currentRate,
    formattedOriginal,
    formattedConverted,
    timestamp: new Date().toISOString(),
    source: "offline-fallback",
  }
}

/**
 * Formats a monetary value according to the given or active currency
 */
export function formatCurrencyValue(
  amount: number,
  currency?: SupportedCurrency,
): string {
  const curr = currency || getActiveCurrency()
  const clean = isNaN(Number(amount)) ? 0 : Number(amount)
  if (curr === "GHS") {
    return `GH₵ ${clean.toFixed(2)}`
  }
  return `$${clean.toFixed(2)}`
}

/**
 * Convert base USD amount to active or target currency
 */
export function convertFromUsd(
  usdAmount: number,
  targetCurrency?: SupportedCurrency,
  customRate?: number,
): number {
  const target = targetCurrency || getActiveCurrency()
  const rate = customRate || getExchangeRate()
  if (target === "GHS") {
    return Math.round(usdAmount * rate * 100) / 100
  }
  return usdAmount
}

/**
 * Convert target currency amount to base USD
 */
export function convertToUsd(
  amount: number,
  sourceCurrency: SupportedCurrency,
  customRate?: number,
): number {
  const rate = customRate || getExchangeRate()
  if (sourceCurrency === "GHS") {
    return Math.round((amount / rate) * 100) / 100
  }
  return amount
}
