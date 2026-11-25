import { useState } from "react"
import { CircleHelp, ThumbsUp, TriangleAlert } from "lucide-react"
import type { FeedbackSentiment } from "../shared/insights"
import { isToolId } from "../shared/insights"
import { submitProductFeedback } from "./privacyTelemetry"

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
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle")

  async function send(sentiment: FeedbackSentiment) {
    if (state === "sending" || state === "sent") return
    setState("sending")
    const sent = await submitProductFeedback(sentiment, toolId && isToolId(toolId) ? toolId : null)
    setState(sent ? "sent" : "failed")
  }

  return (
    <section className={`quick-feedback ${compact ? "is-compact" : ""}`} aria-label="Quick feedback">
      {state === "sent" ? (
        <p className="feedback-confirmation" role="status">
          Thanks — your feedback was sent.
        </p>
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
                onClick={() => void send(sentiment)}
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
