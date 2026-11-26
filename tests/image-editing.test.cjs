const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function loadModule(name, globals = {}) {
  const filePath = path.resolve("src", name)
  const code = ts.transpileModule(fs.readFileSync(filePath, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText
  const exports = {}
  vm.runInNewContext(
    code,
    { exports, require, console, Blob, File, URL, process: { env: {} }, ...globals },
    { filename: filePath },
  )
  return exports
}

const {
  createInitialCrop,
  fitCropToAspect,
  getCropAspect,
  isEditableImageFile,
  moveCrop,
  normalizeCrop,
  renderImageCrop,
  resizeCrop,
  validateOutputDimensions,
} = loadModule("imageEditing.ts")
const { getPassportPrintLayout, getPassportPrintPhotos } = loadModule("passportPrint.ts")

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

test("image editing accepts supported image types and rejects documents", () => {
  assert.equal(isEditableImageFile(new File(["image"], "photo.avif", { type: "" })), true)
  assert.equal(isEditableImageFile(new File(["image"], "photo.png", { type: "image/png" })), true)
  assert.equal(isEditableImageFile(new File(["pdf"], "photo.pdf", { type: "application/pdf" })), false)
  assert.equal(isEditableImageFile(new File(["image"], "vector.svg", { type: "image/svg+xml" })), false)
})

test("image crop ratios parse safely and initial crops cover the largest matching area", () => {
  assert.equal(getCropAspect("free"), null)
  assert.equal(getCropAspect("original"), null)
  assert.equal(getCropAspect("16:9"), 16 / 9)
  assert.equal(getCropAspect("bad"), null)
  assert.deepEqual(plain(createInitialCrop(1200, 800, 1)), { x: 200, y: 0, width: 800, height: 800 })
  assert.deepEqual(plain(createInitialCrop(1200, 800, 9 / 16)), { x: 375, y: 0, width: 450, height: 800 })
  assert.throws(() => createInitialCrop(0, 800), /invalid/)
})

test("moving a crop preserves its size and clamps to the source image", () => {
  const crop = { x: 100, y: 100, width: 200, height: 150 }
  assert.deepEqual(plain(moveCrop(crop, 50, 25, 1000, 800)), { x: 150, y: 125, width: 200, height: 150 })
  assert.deepEqual(plain(moveCrop(crop, -500, 500, 1000, 800)), { x: 0, y: 600, width: 200, height: 150 })
})

test("free crop handles resize only the dragged edges", () => {
  const crop = { x: 100, y: 100, width: 200, height: 200 }
  assert.deepEqual(plain(resizeCrop(crop, "se", 250, 180, 1000, 800)), { x: 100, y: 100, width: 150, height: 80 })
  assert.deepEqual(plain(resizeCrop(crop, "nw", 50, 75, 1000, 800)), { x: 50, y: 75, width: 250, height: 225 })
})

test("fixed-ratio crop handles preserve aspect ratio and stay inside the image", () => {
  const crop = { x: 100, y: 100, width: 200, height: 200 }
  assert.deepEqual(plain(resizeCrop(crop, "se", 250, 180, 1000, 800, 1)), { x: 100, y: 100, width: 150, height: 150 })
  assert.deepEqual(plain(resizeCrop(crop, "se", 2000, 2000, 1000, 800, 1)), { x: 100, y: 100, width: 700, height: 700 })
  assert.deepEqual(plain(resizeCrop(crop, "n", 300, 50, 1000, 800, 1)), { x: 75, y: 50, width: 250, height: 250 })
})

test("crop normalization removes out-of-bounds and unsafe rectangles", () => {
  assert.deepEqual(plain(normalizeCrop({ x: -20, y: 750, width: 300, height: 200 }, 1000, 800)), { x: 0, y: 600, width: 300, height: 200 })
  assert.deepEqual(plain(normalizeCrop({ x: 100, y: 100, width: 400, height: 200 }, 1000, 800, 1)), { x: 100, y: 100, width: 200, height: 200 })
  assert.throws(() => normalizeCrop({ x: 0, y: 0, width: 0, height: 10 }, 100, 100), /invalid/)
})

test("changing aspect ratio keeps the current crop center", () => {
  const crop = { x: 300, y: 200, width: 600, height: 400 }
  assert.deepEqual(plain(fitCropToAspect(crop, 1200, 800, 1)), { x: 200, y: 0, width: 800, height: 800 })
})

test("image output validation rejects unsafe dimensions", () => {
  assert.doesNotThrow(() => validateOutputDimensions(1080, 1350))
  assert.throws(() => validateOutputDimensions(0, 100), /greater than zero/)
  assert.throws(() => validateOutputDimensions(9000, 100), /8192/)
  assert.throws(() => validateOutputDimensions(8192, 8192), /too large/)
})

test("image export draws the explicit source crop into the exact output size", async () => {
  const drawCalls = []
  const fillCalls = []
  const toBlobCalls = []
  const { renderImageCrop } = loadModule("imageEditing.ts", {
    document: {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          drawImage: (...args) => drawCalls.push(args),
          fillRect: (...args) => fillCalls.push(args),
        }),
        toBlob: (callback, type, quality) => {
          toBlobCalls.push({ type, quality })
          callback(new Blob(["image"], { type }))
        },
      }),
    },
  })
  const result = await renderImageCrop(
    { naturalWidth: 1200, naturalHeight: 800 },
    { x: 100, y: 50, width: 200, height: 100 },
    { width: 400, height: 200, format: "image/png", quality: 0.9 },
  )
  assert.equal(result.blob.type, "image/png")
  assert.deepEqual(plain(drawCalls), [[{ naturalWidth: 1200, naturalHeight: 800 }, 100, 50, 200, 100, 0, 0, 400, 200]])
  assert.equal(fillCalls.length, 0)
  assert.deepEqual(plain(toBlobCalls), [{ type: "image/png", quality: 0.9 }])
})

test("A4 passport layouts use exact physical sizes and center the photo grid", () => {
  const us = getPassportPrintLayout(50.8, 50.8)
  assert.equal(us.columns, 3)
  assert.equal(us.rows, 4)
  assert.equal(us.copies, 12)
  const uk = getPassportPrintLayout(35, 45)
  assert.equal(uk.columns, 4)
  assert.equal(uk.rows, 5)
  assert.equal(uk.copies, 20)
  const photos = getPassportPrintPhotos(uk)
  assert.equal(photos.length, 20)
  assert.equal(photos[0].xMm, 24.5)
  assert.equal(photos[0].yMm, 22)
  assert.equal(photos[19].xMm, 150.5)
  assert.equal(photos[19].yMm, 230)
  assert.throws(() => getPassportPrintLayout(250, 45), /fit inside/)
})
