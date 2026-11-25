const test = require("node:test")
const assert = require("node:assert")
const fs = require("node:fs")
const path = require("node:path")
const ts = require("typescript")
const vm = require("node:vm")

function loadShowcaseService() {
  const filePath = path.resolve(__dirname, "../src/imageShowcaseService.ts")
  const source = fs.readFileSync(filePath, "utf8")
  const code = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText

  const wrapper = `(function (exports, require, module, __filename, __dirname) {\n${code}\n})`
  const compiled = vm.runInThisContext(wrapper, { filename: filePath })
  const mod = { exports: {} }
  compiled(mod.exports, require, mod, filePath, path.dirname(filePath))
  return mod.exports
}

test("Showcase ID generation produces unique url-safe keys", () => {
  const service = loadShowcaseService()
  const id1 = service.generateShowcaseId()
  const id2 = service.generateShowcaseId()
  assert.ok(id1.startsWith("sh_"), "ID should start with prefix sh_")
  assert.notStrictEqual(id1, id2, "Generated IDs should be unique")
})

test("Showcase encode and decode preserves metadata without loss", () => {
  const service = loadShowcaseService()
  const original = {
    id: "sh_test_123",
    title: "Summer Flyer",
    description: "20% off all menu items this weekend!",
    badgeText: "SPECIAL OFFER",
    theme: "polaroid",
    imageDataUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    downloadAllowed: true,
    ctaEnabled: true,
    ctaLabel: "Visit Cafe",
    ctaUrl: "https://example.com/cafe",
    createdAt: new Date().toISOString(),
  }

  const hash = service.encodeShowcaseToHash(original)
  assert.ok(typeof hash === "string" && hash.length > 0, "Hash should be non-empty string")
  assert.ok(!hash.includes("+") && !hash.includes("/"), "Hash should be URL-safe (base64url)")

  const decoded = service.decodeShowcaseFromHash(hash)
  assert.deepStrictEqual(decoded.id, original.id)
  assert.deepStrictEqual(decoded.title, original.title)
  assert.deepStrictEqual(decoded.theme, original.theme)
  assert.deepStrictEqual(decoded.ctaLabel, original.ctaLabel)
  assert.deepStrictEqual(decoded.ctaUrl, original.ctaUrl)
  assert.deepStrictEqual(decoded.downloadAllowed, true)
})

test("Showcase themes include all presets and the custom blend", () => {
  const service = loadShowcaseService()
  const themes = ["glassmorphism", "polaroid", "obsidian", "editorial", "vibrant", "billboard", "custom"]
  for (const t of themes) {
    const data = {
      id: `sh_${t}`,
      title: `${t} test`,
      theme: t,
      imageDataUrl: "data:image/png;base64,test",
      downloadAllowed: true,
      ctaEnabled: false,
      createdAt: new Date().toISOString(),
    }
    const hash = service.encodeShowcaseToHash(data)
    const decoded = service.decodeShowcaseFromHash(hash)
    assert.strictEqual(decoded.theme, t)
  }
})

test("Custom showcase colors survive portable payloads", () => {
  const service = loadShowcaseService()
  const customColors = { startColor: "#123456", endColor: "#fedcba" }
  const original = {
    id: "sh_custom_colors",
    title: "Custom blend",
    theme: "custom",
    customColors,
    imageDataUrl: "data:image/png;base64,test",
    downloadAllowed: true,
    ctaEnabled: false,
    createdAt: new Date().toISOString(),
  }

  const decoded = service.decodeShowcaseFromHash(service.encodeShowcaseToHash(original))
  assert.deepStrictEqual(decoded.customColors, customColors)
})

test("Custom palette defaults missing or unsafe colors and selects readable text", () => {
  const service = loadShowcaseService()
  const defaults = service.getShowcaseCustomPalette()
  assert.strictEqual(defaults.startColor, "#4f46e5")
  assert.strictEqual(defaults.endColor, "#ec4899")
  assert.strictEqual(defaults.textColor, "#ffffff")
  assert.strictEqual(defaults.gradient, "linear-gradient(135deg, #4f46e5, #ec4899)")

  const light = service.getShowcaseCustomPalette({ startColor: "#ffffff", endColor: "#fef08a" })
  assert.strictEqual(light.textColor, "#0f172a")
  assert.strictEqual(light.isLight, true)

  const safe = service.getShowcaseCustomPalette({
    startColor: "url(javascript:alert(1))",
    endColor: "#123",
  })
  assert.strictEqual(safe.startColor, defaults.startColor)
  assert.strictEqual(safe.endColor, defaults.endColor)
})
