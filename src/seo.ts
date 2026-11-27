import { tools } from "./config"

export const SITE_URL = "https://masterfilepro.com"
export const SITE_NAME = "MasterfilePro"
export const SITE_DESCRIPTION =
  "A browser-based toolkit for PDF, document, image, QR, audio, and AI text tasks. Process files online without installing software."

type StaticRoute = {
  page: string
  path: string
  title: string
  description: string
}

const staticRoutes: StaticRoute[] = [
  {
    page: "overview",
    path: "/",
    title: "MasterfilePro — Online PDF, QR & Document Tools",
    description: SITE_DESCRIPTION,
  },
  {
    page: "all",
    path: "/tools",
    title: "All File, PDF, QR & AI Tools | MasterfilePro",
    description:
      "Explore MasterfilePro's complete toolkit for PDF files, documents, images, QR codes, audio transcription, and AI text work.",
  },
  {
    page: "files",
    path: "/pdf-tools",
    title: "Online PDF & Document Tools | MasterfilePro",
    description:
      "Merge, split, compress, convert, edit, sign, and protect PDF and document files online with MasterfilePro.",
  },
  {
    page: "qr-tools",
    path: "/qr-tools",
    title: "Online QR Code & Sharing Tools | MasterfilePro",
    description:
      "Create custom QR codes, mobile showcases, vCards, event passes, and shareable content with MasterfilePro.",
  },
  {
    page: "ai",
    path: "/ai-text-tools",
    title: "Online AI Text & Document Tools | MasterfilePro",
    description:
      "Summarize, rewrite, translate, compare, and analyze text or documents online with MasterfilePro's AI text toolkit.",
  },
  {
    page: "audio",
    path: "/audio-tools",
    title: "Online Audio Transcription Tools | MasterfilePro",
    description:
      "Turn voice recordings into editable, downloadable text with MasterfilePro's browser-based audio transcription tools.",
  },
  {
    page: "help",
    path: "/help",
    title: "Help & Tool Guides | MasterfilePro",
    description:
      "Find guides, answers, and practical tips for using MasterfilePro's file, PDF, QR, audio, and AI tools.",
  },
]

const staticByPage = new Map(staticRoutes.map((route) => [route.page, route]))
const staticByPath = new Map(staticRoutes.map((route) => [route.path, route]))
const toolById = new Map(tools.map((tool) => [tool.id, tool]))
const publicTools = tools.filter(
  (tool) => tool.available && tool.category !== "Workspace",
)
const publicToolById = new Map(publicTools.map((tool) => [tool.id, tool]))

export function normalizePath(pathname: string): string {
  const path = pathname.split("?")[0].replace(/\/+$/, "")
  return path || "/"
}

export function pageFromPath(pathname: string): string | null {
  const path = normalizePath(pathname)
  const staticRoute = staticByPath.get(path)
  if (staticRoute) return staticRoute.page
  if (!path.startsWith("/tools/")) return null

  const toolId = path.slice("/tools/".length)
  return /^[a-z0-9-]+$/.test(toolId) ? toolId : null
}

export function pageFromLocation(location: {
  hash?: string
  pathname?: string
}): string {
  const hash = location.hash?.replace(/^#/, "") || ""
  return hash || pageFromPath(location.pathname || "/") || "overview"
}

export function pathForPage(page: string): string | null {
  const route = page.split("?")[0]
  const staticRoute = staticByPage.get(route)
  if (staticRoute) return staticRoute.path
  return publicToolById.has(route) ? `/tools/${route}` : null
}

export function isIndexablePage(page: string): boolean {
  const route = page.split("?")[0]
  return staticByPage.has(route) || publicToolById.has(route)
}

export function getPageMetadata(page: string) {
  const route = page.split("?")[0]
  const staticRoute = staticByPage.get(route)
  const selectedTool = toolById.get(route)
  const indexable = isIndexablePage(route)
  const canonicalPath = indexable ? pathForPage(route) : null
  const title = staticRoute?.title
    ? staticRoute.title
    : selectedTool
      ? `${selectedTool.name} Online | MasterfilePro`
      : "MasterfilePro"
  const description = staticRoute?.description
    ? staticRoute.description
    : selectedTool
      ? `${selectedTool.description} Use it online in your browser with MasterfilePro.`
      : SITE_DESCRIPTION

  return {
    title,
    description,
    canonical: canonicalPath ? `${SITE_URL}${canonicalPath}` : null,
    robots: indexable ? "index, follow" : "noindex, follow",
  }
}

function setMeta(attribute: "name" | "property", key: string, content: string) {
  let element = document.head.querySelector<HTMLMetaElement>(
    `meta[${attribute}="${key}"]`,
  )
  if (!element) {
    element = document.createElement("meta")
    element.setAttribute(attribute, key)
    document.head.appendChild(element)
  }
  element.setAttribute("content", content)
}

function structuredDataForPage(page: string, description: string) {
  const route = page.split("?")[0]
  if (route === "overview") {
    return {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      description,
    }
  }

  const tool = publicToolById.get(route)
  if (!tool) return null
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      {
        "@type": "ListItem",
        position: 1,
        name: "Home",
        item: `${SITE_URL}/`,
      },
      {
        "@type": "ListItem",
        position: 2,
        name: "Tools",
        item: `${SITE_URL}/tools`,
      },
      {
        "@type": "ListItem",
        position: 3,
        name: tool.name,
        item: `${SITE_URL}/tools/${tool.id}`,
      },
    ],
  }
}

export function updatePageMetadata(page: string) {
  if (typeof document === "undefined") return

  const metadata = getPageMetadata(page)
  document.title = metadata.title
  setMeta("name", "description", metadata.description)
  setMeta("name", "robots", metadata.robots)
  setMeta("property", "og:site_name", SITE_NAME)
  setMeta("property", "og:type", "website")
  setMeta("property", "og:title", metadata.title)
  setMeta("property", "og:description", metadata.description)
  setMeta("property", "og:url", metadata.canonical || `${SITE_URL}/`)
  setMeta("name", "twitter:title", metadata.title)
  setMeta("name", "twitter:description", metadata.description)

  let canonical = document.head.querySelector<HTMLLinkElement>(
    'link[rel="canonical"]',
  )
  if (metadata.canonical) {
    if (!canonical) {
      canonical = document.createElement("link")
      canonical.rel = "canonical"
      document.head.appendChild(canonical)
    }
    canonical.href = metadata.canonical
  } else {
    canonical?.remove()
  }

  const structuredData = structuredDataForPage(page, metadata.description)
  let script = document.querySelector<HTMLScriptElement>("#page-structured-data")
  if (structuredData) {
    if (!script) {
      script = document.createElement("script")
      script.id = "page-structured-data"
      script.type = "application/ld+json"
      document.head.appendChild(script)
    }
    script.textContent = JSON.stringify(structuredData)
  } else {
    script?.remove()
  }
}

export const sitemapUrls = Array.from(
  new Set([
    ...staticRoutes.map((route) => `${SITE_URL}${route.path}`),
    ...publicTools.map((tool) => `${SITE_URL}/tools/${tool.id}`),
  ]),
)
