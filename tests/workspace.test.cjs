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
function sourceLoader(hash = "overview") {
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
        location: { hash: `#${hash}` },
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
