import {
  type UserAccount,
  getCurrentUser,
  saveCurrentUser,
  getRegisteredAccounts,
  saveRegisteredAccounts,
  isRootAdmin,
  changeAccountPassword,
  generateSalt,
  hashPassword,
  getStoredCredentials,
  pushUserToCloud,
  SEEDED_ADMIN_ACCOUNT,
} from "./authService"
import { authHeaders, getSessionToken, sharedGetJson } from "./sessionService"
export { isRootAdmin } from "./authService"
import { tools } from "./config"
import {
  getActiveCurrency,
  getExchangeRate,
  setExchangeRate,
  setActiveCurrency,
  convertCurrencyOnBackend,
  type SupportedCurrency,
} from "./currencyService"
export {
  getActiveCurrency,
  getExchangeRate,
  setExchangeRate,
  setActiveCurrency,
  convertCurrencyOnBackend,
  type SupportedCurrency,
}

const TOOL_TIERS_KEY = "masterfilepro-tool-tiers"
const TOOL_PRICES_KEY = "masterfilepro-tool-prices"

// In-memory fallback for test harnesses without localStorage
let inMemoryTiers: Record<string, "standard" | "pro"> | null = null
let inMemoryPrices: Record<string, number> | null = null

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage
  }
  if (typeof localStorage !== "undefined") {
    return localStorage
  }
  return null
}

export function getAllToolTiers(): Record<string, "standard" | "pro"> {
  const storage = getStorage()
  if (storage) {
    try {
      const raw = storage.getItem(TOOL_TIERS_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
  }
  if (inMemoryTiers) return { ...inMemoryTiers }
  return {}
}

export function saveAllToolTiers(
  tiers: Record<string, "standard" | "pro">,
): void {
  inMemoryTiers = { ...tiers }
  const storage = getStorage()
  if (storage) {
    try {
      storage.setItem(TOOL_TIERS_KEY, JSON.stringify(tiers))
      window.dispatchEvent(
        new CustomEvent("masterfilepro-tiers-changed", { detail: tiers }),
      )
    } catch {}
  }
}

export function getToolTier(toolId: string): "standard" | "pro" {
  const tiers = getAllToolTiers()
  return tiers[toolId] || "standard"
}

export function isToolPro(toolId: string): boolean {
  return getToolTier(toolId) === "pro"
}

export function setToolTier(toolId: string, tier: "standard" | "pro"): void {
  const tiers = getAllToolTiers()
  tiers[toolId] = tier
  saveAllToolTiers(tiers)

  // Keep prices strictly synced with tier
  const prices = getAllToolPrices()
  if (tier === "standard") {
    prices[toolId] = 0
    saveAllToolPrices(prices)
  } else if (tier === "pro" && (!prices[toolId] || prices[toolId] === 0)) {
    prices[toolId] = 4.99
    saveAllToolPrices(prices)
  }

  // Push update to serverless database if in live browser environment
  if (typeof window !== "undefined" && typeof fetch === "function") {
    try {
      fetch("/api/db/admin", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          toolTiers: { [toolId]: tier },
          toolPrices: { [toolId]: tier === "pro" ? prices[toolId] || 4.99 : 0 },
        }),
      }).catch(() => {})
    } catch {}
  }
}

export function getAllToolPrices(): Record<string, number> {
  const storage = getStorage()
  if (storage) {
    try {
      const raw = storage.getItem(TOOL_PRICES_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
  }
  if (inMemoryPrices) return { ...inMemoryPrices }
  return {}
}

export function saveAllToolPrices(prices: Record<string, number>): void {
  inMemoryPrices = { ...prices }
  const storage = getStorage()
  if (storage) {
    try {
      storage.setItem(TOOL_PRICES_KEY, JSON.stringify(prices))
      window.dispatchEvent(
        new CustomEvent("masterfilepro-prices-changed", { detail: prices }),
      )
    } catch {}
  }
}

export function getToolPrice(toolId: string): number {
  if (!isToolPro(toolId)) {
    return 0
  }
  const prices = getAllToolPrices()
  if (typeof prices[toolId] === "number" && prices[toolId] > 0) {
    return prices[toolId]
  }
  return 4.99
}

export function setToolPrice(toolId: string, price: number): void {
  const prices = getAllToolPrices()
  const clean = Math.max(0, Math.round(Number(price) * 100) / 100)
  const finalPrice = isNaN(clean) ? 0 : clean
  prices[toolId] = finalPrice
  saveAllToolPrices(prices)

  // Keep tier strictly synced with price
  const tiers = getAllToolTiers()
  const targetTier = finalPrice > 0 ? "pro" : "standard"
  if (tiers[toolId] !== targetTier) {
    tiers[toolId] = targetTier
    saveAllToolTiers(tiers)
  }

  // Push update to serverless database if in live browser environment
  if (typeof window !== "undefined" && typeof fetch === "function") {
    try {
      fetch("/api/db/admin", {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          toolTiers: { [toolId]: targetTier },
          toolPrices: { [toolId]: finalPrice },
        }),
      }).catch(() => {})
    } catch {}
  }
}

