import { apiBaseUrl } from "./services"
import type {
  TranscriptionCapabilities,
  TranscriptionJob,
  TranscriptionOptions,
} from "./jobTypes"

function endpoint(path: string) {
  if (!apiBaseUrl?.trim())
    throw new Error("Backend not connected. No audio has been uploaded.")
  return `${apiBaseUrl.replace(/\/$/, "")}/transcription${path}`
}
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null
export async function getTranscriptionCapabilities(
  signal: AbortSignal,
): Promise<TranscriptionCapabilities> {
  const response = await fetch(endpoint("/capabilities"), {
    signal,
    credentials: "same-origin",
  })
  if (!response.ok)
    throw new Error(
      "Cannot connect to the transcription backend. Check configuration or retry.",
    )
  const data: unknown = await response.json()
  if (
    !record(data) ||
    !Array.isArray(data.formats) ||
    !data.formats.length ||
    !data.formats.every(
      (f) =>
        record(f) &&
        typeof f.extension === "string" &&
        /^\.[a-z0-9]+$/i.test(f.extension) &&
        Array.isArray(f.mimeTypes) &&
        f.mimeTypes.every((m) => typeof m === "string"),
    ) ||
    typeof data.maxFileBytes !== "number" ||
    !Number.isFinite(data.maxFileBytes) ||
    data.maxFileBytes <= 0 ||
    !(
      data.maxDurationSeconds === null ||
      (typeof data.maxDurationSeconds === "number" &&
        Number.isFinite(data.maxDurationSeconds) &&
        data.maxDurationSeconds > 0)
    ) ||
    !Array.isArray(data.languages) ||
    !data.languages.every(
      (l) =>
        record(l) &&
        typeof l.code === "string" &&
        !!l.code &&
        l.code !== "auto" &&
        typeof l.name === "string",
    ) ||
    typeof data.autoDetect !== "boolean" ||
    (!data.autoDetect && !data.languages.length) ||
    typeof data.speakerLabels !== "boolean" ||
    typeof data.timestamps !== "boolean" ||
    typeof data.retention !== "string" ||
    !data.retention.trim() ||
    typeof data.usageLimits !== "string" ||
    !data.usageLimits.trim()
  )
    throw new Error(
      "Backend capabilities are incomplete. Supported formats and limits could not be confirmed.",
    )
  return data as unknown as TranscriptionCapabilities
}
function parseJob(data: unknown): TranscriptionJob {
  if (
    !record(data) ||
    typeof data.id !== "string" ||
    !data.id ||
    !["queued", "processing", "completed", "failed"].includes(
      String(data.status),
    )
  ) {
    throw new Error("The backend returned an invalid job response.")
  }
  if (
    data.status === "completed" &&
    (!record(data.result) ||
      typeof data.result.text !== "string" ||
      !data.result.text.trim())
  ) {
    throw new Error(
      "No speech was returned. The recording may be silent or contain no recognizable speech.",
    )
  }
  if (data.error !== undefined && typeof data.error !== "string")
    throw new Error("Invalid backend error response.")
  return data as unknown as TranscriptionJob
}
export function uploadTranscription(
  file: File,
  options: TranscriptionOptions,
  signal: AbortSignal,
  progress: (percent: number) => void,
): Promise<TranscriptionJob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const abort = () => xhr.abort()
    xhr.open("POST", endpoint("/jobs"))
    xhr.timeout = 120000
    const clean = () => signal.removeEventListener("abort", abort)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable)
        progress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onload = () => {
      clean()
      try {
        if (xhr.status < 200 || xhr.status >= 300)
          throw new Error(
            xhr.status === 413
              ? "The backend rejected this file as too large."
              : xhr.status === 415
                ? "The backend does not support this audio format."
                : xhr.status === 429
                  ? "The transcription usage limit was reached. Try again later."
                  : "Audio upload failed. Please retry.",
          )
        resolve(parseJob(JSON.parse(xhr.responseText) as unknown))
      } catch (error) {
        reject(error)
      }
    }
    xhr.onerror = () => {
      clean()
      reject(new Error("Upload failed. Check your connection and retry."))
    }
    xhr.ontimeout = () => {
      clean()
      reject(new Error("The upload timed out. Please retry."))
    }
    xhr.onabort = () => {
      clean()
      reject(new DOMException("Upload cancelled", "AbortError"))
    }
    signal.addEventListener("abort", abort, { once: true })
    if (signal.aborted) {
      clean()
      reject(new DOMException("Upload cancelled", "AbortError"))
      return
    }
    const body = new FormData()
    body.append("file", file)
    body.append("options", JSON.stringify(options))
    xhr.send(body)
  })
}
export async function getTranscriptionJob(
  id: string,
  signal: AbortSignal,
): Promise<TranscriptionJob> {
  const response = await fetch(endpoint(`/jobs/${encodeURIComponent(id)}`), {
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
    credentials: "same-origin",
  })
  if (!response.ok)
    throw new Error(
      "Could not retrieve transcription status. Check your connection and retry.",
    )
  return parseJob(await response.json())
}
export function waitForPoll(signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer)
      reject(new DOMException("Cancelled", "AbortError"))
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort)
      resolve()
    }, 2000)
    if (signal.aborted) abort()
    else signal.addEventListener("abort", abort, { once: true })
  })
}
