import type { IncomingMessage } from "node:http"
import crypto from "node:crypto"
import { promisify } from "node:util"
import { query } from "./db.ts"

const SESSION_DAYS = 30
const MAX_FAILED_ATTEMPTS = 5
const LOCK_MINUTES = 15
// The options overload is dropped by promisify, so the signature is restated.
const scrypt = promisify(crypto.scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: crypto.ScryptOptions,
) => Promise<Buffer>

export interface AuthUser {
  id: string
  email: string
  name: string
  role: "admin" | "sub-admin" | "user"
  subscription_tier: "standard" | "pro"
  pro_status: "none" | "pending" | "active"
  unlocked_tools: string[]
  must_reset_password: boolean
}

// Legacy format, kept so accounts migrated before scrypt can still sign in and be
// upgraded in place: sha256(`${salt}:${password}`).
export function hashPassword(password: string, salt: string): string {
  return crypto.createHash("sha256").update(`${salt}:${password}`).digest("hex")
}

const SCRYPT = "scrypt"
const SCRYPT_COST = 16384
const SCRYPT_BLOCK = 8
const SCRYPT_PARALLEL = 1
const SCRYPT_KEYLEN = 64

export function generateSalt(): string {
  return `salt_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`
}

/** Self-describing so the cost parameters can be raised later without a migration. */
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

export async function findUserByEmail(email: string): Promise<AuthUser & { password_salt: string | null; password_hash: string | null; locked_until: string | null; failed_attempts: number } | null> {
  const rows = await query<any>(
    `select id, email, name, role, subscription_tier, pro_status, unlocked_tools,
            must_reset_password, password_salt, password_hash, failed_attempts, locked_until
       from users where email = $1 limit 1`,
    [email.trim().toLowerCase()],
  )
  return rows[0] ?? null
}

export async function verifyPassword(
  user: { password_salt: string | null; password_hash: string | null },
  password: string,
): Promise<boolean> {
  if (!user.password_hash) return false
  if (user.password_hash.startsWith(`${SCRYPT}$`)) return scryptMatch(user.password_hash, password)
  if (!user.password_salt) return false
  return timingSafeEqualHex(hashPassword(password, user.password_salt), user.password_hash)
}

/** True while a stored credential is still the single-round sha256 format. */
export function needsPasswordUpgrade(user: { password_hash: string | null }): boolean {
  return !!user.password_hash && !user.password_hash.startsWith(`${SCRYPT}$`)
}

/**
 * Re-stores a verified legacy credential as scrypt. The plaintext is only available
 * at sign-in, so the upgrade is opportunistic rather than a batch migration.
 */
export async function upgradePasswordHash(userId: string, password: string): Promise<void> {
  const salt = generateSalt()
  await query(
    `update users set password_salt = $2, password_hash = $3, updated_at = now() where id = $1`,
    [userId, salt, await hashPasswordScrypt(password, salt)],
  )
}

export async function registerFailedAttempt(userId: string): Promise<void> {
  await query(
    `update users
       set failed_attempts = case when failed_attempts + 1 >= $2 then 0 else failed_attempts + 1 end,
           locked_until = case when failed_attempts + 1 >= $2 then now() + make_interval(mins => $3) else locked_until end,
           updated_at = now()
     where id = $1`,
    [userId, MAX_FAILED_ATTEMPTS, LOCK_MINUTES],
  )
}

export async function clearFailedAttempts(userId: string): Promise<void> {
  await query(
    `update users set failed_attempts = 0, locked_until = null, last_login_at = now(), updated_at = now() where id = $1`,
    [userId],
  )
}

export function isLocked(user: { failed_attempts: number; locked_until: string | null }): boolean {
  if (!user.locked_until) return false
  return new Date(user.locked_until).getTime() > Date.now()
}

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = crypto.randomBytes(32).toString("hex")
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000)
  await query(`insert into sessions (token, user_id, expires_at) values ($1, $2, $3)`, [token, userId, expiresAt])
  return { token, expiresAt }
}

export async function revokeSession(token: string): Promise<void> {
  await query(`update sessions set revoked_at = now() where token = $1 and revoked_at is null`, [token])
}

