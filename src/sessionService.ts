// Server-issued session tokens. Privileged /api endpoints require these;
// the old `x-fluxkit-role` header granted nothing because a browser could set it.

const TOKEN_KEY = "masterfilepro-session-token"

export interface ServerSession {
  token: string
  expiresAt: string
  mustResetPassword?: boolean
  user: {
    id: string
    email: string
    name: string
    role: "admin" | "sub-admin" | "user"
    subscriptionTier: "standard" | "pro"
    proStatus: "none" | "pending" | "active"
    unlockedTools: string[]
  }
}

function getTokenStore(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage)
      return window.localStorage
  } catch {
    return null
  }
  return null
}

export function getSessionToken(): string | null {
  return getTokenStore()?.getItem(TOKEN_KEY) ?? null
}

export function setSessionToken(token: string): void {
  getTokenStore()?.setItem(TOKEN_KEY, token)
}

export function clearSessionToken(): void {
  getTokenStore()?.removeItem(TOKEN_KEY)
}

/** Authorization header for privileged requests; empty when signed out. */
export function authHeaders(
  extra: Record<string, string> = {},
): Record<string, string> {
  const token = getSessionToken()
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra
}

/**
 * Boot-time readers often want the same record (the admin config holds the
 * profile, tool tiers and prices). Concurrent GETs of one path collapse into a
 * single request so a page load issues exactly one call per endpoint.
 */
const inflightGets = new Map<string, Promise<any | null>>()

export function sharedGetJson(path: string): Promise<any | null> {
  const existing = inflightGets.get(path)
  if (existing) return existing

  const pending = (async () => {
    try {
      const res = await fetch(path, { headers: authHeaders() })
      return res.ok ? await res.json().catch(() => null) : null
    } catch {
      // Unreachable endpoint: the caller keeps its offline behaviour.
      return null
    }
  })().finally(() => {
    if (inflightGets.get(path) === pending) inflightGets.delete(path)
  })

  inflightGets.set(path, pending)
  return pending
}

export async function serverSignIn(
  email: string,
  password: string,
): Promise<ServerSession | null> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.ok || !data?.token) return null
    setSessionToken(data.token)
    return data as ServerSession
  } catch {
    return null
  }
}

/** Creates the account server-side. `error` means the server refused; an empty
 *  result means the endpoint was unreachable and the caller may fall back locally. */
export async function serverSignUp(
  name: string,
  email: string,
  password: string,
): Promise<{ session?: ServerSession ; error?: string }> {
  try {
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    })
    const data = await res.json().catch(() => null)
    if (res.ok && data?.ok && data?.token) {
      setSessionToken(data.token)
      return { session: data as ServerSession }
    }
    if (res.status === 400 || res.status === 409) {
      return { error: data?.error || "Could not create that account." }
    }
    return {}
  } catch {
    return {}
  }
}

export async function serverSignOut(): Promise<void> {
  const token = getSessionToken()
  clearSessionToken()
  if (!token) return
  try {
    await fetch("/api/auth/session", {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    // The local token is already gone; a failed revoke is not worth surfacing.
  }
}

/** Changing your own password. Returns null when there is no server session to authorise it. */
export async function serverChangePassword(
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean ; error?: string ; message?: string } | null> {
  if (!getSessionToken()) return null
  return postJson(
    "/api/auth/password",
    { currentPassword, newPassword },
    authHeaders(),
  )
}

/** Administrator-set password for another account; the server re-checks the role. */
export async function serverResetPassword(
  userIdOrEmail: string,
  newPassword: string,
): Promise<{ ok: boolean ; error?: string } | null> {
  if (!getSessionToken()) return null
  return postJson(
    "/api/auth/password",
    { userId: userIdOrEmail, newPassword },
    authHeaders(),
  )
}

/** Requests a server-issued reset code. `devCode` is only present outside production. */
export async function serverRequestPasswordReset(
  email: string,
): Promise<{
  ok: boolean
  message?: string
  error?: string
  devCode?: string
} | null> {
  return postJson("/api/auth/reset-request", { email })
}

export async function serverConfirmPasswordReset(
  email: string,
  code: string,
  newPassword: string,
): Promise<{ ok: boolean ; message?: string ; error?: string } | null> {
  return postJson("/api/auth/reset-confirm", { email, code, newPassword })
}

async function postJson<T>(
  path: string,
  payload: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T | null> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify(payload),
    })
    return (await res.json().catch(() => null)) as T | null
  } catch {
    // Unreachable endpoint: callers keep their offline behaviour.
    return null
  }
}

export type SessionCheck = { state: "none" } | { state: "offline" } | {
  state: "expired"
} | { state: "valid" ; session: ServerSession }

/**
 * Distinguishes "the server rejected this session" from "the server is unreachable":
 * only a rejection may sign the user out, otherwise a dropped network would.
 */
export async function verifySession(): Promise<SessionCheck> {
  const token = getSessionToken()
  if (!token) return { state: "none" }

  try {
    const res = await fetch("/api/auth/session", {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (res.ok) {
      const data = await res.json().catch(() => null)
      if (data?.ok && data.user)
        return { state: "valid", session: data as ServerSession }
    } else if (res.status !== 401 && res.status !== 403) {
      return { state: "offline" }
    }
    clearSessionToken()
    return { state: "expired" }
  } catch {
    return { state: "offline" }
  }
}

/** Refresh the server's view of the signed-in user; null when there is no valid session. */
export async function serverSession(): Promise<ServerSession["user"] | null> {
  const check = await verifySession()
  return check.state === "valid" ? check.session.user : null
}
