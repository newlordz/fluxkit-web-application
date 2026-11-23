import { query } from "./db.ts"

// Provider credentials resolve server-side only. A browser-supplied key is never
// trusted: it would let anyone route usage (and cost) through this project's quota.
const cache = new Map<string, { value: unknown; expiresAt: number }>()
const CACHE_MS = 60_000

export async function getProviderSecret(
  provider: string,
  field: "apiKey" | "clientSecret",
  envNames: string[] = [],
): Promise<string> {
  const derived = `${provider.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_${field === "apiKey" ? "API_KEY" : "CLIENT_SECRET"}`
  for (const name of [...envNames, derived]) {
    const value = process.env[name] || process.env[`VITE_${name}`]
    if (value) return value
  }

  const cacheKey = `${provider}:${field}`
  const hit = cache.get(cacheKey)
  if (hit && hit.expiresAt > Date.now()) return hit.value as string

  const column = field === "apiKey" ? "api_key_secret" : "client_secret"
  const rows = await query<{ secret: string | null }>(
    `select ${column} as secret
       from api_keys
      where provider = $1 and enabled
      order by priority asc
      limit 1`,
    [provider],
  )
  const value = rows[0]?.secret ?? ""
  cache.set(cacheKey, { value, expiresAt: Date.now() + CACHE_MS })
  return value
}

export async function getAdobeCredentials(): Promise<{ clientId: string; clientSecret: string }> {
  const [clientId, clientSecret] = await Promise.all([
    getProviderSecret("adobe", "apiKey", ["ADOBE_CLIENT_ID"]),
    getProviderSecret("adobe", "clientSecret", ["ADOBE_CLIENT_SECRET"]),
  ])
  return { clientId, clientSecret }
}

export async function getILovePdfCredentials(): Promise<{ publicKey: string; secretKey: string }> {
  const [publicKey, secretKey] = await Promise.all([
    getProviderSecret("ilovepdf", "apiKey", ["ILOVEPDF_PUBLIC_KEY"]),
    getProviderSecret("ilovepdf", "clientSecret", ["ILOVEPDF_SECRET_KEY"]),
  ])
  return { publicKey, secretKey }
}

export type CallOutcome = "success" | "error"

/** Append-only ledger insert; monthly totals derive from this, never from a stored counter. */
export async function recordApiCall(
  provider: string,
  tool: string,
  userId: string | null,
  status: CallOutcome,
): Promise<void> {
  try {
    await query(
      `insert into api_usage (api_key_id, tool, user_id, status)
       select id, $2, $3, $4 from api_keys where provider = $1 order by priority asc limit 1`,
      [provider, tool, userId, status],
    )
  } catch {
    // Usage accounting must never fail a user's document job.
  }
}

/** Quota check against the ledger for the current calendar month. */
export async function isProviderOutOfQuota(provider: string): Promise<boolean> {
  const rows = await query<{ monthly_quota: number; used: number }>(
    `select k.monthly_quota,
            coalesce((select count(*)::int from api_usage u
                       where u.api_key_id = k.id and u.created_at >= date_trunc('month', now())), 0) as used
       from api_keys k
      where k.provider = $1 and k.enabled
      order by k.priority asc
      limit 1`,
    [provider],
  )
  const row = rows[0]
  if (!row || !row.monthly_quota) return false
  return row.used >= row.monthly_quota
}

export interface GatewayConfig {
  secretKey: string
  publicKey: string
  currency: string
  mode: string
}

/** Payment gateway credentials come from the gateways table or the environment, never from the client. */
export async function getGatewayConfig(
  id: string,
  envSecretNames: string[] = [],
): Promise<GatewayConfig> {
  const cacheKey = `gateway:${id}`
  const hit = cache.get(cacheKey)
  if (hit && hit.expiresAt > Date.now()) return hit.value as GatewayConfig

  const [row] = await query<any>(
    `select secret_key, public_key, currency, mode from payment_gateways where id = $1`,
    [id],
  )

  let secretKey = row?.secret_key || ""
  for (const name of envSecretNames) {
    if (process.env[name]) {
      secretKey = process.env[name] as string
      break
    }
  }

  const config: GatewayConfig = {
    secretKey,
    publicKey: row?.public_key || "",
    currency: row?.currency || "GHS",
    mode: row?.mode || "test",
  }
  cache.set(cacheKey, { value: config, expiresAt: Date.now() + CACHE_MS })
  return config
}
