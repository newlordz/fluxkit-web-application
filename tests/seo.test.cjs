const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function loadSource(name, overrides = {}, globals = {}) {
  const cache = new Map()
  function load(id) {
    const full = path.resolve("src", id)
    if (cache.has(full)) return cache.get(full)
    const filename = fs.existsSync(`${full}.tsx`) ? `${full}.tsx` : `${full}.ts`
    const exports = {}
    cache.set(full, exports)
    const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }).outputText
    vm.runInNewContext(
      code,
      {
        exports,
        require: (request) => {
          if (overrides[request]) return overrides[request]
          if (!request.startsWith(".")) return require(request)
          return load(path.relative(path.resolve("src"), path.resolve(path.dirname(full), request)))
        },
        ...globals,
      },
      { filename },
    )
    return exports
  }
  return load(name)
}

const seo = loadSource("seo")
const { tools } = loadSource("config")

test("public tool paths and legacy hashes resolve to the same page", () => {
  assert.equal(seo.pageFromPath("/tools/merge-pdf"), "merge-pdf")
  assert.equal(seo.pageFromPath("/tools/merge-pdf/"), "merge-pdf")
  assert.equal(seo.pageFromPath("/pdf-tools"), "files")
  assert.equal(seo.pageFromPath("/tools/not-a-real-tool"), "not-a-real-tool")
  assert.equal(seo.pageFromPath("/settings"), null)
  assert.equal(seo.pageFromLocation({ pathname: "/tools/qr", hash: "#settings" }), "settings")
  assert.equal(seo.pathForPage("merge-pdf"), "/tools/merge-pdf")
  assert.equal(seo.pathForPage("all"), "/tools")
  assert.equal(seo.pathForPage("settings"), null)
  assert.equal(seo.pathForPage("activity"), null)
})

test("public pages get canonical metadata and private pages stay noindex", () => {
  const tool = seo.getPageMetadata("merge-pdf")
  assert.equal(tool.title, "Merge PDF Online | MasterfilePro")
  assert.equal(tool.canonical, "https://masterfilepro.com/tools/merge-pdf")
  assert.equal(tool.robots, "index, follow")
  assert.equal(seo.getPageMetadata("overview").canonical, "https://masterfilepro.com/")

  for (const page of ["settings", "documents", "activity", "meetings", "whiteboards", "admin", "sign-in", "showcase", "not-a-real-tool"]) {
    const metadata = seo.getPageMetadata(page)
    assert.equal(metadata.robots, "noindex, follow", page)
    assert.equal(metadata.canonical, null, page)
  }
  assert.equal(seo.isIndexablePage("audio-text"), true)
  assert.equal(seo.isIndexablePage("not-a-real-tool"), false)
})

test("sitemap contains every available tool and no private or hash URLs", () => {
  assert.equal(new Set(seo.sitemapUrls).size, seo.sitemapUrls.length)
  assert.ok(seo.sitemapUrls.includes("https://masterfilepro.com/tools/merge-pdf"))
  assert.ok(seo.sitemapUrls.includes("https://masterfilepro.com/tools/qr"))
  for (const tool of tools.filter(
    (entry) => entry.available && entry.category !== "Workspace",
  )) {
    assert.ok(seo.sitemapUrls.includes(`https://masterfilepro.com/tools/${tool.id}`), tool.id)
  }
  for (const url of seo.sitemapUrls) {
    assert.ok(url.startsWith("https://masterfilepro.com/"), url)
    assert.doesNotMatch(url, /#|admin|settings|sign-in|activity|showcase|documents|meetings|whiteboards/, url)
  }
})

test("metadata updates replace canonical and structured data on private routes", () => {
  const elements = new Map()
  function element(attributes = {}) {
    return {
      attributes: { ...attributes },
      removed: false,
      setAttribute(key, value) { this.attributes[key] = value },
      remove() { this.removed = true },
    }
  }
  for (const key of ["description", "robots"]) {
    elements.set(`meta[name="${key}"]`, element({ name: key }))
  }
  for (const key of ["og:site_name", "og:type", "og:title", "og:description", "og:url"]) {
    elements.set(`meta[property="${key}"]`, element({ property: key }))
  }
  for (const key of ["twitter:title", "twitter:description"]) {
    elements.set(`meta[name="${key}"]`, element({ name: key }))
  }
  const canonical = element({ rel: "canonical" })
  const script = element({ id: "page-structured-data", type: "application/ld+json" })
  elements.set('link[rel="canonical"]', canonical)
  elements.set("#page-structured-data", script)

  const document = {
    title: "",
    querySelector: (selector) => elements.get(selector) || null,
    head: {
      querySelector: (selector) => elements.get(selector) || null,
      appendChild: (child) => child,
    },
    createElement: () => element(),
  }
  const runtimeSeo = loadSource("seo", {}, { document })

  runtimeSeo.updatePageMetadata("merge-pdf")
  assert.equal(document.title, "Merge PDF Online | MasterfilePro")
  assert.equal(canonical.href, "https://masterfilepro.com/tools/merge-pdf")
  assert.equal(elements.get('meta[name="robots"]').attributes.content, "index, follow")
  assert.match(script.textContent, /BreadcrumbList/)

  runtimeSeo.updatePageMetadata("settings")
  assert.equal(document.title, "MasterfilePro")
  assert.equal(elements.get('meta[name="robots"]').attributes.content, "noindex, follow")
  assert.equal(canonical.removed, true)
  assert.equal(script.removed, true)
})

test("robots, sitemap build hook, and Vercel routes expose only intended crawl paths", () => {
  const robots = fs.readFileSync(path.resolve("public/robots.txt"), "utf8")
  assert.match(robots, /Sitemap: https:\/\/masterfilepro\.com\/sitemap\.xml/)
  assert.match(robots, /Disallow: \/api\//)
  assert.match(robots, /Disallow: \/admin\//)

  const vercel = JSON.parse(fs.readFileSync(path.resolve("vercel.json"), "utf8"))
  for (const source of ["/tools", "/tools/:tool", "/pdf-tools", "/qr-tools", "/ai-text-tools", "/audio-tools", "/help"]) {
    assert.ok(vercel.rewrites.some((rewrite) => rewrite.source === source && rewrite.destination === "/index.html"), source)
  }
  const apiHeaders = vercel.headers.find((entry) => entry.source === "/api/(.*)")
  assert.ok(apiHeaders.headers.some((header) => header.key === "X-Robots-Tag" && header.value.includes("noindex")))

  const viteConfig = fs.readFileSync(path.resolve("vite.config.ts"), "utf8")
  assert.match(viteConfig, /masterfileproSitemapPlugin\(\)/)
  assert.match(viteConfig, /fileName: "sitemap\.xml"/)

  const html = fs.readFileSync(path.resolve("index.html"), "utf8")
  assert.match(html, /<link rel="canonical" href="https:\/\/masterfilepro\.com\/" \/>/)
  assert.match(html, /<meta name="robots" content="index, follow" \/>/)
  assert.doesNotMatch(html, /Figma Make App/)
  assert.equal((html.match(/name="description"/g) || []).length, 0)

  const site = JSON.parse(fs.readFileSync(path.resolve(".figma/make/site.json"), "utf8"))
  assert.equal(site.title, "MasterfilePro — Online PDF, QR & Document Tools")
  assert.equal(site.openGraph.image, "https://masterfilepro.com/masterfilepro-logo.png")
})
