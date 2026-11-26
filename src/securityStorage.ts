const LEGACY_AUTH_KEYS = [
  "masterfilepro-accounts",
  "masterfilepro-credentials",
  "masterfilepro-reset-tokens",
  "masterfilepro-login-attempts",
  "masterfilepro_visitor_log",
]

function browserStorage(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null
  } catch {
    return null
  }
}

export function clearLegacyAuthStorage(): void {
  const storage = browserStorage()
  if (!storage) return
  for (const key of LEGACY_AUTH_KEYS) {
    try {
      storage.removeItem(key)
    } catch {}
  }
}

export function clearLegacyProviderSecrets(): void {
  const storage = browserStorage()
  if (!storage) return

  for (const key of ["masterfilepro-payment-gateways", "masterfilepro_cloud_apis_config_v2"]) {
    try {
      const raw = storage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        storage.removeItem(key)
        continue
      }
      const sanitized = parsed.map((item) => {
        if (!item || typeof item !== "object") return item
        const copy = { ...item } as Record<string, unknown>
        delete copy.secretKey
        delete copy.webhookSecret
        delete copy.apiKey
        delete copy.clientSecret
        return copy
      })
      storage.setItem(key, JSON.stringify(sanitized))
    } catch {
      storage.removeItem(key)
    }
  }
}
