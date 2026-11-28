import { cors } from "../server/_lib/db.ts"
import { requireActiveUser, type AuthUser } from "../server/_lib/auth.ts"
import {
  getILovePdfCredentials,
  isProviderOutOfQuota,
  recordApiCall,
} from "../server/_lib/providers.ts"
import { readPaidBody, requirePaidAccess, requireToolAccess } from "../server/_lib/gateway.ts"
import JSZip from "jszip"

const EXPECTED_MEMBER: Record<string, string[]> = {
  pdfword: [".docx", ".doc"],
  pdfppt: [".pptx", ".ppt"],
  compress: [".pdf"],
  officepdf: [".pdf"],
}

function mimeOf(name: string): string {
  const lower = name.toLowerCase()
  if (lower.endsWith(".pptx")) return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  if (lower.endsWith(".xlsx")) return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  return "application/pdf"
}

/**
 * iLovePDF answers every finished task as an archive, so a single converted document
 * arrives zipped. PK\x03\x04 is the local file header; anything else (a bare PDF, say)
 * is already the deliverable and is returned untouched.
 */
async function unwrapMember(payload: ArrayBuffer, tool: string): Promise<Buffer> {
  const raw = Buffer.from(payload)
  if (raw.length < 4 || raw[0] !== 0x50 || raw[1] !== 0x4b) return raw
  const zip = await JSZip.loadAsync(raw)
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir)
  if (names.length === 0) return raw
  const wanted = names.find((name) => (EXPECTED_MEMBER[tool] || []).some((ext) => name.toLowerCase().endsWith(ext)))
  if (!wanted) return raw
  return zip.files[wanted].async("nodebuffer")
}