/**
 * Synchronize tool tiers and prices with the serverless database.
 * Fetches configured tiers from /api/db/admin so that all visitors on Vercel
 * receive active Pro gating without relying solely on local browser storage.
 */
export async function syncToolTiersFromDatabase(): Promise<void> {
  if (typeof window === "undefined" || typeof fetch !== "function") return
  try {
    const data = await sharedGetJson("/api/db/admin")
    if (data && data.toolTiers && typeof data.toolTiers === "object") {
      const storage = getStorage()
      const current = getAllToolTiers()
      const mergedTiers = { ...data.toolTiers, ...current }
      inMemoryTiers = { ...mergedTiers }
      if (storage) {
        try {
          storage.setItem(TOOL_TIERS_KEY, JSON.stringify(mergedTiers))
        } catch {}
      }
      window.dispatchEvent(
        new CustomEvent("masterfilepro-tiers-changed", { detail: mergedTiers }),
      )
    }
    if (data && data.toolPrices && typeof data.toolPrices === "object") {
      const storage = getStorage()
      const currentPrices = getAllToolPrices()
      const mergedPrices = { ...data.toolPrices, ...currentPrices }
      inMemoryPrices = { ...mergedPrices }
      if (storage) {
        try {
          storage.setItem(TOOL_PRICES_KEY, JSON.stringify(mergedPrices))
        } catch {}
      }
      window.dispatchEvent(
        new CustomEvent("masterfilepro-prices-changed", { detail: mergedPrices }),
      )
    }
  } catch {}
}

export function getFormattedToolPrice(
  toolId: string,
  currency?: string,
  cycle: "month" | "year" | "none" = "none",
): string {
  const price = getToolPrice(toolId)
  if (price === 0) return "Free"
  const activeCurr = currency || getActiveCurrency()
  const rate = getExchangeRate()
  const finalPrice = cycle === "year" ? price * 10 : price
  const suffix = cycle === "year" ? "/yr" : cycle === "month" ? "/mo" : ""
  switch (activeCurr.toUpperCase()) {
    case "GHS":
      return `GH₵${(finalPrice * rate).toFixed(2)}${suffix}`
    case "NGN":
      return `₦${(finalPrice * 1500).toLocaleString()}${suffix}`
    case "EUR":
      return `€${finalPrice.toFixed(2)}${suffix}`
    case "GBP":
      return `£${(finalPrice * 0.85).toFixed(2)}${suffix}`
    default:
      return `$${finalPrice.toFixed(2)}${suffix}`
  }
}

export function canUserAccessTool(
  toolId: string,
  user: UserAccount | null,
): boolean {
  const tier = getToolTier(toolId)
  if (tier !== "pro") {
    return true
  }
  if (!user) {
    return false
  }
  if (user.role === "admin" || user.role === "sub-admin") {
    return true
  }
  if (user.subscriptionTier === "pro" && user.proStatus === "active") {
    return true
  }
  if (
    user.unlockedTools &&
    Array.isArray(user.unlockedTools) &&
    user.unlockedTools.includes(toolId)
  ) {
    // If user has a dated tool subscription record, verify it has not expired
    const sub = (user as any).toolSubscriptions?.[toolId]
    if (sub && sub.expiresAt) {
      if (new Date(sub.expiresAt).getTime() < Date.now()) {
        return false // Subscription expired, requires monthly/yearly renewal
      }
    }
    return true
  }
  return false
}

export type ToolPaymentStatus = {
  isProTool: boolean
  isUnlocked: boolean
  statusLabel: string
  badgeType: "free" | "pro-locked" | "paid" | "all-access" | "admin"
  plan?: "monthly" | "yearly"
  renewsAt?: string
  expiresAt?: string
}

