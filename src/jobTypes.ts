export type JobStatus = "idle" | "uploading" | "queued" | "processing" | "completed" | "failed"
export interface InputFileMetadata {
  name: string
  size: number
  type: string
}
export interface ProcessingError {
  code: string
  message: string
  retryable: boolean
}
export interface ToolOptions {
  title?: string
  preserveOrder?: boolean
}
export interface OutputResult {
  name: string
  blob: Blob
  pieces?: Array<{ name: string blob: Blob pageCount?: number label?: string }>
}
export interface ProcessingJob {
  id: string
  toolId: string
  inputs: InputFileMetadata[]
  options: ToolOptions
  status: JobStatus
  output?: OutputResult
  error?: string
}
export interface TranscriptionOptions {
  language: string
  speakerLabels: boolean
  timestamps: boolean
}
export interface TranscriptSegment {
  text: string
  startSeconds: number
  endSeconds: number
  speaker?: string
}
export interface TranscriptionResult {
  text: string
  language?: string
  segments?: TranscriptSegment[]
}
export interface TranscriptionJob {
  id: string
  status: JobStatus
  result?: TranscriptionResult
  error?: string
}
export interface TranscriptionCapabilities {
  formats: {
    extension: string
    mimeTypes: string[]
  }[]
  maxFileBytes: number
  maxDurationSeconds: number | null
  languages: {
    code: string
    name: string
  }[]
  autoDetect: boolean
  speakerLabels: boolean
  timestamps: boolean
  retention: string
  usageLimits: string
}