export async function currentUser(req: IncomingMessage): Promise<AuthUser | null> {
  const header = req.headers.authorization || ""
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!token) return null
  const rows = await query<AuthUser>(
    `select u.id, u.email, u.name, u.role, u.subscription_tier, u.pro_status, u.unlocked_tools, u.must_reset_password
       from sessions s
       join users u on u.id = s.user_id
      where s.token = $1 and s.revoked_at is null and s.expires_at > now()
      limit 1`,
    [token],
  )
  return rows[0] ?? null
}

export async function requireRole(req: IncomingMessage, roles: string[]): Promise<AuthUser | null> {
  const user = await currentUser(req)
  if (!user || !roles.includes(user.role)) return null
  return user
}

export const requireAdmin = (req: IncomingMessage) => requireRole(req, ["admin", "sub-admin"])

const RESET_MINUTES = 15
const MAX_RESET_ATTEMPTS = 5

export async function activeResetCodeCount(email: string): Promise<number> {
  const rows = await query<{ count: string }>(
    `select count(*)::text as count from password_resets
      where email = $1 and used_at is null and expires_at > now()`,
    [email],
  )
  return Number(rows[0]?.count || 0)
}

/**
 * Stores a hashed one-time code and returns the digits to hand out. sha256 is
 * deliberate here: the code is six digits, expires in minutes, and is attempt-capped,
 * so a slower KDF would not add protection a leaked table could not already defeat.
 */
export async function createResetCode(email: string): Promise<string> {
  const code = String(crypto.randomInt(100000, 1000000))
  const salt = generateSalt()
  await query(
    `insert into password_resets (email, code_salt, code_hash, expires_at)
     values ($1, $2, $3, now() + make_interval(mins => $4))`,
    [email, salt, hashPassword(code, salt), RESET_MINUTES],
  )
  return code
}

export async function applyNewPassword(
  userId: string,
  newPassword: string,
  action: string,
  actorId: string | null,
): Promise<void> {
  const salt = generateSalt()
  await query(
    `update users
       set password_salt = $2, password_hash = $3, must_reset_password = false,
           failed_attempts = 0, locked_until = null, updated_at = now()
     where id = $1`,
    [userId, salt, await hashPasswordScrypt(newPassword, salt)],
  )
  // Sessions must not outlive the credential they were issued with.
  await query(`update sessions set revoked_at = now() where user_id = $1 and revoked_at is null`, [userId])
  await query(
    `insert into audit_log (actor_user_id, action, target, metadata) values ($1, $2, $3, '{}'::jsonb)`,
    [actorId, action, userId],
  )
}

/**
 * Verifies a one-time code and, on success, sets the new password. Attempts are
 * counted server-side so a code cannot be guessed at.
 */
export async function resetPasswordWithCode(
  email: string,
  code: string,
  newPassword: string,
): Promise<{ ok: boolean; error?: string; userId?: string }> {
  const [row] = await query<{ id: string; user_id: string | null; code_salt: string; code_hash: string; attempts: number }>(
    `select r.id, r.code_salt, r.code_hash, r.attempts, u.id as user_id
       from password_resets r
       join users u on lower(u.email) = lower($1)
      where lower(r.email) = lower($1) and r.used_at is null and r.expires_at > now()
      order by r.created_at desc
      limit 1`,
    [email],
  )

  if (!row || !row.user_id) return { ok: false, error: "Invalid or expired verification code." }

  if (row.attempts >= MAX_RESET_ATTEMPTS) {
    await query(`update password_resets set used_at = now() where id = $1`, [row.id])
    return { ok: false, error: "Too many failed attempts. Please request a new code." }
  }

  if (!timingSafeEqualHex(row.code_hash, hashPassword(code, row.code_salt))) {
    await query(`update password_resets set attempts = attempts + 1 where id = $1`, [row.id])
    return { ok: false, error: "Invalid or expired verification code." }
  }

  await query(`update password_resets set used_at = now() where id = $1`, [row.id])
  await applyNewPassword(row.user_id, newPassword, "auth.password.reset", row.user_id)
  return { ok: true, userId: row.user_id }
}
