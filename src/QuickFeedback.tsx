import { useState } from "react"
import { CircleHelp, Send, ThumbsUp, TriangleAlert } from "lucide-react"
import type { FeedbackSentiment } from "../shared/insights"
import { isToolId } from "../shared/insights"
import { saveLocalFeedbackEntry, submitProductFeedback } from "./privacyTelemetry"

const options: { sentiment: FeedbackSentiment; label: string; icon: typeof ThumbsUp }[] = [
  { sentiment: "works-well", label: "Works well", icon: ThumbsUp },
  { sentiment: "could-be-easier", label: "Could be easier", icon: CircleHelp },
  { sentiment: "found-a-problem", label: "Found a problem", icon: TriangleAlert },
]

export default function QuickFeedback({
  toolId,
  compact = false,
}: {
  toolId?: string
  compact?: boolean
}) {
  const [state, setState] = useState<"idle" | "commenting" | "sending" | "sent" | "local" | "failed">("idle")
  const [selectedSentiment, setSelectedSentiment] = useState<FeedbackSentiment | null>(null)
  const [comment, setComment] = useState("")

  async function send(sentiment: FeedbackSentiment, note?: string) {
    if (state === "sending" || state === "sent" || state === "local") return
    setState("sending")
    const validTool = toolId && isToolId(toolId) ? toolId : null
    const sent = await submitProductFeedback(sentiment, validTool, note)
    if (sent) {
      setState("sent")
      return
    }
    const savedLocally = saveLocalFeedbackEntry(sentiment, validTool, note)
    setState(savedLocally ? "local" : "failed")
  }

  function handleOptionClick(sentiment: FeedbackSentiment) {
    if (sentiment === "works-well") {
      void send(sentiment)
      return
    }
    setSelectedSentiment(sentiment)
    setState("commenting")
  }

  return (
    <section className={`quick-feedback ${compact ? "is-compact" : ""}`} aria-label="Quick feedback">
      {state === "sent" || state === "local" ? (
        <p className="feedback-confirmation" role="status">
          {state === "sent"
            ? "Thanks — your feedback was sent."
            : "Thanks — your feedback note was saved."}
        </p>
      ) : state === "commenting" && selectedSentiment ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px", width: "100%" }}>
          <div className="feedback-prompt">
            <strong>
              {selectedSentiment === "found-a-problem"
                ? "What problem did you run into?"
                : "What could be easier?"}
            </strong>
            <span>Optional note — no document files or contents are collected.</span>
          </div>
          <textarea
            rows={2}
            maxLength={500}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={
              selectedSentiment === "found-a-problem"
                ? "Describe the error or unexpected result..."
                : "Share a quick suggestion..."
            }
            style={{
              width: "100%",
              padding: "8px 10px",
              borderRadius: "8px",
              border: "1px solid var(--border)",
              background: "var(--surface)",
              color: "var(--text)",
              fontSize: "12.5px",
              resize: "vertical",
            }}
          />
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="feedback-option"
              onClick={() => void send(selectedSentiment, comment)}
              style={{
                background: "var(--accent)",
                color: "var(--accent-ink)",
                borderColor: "var(--accent)",
                fontWeight: 600,
              }}
            >
              <Send size={14} aria-hidden="true" />
              Send feedback
            </button>
            <button
              type="button"
              className="feedback-option"
              onClick={() => {
                setSelectedSentiment(null)
                setComment("")
                setState("idle")
              }}
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="feedback-prompt">
            <strong>How did this tool go?</strong>
            {!compact && <span>One click. No document details are collected.</span>}
          </div>
          <div className="feedback-options">
            {options.map(({ sentiment, label, icon: Icon }) => (
              <button
                key={sentiment}
                type="button"
                className="feedback-option"
                disabled={state === "sending"}
                onClick={() => handleOptionClick(sentiment)}
              >
                <Icon size={15} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          {state === "failed" && (
            <p className="feedback-error" role="alert">
              Feedback could not be sent. Please try again.
            </p>
          )}
        </>
      )}
    </section>
  )
}
