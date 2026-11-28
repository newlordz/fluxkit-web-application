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
    const filename = fs.existsSync(full) ? full : fs.existsSync(`${full}.tsx`) ? `${full}.tsx` : `${full}.ts`
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

const groups = loadSource("converterGroups")
const { tools } = loadSource("config")
const toolById = new Map(tools.map((tool) => [tool.id, tool]))

test("every mirrored converter group points at real, available tools", () => {
  assert.equal(groups.CONVERTER_GROUPS.length, 4)
  for (const group of groups.CONVERTER_GROUPS) {
    assert.equal(group.members.length, 2, group.id)
    for (const id of group.members) {
      const tool = toolById.get(id)
      assert.ok(tool, `missing tool ${id}`)
      assert.equal(tool.available, true, id)
    }
  }
})

test("both directions resolve to the same group and the reverse stays out of the catalog", () => {
  for (const group of groups.CONVERTER_GROUPS) {
    const [head, tail] = group.members
    assert.equal(groups.converterGroupFor(head), group)
    assert.equal(groups.converterGroupFor(tail), group)
    assert.equal(groups.converterHeadId(tail), head)
    assert.equal(groups.isConverterTail(head), false)
    assert.equal(groups.isConverterTail(tail), true)
    assert.deepEqual(Array.from(groups.converterMemberIds(tail)), [head, tail])
  }
})

test("merged catalog hides exactly one card per pair", () => {
  const catalog = tools.filter((tool) => !groups.isConverterTail(tool.id))
  assert.equal(tools.length - catalog.length, groups.CONVERTER_GROUPS.length)
  for (const group of groups.CONVERTER_GROUPS) {
    assert.ok(catalog.some((tool) => tool.id === group.members[0]), group.id)
    assert.ok(!catalog.some((tool) => tool.id === group.members[1]), group.id)
  }
})

test("non-converter tools are unaffected", () => {
  assert.equal(groups.converterGroupFor("merge-pdf"), undefined)
  assert.equal(groups.converterHeadId("merge-pdf"), undefined)
  assert.equal(groups.isConverterTail("merge-pdf"), false)
  assert.equal(groups.converterMemberIds("merge-pdf").length, 0)
})

test("direction labels read as arrows", () => {
  assert.equal(groups.converterDirectionLabel("PDF to Word"), "PDF → Word")
  assert.equal(groups.converterDirectionLabel("PowerPoint to PDF"), "PowerPoint → PDF")
  assert.equal(groups.converterDirectionLabel("Merge PDF"), "Merge PDF")
})
