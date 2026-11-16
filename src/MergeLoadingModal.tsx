import React from "react"
import { Layers, FileText, Check, ShieldCheck, Sparkles, Loader2 } from "lucide-react"
import type { MergePDFProgress } from "./services"

interface MergeLoadingModalProps {
  files: File[]
  progress: MergePDFProgress | null
}

export default function MergeLoadingModal({ files, progress }: MergeLoadingModalProps) {
  if (!progress) return null

  const percentage = Math.min(100, Math.max(0, progress.percentage || 15))
  const total = progress.total || files.length || 2
  const current = progress.current || 1

  // Stages
  const isReading = percentage < 45
  const isMerging = percentage >= 45 && percentage < 85
  const isCompiling = percentage >= 85 && percentage < 100
  const isDone = percentage >= 100

  return (
    <div className="mlm-backdrop" role="dialog" aria-modal="true" aria-label="Merging PDF documents">
      <div className="mlm-card">
        {/* Animated Visual Stage with 3D floating & merging cards */}
        <div className="mlm-visual-stage" aria-hidden="true">
          <div className="mlm-glow-ring" />
          <div className="mlm-glow-core" />

          {/* Left flying document */}
          <div className="mlm-floating-doc mlm-floating-doc--left">
            <div className="mlm-doc-lines">
              <div className="mlm-doc-line" style={{ width: "85%" }} />
              <div className="mlm-doc-line" style={{ width: "65%" }} />
              <div className="mlm-doc-line" style={{ width: "75%" }} />
            </div>
            <FileText size={12} style={{ color: "rgba(170, 145, 255, 0.7)", alignSelf: "flex-end" }} />
          </div>

          {/* Center glowing binder */}
          <div className="mlm-floating-doc mlm-floating-doc--center">
            {isDone ? (
              <Check size={28} style={{ color: "#10b981", animation: "mlmPulse 0.5s ease" }} />
            ) : (
              <Layers size={28} />
            )}
          </div>

          {/* Right flying document */}
          <div className="mlm-floating-doc mlm-floating-doc--right">
            <div className="mlm-doc-lines">
              <div className="mlm-doc-line" style={{ width: "70%" }} />
              <div className="mlm-doc-line" style={{ width: "90%" }} />
              <div className="mlm-doc-line" style={{ width: "55%" }} />
            </div>
            <FileText size={12} style={{ color: "rgba(99, 102, 241, 0.7)", alignSelf: "flex-start" }} />
          </div>
        </div>

        {/* Headings */}
        <h2 className="mlm-title">
          {isDone ? "Merge Completed!" : "Merging Your Documents…"}
        </h2>
        <p className="mlm-subtitle">
          {progress.stage || `Combining ${total} documents into one clean, seamless PDF`}
        </p>

        {/* Progress bar */}
        <div className="mlm-progress-wrap">
          <div className="mlm-progress-header">
            <span>
              Processing File {Math.min(current, total)} of {total}
            </span>
            <span className="mlm-progress-percent">{percentage}%</span>
          </div>
          <div className="mlm-progress-track">
            <div className="mlm-progress-fill" style={{ width: `${percentage}%` }} />
          </div>
        </div>

        {/* Dynamic active file indicator */}
        <div className="mlm-file-status">
          {isDone ? (
            <Check size={14} style={{ color: "#10b981" }} />
          ) : (
            <Loader2 size={14} className="spin" />
          )}
          <span>
            {isDone
              ? "All files successfully stitched"
              : `Current: ${progress.currentFileName || files[current - 1]?.name || "Extracting pages"}`}
          </span>
        </div>

        {/* Step-by-step indicator */}
        <div className="mlm-steps">
          <div className={`mlm-step-pill ${isReading ? "mlm-step-pill--active" : percentage >= 45 ? "mlm-step-pill--done" : ""}`}>
            <span className="mlm-step-dot" />
            <span>1. Read</span>
          </div>
          <div className={`mlm-step-pill ${isMerging ? "mlm-step-pill--active" : percentage >= 85 ? "mlm-step-pill--done" : ""}`}>
            <span className="mlm-step-dot" />
            <span>2. Sequence</span>
          </div>
          <div className={`mlm-step-pill ${isCompiling ? "mlm-step-pill--active" : isDone ? "mlm-step-pill--done" : ""}`}>
            <span className="mlm-step-dot" />
            <span>3. Compile</span>
          </div>
          <div className={`mlm-step-pill ${isDone ? "mlm-step-pill--done mlm-step-pill--active" : ""}`}>
            <span className="mlm-step-dot" />
            <span>4. Ready</span>
          </div>
        </div>

        {/* Privacy badge */}
        <div className="mlm-footer-security">
          <ShieldCheck size={13} />
          <span>Private in-browser processing · Files never leave your device</span>
        </div>
      </div>
    </div>
  )
}