export function getToolPaymentStatus(
  toolId: string,
  user: UserAccount | null,
): ToolPaymentStatus {
  const isPro = isToolPro(toolId)
  if (!isPro) {
    return {
      isProTool: false,
      isUnlocked: true,
      statusLabel: "FREE",
      badgeType: "free",
    }
  }

  if (!user) {
    return {
      isProTool: true,
      isUnlocked: false,
      statusLabel: `PRO · ${getFormattedToolPrice(toolId, undefined, "month")}`,
      badgeType: "pro-locked",
    }
  }

  if (user.role === "admin" || user.role === "sub-admin") {
    return {
      isProTool: true,
      isUnlocked: true,
      statusLabel: "ADMIN ACCESS",
      badgeType: "admin",
    }
  }

  if (user.subscriptionTier === "pro" && user.proStatus === "active") {
    return {
      isProTool: true,
      isUnlocked: true,
      statusLabel: "ALL-ACCESS PRO",
      badgeType: "all-access",
    }
  }

  const sub = (user as any).toolSubscriptions?.[toolId]
  const isUnlockedList =
    user.unlockedTools &&
    Array.isArray(user.unlockedTools) &&
    user.unlockedTools.includes(toolId)

  if (isUnlockedList) {
    if (
      sub &&
      sub.expiresAt &&
      new Date(sub.expiresAt).getTime() < Date.now()
    ) {
      return {
        isProTool: true,
        isUnlocked: false,
        statusLabel: "EXPIRED",
        badgeType: "pro-locked",
        expiresAt: sub.expiresAt,
      }
    }
    const cycleLabel = sub?.plan === "yearly" ? "YEARLY" : "MONTHLY"
    return {
      isProTool: true,
      isUnlocked: true,
      statusLabel: `PAID · ${cycleLabel}`,
      badgeType: "paid",
      plan: sub?.plan || "monthly",
      renewsAt: sub?.renewsAt,
      expiresAt: sub?.expiresAt,
    }
  }

  return {
    isProTool: true,
    isUnlocked: false,
    statusLabel: `PRO · ${getFormattedToolPrice(toolId, undefined, "month")}`,
    badgeType: "pro-locked",
  }
}

export function unlockSingleToolForUser(
  userId: string,
  toolId: string,
  cycle: "monthly" | "yearly" = "monthly",
): UserAccount {
  const accounts = getRegisteredAccounts()
  const idx = accounts.findIndex((a) => a.id === userId)
  let updated: UserAccount

  const now = new Date()
  const expiresDate = new Date(now)
  if (cycle === "yearly") {
    expiresDate.setFullYear(expiresDate.getFullYear() + 1)
  } else {
    expiresDate.setMonth(expiresDate.getMonth() + 1)
  }
  const expiresAt = expiresDate.toISOString()

  const subRecord = {
    toolId,
    plan: cycle,
    status: "active" as const,
    startedAt: now.toISOString(),
    expiresAt,
    renewsAt: expiresAt,
    autoRenew: true,
  }

  if (idx >= 0) {
    const existing = accounts[idx].unlockedTools || []
    const existingSubs = (accounts[idx] as any).toolSubscriptions || {}
    accounts[idx] = ({
      ...accounts[idx],
      unlockedTools: existing.includes(toolId)
        ? existing
        : [...existing, toolId],
      toolSubscriptions: {
        ...existingSubs,
        [toolId]: subRecord,
      },
    } as any)
    saveRegisteredAccounts(accounts)
    updated = accounts[idx]
  } else {
    const current = getCurrentUser()
    const existing = current?.unlockedTools || []
    const existingSubs = (current as any)?.toolSubscriptions || {}
    const combined = existing.includes(toolId)
      ? existing
      : [...existing, toolId]
    if (current && (current.id === userId || !current.id)) {
      updated = ({
        ...current,
        unlockedTools: combined,
        toolSubscriptions: {
          ...existingSubs,
          [toolId]: subRecord,
        },
      } as any)
    } else {
      updated = ({
        id: userId,
        name: "Customer",
        email: "customer@masterfilepro.com",
        provider: "email",
        role: "user",
        subscriptionTier: "standard",
        proStatus: "none",
        unlockedTools: [toolId],
        toolSubscriptions: {
          [toolId]: subRecord,
        },
        createdAt: now.toISOString(),
        lastLoginAt: now.toISOString(),
      } as any)
    }
  }

  const current = getCurrentUser()
  if (current && (current.id === userId || !current.id)) {
    saveCurrentUser(updated)
  }
  return updated
}

