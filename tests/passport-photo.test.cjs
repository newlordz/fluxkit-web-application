const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

function loadPassportPhoto(globals = {}) {
  const filePath = path.resolve("src/passportPhoto.ts")
  const code = ts
    .transpileModule(fs.readFileSync(filePath, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        esModuleInterop: true,
      },
    })
    .outputText
  const exports = {}
  vm.runInNewContext(
    code,
    {
      exports,
      require,
      console,
      process: { env: {} },
      Blob,
      File,
      URL,
      Image: class Image {},
      document: {},
      ...globals,
    },
    { filename: filePath },
  )
  return exports
}

const {
  PASSPORT_PHOTO_PRESETS,
  formatPassportSize,
  getPassportCrop,
  getPassportPreset,
  isPassportImageFile,
  loadPassportImage,
  resolveOutputDimensions,
} = loadPassportPhoto()

function plain(value) {
  return JSON.parse(JSON.stringify(value))
}

test("Passport Photo Studio: country presets are unique and include common print sizes", () => {
  const ids = PASSPORT_PHOTO_PRESETS.map((preset) => preset.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(getPassportPreset("us").widthMm, 50.8)
  assert.equal(getPassportPreset("us").heightMm, 50.8)
  assert.equal(getPassportPreset("canada").widthMm, 50)
  assert.equal(getPassportPreset("canada").heightMm, 70)
  assert.equal(getPassportPreset("uk").widthMm, 35)
  assert.equal(getPassportPreset("uk").heightMm, 45)
  assert.equal(getPassportPreset("missing"), undefined)
})

test("Passport Photo Studio: physical dimensions convert to exact print pixels", () => {
  assert.deepEqual(plain(resolveOutputDimensions(50.8, 50.8, "mm", 300)), {
    width: 600,
    height: 600,
  })
  assert.deepEqual(plain(resolveOutputDimensions(2, 2, "in", 300)), {
    width: 600,
    height: 600,
  })
  assert.deepEqual(plain(resolveOutputDimensions(35, 45, "mm", 300)), {
    width: 413,
    height: 531,
  })
  assert.deepEqual(plain(resolveOutputDimensions(1200, 1500, "px", 300)), {
    width: 1200,
    height: 1500,
  })
})

test("Passport Photo Studio: invalid or unsafe output sizes are rejected", () => {
  assert.throws(() => resolveOutputDimensions(0, 45, "mm", 300), /greater than zero/)
  assert.throws(() => resolveOutputDimensions(-1, 45, "mm", 300), /greater than zero/)
  assert.throws(() => resolveOutputDimensions(35, 45, "mm", 60), /between 72 and 1200/)
  assert.throws(() => resolveOutputDimensions(5000, 45, "px", 300), /4096/)
  assert.throws(() => resolveOutputDimensions(4096, 4096, "px", 300), /too large/)
})

test("Passport Photo Studio: cover crop preserves aspect ratio and honors focus and zoom", () => {
  assert.deepEqual(plain(getPassportCrop(1200, 800, 600, 600, 1, 0.5, 0.5)), {
    x: 200,
    y: 0,
    width: 800,
    height: 800,
  })
  assert.deepEqual(plain(getPassportCrop(1200, 800, 600, 600, 2, 0.5, 0.5)), {
    x: 400,
    y: 200,
    width: 400,
    height: 400,
  })
  assert.deepEqual(plain(getPassportCrop(1200, 800, 600, 600, 1, 0, 0.5)), {
    x: 0,
    y: 0,
    width: 800,
    height: 800,
  })
  assert.deepEqual(plain(getPassportCrop(1200, 800, 600, 600, 1, 1, 0.5)), {
    x: 400,
    y: 0,
    width: 800,
    height: 800,
  })
  assert.throws(() => getPassportCrop(1200, 800, 600, 600, 0.5, 0.5, 0.5), /cannot be cropped/)
})

test("Passport Photo Studio: unsupported and oversized source files fail before decoding", async () => {
  assert.equal(
    isPassportImageFile(new File(["image"], "portrait.jpg", { type: "" })),
    true,
  )
  assert.equal(
    isPassportImageFile(new File(["image"], "portrait.txt", { type: "" })),
    false,
  )
  await assert.rejects(
    loadPassportImage(new File(["not an image"], "document.pdf", { type: "application/pdf" })),
    /JPG, PNG, WebP, or AVIF/,
  )
  const oversized = new File([new Uint8Array(25 * 1024 * 1024 + 1)], "large.jpg", {
    type: "image/jpeg",
  })
  await assert.rejects(loadPassportImage(oversized), /smaller than 25 MB/)
})

test("Passport Photo Studio: export renders the selected crop at the exact output size", async () => {
  const drawCalls = []
  const fillCalls = []
  const toBlobCalls = []
  const { renderPassportPhoto } = loadPassportPhoto({
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
  const image = { naturalWidth: 1200, naturalHeight: 800 }
  const result = await renderPassportPhoto(image, {
    width: 600,
    height: 600,
    unit: "px",
    dpi: 300,
    zoom: 2,
    focusX: 0.5,
    focusY: 0.5,
    removeBackground: false,
    backgroundColor: "#ffffff",
    backgroundTolerance: 28,
    format: "image/png",
    quality: 0.92,
  })

  assert.equal(result.blob.type, "image/png")
  assert.equal(result.blob.size, 5)
  assert.deepEqual(
    plain({ width: result.width, height: result.height, extension: result.extension }),
    { width: 600, height: 600, extension: "png" },
  )
  assert.deepEqual(plain(drawCalls), [
    [image, 400, 200, 400, 400, 0, 0, 600, 600],
    [
      {
        width: 600,
        height: 600,
      },
      0,
      0,
    ],
  ])
  assert.deepEqual(plain(toBlobCalls), [{ type: "image/png", quality: 0.92 }])
  assert.equal(fillCalls.length, 0)
})

test("Passport Photo Studio: plain-background cleanup tolerates subject pixels on the border", async () => {
  const width = 100
  const height = 100
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const skin =
        (x >= 40 && x < 60 && y >= 40 && y < 60) ||
        (x < 20 && y >= 40 && y < 60)
      data[index] = skin ? 222 : 255
      data[index + 1] = skin ? 170 : 255
      data[index + 2] = skin ? 135 : 255
      data[index + 3] = 255
    }
  }
  let cleanedData
  const { renderPassportPhoto } = loadPassportPhoto({
    document: {
      createElement: () => ({
        width,
        height,
        getContext: () => ({
          drawImage: () => {},
          fillRect: () => {},
          getImageData: () => ({ data, width, height }),
          putImageData: (nextData) => {
            cleanedData = nextData
          },
        }),
        toBlob: (callback, type) => callback(new Blob(["image"], { type })),
      }),
    },
  })
  const result = await renderPassportPhoto(
    { naturalWidth: width, naturalHeight: height },
    {
      width,
      height,
      unit: "px",
      dpi: 300,
      zoom: 1,
      focusX: 0.5,
      focusY: 0.5,
      removeBackground: true,
      backgroundColor: "#ffffff",
      backgroundTolerance: 28,
      format: "image/png",
      quality: 0.92,
    },
  )

  assert.equal(result.extension, "png")
  assert.equal(cleanedData.data[(50 * width + 50) * 4 + 3], 255)
  assert.equal(cleanedData.data[(50 * width + 10) * 4 + 3], 255)
  assert.equal(cleanedData.data[(10 * width + 90) * 4 + 3], 0)
})

test("Passport Photo Studio: varied backgrounds are rejected instead of erased", async () => {
  const width = 100
  const height = 100
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      data[index] = (x * 37 + y * 17) % 256
      data[index + 1] = (x * 11 + y * 53) % 256
      data[index + 2] = (x * 29 + y * 7) % 256
      data[index + 3] = 255
    }
  }
  const { renderPassportPhoto } = loadPassportPhoto({
    document: {
      createElement: () => ({
        width,
        height,
        getContext: () => ({
          drawImage: () => {},
          getImageData: () => ({ data, width, height }),
        }),
      }),
    },
  })

  await assert.rejects(
    renderPassportPhoto(
      { naturalWidth: width, naturalHeight: height },
      {
        width,
        height,
        unit: "px",
        dpi: 300,
        zoom: 1,
        focusX: 0.5,
        focusY: 0.5,
        removeBackground: true,
        backgroundColor: "#ffffff",
        backgroundTolerance: 28,
        format: "image/png",
        quality: 0.92,
      },
    ),
    /background is too varied/,
  )
})

test("Passport Photo Studio: size labels use sensible precision for each unit", () => {
  assert.equal(formatPassportSize(50.8, 50.8, "mm"), "50.8 × 50.8 mm")
  assert.equal(formatPassportSize(2, 2, "in"), "2.00 × 2.00 in")
  assert.equal(formatPassportSize(600, 600, "px"), "600 × 600 px")
})
