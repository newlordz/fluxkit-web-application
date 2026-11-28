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

const families = loadSource("toolFamilies")
const converters = loadSource("converterGroups")
const { tools } = loadSource("config")
const toolById = new Map(tools.map((tool) => [tool.id, tool]))

test("every tool family points at real, available tools with a known head", () => {
  assert.equal(families.TOOL_FAMILIES.length, 3)
  for (const family of families.TOOL_FAMILIES) {
    assert.ok(family.members.length >= 2, family.id)
    for (const id of family.members) {
      const tool = toolById.get(id)
      assert.ok(tool, `missing tool ${id}`)
      assert.equal(tool.available, true, id)
    }
    assert.equal(families.familyHeadId(family.members[1]), family.members[0])
  }
})

test("non-head members stay out of the catalog while heads stay in", () => {
  for (const family of families.TOOL_FAMILIES) {
    family.members.forEach((id, index) => {
      assert.equal(families.isFamilyTail(id), index > 0, id)
      assert.equal(families.familyHeadId(id), family.members[0], id)
      assert.deepEqual(
        Array.from(families.familyMemberIds(id)),
        Array.from(family.members),
      )
    })
  }
})

test("families and mirror pairs never share a tool", () => {
  for (const family of families.TOOL_FAMILIES) {
    for (const id of family.members) {
      assert.equal(converters.converterGroupFor(id), undefined, id)
    }
  }
})

test("merged catalog hides one card per family member after the head", () => {
  const hidden = tools.filter(
    (tool) => converters.isConverterTail(tool.id) || families.isFamilyTail(tool.id),
  )
  const heads = tools.length - hidden.length
  assert.equal(
    hidden.length,
    converters.CONVERTER_GROUPS.length +
      families.TOOL_FAMILIES.reduce((sum, family) => sum + family.members.length - 1, 0),
  )
  assert.equal(heads, 49)
  for (const family of families.TOOL_FAMILIES) {
    assert.ok(!hidden.some((tool) => tool.id === family.members[0]), family.id)
  }
})

test("non-family tools are unaffected", () => {
  assert.equal(families.toolFamilyFor("compress"), undefined)
  assert.equal(families.familyHeadId("compress"), undefined)
  assert.equal(families.isFamilyTail("compress"), false)
  assert.equal(families.familyMemberIds("compress").length, 0)
})
