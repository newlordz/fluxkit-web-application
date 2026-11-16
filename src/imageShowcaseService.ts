/**
 * Image Showcase Service
 * Manages storage, retrieval, and encoding for Image QR Code landing pages.
 * Supports dual-tier persistence:
 * 1. Serverless API sync (/api/showcase) with memory & redis/file caching
 * 2. Client-side localStorage persistence for instant, zero-latency access
 * 3. Base64 URL payload hash fallback for 100% standalone cross-device resilience
 */

export type ShowcaseTheme =
  | "glassmorphism"
  | "polaroid"
  | "obsidian"
  | "editorial"
  | "vibrant"
  | "billboard"

export interface ImageShowcaseData {
  id: string
  title: string
  description?: string
  badgeText?: string
  theme: ShowcaseTheme
  imageDataUrl: string
  downloadAllowed: boolean
  ctaEnabled: boolean
  ctaLabel?: string
  ctaUrl?: string
  accentColor?: string
  aspectRatio?: "square" | "portrait" | "landscape" | "auto"
  createdAt: string
}

const STORAGE_PREFIX = "fluxkit-showcase-"
const inMemoryCache = new Map<string, ImageShowcaseData>()

/**
 * Compresses an uploaded image file into an optimized Data URL for instant mobile loading.
 * Caps maximum dimension at 1400px and uses high-efficiency WebP/JPEG encoding.
 */
export async function optimizeShowcaseImage(
  file: File,
  maxDimension = 1400,
  quality = 0.85,
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Failed to read image file."))
    reader.onload = () => {
      const img = new window.Image()
      img.onerror = () => reject(new Error("Failed to decode image."))
      img.onload = () => {
        let width = img.naturalWidth || img.width
        let height = img.naturalHeight || img.height

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width)
            width = maxDimension
          } else {
            width = Math.round((width * maxDimension) / height)
            height = maxDimension
          }
        }

        const canvas = document.createElement("canvas")
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext("2d")
        if (!ctx) {
          resolve({ dataUrl: reader.result as string, width, height })
          return
        }

        // Draw with high quality smoothing
        ctx.imageSmoothingEnabled = true
        ctx.imageSmoothingQuality = "high"
        ctx.drawImage(img, 0, 0, width, height)

        // Try webp first, fallback to jpeg
        let dataUrl: string
        try {
          dataUrl = canvas.toDataURL("image/webp", quality)
          if (!dataUrl.startsWith("data:image/webp")) {
            dataUrl = canvas.toDataURL("image/jpeg", quality)
          }
        } catch {
          dataUrl = canvas.toDataURL("image/jpeg", quality)
        }

        resolve({ dataUrl, width, height })
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}

/**
 * Generate a unique, url-safe identifier for the showcase.
 */
export function generateShowcaseId(): string {
  const ts = Date.now().toString(36)
  const rand = Math.random().toString(36).substring(2, 8)
  return `sh_${ts}_${rand}`
}

/**
 * Encodes showcase metadata (excluding heavy base64 image or including compact image)
 * into a URL-safe hash fragment for portable sharing.
 */
export function encodeShowcaseToHash(data: ImageShowcaseData): string {
  try {
    const json = JSON.stringify(data)
    // Convert utf-8 string to base64url safely
    const bytes = new TextEncoder().encode(json)
    let binary = ""
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "")
  } catch {
    return ""
  }
}

/**
 * Decodes showcase data from URL-safe base64 hash.
 */
export function decodeShowcaseFromHash(hash: string): ImageShowcaseData | null {
  try {
    const base64 = hash.replace(/-/g, "+").replace(/_/g, "/")
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    const json = new TextDecoder().decode(bytes)
    const parsed = JSON.parse(json)
    if (parsed && parsed.id && parsed.imageDataUrl) {
      return parsed as ImageShowcaseData
    }
    return null
  } catch {
    return null
  }
}

/**
 * Saves a showcase to local storage, in-memory cache, and asynchronously syncs to backend API.
 */
export async function saveShowcase(data: ImageShowcaseData): Promise<{
  id: string
  url: string
}> {
  inMemoryCache.set(data.id, data)

  // 1. Store in localStorage
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      window.localStorage.setItem(
        `${STORAGE_PREFIX}${data.id}`,
        JSON.stringify(data),
      )
    } catch (err) {
      console.warn("Local storage write warning:", err)
    }
  }

  // 2. Asynchronously sync to backend API (fire and forget with error boundary)
  try {
    fetch("/api/showcase", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    }).catch(() => {
      // Backend sync error silently handled; local and hash fallback exist
    })
  } catch {
    // ignore
  }

  // 3. Construct target URL
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://fluxfix.de5.net"

  // If the image is compact (< 80KB), we can also attach the encoded payload as backup
  let url = `${origin}/#showcase?id=${data.id}`
  if (data.imageDataUrl && data.imageDataUrl.length < 80000) {
    const hash = encodeShowcaseToHash(data)
    if (hash) {
      url = `${origin}/#showcase?id=${data.id}&p=${hash}`
    }
  }

  return { id: data.id, url }
}

/**
 * Retrieves showcase data by ID, checking:
 * 1. In-memory cache
 * 2. URL hash payload parameter (`p`)
 * 3. LocalStorage
 * 4. Backend API `/api/showcase?id=...`
 */
export async function getShowcase(
  id: string,
  hashPayload?: string,
): Promise<ImageShowcaseData | null> {
  // 1. In-memory
  if (inMemoryCache.has(id)) {
    return inMemoryCache.get(id)!
  }

  // 2. Hash payload parameter
  if (hashPayload) {
    const decoded = decodeShowcaseFromHash(hashPayload)
    if (decoded && (decoded.id === id || !id)) {
      inMemoryCache.set(decoded.id, decoded)
      return decoded
    }
  }

  // 3. LocalStorage
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${id}`)
      if (raw) {
        const parsed = JSON.parse(raw) as ImageShowcaseData
        if (parsed && parsed.id) {
          inMemoryCache.set(id, parsed)
          return parsed
        }
      }
    } catch {
      // ignore
    }
  }

  // 4. Backend API
  try {
    const res = await fetch(`/api/showcase?id=${encodeURIComponent(id)}`)
    if (res.ok) {
      const data = await res.json()
      if (data && data.id && data.imageDataUrl) {
        inMemoryCache.set(id, data)
        return data as ImageShowcaseData
      }
    }
  } catch {
    // API unavailable
  }

  return null
}
