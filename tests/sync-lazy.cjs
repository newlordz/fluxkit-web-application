const Module = require("node:module")
const ts = require("typescript")

const lazyImportWithInterop = /\(\) => Promise\.resolve\(\)\.then\(\(\) => __importStar\(require\((["'])([^"']+)\1\)\)\)/g
const lazyImportPlain = /\(\) => Promise\.resolve\(\)\.then\(\(\) => require\((["'])([^"']+)\1\)\)/g
const load = Module._load
let patchedTypeScript

Module._load = function (request, parent, isMain) {
  const exported = load.call(this, request, parent, isMain)
  if (request !== "typescript") return exported

  if (!patchedTypeScript) {
    patchedTypeScript = {
      ...ts,
      transpileModule(input, options, fileName, ...rest) {
        const result = ts.transpileModule(input, options, fileName, ...rest)
        result.outputText = result.outputText.replaceAll(
          "import.meta.env",
          "(typeof process !== \"undefined\" ? process.env : globalThis.__VITE_ENV__)",
        )

        if (input.includes("function RouteLoading") && input.includes("export default function App")) {
          result.outputText = result.outputText
            .replace(
              lazyImportWithInterop,
              (_, quote, id) =>
                `() => ({ then: (resolve) => resolve(__importStar(require(${quote}${id}${quote}))) })`,
            )
            .replace(
              lazyImportPlain,
              (_, quote, id) =>
                `() => ({ then: (resolve) => resolve(require(${quote}${id}${quote})) })`,
            )
        }

        return result
      },
    }
  }

  return patchedTypeScript
}
