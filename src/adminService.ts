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
} from "./authService"
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

const TOOL_TIERS_KEY = "fluxkit-tool-tiers"
const TOOL_PRICES_KEY = "fluxkit-tool-prices"

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
        new CustomEvent("fluxkit-tiers-changed", { detail: tiers }),
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
        new CustomEvent("fluxkit-prices-changed", { detail: prices }),
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
        email: `${userId}@fluxkit.com`,
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
        email: `${userId}@fluxkit.com`,
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
  return updated
}

export function approveProSubscription(userId: string): UserAccount {
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
        email: `${userId}@fluxkit.com`,
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
        email: `${userId}@fluxkit.com`,
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
  return updated
}

export function getAllUsers(): UserAccount[] {
  return getRegisteredAccounts()
}

export function updateUserRole(
  userId: string,
  role: "admin" | "sub-admin" | "user",
): UserAccount {
  if (isRootAdmin(userId) && role !== "admin") {
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
}

export function createUserByAdmin(payload: {
  name: string
  email: string
  password: string
  role?: "admin" | "sub-admin" | "user"
  subscriptionTier?: "standard" | "pro"
}): UserAccount {
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
  if (!password || password.length < 8) {
    throw new Error("Password must be at least 8 characters long.")
  }

  const accounts = getRegisteredAccounts()
  if (
    accounts.some((a) => a.email.toLowerCase() === cleanEmail) ||
    cleanEmail === "admin@masterfilepro.com" ||
    cleanEmail === "admin@fluxkit.com"
  ) {
    throw new Error("An account with this email address already exists.")
  }

  // Hash & store credential
  changeAccountPassword(cleanEmail, password)

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
  return newUser
}

export function changeUserPassword(
  userIdOrEmail: string,
  newPassword: string,
): void {
  const accounts = getRegisteredAccounts()
  const found = accounts.find(
    (a) =>
      a.id === userIdOrEmail ||
      a.email.toLowerCase() === userIdOrEmail.toLowerCase(),
  )
  const targetEmail = found ? found.email : userIdOrEmail
  changeAccountPassword(targetEmail, newPassword)
}

export function updateUserDetails(
  userId: string,
  updates: {
    name?: string
    email?: string
    role?: "admin" | "sub-admin" | "user"
    subscriptionTier?: "standard" | "pro"
    proStatus?: "active" | "pending" | "none"
  },
): UserAccount {
  const accounts = getRegisteredAccounts()
  const idx = accounts.findIndex((a) => a.id === userId)
  const isRoot = isRootAdmin(userId)

  if (idx < 0) {
    const current = getCurrentUser()
    if (!current || current.id !== userId) {
      throw new Error("User account not found.")
    }
  }

  const existing = idx >= 0 ? accounts[idx] : getCurrentUser()!

  // Guard: root admin cannot be demoted or stripped of Pro
  let role = updates.role !== undefined ? updates.role : existing.role
  let subscriptionTier =
    updates.subscriptionTier !== undefined
      ? updates.subscriptionTier
      : existing.subscriptionTier
  let proStatus =
    updates.proStatus !== undefined ? updates.proStatus : existing.proStatus

  if (isRoot) {
    role = "admin"
    subscriptionTier = "pro"
    proStatus = "active"
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
          storage.setItem("fluxkit-credentials", JSON.stringify(creds))
        } catch {}
      }
    }
    email = newEmail
  }

  const name =
    updates.name !== undefined ? updates.name.trim() : existing.name
  if (!name) {
    throw new Error("User name cannot be empty.")
  }

  const updated: UserAccount = {
    ...existing,
    name,
    email,
    role,
    subscriptionTier,
    proStatus,
  }

  if (idx >= 0) {
    accounts[idx] = updated
    saveRegisteredAccounts(accounts)
  }

  const current = getCurrentUser()
  if (current && current.id === userId) {
    saveCurrentUser(updated)
  }

  return updated
}