export function setBulkToolPrices(toolIds: string[], price: number): void {
  const prices = getAllToolPrices()
  const clean = Math.max(0, Math.round(Number(price) * 100) / 100)
  const val = isNaN(clean) ? 0 : clean
  const tiers = getAllToolTiers()
  const targetTier = val > 0 ? "pro" : "standard"
  for (const id of toolIds) {
    prices[id] = val
    tiers[id] = targetTier
  }
  saveAllToolPrices(prices)
  saveAllToolTiers(tiers)
}

export function setCategoryPrice(category: string, price: number): void {
  const matchingTools = tools.filter(
    (t) => t.category.toLowerCase() === category.toLowerCase(),
  )
  setBulkToolPrices(
    matchingTools.map((t) => t.id),
    price,
  )
}

export function activateProSimulatedPayment(userId: string): UserAccount {
  const accounts = getRegisteredAccounts()
  const idx = accounts.findIndex((a) => a.id === userId)
  let updated: UserAccount

  if (idx >= 0) {
    accounts[idx] = {
      ...accounts[idx],
      subscriptionTier: "pro",
      proStatus: "active",
    }
    saveRegisteredAccounts(accounts)
    updated = accounts[idx]
  } else {
    // If user is current user but not in registered list
    const current = getCurrentUser()
    if (current && current.id === userId) {
      updated = {
        ...current,
        subscriptionTier: "pro",
        proStatus: "active",
      }
    } else {
      updated = {
        id: userId,
        name: "Pro User",
        email: `${userId}@masterfilepro.com`,
        provider: "email",
        role: "user",
        subscriptionTier: "pro",
        proStatus: "active",
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      }
    }
  }

  const current = getCurrentUser()
  if (current && current.id === userId) {
    saveCurrentUser(updated)
  }
  return updated
}

export function requestProApproval(userId: string): UserAccount {
  const accounts = getRegisteredAccounts()
  const idx = accounts.findIndex((a) => a.id === userId)
  let updated: UserAccount

  if (idx >= 0) {
    accounts[idx] = {
      ...accounts[idx],
      subscriptionTier: "standard",
      proStatus: "pending",
    }
    saveRegisteredAccounts(accounts)
    updated = accounts[idx]
  } else {
    const current = getCurrentUser()
    if (current && current.id === userId) {
      updated = {
        ...current,
        subscriptionTier: "standard",
        proStatus: "pending",
      }
    } else {
      updated = {
        id: userId,
        name: "Applicant User",
        email: `${userId}@masterfilepro.com`,
        provider: "email",
        role: "user",
        subscriptionTier: "standard",
        proStatus: "pending",
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      }
    }
  }

  const current = getCurrentUser()
  if (current && current.id === userId) {
    saveCurrentUser(updated)
  }
  pushUserToCloud(updated)
  return updated
}

export function approveProSubscription(userId: string): UserAccount {
  if (isRootAdmin(userId)) {
    throw new Error(
      "Root administrator Pro status is permanently active and locked.",
    )
  }
  const accounts = getRegisteredAccounts()
  const idx = accounts.findIndex((a) => a.id === userId)
  let updated: UserAccount

  if (idx >= 0) {
    accounts[idx] = {
      ...accounts[idx],
      subscriptionTier: "pro",
      proStatus: "active",
    }
    saveRegisteredAccounts(accounts)
    updated = accounts[idx]
  } else {
    const current = getCurrentUser()
    if (current && current.id === userId) {
      updated = {
        ...current,
        subscriptionTier: "pro",
        proStatus: "active",
      }
    } else {
      updated = {
        id: userId,
        name: "Approved User",
        email: `${userId}@masterfilepro.com`,
        provider: "email",
        role: "user",
        subscriptionTier: "pro",
        proStatus: "active",
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      }
    }
  }

  const current = getCurrentUser()
  if (current && current.id === userId) {
    saveCurrentUser(updated)
  }
  pushUserToCloud(updated)
  return updated
}

