import type { IncomingMessage } from "node:http"
import crypto from "node:crypto"
import { promisify } from "node:util"
import { query, queryAuthoritative, transact } from "./db.ts"

const SESSION_DAYS = 30
const MAX_FAILED_ATTEMPTS = 5
const LOCK_MINUTES = 15
const RESET_MINUTES = 15
const MAX_RESET_ATTEMPTS = 5
const SCRYPT = "scrypt"
const SCRYPT_COST = 16384
const SCRYPT_BLOCK = 8
const SCRYPT_PARALLEL = 1
const SCRYPT_KEYLEN = 64
const DUMMY_HASH = `scrypt$${SCRYPT_COST}$${SCRYPT_BLOCK}$${SCRYPT_PARALLEL}$c2FsdA==$${"0".repeat(SCRYPT_KEYLEN * 2)}`

const scrypt = promisify(crypto.scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>

type Sql = (text: string, params?: any[]) => Promise<any[]>

type CredentialRow = {
  password_salt: string | null
  password_hash: string | null
}

export interface AuthUser {
  id: string
  email: string
  name: string
  provider?: "email" | "google"
  google_sub?: string | null
  role: "admin" | "sub-admin" | "user"
  subscription_tier: "standard" | "pro"
  pro_status: "none" | "pending" | "active"
  unlocked_tools: string[]
  must_reset_password: boolean
}

type UserCredential = AuthUser & CredentialRow & {
  avatar: string | null
  failed_attempts: number
  locked_until: string | null
}

export function hashPassword(password: string, salt: string): string {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex")
}

export function generateSalt(): string {
  return `salt_${Date.now().toString(36)}_${crypto.randomBytes(8).toString("hex")}`
}

export async function hashPasswordScrypt(password: string, salt: string): Promise<string> {
  const key = await scrypt(password, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_COST,
    r: SCRYPT_BLOCK,
    p: SCRYPT_PARALLEL,
    maxmem: 128 * 1024 * 1024,
  })
  return `${SCRYPT}$${SCRYPT_COST}$${SCRYPT_BLOCK}$${SCRYPT_PARALLEL}$${Buffer.from(salt, "utf8").toString("base64")}$${key.toString("hex")}`
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"))
}

async function scryptMatch(stored: string, password: string): Promise<boolean> {
  const [, n, r, p, saltB64, digest] = stored.split("$")
  const key = await scrypt(password, Buffer.from(saltB64, "base64"), digest.length / 2, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: 128 * 1024 * 1024,
  })
  return timingSafeEqualHex(key.toString("hex"), digest)
}

export async function findUserByEmail(email: string): Promise<UserCredential | null> {
  const rows = await queryAuthoritative<UserCredential>(
    `select id, email, name, avatar, provider, google_sub, role, subscription_tier, pro_status,
            unlocked_tools, must_reset_password, password_salt, password_hash,
            failed_attempts, locked_until
       from users where email = $1 limit 1`,
    [email.trim().toLowerCase()],
  )
  return rows[0] ?? null
}

export async function verifyPassword(user: CredentialRow, password: string): Promise<boolean> {
  if (!user.password_hash) return false
  if (user.password_hash.startsWith(`${SCRYPT}$`)) return scryptMatch(user.password_hash, password)
  if (!user.password_salt) return false
  return timingSafeEqualHex(hashPassword(password, user.password_salt), user.password_hash)
}

export function needsPasswordUpgrade(user: { password_hash: string | null }): boolean {
  return !!user.password_hash && !user.password_hash.startsWith(`${SCRYPT}$`)
}

export function isLocked(user: { failed_attempts: number; locked_until: string | null }): boolean {
  return !!user.locked_until && new Date(user.locked_until).getTime() > Date.now()
}

export function hashSessionToken(token: string): string {
  return `sha256$${crypto.createHash("sha256").update(token).digest("hex")}`
}

async function issueSession(sql: Sql, userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await sql(
    `insert into sessions (token, user_id, expires_at) values ($1, $2, $3)`,
    [hashSessionToken(token), userId, expiresAt],
  )
  return { token, expiresAt }
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  return issueSession(queryAuthoritative, userId)
}

export async function revokeSession(token: string): Promise<void> {
  await queryAuthoritative(
    `update sessions set revoked_at = now() where token = $1 and revoked_at is null`,
    [hashSessionToken(token)],
  )
}