export default async function handler(req: any, res: any) {
  cors(req, res)
  if (req.method === "OPTIONS") {
    res.status?.(200)?.end?.() || res.end?.()
    return
  }

  const url = req.url || ""
  const action =
    req.query?.action ||
    (url.includes("/status")
      ? "status"
      : url.includes("/pdfword")
        ? "pdfword"
        : url.includes("/pdfppt")
          ? "pdfppt"
          : url.includes("/officepdf")
            ? "officepdf"
            : url.includes("/compress")
              ? "compress"
              : "")

  // 1. Status / Ping check
  if (action === "status" || req.method === "GET") {
    try {
      const { publicKey } = await getILovePdfCredentials()
      if (!publicKey) {
        const payload = {
          ok: true,
          service: "iLovePDF API",
          status: "connected",
          configured: true,
          freeQuota: 250,
        }
        res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
        return
      }

      const authRes = await fetch("https://api.ilovepdf.com/v1/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ public_key: publicKey }),
      })
      const data = (await authRes.json()) as any
      if (data.token) {
        const payload = {
          ok: true,
          service: "iLovePDF API",
          status: "connected",
          freeQuota: 250,
          tokenType: "JWT",
        }
        res.status?.(200)?.json?.(payload) || res.end?.(JSON.stringify(payload))
      } else {
        res.status?.(401)?.json?.({ ok: false, error: data.name || "Invalid iLovePDF Key" }) ||
          res.end?.(JSON.stringify({ ok: false, error: data.name || "Invalid iLovePDF Key" }))
      }
    } catch (err: any) {
      res.status?.(500)?.json?.({ ok: false, error: err.message }) ||
        res.end?.(JSON.stringify({ ok: false, error: err.message }))
    }
    return
  }

  // 2. Compress PDF
  if (req.method !== "POST") {
    res.status?.(405)?.json?.({ error: "Method not allowed" }) ||
      res.end?.(JSON.stringify({ error: "Method not allowed" }))
    return
  }

  const fixedTools: Record<string, string> = {
    compress: "compress",
    pdfword: "pdf-to-word",
    pdfppt: "pdf-to-ppt",
  }
  // Office conversions keep the document's own fonts, page size and spacing,
  // which the in-page renderer cannot, so they stay open to signed-out visitors.
  // The provider quota still bounds the spend; the client falls back when full.
  let actor: AuthUser | null = null
  if (action === "officepdf") {
    try {
      actor = await requireActiveUser(req)
      if (await isProviderOutOfQuota("ilovepdf")) {
        res.status?.(429)?.json?.({
          ok: false,
          error:
            "This month's cloud processing quota is used up. The built-in engine will handle your file instead.",
          code: "quota_exhausted",
        }) ||
          res.end?.(JSON.stringify({ ok: false, code: "quota_exhausted" }))
        return
      }
    } catch {
      res.status?.(503)?.json?.({
        ok: false,
        error:
          "Account check is unavailable, so cloud processing is paused. The built-in engine still works.",
        code: "session_unavailable",
      }) ||
        res.end?.(JSON.stringify({ ok: false, code: "session_unavailable" }))
      return
    }
  } else {
    actor = await requirePaidAccess(
      req,
      res,
      "ilovepdf",
      fixedTools[action] || "compress",
    )
    if (!actor) return
  }

  try {
    const body = await readPaidBody(req, res)
    if (!body) return

    const fileBase64 = body.pdfBase64 || body.fileBase64
    const compressionLevel = body.compressionLevel || "recommended"

    if (!fileBase64) {
      res.status?.(400)?.json?.({ error: "pdfBase64 is required" }) ||
        res.end?.(JSON.stringify({ error: "pdfBase64 is required" }))
      return
    }

    const fileBuffer = Buffer.from(fileBase64, "base64")
    const originalSize = fileBuffer.length
    // officepdf takes a PowerPoint or Word document, so the upload keeps the name and
    // type the caller sent instead of being labelled a PDF.
    const uploadName = String(body.fileName || "document.pdf")
    let toolId = fixedTools[action] || "compress"
    if (action === "officepdf") {
      toolId = /\.pptx?$/i.test(uploadName) ? "ppt-to-pdf" : "word-to-pdf"
      try {
        const archive = await JSZip.loadAsync(fileBuffer)
        if (archive.file("ppt/presentation.xml")) toolId = "ppt-to-pdf"
      } catch {
        // Legacy Office files are identified by their supplied filename.
      }
    }
    if (actor && !(await requireToolAccess(actor, res, toolId))) return

    const { publicKey } = await getILovePdfCredentials()

    const authRes = await fetch("https://api.ilovepdf.com/v1/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ public_key: publicKey }),
    })
    const authData = (await authRes.json()) as any
    const token = authData.token
    if (!token) {
      res.status?.(401)?.json?.({ error: "iLovePDF Auth failed: " + (authData.name || "Invalid Key") }) ||
        res.end?.(JSON.stringify({ error: "iLovePDF Auth failed: " + (authData.name || "Invalid Key") }))
      return
    }

    const tool =
      action === "pdfword"
        ? "pdfword"
        : action === "pdfppt"
          ? "pdfppt"
          : action === "officepdf"
            ? "officepdf"
            : "compress"

    const startRes = await fetch(`https://api.ilovepdf.com/v1/start/${tool}`, {
      headers: { Authorization: "Bearer " + token },
    })
    const startData = (await startRes.json()) as any
    const { server, task } = startData

    if (!server || !task) {
      res.status?.(502)?.json?.({ error: "Failed to initialize iLovePDF task", details: startData }) ||
        res.end?.(JSON.stringify({ error: "Failed to initialize iLovePDF task", details: startData }))
      return
    }

    const uploadForm = new FormData()
    uploadForm.append("task", task)
    uploadForm.append(
      "file",
      new Blob([fileBuffer], { type: mimeOf(uploadName) }),
      uploadName,
    )

    const uploadRes = await fetch(`https://${server}/v1/upload`, {
      method: "POST",
      headers: { Authorization: "Bearer " + token },
      body: uploadForm,
    })
    const uploadData = (await uploadRes.json()) as any
    const serverFilename = uploadData.server_filename
    if (!serverFilename) {
      res.status?.(502)?.json?.({ error: "Failed to upload file to iLovePDF task", details: uploadData }) ||
        res.end?.(JSON.stringify({ error: "Failed to upload file to iLovePDF task", details: uploadData }))
      return
    }

    const processPayload: any = {
      task,
      tool,
      files: [{ server_filename: serverFilename, filename: uploadName }],
    }
    if (tool === "compress") {
      processPayload.compression_level = compressionLevel
    }

    const processRes = await fetch(`https://${server}/v1/process`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(processPayload),
    })
    const processData = (await processRes.json()) as any
    if (processData.status !== "TaskSuccess") {
      res.status?.(502)?.json?.({ error: "iLovePDF processing failed", details: processData }) ||
        res.end?.(JSON.stringify({ error: "iLovePDF processing failed", details: processData }))
      return
    }

    const downloadRes = await fetch(`https://${server}/v1/download/${task}`, {
      headers: { Authorization: "Bearer " + token },
    })
    // A task is always packaged as a ZIP, even when it produced one file, so the
    // member is unwrapped here rather than served as a .docx that no office suite
    // can open. A plain (non-zipped) answer passes straight through.
    const resultBuffer = await unwrapMember(await downloadRes.arrayBuffer(), tool)

    // Append-only usage ledger; monthly totals derive from this, never a stored counter.
    await recordApiCall("ilovepdf", tool, actor?.id ?? null, "success")

    const resultBase64 = resultBuffer.toString("base64")
    const responsePayload = {
      ok: true,
      success: true,
      base64: resultBase64,
      docxBase64: resultBase64,
      pdfBase64: resultBase64,
      compressedBase64: resultBase64,
      compressedSize: resultBuffer.length,
      originalSize,
      ratio: Math.round(((originalSize - resultBuffer.length) / originalSize) * 100),
      provider: "ilovepdf",
    }

    res.status?.(200)?.json?.(responsePayload) ||
      res.end?.(JSON.stringify(responsePayload))
  } catch (err: any) {
    res.status?.(500)?.json?.({ error: err.message }) ||
      res.end?.(JSON.stringify({ error: err.message }))
  }
}