export function revokeProSubscription(userId: string): UserAccount {
  if (isRootAdmin(userId)) {
    throw new Error(
      "Root administrator Pro status is permanently active and cannot be revoked.",
    )
  }
  const accounts = getRegisteredAccounts()
  const idx = accounts.findIndex((a) => a.id === userId)
  let updated: UserAccount

  if (idx >= 0) {
    accounts[idx] = {
      ...accounts[idx],
      subscriptionTier: "standard",
      proStatus: "none",
    }
    saveRegisteredAccounts(accounts)
    updated = accounts[idx]
  } else {
    const current = getCurrentUser()
    if (current && current.id === userId) {
      updated = {
        ...current,
        subscriptionTier: "standard",
        proStatus: "none",
      }
    } else {
      updated = {
        id: userId,
        name: "Standard User",
        email: `${userId}@masterfilepro.com`,
        provider: "email",
        role: "user",
        subscriptionTier: "standard",
        proStatus: "none",
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      }
    }
  }

  const current = getCurrentUser()
  if (current && current.id === userId) {
    saveCurrentUser(updated)
  }
  pushUserToCloud(updated)
  return updated
}

export function getAllUsers(): UserAccount[] {
  return getRegisteredAccounts()
}

/**
 * Push an individual user update or creation to the serverless database.
 */
export async function pushUserToServer(user: UserAccount): Promise<void> {
  pushUserToCloud(user)
}

/**
 * Push batch users to the serverless database.
 */
export async function pushUsersToServer(users: UserAccount[]): Promise<void> {
  if (typeof window === "undefined" || typeof fetch !== "function") return
  try {
    await fetch("/api/db/users", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ users }),
    })
  } catch (err) {
    console.warn("Failed to push users to server:", err)
  }
}

/**
 * Remove a user from the serverless database.
 */
export async function deleteUserFromServer(userId: string): Promise<void> {
  if (typeof window === "undefined" || typeof fetch !== "function") return
  try {
    await fetch("/api/db/users", {
      method: "POST",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ action: "delete", userId }),
    })
  } catch (err) {
    console.warn("Failed to delete user on server:", err)
  }
}

/**
 * Synchronize registered users with the serverless database.
 * Fetches all registered accounts from /api/db/users so that administrators
 * see all users across all devices and browsers in real time.
 */
export async function syncUsersWithServer(): Promise<UserAccount[]> {
  if (typeof window === "undefined" || typeof fetch !== "function") {
    return getRegisteredAccounts()
  }
  // The roster is admin-only; without one of these roles the call is a guaranteed 401.
  const viewer = getCurrentUser()
  if (
    !getSessionToken() ||
    (viewer?.role !== "admin" && viewer?.role !== "sub-admin")
  ) {
    return getRegisteredAccounts()
  }
  try {
    const res = await fetch("/api/db/users", {
      method: "GET",
      headers: authHeaders(),
    })
    if (res.ok) {
      const data = await res.json()
      if (data && Array.isArray(data.users)) {
        const current = getCurrentUser()

        // The server roster is authoritative: an admin browser must not re-add
        // accounts that were deleted server-side from its own stale cache.
        const mergedMap = new Map<string, UserAccount>()

        for (const u of data.users) {
          if (u && u.email) {
            mergedMap.set(u.email.toLowerCase(), u)
          }
        }

        if (current?.email && !mergedMap.has(current.email.toLowerCase())) {
          mergedMap.set(current.email.toLowerCase(), current)
        }

        const mergedList = Array.from(mergedMap.values())
        saveRegisteredAccounts(mergedList)

        // If current user is logged in, ensure their session reflects the latest cloud status (e.g. if approved as Pro by admin)
        if (current && current.email) {
          const fresh = mergedMap.get(current.email.toLowerCase())
          if (
            fresh &&
            (fresh.proStatus !== current.proStatus ||
              fresh.subscriptionTier !== current.subscriptionTier ||
              fresh.role !== current.role)
          ) {
            saveCurrentUser(fresh)
          }
        }

        if (typeof window === "undefined") {
          return mergedList
        }

        window.dispatchEvent(
          new CustomEvent("masterfilepro-users-synced", { detail: mergedList }),
        )

        return mergedList
      }
    }
  } catch (err) {
    console.warn("Failed to sync users with server:", err)
  }
  return getRegisteredAccounts()
}

