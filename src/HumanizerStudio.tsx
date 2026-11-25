import { useEffect, useMemo, useRef, useState } from "react"
import {
  Check,
  ChevronDown,
  Copy,
  Download,
  FileText,
  LockKeyhole,
  RotateCcw,
  Sparkles,
  Undo2,
} from "lucide-react"
import {
  HUMANIZER_DISCLAIMER,
  HUMANIZER_GOALS,
  HUMANIZER_INTENSITIES,
  HUMANIZER_LIMITS,
  buildText,
  fidelityLines,
  groupEdits,
  humanize,
  renderDraft,
  renderSegments,
  type Decisions,
  type HumanizerGoal,
  type HumanizerIntensity,
  type HumanizerRun,
} from "./humanizer"
import { trackToolEvent } from "./privacyTelemetry"

interface HumanizerStudioProps {
  toolId: string
  onComplete: (name: string) => void
}

type ViewMode = "draft" | "marked" | "original"

const EMPTY_DECISIONS: Decisions = { off: [], on: [] }
const KIND_LABELS: Record<string, string> = {
  filler: "padding",
  "word-choice": "word choice",
  transition: "connective",
  tone: "tone",
  voice: "sentence shape",
  rhythm: "rhythm",
  punctuation: "spacing",
  repetition: "repeated word",
}

/** One edit has exactly one decision; the engine gives "reverted" precedence. */
function pickDecision(current: Decisions, id: string, next: "applied" | "reverted" | "pending"): Decisions {
  const on = current.on.filter((value) => value !== id)
  const off = current.off.filter((value) => value !== id)
  if (next === "applied") on.push(id)
  if (next === "reverted") off.push(id)
  return { on, off }
}

