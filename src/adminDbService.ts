/**
 * Masterfilepro Admin & Database Service
 * Provides database-backed persistence for Administrator credentials,
 * security configurations, and user accounts.
 *
 * Backed by three layers, most authoritative first:
 * 1. Supabase Postgres behind /api/db/* (credentials and pricing live server-side)
 * 2. Client-side IndexedDB (masterfilepro_database -> admin_settings)
 * 3. Synchronous localStorage cache for zero-latency lookups and offline capability
 */

import {
  type UserAccount,
  getCurrentUser,
  saveCurrentUser,
  getRegisteredAccounts,
  saveRegisteredAccounts,
  generateSalt,
  hashPassword,
  SEEDED_ADMIN_ACCOUNT,
  SEEDED_ADMIN_CREDENTIALS,
} from "./authService"
import {
  authHeaders,
  serverChangePassword,
  serverSignIn,
  sharedGetJson,
} from "./sessionService"

export const ADMIN_CONFIG_KEY = "masterfilepro-admin-config"

export const CREDENTIALS_KEY = "masterfilepro-credentials"

export interface AdminDatabaseRecord {
  id: string

  name: string

  email: string

  role: "admin"

  updatedAt: string

  source?: "database" | "local"
}

export interface DatabaseStatus {
  connected: boolean

  engine: string

  serverDbPath: string

  indexedDbReady: boolean

  lastSyncedAt: string

  userCount: number
}

// Default initial admin config matching database

const DEFAULT_ADMIN_CONFIG: AdminDatabaseRecord = {
  id: SEEDED_ADMIN_ACCOUNT.id,

  name: "Masterfilepro Administrator",

  email: "admin@masterfilepro.com",

  role: "admin",

  updatedAt: "2026-11-19T14:57:23.342Z",

  source: "database",
}

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      return window.localStorage
    } catch {
      return null
    }
  }

  if (typeof localStorage !== "undefined") {
    try {
      return localStorage
    } catch {
      return null
    }
  }

  return null
}

/**
 * Reads current admin configuration from localStorage cache
 */

export function getAdminConfig(): AdminDatabaseRecord {
  const storage = getStorage()

  if (storage) {
    try {
      const raw = storage.getItem(ADMIN_CONFIG_KEY)

      if (raw) {
        const parsed = JSON.parse(raw) as AdminDatabaseRecord

        if (parsed && parsed.email) {
          return parsed
        }
      }
    } catch {}
  }

  return { ...DEFAULT_ADMIN_CONFIG }
}

/**
 * Saves admin configuration to localStorage cache
 */

export function saveAdminConfigToLocal(config: AdminDatabaseRecord): void {
  const storage = getStorage()

  if (!storage) return

  try {
    storage.setItem(ADMIN_CONFIG_KEY, JSON.stringify(config))

    window.dispatchEvent(
      new CustomEvent("masterfilepro-admin-config-changed", { detail: config }),
    )
  } catch {}
}

/**
 * IndexedDB helper for robust browser-backed database storage
 */

const DB_NAME = "masterfilepro_admin_db"

const DB_STORE = "admin_settings"

function openAdminIndexedDB(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1)

      request.onupgradeneeded = () => {
        const db = request.result

        if (!db.objectStoreNames.contains(DB_STORE)) {
          db.createObjectStore(DB_STORE, { keyPath: "id" })
        }
      }

      request.onsuccess = () => resolve(request.result)

      request.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

async function saveToIndexedDB(config: AdminDatabaseRecord): Promise<boolean> {
  try {
    const db = await openAdminIndexedDB()

    if (!db) return false

    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, "readwrite")

      const store = tx.objectStore(DB_STORE)

      store.put({ ...config, id: "root_admin" })

      tx.oncomplete = () => resolve(true)

      tx.onerror = () => resolve(false)
    })
  } catch {
    return false
  }
}

