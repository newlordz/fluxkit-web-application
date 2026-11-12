const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

test("DocumentPreviewModal file exists and is cleanly structured", () => {
  const modalPath = path.resolve(__dirname, "../src/DocumentPreviewModal.tsx")
  assert.ok(fs.existsSync(modalPath), "DocumentPreviewModal.tsx must exist")
  const content = fs.readFileSync(modalPath, "utf8")

  assert.match(content, /export default function DocumentPreviewModal/)
  assert.match(content, /createPortal/)
  assert.match(content, /splitPointsToRanges/)
  assert.match(content, /dpm-file-card/)
  assert.match(content, /dpm-file-grid/)
  assert.match(content, /FilePreviewCard/)
  assert.match(content, /loadFilePreview/)
  assert.match(content, /dpm-page-grid/)
  assert.match(content, /dpm-split-btn/)
  assert.match(content, /dpm-rotate-btn/)
  assert.match(content, /dpm-inspect-reorder-bar/)
})

test("ToolPage imports and connects DocumentPreviewModal", () => {
  const toolPagePath = path.resolve(__dirname, "../src/ToolPage.tsx")
  const content = fs.readFileSync(toolPagePath, "utf8")

  assert.match(content, /import DocumentPreviewModal from "\.\/DocumentPreviewModal"/)
  assert.match(content, /showPreviewModal/)
  assert.match(content, /previewModalMode/)
  assert.match(content, /<DocumentPreviewModal/)
  assert.match(content, /dpm-trigger-btn/)
})

test("index.css imports document-preview-modal.css", () => {
  const cssPath = path.resolve(__dirname, "../src/index.css")
  const content = fs.readFileSync(cssPath, "utf8")

  assert.match(content, /@import '\.\/document-preview-modal\.css';/)
})

test("document-preview-modal.css defines necessary styling and animations", () => {
  const modalCssPath = path.resolve(__dirname, "../src/document-preview-modal.css")
  assert.ok(fs.existsSync(modalCssPath), "document-preview-modal.css must exist")
  const css = fs.readFileSync(modalCssPath, "utf8")

  assert.match(css, /\.dpm-backdrop/)
  assert.match(css, /\.dpm-modal/)
  assert.match(css, /\.dpm-split-btn--active/)
  assert.match(css, /@keyframes dpm-split-pulse/)
  assert.match(css, /@keyframes dpm-chip-in/)
  assert.match(css, /\.dpm-trigger-btn/)
  assert.match(css, /\.dpm-file-grid/)
  assert.match(css, /\.dpm-file-preview-card/)
  assert.match(css, /\.dpm-file-preview-canvas/)
  assert.match(css, /\.dpm-view-toggle/)
})