export async function currentUser(req: IncomingMessage): Promise<AuthUser | null> {
  const header = req.headers.authorization || ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!/^[a-f0-9]{64}$/i.test(token)) return null
  const hash = hashSessionToken(token)
  const rows = await queryAuthoritative<AuthUser>(
    `select u.id, u.email, u.name, u.provider, u.role, u.subscription_tier, u.pro_status,
            u.unlocked_tools, u.must_reset_password
       from sessions s
       join users u on u.id = s.user_id
      where s.token = $1 and s.revoked_at is null and s.expires_at > now()
      limit 1`,
    [hash],
  )
  return rows[0] ?? null
}

export async function requireActiveUser(req: IncomingMessage): Promise<AuthUser | null> {
  const user = await currentUser(req)
  return user && !user.must_reset_password ? user : null
}

export async function requireRole(req: IncomingMessage, roles: string[]): Promise<AuthUser | null> {
  const user = await requireActiveUser(req)
  return user && roles.includes(user.role) ? user : null
}

export const requireAdmin = (req: IncomingMessage) => requireRole(req, ["admin", "sub-admin"])

export async function authenticatePassword(
  email: string,
  password: string,
): Promise<
  | { status: "invalid" }
  | { status: "locked" }
  | { status: "ok"; user: AuthUser; token: string; expiresAt: Date }
> {
  const cleanEmail = email.trim().toLowerCase()
  const result = await transact(async (sql) => {
    const [user] = await sql<UserCredential>(
      `select id, email, name, provider, role, subscription_tier, pro_status, unlocked_tools,
              must_reset_password, password_salt, password_hash, failed_attempts, locked_until
         from users where email = $1 for update`,
      [cleanEmail],
    )
    if (!user) {
      await verifyPassword({ password_salt: "salt", password_hash: DUMMY_HASH }, password)
      return { status: "invalid" as const }
    }
    if (isLocked(user)) {
      await verifyPassword({ password_salt: "salt", password_hash: DUMMY_HASH }, password)
      return { status: "locked" as const }
    }

    if (!(await verifyPassword(user, password))) {
      await sql(
        `update users
           set failed_attempts = case when failed_attempts + 1 >= $2 then 0 else failed_attempts + 1 end,
               locked_until = case when failed_attempts + 1 >= $2 then now() + make_interval(mins => $3) else locked_until end,
               updated_at = now()
         where id = $1`,
        [user.id, MAX_FAILED_ATTEMPTS, LOCK_MINUTES],
      )
      return { status: "invalid" as const }
    }

    let mustReset = user.must_reset_password
    if (needsPasswordUpgrade(user)) {
      const salt = generateSalt()
      const hash = await hashPasswordScrypt(password, salt)
      await sql(
        `update users set password_salt = $2, password_hash = $3, must_reset_password = true,
                failed_attempts = 0, locked_until = null, last_login_at = now(), updated_at = now()
          where id = $1`,
        [user.id, salt, hash],
      )
      mustReset = true
    } else {
      await sql(
        `update users set failed_attempts = 0, locked_until = null, last_login_at = now(), updated_at = now()
          where id = $1`,
        [user.id],
      )
    }

    const session = await issueSession(sql, user.id)
    return {
      status: "ok" as const,
      user: { ...user, must_reset_password: mustReset },
      ...session,
    }
  })

  return result
}

export async function consumeAuthRateLimit(
  req: IncomingMessage,
  action: string,
  limit: number,
  windowSeconds: number,
  subject = "",
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const forwarded = req.headers["x-vercel-forwarded-for"] || req.headers["x-forwarded-for"]
  const ip = String(forwarded || req.socket?.remoteAddress || "unknown").split(",")[0].trim()
  const key = crypto
    .createHmac("sha256", process.env.SUPABASE_DB_URL || "masterfilepro-auth-rate-limit")
    .update(`${action}:${subject}:${ip}`)
    .digest("hex")
  const [row] = await queryAuthoritative<{ attempts: number; retry_after_seconds: number }>(
    `with pruned as (
       delete from auth_rate_limits where window_started_at < now() - interval '1 day'
     )
     insert into auth_rate_limits (bucket, window_started_at, attempts)
     values ($1, now(), 1)
     on conflict (bucket) do update set
       attempts = case when auth_rate_limits.window_started_at <= now() - make_interval(secs => $2)
                       then 1 else auth_rate_limits.attempts + 1 end,
       window_started_at = case when auth_rate_limits.window_started_at <= now() - make_interval(secs => $2)
                                then now() else auth_rate_limits.window_started_at end
     returning attempts,
       ceil(extract(epoch from window_started_at + make_interval(secs => $2) - now()))::int as retry_after_seconds`,
    [key, windowSeconds],
  )
  return {
    allowed: Number(row?.attempts || 0) <= limit,
    retryAfterSeconds: Math.max(1, Number(row?.retry_after_seconds || windowSeconds)),
  }
}