export function updateUserRole(
  userId: string,
  role: "admin" | "sub-admin" | "user",
): UserAccount {
  if (isRootAdmin(userId)) {
    throw new Error(
      "The root administrator account is permanently locked and cannot be demoted.",
    )
  }
  const accounts = getRegisteredAccounts()
  const idx = accounts.findIndex((a) => a.id === userId)
  let updated: UserAccount
  if (idx >= 0) {
    accounts[idx] = { ...accounts[idx], role }
    saveRegisteredAccounts(accounts)
    updated = accounts[idx]
  } else {
    const current = getCurrentUser()
    if (current && current.id === userId) {
      updated = { ...current, role }
    } else {
      throw new Error("User not found")
    }
  }
  const current = getCurrentUser()
  if (current && current.id === userId) {
    saveCurrentUser(updated)
  }
  pushUserToCloud(updated)
  return updated
}

export function deleteUser(userId: string): void {
  if (isRootAdmin(userId)) {
    throw new Error(
      "The root administrator account is permanently locked and cannot be deleted.",
    )
  }
  const accounts = getRegisteredAccounts()
  const filtered = accounts.filter(
    (a) =>
      a.id !== userId &&
      a.email.toLowerCase() !== "admin@masterfilepro.com" &&
      a.email.toLowerCase() !== "admin@fluxkit.com",
  )
  saveRegisteredAccounts(filtered)
  deleteUserFromServer(userId).catch(() => {})
}

