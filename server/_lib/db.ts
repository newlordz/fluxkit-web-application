import type { IncomingMessage, ServerResponse } from "node:http"
import { Pool } from "pg"

// package.json sets "type": "module", so Vercel emits these handlers as ES modules and
// every relative import here and in api/ must carry its `.ts` extension to resolve.

// Vercel's Node.js runtime leaves query parsing to the handler, so the dev
// middleware injects `query` and production falls back to the raw URL.
export type ApiRequest = IncomingMessage & { query?: Record<string, string>; body?: any }

// Postgres via the Supavisor transaction pooler: serverless instances open many
// short-lived connections, so the pool stays tiny and queries are parameterised.
let pool: Pool | null = null

function createPool(): Pool {
  const connectionString = process.env.SUPABASE_DB_URL
  if (!connectionString) {
    throw new Error("SUPABASE_DB_URL is not set (Vercel project environment variable)")
  }
  const fresh = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 2,
    idleTimeoutMillis: 8000,
    connectionTimeoutMillis: 5000,
  })
  // Supavisor closes idle connections without warning. An 'error' event with no
  // listener is thrown by the emitter and fails the whole invocation, rather
  // than the one query that happened to pick up the dead client.
  fresh.on("error", () => {
    // pg removes the client that errored; the next acquire opens a fresh one.
  })
  return fresh
}

export function getPool(): Pool {
  if (!pool) pool = createPool()
  return pool
}

// The pooler can hand back a socket it has already closed, so the first failure
// of a request is retried against a rebuilt pool instead of reaching the user.
function isStaleConnection(err: unknown): boolean {
  const message = String((err as any)?.message || "")
  return /connection terminated|server closed the connection unexpectedly|ECONNRESET|ETIMEDOUT|ssl connection has been closed|cannot execute a request during a aborted transaction/i.test(
    message,
  )
}

function discardPool() {
  const dead = pool
  pool = null
  // Deliberately not awaited: end() waits for outstanding checkouts, and the
  // retry must not stall behind the connection that just failed.
  dead?.end().catch(() => {})
}

async function withStaleRetry<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch (err) {
    if (!isStaleConnection(err)) throw err
    discardPool()
    // Measured against the live pooler through a socket cut mid-query: an
    // immediate reconnect, and one 250 ms later, both fail again with the same
    // stale error; 600 ms gets a working connection. Paid only on that path.
    await new Promise((resolve) => setTimeout(resolve, 600))
    return run()
  }
}

export async function query<T = Record<string, any>>(text: string, params: any[] = []): Promise<T[]> {
  return withStaleRetry(async () => {
    const res = await getPool().query(text, params)
    return res.rows as T[]
  })
}

export async function transact<T>(fn: (sql: (text: string, params?: any[]) => Promise<T[]>) => Promise<T>): Promise<T> {
  return withStaleRetry(() => runTransaction(fn))
}

async function runTransaction<T>(
  fn: (sql: (text: string, params?: any[]) => Promise<T[]>) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query("begin")
    const run = async (text: string, params: any[] = []) => {
      const r = await client.query(text, params)
      return r.rows
    }
    const out = await fn(run)
    await client.query("commit")
    return out
  } catch (err) {
    await client.query("rollback").catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

export function cors(req: IncomingMessage, res: ServerResponse) {
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS,POST,PUT,DELETE")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  )
  res.setHeader("Access-Control-Allow-Credentials", "true")
  const origin = req.headers.origin
  if (typeof origin === "string" && /^https?:\/\/([a-z0-9-]+\.)*(masterfilepro\.com|vercel\.app|localhost(:\d+)?)(:.*)?$/i.test(origin)) {
    res.setHeader("Vary", "Origin")
    res.setHeader("Access-Control-Allow-Origin", origin)
  } else {
    res.setHeader("Vary", "Origin")
    res.setHeader("Access-Control-Allow-Origin", "null")
  }
}

export function json(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status
  res.setHeader("Content-Type", "application/json")
  res.end(JSON.stringify(payload))
}

export async function readBody(req: IncomingMessage, maxBytes = 1024 * 1024): Promise<any> {
  if ((req as any).body && typeof (req as any).body === "object") return (req as any).body
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer)
    total += buf.length
    if (total > maxBytes) throw new Error("Payload too large")
    chunks.push(buf)
  }
  const raw = Buffer.concat(chunks).toString("utf-8")
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

// Third-party credentials must never leave the server, not even masked in full.
export function redactSecret(value: string | null | undefined): string | null {
  if (!value) return null
  if (value.length <= 8) return "••••"
  return value.slice(0, 3) + "••••" + value.slice(-4)
}
