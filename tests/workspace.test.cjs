const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")
const React = require("react")
const { renderToStaticMarkup } = require("react-dom/server")

// Compile source in memory for dependency-free service and render smoke checks.
// This does not replace interactive browser or provider integration testing.
function sourceLoader(hash = "overview", pathname = "/") {
  const cache = new Map()
  function load(name) {
    const full = path.resolve("src", name)
    if (cache.has(full)) return cache.get(full)
    const filename = fs.existsSync(full + ".tsx") ? full + ".tsx" : full + ".ts"
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
        require: (id) => {
          if (id === "./services")
            return { apiBaseUrl: undefined, download: () => {} }
          return id.startsWith(".")
            ? load(
                path.relative(
                  path.resolve("src"),
                  path.resolve(path.dirname(full), id),
                ),
              )
            : require(id)
        },
        location: { hash: hash ? `#${hash}` : "", pathname },
        localStorage: { getItem: () => null },
        setTimeout,
        clearTimeout,
        AbortSignal,
        DOMException,
      },
      { filename },
    )
    return exports
  }
  return load
}
test("Vercel stays within 12 functions and routes image table extraction", () => {
  const functionFiles = []
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith(".ts")) functionFiles.push(full)
    }
  }
  walk(path.resolve("api"))
  assert.equal(functionFiles.length, 12)
  const vercel = JSON.parse(fs.readFileSync(path.resolve("vercel.json"), "utf8"))
  assert.ok(
    vercel.rewrites.some(
      (rewrite) =>
        rewrite.source === "/api/image-table/extract" &&
        rewrite.destination === "/api/image-table?action=extract",
    ),
  )
  assert.ok(
    vercel.rewrites.some(
      (rewrite) =>
        rewrite.source === "/api/db/insights" &&
        rewrite.destination === "/api/db?action=insights",
    ),
  )
  assert.ok(
    vercel.rewrites.some(
      (rewrite) =>
        rewrite.source === "/api/db/transactions" &&
        rewrite.destination === "/api/db?action=transactions",
    ),
  )
  const dispatcher = fs.readFileSync(path.resolve("api/db.ts"), "utf8")
  assert.match(dispatcher, /import transactions from "\.\.\/server\/db\/transactions\.ts"/)
  assert.match(dispatcher, /\btransactions,/)
})
test("authentication cannot succeed without a server adapter", () => {
  const auth = sourceLoader()("authService")
  assert.equal(auth.authConnected, false)
  assert.throws(
    () =>
      auth.signIn({
        email: "example@example.com",
        password: "not-a-real-password",
      }),
    /not connected/,
  )
  assert.throws(
    () =>
      auth.signUp({
        name: "Example",
        email: "example@example.com",
        password: "not-a-real-password",
      }),
    /not connected/,
  )
  assert.throws(
    () => auth.requestPasswordReset("example@example.com"),
    /not connected/,
  )
})
test("catalog routes are unique and audio is a distinct backend-dependent category", () => {
  const { tools, categories } = sourceLoader()("config")
  assert.equal(new Set(tools.map((t) => t.id)).size, tools.length)
  assert.ok(categories.includes("Audio tools"))
  const audio = tools.find((t) => t.id === "audio-text")
  assert.equal(audio.category, "Audio tools")
  assert.equal(audio.integrationRequired, true)
  const passport = tools.find((t) => t.id === "passport-photo")
  assert.equal(passport.category, "File tools")
  assert.equal(passport.available, true)
  assert.notEqual(passport.integrationRequired, true)
  for (const id of ["image-crop", "image-resize"]) {
    const imageTool = tools.find((t) => t.id === id)
    assert.equal(imageTool.category, "File tools")
    assert.equal(imageTool.available, true)
    assert.notEqual(imageTool.integrationRequired, true)
  }
  assert.equal(
    tools.filter(
      (t) =>
        t.category === "File tools" && t.name.toLowerCase().includes("pdf"),
    ).length > 0,
    true,
  )
})
for (const route of [
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
  "merge-pdf",
  "image-to-excel",
  "image-crop",
  "image-resize",
  "passport-photo",
  "text-pdf",
  "audio-text",
  "sign-in",
  "sign-up",
  "reset-password",
  "unknown-route",
]) {
  test(`route renders: ${route}`, () => {
    const App = sourceLoader(route)("App").default
    const html = renderToStaticMarkup(React.createElement(App))
    assert.ok(html.length > 500)
    if (route === "all") assert.match(html, /href="\/tools\/merge-pdf"/)
    if (route === "unknown-route") assert.match(html, /404/)
    if (["sign-in", "sign-up", "reset-password"].includes(route)) {
      assert.match(html, /Authentication not connected/)
      assert.match(html, /autocomplete="email"/i)
      assert.doesNotMatch(
        html,
        /Account created|Email sent|Successfully signed in/,
      )
    }
    if (route === "audio-text") assert.match(html, /Backend not connected/)
  })
}

test("clean tool paths initialize the selected tool route", () => {
  const App = sourceLoader("", "/tools/merge-pdf")("App").default
  const html = renderToStaticMarkup(React.createElement(App))
  assert.match(html, /data-page="merge-pdf"/)
  assert.match(html, /Loading…/)
})
