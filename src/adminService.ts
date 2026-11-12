import {
  type UserAccount,
  getCurrentUser,
  saveCurrentUser,
  getRegisteredAccounts,
  saveRegisteredAccounts,
} from "./authService"
import { tools } from "./config"

const TOOL_TIERS_KEY = "fluxkit-tool-tiers"

// In-memory fallback for test harnesses without localStorage
let inMemoryTiers: Record<string, "standard" | "pro"> | null = null

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
  if (user.role === "admin") {
    return true
  }
  return user.subscriptionTier === "pro" && user.proStatus === "active"
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
  role: "admin" | "user",
): UserAccount {
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
