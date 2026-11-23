/**
 * One-time carry-over of data written under the retired FluxKit identifiers.
 * Runs before React mounts so every service reads its renamed key or database.
 */

const LEGACY_KEY = /^fluxkit([-_].*)$/
const CURRENT_PREFIX = "masterfilepro"

const LEGACY_DATABASES = [
  { from: "FluxKitDocumentsDB", to: "MasterfileproDocumentsDB" },
  { from: "fluxkit_admin_db", to: "masterfilepro_admin_db" },
]

// Seeding is skipped when this flag is set, so it may only move across once the
// documents themselves are in the new database.
const INIT_FLAG = "fluxkit_db_initialized"

function migrateStorage(store: Storage, skip: string[]): number {
  const names: string[] = []
  for (let index = 0; index < store.length; index++) {
    const key = store.key(index)
    if (key) names.push(key)
  }

  let carried = 0
  for (const key of names) {
    const match = LEGACY_KEY.exec(key)
    if (!match || skip.includes(key)) continue
    const value = store.getItem(key)
    if (value === null) continue
    const next = `${CURRENT_PREFIX}${match[1]}`
    // The legacy entry is left in place so an already-open tab running the
    // previous bundle keeps reading what it wrote.
    if (store.getItem(next) === null) {
      store.setItem(next, value)
      carried++
    }
  }
  return carried
}

function openDatabase(name: string, version?: number): Promise<{
  db: IDBDatabase
  created: boolean
}> {
  return new Promise((resolve, reject) => {
    let created = false
    let request: IDBOpenDBRequest
    try {
      request = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version)
    } catch (error) {
      reject(error)
      return
    }
    request.onupgradeneeded = () => {
      created = true
    }
    request.onsuccess = () => resolve({ db: request.result, created })
    request.onerror = () => reject(request.error)
    request.onblocked = () => reject(new Error(`${name} upgrade blocked`))
  })
}

type StorePlan = {
  name: string
  keyPath: IDBObjectStore["keyPath"]
  autoIncrement: boolean
  indexes: { name: string; keyPath: IDBObjectStore["keyPath"]; unique: boolean; multiEntry: boolean }[]
  records: { key: IDBValidKey; value: unknown }[]
}

function snapshot(store: IDBObjectStore): Promise<StorePlan> {
  return new Promise((resolve, reject) => {
    const keysRequest = store.getAllKeys()
    const valuesRequest = store.getAll()
    let keys: IDBValidKey[] | null = null
    let values: unknown[] | null = null
    // Both handlers are attached before either result can arrive; awaiting one
    // inside the other's callback loses the race on small stores.
    const finish = () => {
      const capturedKeys = keys
      const capturedValues = values
      if (!capturedKeys || !capturedValues) return
      resolve({
        name: store.name,
        keyPath: store.keyPath,
        autoIncrement: store.autoIncrement,
        indexes: Array.from(store.indexNames).map((indexName) => {
          const index = store.index(indexName)
          return {
            name: indexName,
            keyPath: index.keyPath,
            unique: index.unique,
            multiEntry: index.multiEntry,
          }
        }),
        records: capturedKeys.map((key, position) => ({
          key,
          value: capturedValues[position],
        })),
      })
    }
    keysRequest.onsuccess = () => {
      keys = keysRequest.result as IDBValidKey[]
      finish()
    }
    valuesRequest.onsuccess = () => {
      values = valuesRequest.result as unknown[]
      finish()
    }
    keysRequest.onerror = () => reject(keysRequest.error)
    valuesRequest.onerror = () => reject(valuesRequest.error)
  })
}

async function copyDatabase(from: string, to: string): Promise<boolean> {
  const legacy = await openDatabase(from)
  if (legacy.created) {
    // Opening a name that never existed provisions an empty database; remove it.
    legacy.db.close()
    await new Promise<void>((done) => {
      const request = indexedDB.deleteDatabase(from)
      request.onsuccess = () => done()
      request.onerror = () => done()
      request.onblocked = () => done()
    })
    return false
  }

  const version = legacy.db.version
  const names = Array.from(legacy.db.objectStoreNames)
  const tx = legacy.db.transaction(names, "readonly")
  const plans = await Promise.all(names.map((name) => snapshot(tx.objectStore(name))))
  legacy.db.close()

  if (!plans.some((plan) => plan.records.length)) return false

  const target = await openTarget(to, version, plans)
  let wrote = false
  const normalize = (key: IDBValidKey) =>
    Array.isArray(key) ? key.join("|") : String(key)
  for (const plan of plans) {
    if (!target.db.objectStoreNames.contains(plan.name)) continue
    const writeTx = target.db.transaction(plan.name, "readwrite")
    const store = writeTx.objectStore(plan.name)
    // Keys the new database already holds win, so a re-run after a partial
    // migration can never overwrite an edit made under the new name.
    const present = await new Promise<Set<string>>((resolve, reject) => {
      const request = store.getAllKeys()
      request.onsuccess = () =>
        resolve(new Set((request.result as IDBValidKey[]).map(normalize)))
      request.onerror = () => reject(request.error)
    })
    for (const record of plan.records) {
      if (present.has(normalize(record.key))) continue
      // An in-line key store rejects an explicit key argument outright.
      if (plan.keyPath) store.put(record.value)
      else store.put(record.value, record.key)
      wrote = true
    }
    await new Promise<void>((resolve, reject) => {
      writeTx.oncomplete = () => resolve()
      writeTx.onabort = () => reject(writeTx.error)
    })
  }
  target.db.close()
  return wrote
}

function openTarget(name: string, version: number, plans: StorePlan[]) {
  return new Promise<{ db: IDBDatabase }>((resolve, reject) => {
    const request = indexedDB.open(name, version)
    request.onupgradeneeded = () => {
      const db = request.result
      for (const plan of plans) {
        if (db.objectStoreNames.contains(plan.name)) continue
        const store = db.createObjectStore(plan.name, {
          keyPath: plan.keyPath ?? undefined,
          autoIncrement: plan.autoIncrement,
        })
        for (const index of plan.indexes) {
          store.createIndex(index.name, index.keyPath as string, {
            unique: index.unique,
            multiEntry: index.multiEntry,
          })
        }
      }
    }
    request.onsuccess = () => resolve({ db: request.result })
    request.onerror = () => reject(request.error)
  })
}

export async function migrateLegacyBrandStorage(): Promise<void> {
  if (typeof window === "undefined") return

  migrateStorage(window.localStorage, [INIT_FLAG])
  migrateStorage(window.sessionStorage, [])

  if (typeof indexedDB === "undefined") return

  let documentsCarried = false
  for (const database of LEGACY_DATABASES) {
    try {
      const copied = await copyDatabase(database.from, database.to)
      if (copied && database.from === "FluxKitDocumentsDB") documentsCarried = true
    } catch {
      // A failed copy leaves the legacy database untouched and readable.
    }
  }

  if (documentsCarried && window.localStorage.getItem(INIT_FLAG) !== null) {
    window.localStorage.setItem("masterfilepro_db_initialized", "true")
  }
}
