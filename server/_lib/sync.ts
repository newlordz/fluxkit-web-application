import { Pool } from "pg"
import { isNeonHost, queryNeonHttp } from "./db.ts"

interface SyncTableSpec {
  name: string
  conflictCol: string
  updatedAtCol: string | null
  columns: string[]
  jsonCols?: string[]
  specialConflictSet?: string
}

const SYNC_TABLES: SyncTableSpec[] = [
  {
    name: "users",
    conflictCol: "id",
    updatedAtCol: "updated_at",
    columns: [
      "id", "email", "name", "avatar", "provider", "role",
      "subscription_tier", "pro_status", "unlocked_tools",
      "password_salt", "password_hash", "must_reset_password",
      "failed_attempts", "locked_until", "created_at", "last_login_at", "updated_at",
    ],
  },
  {
    name: "sessions",
    conflictCol: "token",
    updatedAtCol: null,
    columns: ["token", "user_id", "created_at", "expires_at", "revoked_at"],
    specialConflictSet: "revoked_at = coalesce(excluded.revoked_at, sessions.revoked_at)",
  },
  {
    name: "payment_gateways",
    conflictCol: "id",
    updatedAtCol: "updated_at",
    columns: [
      "id", "name", "description", "enabled", "mode",
      "public_key", "secret_key", "webhook_secret", "currency",
      "notes", "endpoint_url", "test_status", "last_tested_at",
      "test_message", "updated_at",
    ],
  },
  {
    name: "tools",
    conflictCol: "key",
    updatedAtCol: "updated_at",
    columns: ["key", "tier", "price", "updated_at"],
  },
  {
    name: "api_keys",
    conflictCol: "id",
    updatedAtCol: "updated_at",
    columns: [
      "id", "name", "provider", "category", "priority", "enabled",
      "description", "dashboard_url", "api_key_secret", "client_secret",
      "endpoint", "monthly_quota", "status", "is_free_tier",
      "free_credit_reset_day", "created_at", "updated_at",
    ],
  },
  {
    name: "settings",
    conflictCol: "key",
    updatedAtCol: "updated_at",
    columns: ["key", "value", "updated_at"],
    jsonCols: ["value"],
  },
  {
    name: "showcases",
    conflictCol: "id",
    updatedAtCol: "updated_at",
    columns: ["id", "owner_user_id", "title", "published", "payload", "created_at", "updated_at"],
    jsonCols: ["payload"],
  },
  {
    name: "visitor_passes",
    conflictCol: "id",
    updatedAtCol: null,
    columns: ["id", "owner_user_id", "event", "payload", "created_at"],
    jsonCols: ["payload"],
  },
  {
    name: "payments",
    conflictCol: "reference",
    updatedAtCol: "updated_at",
    columns: ["reference", "user_id", "email", "amount", "currency", "status", "gateway", "tool", "metadata", "created_at", "updated_at"],
    jsonCols: ["metadata"],
  },
]

interface DbClient {
  query: <T = Record<string, any>>(text: string, params?: any[]) => Promise<T[]>
  close: () => Promise<void>
}

function makeClient(connectionString: string): DbClient {
  if (isNeonHost(connectionString)) {
    return {
      query: (text, params = []) => queryNeonHttp(connectionString, text, params),
      close: async () => {},
    }
  }
  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 8000,
    connectionTimeoutMillis: 8000,
  })
  pool.on("error", () => {})
  return {
    query: async (text, params = []) => (await pool.query(text, params)).rows,
    close: () => pool.end().catch(() => {}),
  }
}

function buildUpsertSql(spec: SyncTableSpec): string {
  const cols = spec.columns.join(", ")
  const placeholders = spec.columns.map((_, i) => `$${i + 1}`).join(", ")
  if (spec.specialConflictSet) {
    return `insert into ${spec.name} (${cols}) values (${placeholders}) on conflict (${spec.conflictCol}) do update set ${spec.specialConflictSet}`
  }
  if (!spec.updatedAtCol) {
    return `insert into ${spec.name} (${cols}) values (${placeholders}) on conflict (${spec.conflictCol}) do nothing`
  }
  const updates = spec.columns
    .filter((c) => c !== spec.conflictCol)
    .map((c) => `${c} = excluded.${c}`)
    .join(", ")
  return `insert into ${spec.name} (${cols}) values (${placeholders}) on conflict (${spec.conflictCol}) do update set ${updates} where excluded.${spec.updatedAtCol} > ${spec.name}.${spec.updatedAtCol}`
}

async function syncDirection(
  source: DbClient,
  target: DbClient,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  for (const spec of SYNC_TABLES) {
    const rows = await source.query(`select ${spec.columns.join(", ")} from ${spec.name}`)
    if (rows.length === 0) {
      counts[spec.name] = 0
      continue
    }
    const upsertSql = buildUpsertSql(spec)
    const jsonSet = new Set(spec.jsonCols || [])
    let synced = 0
    for (const row of rows) {
      const params = spec.columns.map((c) => {
        const val = row[c]
        if (jsonSet.has(c) && val !== null && val !== undefined && typeof val !== "string") {
          return JSON.stringify(val)
        }
        return val ?? null
      })
      await target.query(upsertSql, params)
      synced += 1
    }
    counts[spec.name] = synced
  }
  return counts
}

export interface SyncResult {
  ok: boolean
  primaryToFallback: Record<string, number>
  fallbackToPrimary: Record<string, number>
  durationMs: number
}

let inFlight: Promise<SyncResult> | null = null

/**
 * Bidirectionally reconciles all application tables between primary (Supabase)
 * and fallback (Neon) using newest-`updated_at`-wins upserts.
 */
export async function syncDatabases(options?: {
  primaryUrl?: string
  fallbackUrl?: string
}): Promise<SyncResult> {
  if (inFlight) return inFlight

  const primaryUrl = options?.primaryUrl || process.env.SUPABASE_DB_URL
  const fallbackUrl = options?.fallbackUrl || process.env.FALLBACK_DB_URL
  if (!primaryUrl || !fallbackUrl) {
    throw new Error("Both SUPABASE_DB_URL and FALLBACK_DB_URL must be configured to sync.")
  }

  inFlight = (async () => {
    const start = Date.now()
    const primary = makeClient(primaryUrl)
    const fallback = makeClient(fallbackUrl)
    try {
      const primaryToFallback = await syncDirection(primary, fallback)
      const fallbackToPrimary = await syncDirection(fallback, primary)
      return {
        ok: true,
        primaryToFallback,
        fallbackToPrimary,
        durationMs: Date.now() - start,
      }
    } finally {
      await Promise.all([primary.close(), fallback.close()])
      inFlight = null
    }
  })()

  return inFlight
}