async function readFromIndexedDB(): Promise<AdminDatabaseRecord | null> {
  try {
    const db = await openAdminIndexedDB()

    if (!db) return null

    return new Promise((resolve) => {
      const tx = db.transaction(DB_STORE, "readonly")

      const store = tx.objectStore(DB_STORE)

      const request = store.get("root_admin")

      request.onsuccess = () => resolve(request.result || null)

      request.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

/** Saves the admin profile through /api/db/admin; credentials themselves are server-only. */

async function saveToServerDatabase(payload: {
  name: string

  email: string

  passwordChanged?: boolean
}): Promise<{ ok: boolean ; message: string }> {
  try {
    const res = await fetch("/api/db/admin", {
      method: "POST",

      headers: authHeaders({ "Content-Type": "application/json" }),

      body: JSON.stringify(payload),
    })

    if (res.ok) {
      const data = await res.json()

      return { ok: true, message: data.message || "Saved to server database." }
    }

    return { ok: false, message: `Server database status ${res.status}` }
  } catch (err: any) {
    return {
      ok: false,
      message: err.message || "Failed to reach server database",
    }
  }
}

/**
 * Updates administrator credentials at any time.
 * Backed by Server Database + IndexedDB + Local Cache.
 */

export async function updateAdminSettings(options: {
  newName?: string

  newEmail?: string

  currentPassword?: string

  newPassword?: string

  overrideAuthCheck?: boolean
}): Promise<{ success: boolean ; message: string }> {
  const currentConfig = getAdminConfig()

  // Root admin display name and status are locked; only email and password can change
  const cleanName = currentConfig.name || "Masterfilepro Administrator"

  const cleanEmail = (options.newEmail || currentConfig.email || "")
    .trim()
    .toLowerCase()

  const currentPassword = options.currentPassword || ""

  const newPassword = options.newPassword || ""

  if (!cleanName) {
    throw new Error("Administrator name cannot be empty.")
  }

  if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
    throw new Error("Please enter a valid administrator email address.")
  }

  // The server verifies the current password; the browser holds no hash that
  // could be checked here.
  if (newPassword) {
    if (newPassword.length < 12) {
      throw new Error("New password must be at least 12 characters long.")
    }

    const result = await serverChangePassword(currentPassword, newPassword)

    if (result && !result.ok) {
      throw new Error(result.error || "Password change was rejected.")
    }

    if (!result) {
      throw new Error(
        "Could not reach the server to verify your password. Please try again.",
      )
    }

    // The session was revoked by the change, so the new password is signed in again.
    await serverSignIn(cleanEmail, newPassword)
  } else if (cleanEmail !== currentConfig.email && !options.overrideAuthCheck) {
    if (!currentPassword) {
      throw new Error(
        "Please enter your current password to authorize changes.",
      )
    }
  }

  const now = new Date().toISOString()

  const updatedRecord: AdminDatabaseRecord = {
    id: currentConfig.id || SEEDED_ADMIN_ACCOUNT.id,

    name: cleanName,

    email: cleanEmail,

    role: "admin",

    updatedAt: now,

    source: "database",
  }

  // 1. Save to localStorage cache

  saveAdminConfigToLocal(updatedRecord)

  // 2. Keep the offline sign-in mirror under the new address

  const storage = getStorage()

  if (storage) {
    try {
      const rawCreds = storage.getItem(CREDENTIALS_KEY)

      const creds = rawCreds ? JSON.parse(rawCreds) : {}

      if (cleanEmail !== currentConfig.email.toLowerCase()) {
        delete creds[currentConfig.email.toLowerCase()]
      }

      if (newPassword) {
        const mirrorSalt = generateSalt()

        creds[cleanEmail] = {
          salt: mirrorSalt,
          hash: hashPassword(newPassword, mirrorSalt),
        }
      }

      storage.setItem(CREDENTIALS_KEY, JSON.stringify(creds))
    } catch {}
  }

  // 3. Update registered accounts collection so user table displays new admin info

  const accounts = getRegisteredAccounts()

  const adminIndex = accounts.findIndex(
    (a) =>
      a.id === updatedRecord.id ||
      a.email.toLowerCase() === currentConfig.email.toLowerCase(),
  )

  if (adminIndex >= 0) {
    accounts[adminIndex] = {
      ...accounts[adminIndex],

      name: cleanName,

      email: cleanEmail,

      role: "admin",
    }
  } else {
    accounts.unshift({
      id: updatedRecord.id,

      name: cleanName,

      email: cleanEmail,

      provider: "email",

      role: "admin",

      subscriptionTier: "pro",

      proStatus: "active",

      createdAt: "2026-01-01T00:00:00.000Z",

      lastLoginAt: now,
    })
  }

  saveRegisteredAccounts(accounts)

  // 4. Update currently logged in session if active user is admin

  const currentUser = getCurrentUser()

  if (
    currentUser &&
    (currentUser.id === updatedRecord.id ||
      currentUser.role === "admin" ||
      currentUser.email.toLowerCase() === currentConfig.email.toLowerCase())
  ) {
    saveCurrentUser({
      ...currentUser,

      name: cleanName,

      email: cleanEmail,

      role: "admin",
    })
  }

  // 5. Save to client-side IndexedDB database

  await saveToIndexedDB(updatedRecord)

  // 6. Save the profile through the server API

  await saveToServerDatabase({
    name: cleanName,

    email: cleanEmail,

    passwordChanged: Boolean(newPassword),
  })

  return {
    success: true,

    message: "Admin credentials successfully updated and backed by database.",
  }
}

/**
 * Initializes and synchronizes database state between server and client.
 */

export async function initializeDatabaseSync(): Promise<DatabaseStatus> {
  let serverConnected = false

  let lastSync = new Date().toISOString()

  // 1. Fetch server database state

  try {
    const data = await sharedGetJson("/api/db/admin")

    if (data?.ok && data.admin) {
      serverConnected = true

      lastSync = data.database?.syncedAt || lastSync

      const serverAdmin = data.admin

      const localAdmin = getAdminConfig()

      // If server has more recent or custom data, sync into local cache

      if (
        serverAdmin.email &&
        (serverAdmin.email !== DEFAULT_ADMIN_CONFIG.email ||
          new Date(serverAdmin.updatedAt) > new Date(localAdmin.updatedAt))
      ) {
        saveAdminConfigToLocal({
          ...localAdmin,

          name: serverAdmin.name || localAdmin.name,

          email: serverAdmin.email || localAdmin.email,

          updatedAt: serverAdmin.updatedAt || localAdmin.updatedAt,

          source: "database",
        })
      }
    }
  } catch {}

  // 2. Fallback to IndexedDB if local config is default

  const localConfig = getAdminConfig()

  if (localConfig.email === DEFAULT_ADMIN_CONFIG.email) {
    const idbAdmin = await readFromIndexedDB()

    if (
      idbAdmin &&
      idbAdmin.email &&
      idbAdmin.email !== DEFAULT_ADMIN_CONFIG.email
    ) {
      saveAdminConfigToLocal(idbAdmin)
    }
  }

  const accounts = getRegisteredAccounts()

  return {
    connected: true,

    engine: serverConnected
      ? "Supabase Postgres (/api/db/*) + Client IndexedDB"
      : "Client IndexedDB + Local Database Cache",

    serverDbPath: "/api/db/admin",

    indexedDbReady: typeof window !== "undefined" && "indexedDB" in window,

    lastSyncedAt: lastSync,

    userCount: accounts.length + 1,
  }
}

/**
 * Restores the default administrator name and email in the local config store.
 * The password itself is only ever changed through the server.
 */
export async function resetAdminToDefaults(): Promise<{
  success: boolean
  message: string
}> {
  const now = new Date().toISOString()
  const record: AdminDatabaseRecord = {
    ...DEFAULT_ADMIN_CONFIG,
    updatedAt: now,
  }

  saveAdminConfigToLocal(record)
  await saveToIndexedDB(record)
  await saveToServerDatabase({
    name: record.name,
    email: record.email,
  })

  return {
    success: true,
    message: "Administrator credentials reset to default.",
  }
}