export async function createUserByAdmin(payload: {
  name: string
  email: string
  password: string
  role?: "admin" | "sub-admin" | "user"
  subscriptionTier?: "standard" | "pro"
}): Promise<UserAccount> {
  const cleanName = (payload.name || "").trim()
  const cleanEmail = (payload.email || "").trim().toLowerCase()
  const password = payload.password || ""
  const role = payload.role || "user"
  const subscriptionTier = payload.subscriptionTier || "standard"
  const proStatus = subscriptionTier === "pro" ? "active" : "none"

  if (!cleanName) {
    throw new Error("Please enter a user name.")
  }
  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error("Please enter a valid email address.")
  }
  if (!password || password.length < 12) {
    throw new Error("Password must be at least 12 characters long.")
  }

  const accounts = getRegisteredAccounts()
  if (
    accounts.some((a) => a.email.toLowerCase() === cleanEmail) ||
    cleanEmail === "admin@masterfilepro.com" ||
    cleanEmail === "admin@fluxkit.com"
  ) {
    throw new Error("An account with this email address already exists.")
  }

  const now = new Date().toISOString()
  const newUser: UserAccount = {
    id: `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: cleanName,
    email: cleanEmail,
    provider: "email",
    role,
    subscriptionTier,
    proStatus,
    createdAt: now,
    lastLoginAt: now,
  }

  accounts.push(newUser)
  saveRegisteredAccounts(accounts)

  // The account has to exist server-side before its password can be set there.
  await pushUserToCloud(newUser)
  await changeAccountPassword(cleanEmail, password)

  return newUser
}

export async function changeUserPassword(
  userIdOrEmail: string,
  newPassword: string,
): Promise<void> {
  const accounts = getRegisteredAccounts()
  const found = accounts.find(
    (a) =>
      a.id === userIdOrEmail ||
      a.email.toLowerCase() === userIdOrEmail.toLowerCase(),
  )
  const targetEmail = found ? found.email : userIdOrEmail
  await changeAccountPassword(targetEmail, newPassword)
}

export async function updateUserDetails(
  userId: string,
  updates: {
    name?: string
    email?: string
    role?: "admin" | "sub-admin" | "user"
    subscriptionTier?: "standard" | "pro"
    proStatus?: "active" | "pending" | "none"
    requirePasswordReset?: boolean
    newPassword?: string
  },
): Promise<UserAccount> {
  const accounts = getRegisteredAccounts()
  const idx = accounts.findIndex((a) => a.id === userId)
  const isRoot = isRootAdmin(userId)

  if (idx < 0) {
    const current = getCurrentUser()
    if (!current || (!isRoot && current.id !== userId)) {
      throw new Error("User account not found.")
    }
  }

  const existing =
    idx >= 0 ? accounts[idx] : isRoot ? SEEDED_ADMIN_ACCOUNT : getCurrentUser()!

  // Guard: root admin cannot change status (role, subscriptionTier, proStatus, or name)
  // The only things able to change for the main root admin are email and password
  let role = updates.role !== undefined ? updates.role : existing.role
  let subscriptionTier =
    updates.subscriptionTier !== undefined
      ? updates.subscriptionTier
      : existing.subscriptionTier
  let proStatus =
    updates.proStatus !== undefined ? updates.proStatus : existing.proStatus
  let name = updates.name !== undefined ? updates.name.trim() : existing.name

  if (isRoot) {
    role = "admin"
    subscriptionTier = "pro"
    proStatus = "active"
    name = existing.name // Root admin display name is locked
  } else if (!name) {
    throw new Error("User name cannot be empty.")
  }

  let email = existing.email
  if (
    updates.email &&
    updates.email.trim().toLowerCase() !== existing.email.toLowerCase()
  ) {
    const newEmail = updates.email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
      throw new Error("Please enter a valid email address.")
    }
    if (
      accounts.some(
        (a) => a.id !== userId && a.email.toLowerCase() === newEmail,
      )
    ) {
      throw new Error("An account with this email address already exists.")
    }

    // Migrate stored password credentials if present
    const creds = getStoredCredentials()
    if (creds[existing.email.toLowerCase()]) {
      creds[newEmail] = creds[existing.email.toLowerCase()]
      delete creds[existing.email.toLowerCase()]
      const storage = getStorage()
      if (storage) {
        try {
          storage.setItem("masterfilepro-credentials", JSON.stringify(creds))
        } catch {}
      }
    }
    email = newEmail

    if (isRoot) {
      const storage = getStorage()
      if (storage) {
        try {
          const raw = storage.getItem("masterfilepro-admin-config")
          const parsed = raw ? JSON.parse(raw) : {}
          const updatedConfig = {
            ...parsed,
            id: existing.id || "usr_admin_default",
            name: existing.name || "Masterfilepro Administrator",
            email: newEmail,
            role: "admin",
            updatedAt: new Date().toISOString(),
          }
          storage.setItem("masterfilepro-admin-config", JSON.stringify(updatedConfig))
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("masterfilepro-admin-config-changed", {
                detail: updatedConfig,
              }),
            )
          }
        } catch {}
      }

      if (typeof window !== "undefined" && typeof fetch === "function") {
        fetch("/api/db/admin", {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ email: newEmail }),
        }).catch(() => {})
      }
    }
  }

  if (updates.newPassword) {
    if (updates.newPassword.length < 12) {
      throw new Error("Password must be at least 12 characters long.")
    }
    await changeAccountPassword(email, updates.newPassword)
  }

  let requirePasswordReset =
    updates.requirePasswordReset !== undefined
      ? updates.requirePasswordReset
      : existing.requirePasswordReset

  const updated: UserAccount = {
    ...existing,
    name,
    email,
    role,
    subscriptionTier,
    proStatus,
    requirePasswordReset,
  }

  if (idx >= 0) {
    accounts[idx] = updated
    saveRegisteredAccounts(accounts)
  } else if (isRoot) {
    accounts.push(updated)
    saveRegisteredAccounts(accounts)
  }

  const current = getCurrentUser()
  if (
    current &&
    (current.id === userId ||
      (isRoot && isRootAdmin(current)) ||
      current.email.toLowerCase() === existing.email.toLowerCase())
  ) {
    saveCurrentUser(updated)
  }

  pushUserToCloud(updated)

  return updated
}

/**
 * Enforce or clear the "Require Password Reset on Next Login" security policy for a user
 */
export function requireUserPasswordReset(
  userIdOrEmail: string,
  requireReset: boolean = true,
): UserAccount {
  const accounts = getRegisteredAccounts()
  const idx = accounts.findIndex(
    (a) =>
      a.id === userIdOrEmail ||
      a.email.toLowerCase() === userIdOrEmail.toLowerCase(),
  )
  if (idx < 0) {
    throw new Error("User account not found.")
  }

  const updated: UserAccount = {
    ...accounts[idx],
    requirePasswordReset: requireReset,
  }

  accounts[idx] = updated
  saveRegisteredAccounts(accounts)

  const current = getCurrentUser()
  if (
    current &&
    (current.id === updated.id ||
      current.email.toLowerCase() === updated.email.toLowerCase())
  ) {
    saveCurrentUser(updated)
  }

  pushUserToCloud(updated)
  return updated
}