export default function HumanizerStudio({ toolId, onComplete }: HumanizerStudioProps) {
  const [source, setSource] = useState("")
  const [goal, setGoal] = useState<HumanizerGoal>("natural")
  const [intensity, setIntensity] = useState<HumanizerIntensity>("standard")
  const [voiceSample, setVoiceSample] = useState("")
  const [showVoice, setShowVoice] = useState(false)
  const [run, setRun] = useState<HumanizerRun | null>(null)
  const [decisions, setDecisions] = useState<Decisions>(EMPTY_DECISIONS)
  const [view, setView] = useState<ViewMode>("draft")
  const [error, setError] = useState("")
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const resultRef = useRef<HTMLDivElement | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const draft = useMemo(() => (run ? buildText(run, decisions) : ""), [run, decisions])
  const groups = useMemo(() => (run ? groupEdits(run, decisions) : null), [run, decisions])
  const draftSegments = useMemo(() => (run ? renderDraft(run, decisions) : []), [run, decisions])
  const markedSegments = useMemo(() => (run ? renderSegments(run, decisions) : []), [run, decisions])

  useEffect(() => {
    if (!copied) return undefined
    const timer = window.setTimeout(() => setCopied(false), 2200)
    return () => window.clearTimeout(timer)
  }, [copied])

  const runHumanizer = () => {
    if (!source.trim()) {
      setError("Paste or type the text you want to look at first.")
      return
    }
    setError("")
    setBusy(true)
    window.setTimeout(() => {
      try {
        const next = humanize(source, { goal, intensity, voiceSample: voiceSample.trim() || undefined })
        setRun(next)
        setDecisions(EMPTY_DECISIONS)
        setView("draft")
        trackToolEvent("result_ready", toolId)
        onComplete("Humanized text (" + next.goal + ")")
        window.requestAnimationFrame(() => {
          if (resultRef.current) {
            resultRef.current.focus()
            resultRef.current.scrollIntoView({ block: "nearest" })
          }
        })
      } catch (issue) {
        setError(issue instanceof Error ? issue.message : "The engine could not read that text.")
      } finally {
        setBusy(false)
      }
    }, 16)
  }

  const loadFile = (file: File | undefined) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : ""
      setSource(text.slice(0, HUMANIZER_LIMITS.maxChars))
      setError("")
    }
    reader.onerror = () => setError("That file could not be read in the browser.")
    reader.readAsText(file)
  }

  const acceptSafeSuggestions = () => {
    if (!run) return
    setDecisions({
      off: [],
      on: run.edits.filter((edit) => !edit.autoApply && edit.confidence !== "low").map((edit) => edit.id),
    })
  }

  const revertEverything = () => {
    if (!run) return
    setDecisions({ off: run.edits.map((edit) => edit.id), on: [] })
  }

  const copyDraft = async () => {
    if (!draft) return
    try {
      await navigator.clipboard.writeText(draft)
      setCopied(true)
    } catch {
      setError("The browser blocked the clipboard. Select the draft and copy it manually.")
    }
  }

  const downloadDraft = () => {
    if (!run || !draft) return
    trackToolEvent("download_started", toolId)
    const header =
      "Humanized draft - goal: " + run.goal + ", intensity: " + run.intensity + "\n" +
      "Edits applied: " + (groups ? groups.applied.length : 0) + ", suggestions you declined or kept: " +
      (groups ? groups.flagged.length + groups.reverted.length : 0) + "\n" +
      "Facts, numbers, names and quotes were locked by the engine.\n" +
      "Produced on this device. Nothing was uploaded.\n\n"
    const blob = new Blob([header + draft], { type: "text/plain;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = "humanized-" + run.goal + ".txt"
    document.body.appendChild(anchor)
    anchor.click()
    document.body.removeChild(anchor)
    window.setTimeout(() => URL.revokeObjectURL(url), 4000)
    onComplete("Humanized text (" + run.goal + ")")
  }

  const words = source.trim() ? source.trim().split(/\s+/).length : 0
  const activeGoal = HUMANIZER_GOALS.find((item) => item.id === goal)
  const activeIntensity = HUMANIZER_INTENSITIES.find((item) => item.id === intensity)

  return (
    <div className="humanizer-studio">
      <section className="humanizer-card" aria-labelledby="humanizer-input-heading">
        <div className="humanizer-card-head">
          <h2 id="humanizer-input-heading">Your text</h2>
          <span className="humanizer-local-chip">
            <LockKeyhole size={13} aria-hidden="true" /> Stays on this device
          </span>
        </div>

        <label className="humanizer-label" htmlFor="humanizer-source">
          Text to humanise
        </label>
        <textarea
          id="humanizer-source"
          className="humanizer-textarea"
          rows={9}
          spellCheck
          value={source}
          maxLength={HUMANIZER_LIMITS.maxChars}
          placeholder="Paste an email, a report paragraph, an essay section - anything that reads stiffly."
          onChange={(event) => setSource(event.target.value)}
        />
        <div className="humanizer-meta-row">
          <span className="humanizer-meta">
            {words.toLocaleString("en-GB")} words · {source.length.toLocaleString("en-GB")} characters
          </span>
          <div className="humanizer-meta-actions">
            <button
              type="button"
              className="humanizer-link-button"
              onClick={() => fileRef.current && fileRef.current.click()}
            >
              <FileText size={14} aria-hidden="true" /> Load .txt or .md
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,text/plain"
              className="humanizer-file-input"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                loadFile(event.target.files?.[0])
                event.target.value = ""
              }}
            />
            {source ? (
              <button
                type="button"
                className="humanizer-link-button"
                onClick={() => {
                  setSource("")
                  setRun(null)
                  setDecisions(EMPTY_DECISIONS)
                }}
              >
                <RotateCcw size={14} aria-hidden="true" /> Clear
              </button>
            ) : null}
          </div>
        </div>

        <div className="humanizer-options">
          <div className="humanizer-field">
            <label className="humanizer-label" htmlFor="humanizer-goal">
              What should change
            </label>
            <select
              id="humanizer-goal"
              className="humanizer-select"
              value={goal}
              onChange={(event) => setGoal(event.target.value as HumanizerGoal)}
            >
              {HUMANIZER_GOALS.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="humanizer-hint">{activeGoal ? activeGoal.hint : ""}</p>
          </div>

          <div className="humanizer-field">
            <label className="humanizer-label" htmlFor="humanizer-intensity">
              How much
            </label>
            <select
              id="humanizer-intensity"
              className="humanizer-select"
              value={intensity}
              onChange={(event) => setIntensity(event.target.value as HumanizerIntensity)}
            >
              {HUMANIZER_INTENSITIES.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="humanizer-hint">{activeIntensity ? activeIntensity.hint : ""}</p>
          </div>
        </div>

        <button
          type="button"
          className="humanizer-disclosure"
          aria-expanded={showVoice}
          aria-controls="humanizer-voice-panel"
          onClick={() => setShowVoice((open) => !open)}
        >
          <ChevronDown size={15} aria-hidden="true" className={showVoice ? "is-open" : ""} />
          {showVoice ? "Hide the voice sample" : "Match the rhythm of my own writing"}
        </button>
        {showVoice ? (
          <div id="humanizer-voice-panel" className="humanizer-voice-panel">
            <label className="humanizer-label" htmlFor="humanizer-voice">
              A sample of your writing (optional, 25 words or more)
            </label>
            <textarea
              id="humanizer-voice"
              className="humanizer-textarea humanizer-textarea-small"
              rows={4}
              value={voiceSample}
              maxLength={HUMANIZER_LIMITS.maxChars}
              placeholder="Paste something you wrote that sounds like you. Only its sentence lengths and pacing are measured - never stored or sent."
              onChange={(event) => setVoiceSample(event.target.value)}
            />
            <p className="humanizer-hint">
              The sample sets the target sentence rhythm. It is not used to imitate your wording, and nothing is
              compared against a database.
            </p>
          </div>
        ) : null}

        {error ? (
          <p className="humanizer-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="humanizer-actions">
          <button type="button" className="humanizer-primary" onClick={runHumanizer} aria-disabled={busy}>
            <Sparkles size={16} aria-hidden="true" /> {busy ? "Working…" : "Humanise text"}
          </button>
          <p className="humanizer-hint">
            {run && (run.goal !== goal || run.intensity !== intensity)
              ? "Settings changed since this draft — run it again to see the difference."
              : "Numbers, dates, names, amounts, URLs and quoted text are locked and cannot be rewritten."}
          </p>
        </div>
      </section>

      {run && groups ? (
        <section className="humanizer-card" aria-label="Humanized result">
          <div
            ref={resultRef}
            className="humanizer-result-head"
            tabIndex={-1}
            role="status"
            aria-busy={busy}
          >
            <h2>Draft</h2>
            <p className="humanizer-summary">
              {groups.applied.length} applied · {groups.flagged.length} waiting for you ·{" "}
              {groups.reverted.length} reverted
            </p>
          </div>

          <div className="humanizer-tabs" role="group" aria-label="Draft view">
            {(
              [
                { id: "draft", label: "Draft" },
                { id: "marked", label: "Marked original" },
                { id: "original", label: "Original" },
              ] as Array<{ id: ViewMode; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                className="humanizer-tab"
                aria-pressed={view === tab.id}
                onClick={() => setView(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="humanizer-output" lang="en">
            {view === "draft"
              ? draftSegments.map((segment, index) =>
                  segment.editId ? (
                    <span
                      key={"m" + index}
                      className={
                        "humanizer-mark is-" + segment.state + " is-" + (segment.confidence || "high")
                      }
                    >
                      {segment.text}
                    </span>
                  ) : (
                    <span key={"p" + index}>{segment.text}</span>
                  ),
                )
              : null}
            {view === "marked"
              ? markedSegments.map((segment, index) =>
                  segment.editId ? (
                    <span
                      key={"o" + index}
                      className={
                        "humanizer-mark is-" + segment.state + " is-" + (segment.confidence || "high")
                      }
                    >
                      {segment.text}
                    </span>
                  ) : (
                    <span key={"c" + index}>{segment.text}</span>
                  ),
                )
              : null}
            {view === "original" ? <span>{run.source}</span> : null}
          </div>

          <div className="humanizer-toolbar">
            <button
              type="button"
              className="humanizer-button"
              onClick={copyDraft}
              aria-disabled={!draft}
            >
              {copied ? <Check size={15} aria-hidden="true" /> : <Copy size={15} aria-hidden="true" />}
              {copied ? "Copied" : "Copy draft"}
            </button>
            <button type="button" className="humanizer-button" onClick={downloadDraft} aria-disabled={!draft}>
              <Download size={15} aria-hidden="true" /> Download .txt
            </button>
            <button
              type="button"
              className="humanizer-button"
              onClick={acceptSafeSuggestions}
              aria-disabled={!groups.flagged.length}
            >
              <Check size={15} aria-hidden="true" /> Accept the safe suggestions
            </button>
            <button
              type="button"
              className="humanizer-button"
              onClick={revertEverything}
              aria-disabled={!run.edits.length}
            >
              <Undo2 size={15} aria-hidden="true" /> Revert everything
            </button>
          </div>

          <details className="humanizer-fidelity" open={run.edits.length === 0}>
            <summary>What the engine checked</summary>
            <ul className="humanizer-fidelity-list">
              {fidelityLines(run).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p className="humanizer-hint">
              Draft counts above include only the edits currently applied. Reverting or accepting a suggestion changes
              them.
            </p>
          </details>

          {run.notes.length ? (
            <ul className="humanizer-notes">
              {run.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}

          <h3 className="humanizer-section-title">Every edit</h3>
          {run.edits.length === 0 ? (
            <p className="humanizer-empty">
              No edits were made. The engine only changes what it can explain, so an unchanged draft is a normal
              result.
            </p>
          ) : (
            <ul className="humanizer-editlist">
              {run.edits.map((edit) => {
                const state = groups.applied.includes(edit)
                  ? "applied"
                  : groups.flagged.includes(edit)
                    ? "suggested"
                    : "reverted"
                return (
                  <li key={edit.id} className={"humanizer-edit is-" + state}>
                    <div className="humanizer-edit-head">
                      <span className="humanizer-badge">{KIND_LABELS[edit.kind] || edit.kind}</span>
                      <span className={"humanizer-confidence is-" + edit.confidence}>{edit.confidence}</span>
                      <span className="humanizer-state">
                        {state === "applied" ? "in the draft" : state === "suggested" ? "your call" : "reverted"}
                      </span>
                    </div>
                    <p className="humanizer-change">
                      <del>{edit.before}</del>{" "}
                      <ins>{edit.after}</ins>
                    </p>
                    <p className="humanizer-reason">{edit.reason}</p>
                    {edit.risk ? <p className="humanizer-risk">{edit.risk}</p> : null}
                    <div className="humanizer-edit-actions">
                      {state === "applied" ? (
                        <button
                          type="button"
                          className="humanizer-tiny-button"
                          onClick={() => setDecisions((current) => pickDecision(current, edit.id, "reverted"))}
                        >
                          <Undo2 size={13} aria-hidden="true" /> Revert this
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="humanizer-tiny-button"
                          onClick={() =>
                            setDecisions((current) =>
                              pickDecision(current, edit.id, state === "reverted" ? "pending" : "applied"),
                            )
                          }
                        >
                          {state === "reverted" ? (
                            <Undo2 size={13} aria-hidden="true" />
                          ) : (
                            <Check size={13} aria-hidden="true" />
                          )}
                          {state === "reverted" ? "Put it back" : "Apply this"}
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          <p className="humanizer-disclaimer">{HUMANIZER_DISCLAIMER}</p>
        </section>
      ) : null}
    </div>
  )
}
