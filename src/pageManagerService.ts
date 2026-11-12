import { tools } from "./config"

export interface CustomPage {
  id: string
  slug: string
  title: string
  navTitle?: string
  description?: string
  content: string
  showInNav: boolean
  navOrder?: number
  status: "published" | "draft"
  createdAt: string
  updatedAt: string
}

const CUSTOM_PAGES_KEY = "fluxkit-custom-pages"

const RESERVED_SLUGS = new Set([
  "admin",
  "overview",
  "all",
  "files",
  "qr-tools",
  "ai",
  "audio",
  "documents",
  "activity",
  "settings",
  "help",
  "qr",
  "sign-in",
  "sign-up",
  "reset-password",
  ...tools.map((t) => t.id),
])

let inMemoryPages: CustomPage[] | null = null

function getStorage(): Storage | null {
  if (typeof window !== "undefined" && window.localStorage) {
    return window.localStorage
  }
  if (typeof localStorage !== "undefined") {
    return localStorage
  }
  return null
}

export function getCustomPages(): CustomPage[] {
  const storage = getStorage()
  if (storage) {
    try {
      const raw = storage.getItem(CUSTOM_PAGES_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
  }
  if (inMemoryPages) return [...inMemoryPages]
  return []
}

export function saveCustomPages(pages: CustomPage[]): void {
  inMemoryPages = [...pages]
  const storage = getStorage()
  if (storage) {
    try {
      storage.setItem(CUSTOM_PAGES_KEY, JSON.stringify(pages))
      window.dispatchEvent(
        new CustomEvent("fluxkit-pages-changed", { detail: pages }),
      )
    } catch {}
  }
}

export function getPublishedCustomPages(): CustomPage[] {
  return getCustomPages().filter((p) => p.status === "published")
}

export function getCustomPageBySlug(slug: string): CustomPage | null {
  const normalized = slug.trim().toLowerCase()
  const pages = getCustomPages()
  return pages.find((p) => p.slug.toLowerCase() === normalized) || null
}

export function getCustomPageById(id: string): CustomPage | null {
  const pages = getCustomPages()
  return pages.find((p) => p.id === id) || null
}

export function createCustomPage(
  data: Partial<CustomPage> & { slug: string; title: string; content: string },
): CustomPage {
  const cleanSlug = data.slug.trim().toLowerCase()

  if (!cleanSlug) {
    throw new Error("Page slug cannot be empty (invalid slug)")
  }

  if (RESERVED_SLUGS.has(cleanSlug)) {
    throw new Error(
      `The slug '${cleanSlug}' is reserved by the system (reserved collision)`,
    )
  }

  const existing = getCustomPages()
  if (existing.some((p) => p.slug.toLowerCase() === cleanSlug)) {
    throw new Error(
      `A page with slug '${cleanSlug}' already exists (slug collision)`,
    )
  }

  const now = new Date().toISOString()
  const newPage: CustomPage = {
    id: `page_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    slug: cleanSlug,
    title: data.title.trim(),
    navTitle: data.navTitle?.trim() || data.title.trim(),
    description: data.description?.trim() || "",
    content: data.content,
    showInNav: data.showInNav ?? false,
    navOrder: data.navOrder ?? existing.length + 1,
    status: data.status || "published",
    createdAt: now,
    updatedAt: now,
  }

  existing.push(newPage)
  saveCustomPages(existing)
  return newPage
}

export function updateCustomPage(
  id: string,
  updates: Partial<CustomPage>,
): CustomPage {
  const pages = getCustomPages()
  const idx = pages.findIndex((p) => p.id === id)
  if (idx < 0) {
    throw new Error(`Custom page with id '${id}' not found`)
  }

  if (updates.slug !== undefined) {
    const cleanSlug = updates.slug.trim().toLowerCase()
    if (!cleanSlug) throw new Error("Page slug cannot be empty (invalid slug)")
    if (RESERVED_SLUGS.has(cleanSlug)) {
      throw new Error(`Slug '${cleanSlug}' is reserved (reserved collision)`)
    }
    const duplicate = pages.find(
      (p) => p.slug.toLowerCase() === cleanSlug && p.id !== id,
    )
    if (duplicate) {
      throw new Error(`Slug '${cleanSlug}' is already in use (slug collision)`)
    }
    updates.slug = cleanSlug
  }

  const updated: CustomPage = {
    ...pages[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  }

  pages[idx] = updated
  saveCustomPages(pages)
  return updated
}

export function deleteCustomPage(id: string): boolean {
  const pages = getCustomPages()
  const filtered = pages.filter((p) => p.id !== id)
  if (filtered.length === pages.length) {
    return false
  }
  saveCustomPages(filtered)
  return true
}