async function writePasswordChange(
  sql: Sql,
  userId: string,
  salt: string,
  hash: string,
  action: string,
  actorId: string | null,
): Promise<void> {
  await sql(
    `update users set password_salt = $2, password_hash = $3, must_reset_password = false,
            failed_attempts = 0, locked_until = null, updated_at = now()
      where id = $1`,
    [userId, salt, hash],
  )
  await sql(`update sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, [userId])
  await sql(
    `update password_resets set used_at = now()
      where used_at is null and (user_id = $1 or lower(email::text) in (
        select lower(email::text) from users where id = $1
      ))`,
    [userId],
  )
  await sql(
    `insert into audit_log (actor_user_id, action, target, metadata) values ($1, $2, $3, '{}'::jsonb)`,
    [actorId, action, userId],
  )
}

export async function applyNewPassword(
  userId: string,
  newPassword: string,
  action: string,
  actorId: string | null,
): Promise<void> {
  const salt = generateSalt()
  const hash = await hashPasswordScrypt(newPassword, salt)
  await transact((sql) => writePasswordChange(sql, userId, salt, hash, action, actorId))
}

export async function changePasswordWithCurrent(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<boolean> {
  const salt = generateSalt()
  const hash = await hashPasswordScrypt(newPassword, salt)
  return transact(async (sql) => {
    const [row] = await sql<CredentialRow>(
      `select password_salt, password_hash from users where id = $1 for update`,
      [userId],
    )
    if (!row || !(await verifyPassword(row, currentPassword))) return false
    await writePasswordChange(sql, userId, salt, hash, "auth.password.change", userId)
    return true
  })
}

export async function createResetCode(userId: string, email: string): Promise<string> {
  const code = String(crypto.randomInt(100000, 1000000))
  const salt = generateSalt()
  await transact(async (sql) => {
    await sql(`select id from users where id = $1 for update`, [userId])
    await sql(
      `update password_resets set used_at = now() where user_id = $1 and used_at is null`,
      [userId],
    )
    await sql(
      `insert into password_resets (user_id, email, code_salt, code_hash, expires_at)
       values ($1, $2, $3, $4, now() + make_interval(mins => $5))`,
      [userId, email, salt, hashPassword(code, salt), RESET_MINUTES],
    )
  })
  return code
}

export async function resetPasswordWithCode(
  email: string,
  code: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string; userId?: string }> {
  const salt = generateSalt()
  const hash = await hashPasswordScrypt(newPassword, salt)
  return transact(async (sql) => {
    const [row] = await sql<{
      id: string
      user_id: string
      code_salt: string
      code_hash: string
      attempts: number
    }>(
      `select r.id, r.user_id, r.code_salt, r.code_hash, r.attempts
         from password_resets r
         join users u on u.id = r.user_id
        where lower(r.email::text) = lower($1)
          and lower(u.email::text) = lower(r.email::text)
          and r.used_at is null and r.expires_at > now()
        order by r.created_at desc
        limit 1
        for update of r, u`,
      [email.trim().toLowerCase()],
    )
    if (!row) return { ok: false, error: "Invalid or expired verification code." }

    if (row.attempts >= MAX_RESET_ATTEMPTS) {
      await sql(
        `update password_resets set used_at = now() where user_id = $1 and used_at is null`,
        [row.user_id],
      )
      return { ok: false, error: "Too many failed attempts. Please request a new code." }
    }

    if (!timingSafeEqualHex(row.code_hash, hashPassword(code, row.code_salt))) {
      const exhausted = row.attempts + 1 >= MAX_RESET_ATTEMPTS
      await sql(
        `update password_resets set attempts = attempts + 1,
                used_at = case when attempts + 1 >= $2 then now() else used_at end
          where id = $1`,
        [row.id, MAX_RESET_ATTEMPTS],
      )
      return {
        ok: false,
        error: exhausted ? "Too many failed attempts. Please request a new code." : "Invalid or expired verification code.",
      }
    }

    await writePasswordChange(sql, row.user_id, salt, hash, "auth.password.reset", row.user_id)
    return { ok: true, userId: row.user_id }
  })
}
