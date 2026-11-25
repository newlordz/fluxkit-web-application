const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const ts = require("typescript")

// The Humanizer engine must stay pure text: the project test sandbox gives the module
// no window, no process, no matchMedia and no import.meta, so loading it here is itself
// part of the contract.
function loadHumanizer() {
  const filePath = path.resolve("src/humanizer.ts")
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
  vm.runInNewContext(code, { exports, console }, { filename: filePath })
  return exports
}

const engine = loadHumanizer()
const {
  HUMANIZER_DISCLAIMER,
  HUMANIZER_GOALS,
  HUMANIZER_INTENSITIES,
  HUMANIZER_LIMITS,
  buildText,
  fidelityLines,
  groupEdits,
  humanize,
  isHumanizerEnglish,
  renderDraft,
  renderSegments,
  splitMarkers,
  summarise,
} = engine

const GOALS = HUMANIZER_GOALS.map((goal) => goal.id)
const INTENSITIES = HUMANIZER_INTENSITIES.map((intensity) => intensity.id)

const STIFF =
  "It should be noted that the team is utilizing a holistic approach in order to leverage our core " +
  "competencies and move the needle. Due to the fact that the summary was written by the analyst and " +
  "it was reviewed by management, we will be in a position to reach out to the client base. The " +
  "deadline is 14 January 2026 and the budget is $48,500. We essentially need to do a deep dive on the " +
  "metrics that were collected by the field office over a period of 90 days. This is a testament to the " +
  "hard work of everyone involved."

const FACTS =
  "Email ana.patel@northlane.com by 9am on 14 January 2026 about invoice INV-2043 for $1,250.00. " +
  "The discount is 15 percent and the room is 4B. See quarterly-report.pdf, revision 3, or visit " +
  "https://northlane.com/pricing for “final terms”. Allow 90 minutes and 3 reviewers. " +
  "It is worth noting that the figures in the annex (see table 2) were not reviewed."

const CERTAINTY =
  "The result is not what we expected. It is effectively final and applies to all departments. " +
  "We must act, and the window is open to every team, so do not assume the option is optional. " +
  "Many of the samples were tested and more than half failed, which is more than we allowed. " +
  "We logged a large number of incidents and each and every one was reviewed by the same analyst. " +
  "At the end of the day, needless to say, the draft still needs your sign-off."

const PASSIVE =
  "The decision was delayed by the committee. The changes were approved by the board. " +
  "The risk was accepted by the client. The invoice was cleared by the finance team. " +
  "Each of the reports was checked twice before it reached the desk of the director."

const FRENCH =
  "Je ne suis pas certain que cela soit véritablement nécessaire, mais il est important de noter que " +
  "le rapport a été rédigé par l’équipe et qu’il sera examiné demain matin par la direction générale."

const VOICE_SAMPLE =
  "The old office leaked. We put a bucket under it. Nobody complained because the work still shipped. " +
  "Then the roof went. It took a month to fix and the bucket stayed as a joke."

// Words whose presence or absence changes how sure a claim sounds. The engine treats them
// as the writer's, not its own, so any edit that moves one must be a flagged suggestion.
const CERTAINTY_WORDS = new Set([
  "not", "no", "all", "every", "many", "more", "less", "half", "must", "will", "may",
  "only", "always", "never", "usually", "exactly", "effectively", "probably", "possible",
])

const allOn = (run) => ({ off: [], on: run.edits.map((edit) => edit.id) })
const allOff = (run) => ({ off: run.edits.map((edit) => edit.id), on: [] })
const wordSet = (text) =>
  new Set(
    String(text)
      .toLowerCase()
      .replace(/[’]/g, "'")
      .replace(/\bcan't\b/g, "cannot")
      .replace(/n'(t)\b/g, " not")
      .replace(/'m\b/g, " m")
      .replace(/'re\b/g, " are")
      .replace(/'ll\b/g, " will")
      .replace(/'ve\b/g, " have")
      .replace(/'d\b/g, " would")
      .split(/[^a-z0-9']+/u)
      .filter(Boolean),
  )

test("humanizer: the engine loads and runs without any browser or Node globals", () => {
  const source = fs.readFileSync(path.resolve("src/humanizer.ts"), "utf8")
  for (const forbidden of ["window.", "document.", "process.", "matchMedia", "import.meta", "localStorage"]) {
    assert.equal(source.includes(forbidden), false, "engine must not touch " + forbidden)
  }
  const run = humanize(STIFF, { goal: "natural", intensity: "standard" })
  assert.ok(run.edits.length > 0, "a stiff paragraph should produce edits")
  assert.equal(run.languageOk, true)
  assert.equal(run.truncated, false)
})

test("humanizer: protected facts survive every goal and intensity", () => {
  const mustSurvive = [
    "ana.patel@northlane.com",
    "14 January 2026",
    "INV-2043",
    "$1,250.00",
    "15 percent",
    "4B",
    "quarterly-report.pdf",
    "revision 3",
    "https://northlane.com/pricing",
    "“final terms”",
    "90 minutes",
    "3 reviewers",
    "table 2",
  ]
  for (const goal of GOALS) {
    for (const intensity of INTENSITIES) {
      const run = humanize(FACTS, { goal, intensity })
      const draft = buildText(run, allOn(run))
      assert.equal(run.fidelity.protectedSpans > 5, true, goal + "/" + intensity + " found no spans to lock")
      assert.equal(run.fidelity.protectedSpansIntact, true, goal + "/" + intensity + " altered a protected span")
      assert.equal(run.fidelity.numbersPreserved, true, goal + "/" + intensity + " altered a number")
      for (const fact of mustSurvive) {
        assert.ok(draft.includes(fact), goal + "/" + intensity + " lost " + fact + "\n" + draft)
      }
    }
  }
})

test("humanizer: the default draft only contains auto-applied edits", () => {
  const run = humanize(STIFF, { goal: "natural", intensity: "full" })
  assert.equal(run.text, buildText(run, { off: [], on: [] }))
  for (const edit of run.edits) {
    assert.equal(edit.autoApply, edit.confidence !== "low", edit.id + " autoApply must follow confidence")
    if (edit.autoApply) continue
    const withEdit = buildText(run, { off: [], on: [edit.id] })
    assert.notEqual(withEdit, run.text, edit.id + " is flagged yet sits in the default draft")
  }
})

test("humanizer: reverting every edit returns the original, character for character", () => {
  for (const sample of [STIFF, FACTS, CERTAINTY, PASSIVE, VOICE_SAMPLE]) {
    for (const goal of GOALS) {
      const run = humanize(sample, { goal, intensity: "full" })
      assert.equal(buildText(run, allOff(run)), sample, "goal " + goal + " lost text on revert")
    }
  }
})

test("humanizer: every edit is classified, explained and points at real source text", () => {
  const kinds = new Set(["filler", "word-choice", "transition", "tone", "voice", "rhythm", "punctuation", "repetition"])
  for (const goal of GOALS) {
    for (const intensity of INTENSITIES) {
      const run = humanize([STIFF, FACTS, CERTAINTY, PASSIVE].join("\n\n"), { goal, intensity })
      const ids = new Set()
      for (const edit of run.edits) {
        const label = goal + "/" + intensity + " " + edit.id
        assert.match(edit.id, /^[er]\d+$/, label + " has a malformed id")
        assert.equal(ids.has(edit.id), false, label + " has a duplicate id")
        ids.add(edit.id)
        assert.equal(kinds.has(edit.kind), true, label + " kind " + edit.kind)
        assert.ok(["high", "medium", "low"].includes(edit.confidence), label + " confidence")
        assert.ok(["replace", "split", "merge"].includes(edit.op), label + " op")
        assert.ok(typeof edit.reason === "string" && edit.reason.length > 25, label + " needs a plain-English reason")
        assert.ok(edit.startOffset >= 0 && edit.endOffset <= run.source.length + 1, label + " offset out of range")
        assert.ok(edit.endOffset >= edit.startOffset, label + " inverted range")
        assert.equal(edit.words.length === 0, edit.after === "", label + " words and after must agree")
        assert.ok(Array.isArray(edit.words), label + " must list its replacement words")
        if (edit.op === "replace") {
          assert.equal(run.source.slice(edit.startOffset, edit.endOffset), edit.before, label + " before does not match source")
        } else {
          assert.equal(edit.autoApply, false, label + " rhythm edit must never be automatic")
        }
      }
    }
  }
})

test("humanizer: edits that move certainty, delete words, or reshape voice are flagged", () => {
  let certaintyHits = 0
  let deletions = 0
  let voiceHits = 0
  for (const goal of GOALS) {
    for (const intensity of INTENSITIES) {
      const run = humanize([CERTAINTY, STIFF, PASSIVE].join("\n\n"), { goal, intensity })
      for (const edit of run.edits) {
        if (edit.kind === "voice") {
          voiceHits += 1
          assert.equal(edit.autoApply, false, "passive→active must wait for the writer")
        }
        if (edit.words.length === 0) {
          deletions += 1
          assert.equal(edit.confidence, "low", "a deletion must be a suggestion")
          assert.equal(edit.autoApply, false, "a deletion must be a suggestion")
          assert.ok(edit.risk, "a deletion must say what to check")
        }
        if (edit.op !== "replace") continue
        const before = wordSet(edit.before)
        const after = wordSet(edit.after)
        const moved = [...before].some((word) => CERTAINTY_WORDS.has(word) && !after.has(word)) ||
          [...after].some((word) => CERTAINTY_WORDS.has(word) && !before.has(word))
        if (moved) {
          certaintyHits += 1
          assert.equal(edit.confidence, "low", "certainty word moved by " + edit.before + " → " + edit.after)
          assert.equal(edit.autoApply, false, "certainty changes are the writer's call")
          assert.ok(edit.risk, "certainty changes must carry a risk note")
        }
      }
    }
  }
  assert.ok(certaintyHits > 0, "no certainty-word edits were exercised")
  assert.ok(deletions > 0, "no deletion edits were exercised")
  assert.ok(voiceHits > 0, "no voice edits were exercised")
})

test("humanizer: intensity widens the change set", () => {
  const counts = INTENSITIES.map((intensity) => humanize(STIFF, { goal: "natural", intensity }).edits.length)
  assert.ok(counts[0] <= counts[1], "light should not out-edit standard: " + counts.join("/"))
  assert.ok(counts[2] >= counts[1], "full should not under-edit standard: " + counts.join("/"))
  const kindsByIntensity = INTENSITIES.map((intensity) => new Set(humanize(STIFF, { goal: "natural", intensity }).edits.map((edit) => edit.kind)))
  assert.equal(kindsByIntensity[0].has("tone"), false, "light must not change register")
  assert.equal(kindsByIntensity[2].has("tone"), true, "full should offer register changes")
})

test("humanizer: formal-lite and plainer never add contractions", () => {
  const sample =
    "It is clear that we do not have the data and that is not acceptable. I am not able to say that the " +
    "figures will not change, and we are not certain about the rest of the report."
  for (const goal of ["formal-lite", "plainer", "tighter"]) {
    for (const intensity of INTENSITIES) {
      const run = humanize(sample, { goal, intensity })
      for (const edit of run.edits) {
        assert.equal(/n’t|n't|’m\b|’re\b|’ll\b/.test(edit.after), false, goal + " introduced a contraction: " + edit.after)
      }
      assert.equal(run.edits.some((edit) => edit.kind === "tone"), false, goal + " must not use tone rules")
    }
  }
  const natural = humanize(sample, { goal: "natural", intensity: "full" })
  assert.equal(natural.edits.some((edit) => edit.kind === "tone" && /n’t|n't/.test(edit.after)), true, "natural should offer contractions")
})

test("humanizer: non-English input is an honest no-op", () => {
  assert.equal(isHumanizerEnglish(STIFF), true)
  assert.equal(isHumanizerEnglish(FRENCH), false)
  const run = humanize(FRENCH, { goal: "natural", intensity: "full" })
  assert.equal(run.languageOk, false)
  assert.equal(run.edits.length, 0)
  assert.equal(run.text, FRENCH)
  assert.match(run.notes.join(" "), /English/)
})

test("humanizer: same input gives the same draft", () => {
  for (const goal of GOALS) {
    const first = humanize(STIFF + "\n\n" + FACTS, { goal, intensity: "full" })
    const second = humanize(STIFF + "\n\n" + FACTS, { goal, intensity: "full" })
    assert.deepEqual(second.edits, first.edits, "edits differ between runs for " + goal)
    assert.equal(second.text, first.text)
    assert.deepEqual(second.fidelity, first.fidelity)
  }
})

test("humanizer: empty, whitespace and tiny input do not crash or invent work", () => {
  for (const input of ["", "   ", "\n\n", "Hi.", "7", "   \t  \n "]) {
    const run = humanize(input, { goal: "natural", intensity: "full" })
    assert.equal(run.edits.length, 0, "nothing to edit in " + JSON.stringify(input))
    assert.equal(run.text, input)
    assert.equal(run.fidelity.protectedSpansIntact, true)
  }
})

test("humanizer: oversized input is truncated and says so", () => {
  const huge = (STIFF + " ").repeat(Math.ceil(HUMANIZER_LIMITS.maxChars / STIFF.length))
  const run = humanize(huge, { goal: "natural", intensity: "standard" })
  assert.equal(run.truncated, true)
  assert.equal(run.source.length, HUMANIZER_LIMITS.maxChars)
  assert.ok(run.edits.length <= HUMANIZER_LIMITS.maxEdits)
  assert.match(run.notes.join(" "), /first 50,000 characters/)
})

test("humanizer: a voice sample aims the rhythm instead of the text itself", () => {
  const without = humanize(STIFF, { goal: "natural", intensity: "full" })
  const withSample = humanize(STIFF, { goal: "natural", intensity: "full", voiceSample: VOICE_SAMPLE })
  assert.equal(without.fidelity.voiceReference, "this text")
  assert.equal(withSample.fidelity.voiceReference, "sample")
  for (const key of ["voiceDriftBefore", "voiceDriftAfter"]) {
    assert.equal(Number.isFinite(withSample.fidelity[key]), true, key + " must be a number")
  }
  assert.equal(withSample.fidelity.protectedSpansIntact, true)
})

test("humanizer: the marked views rebuild the source and the draft exactly", () => {
  const run = humanize(STIFF, { goal: "natural", intensity: "full" })
  assert.equal(renderSegments(run).map((segment) => segment.text).join(""), run.source)
  const decisions = allOn(run)
  const marked = renderDraft(run, decisions)
  assert.equal(
    marked
      .map((segment) => (segment.state === "reverted" ? "" : segment.text))
      .join(""),
    buildText(run, decisions),
  )
  const groups = groupEdits(run, decisions)
  assert.equal(groups.applied.length + groups.flagged.length + groups.reverted.length, run.edits.length)
  assert.equal(groups.flagged.length, 0, "applying every id should leave nothing flagged")
  const defaults = groupEdits(run, { off: [], on: [] })
  assert.equal(defaults.applied.length, run.edits.filter((edit) => edit.autoApply).length)
  assert.equal(defaults.flagged.length, run.edits.filter((edit) => !edit.autoApply).length)
  for (const marker of splitMarkers(run, decisions)) {
    assert.ok(["split", "merge"].includes(marker.kind))
    assert.equal(run.edits.some((edit) => edit.id === marker.editId), true)
  }
})

test("humanizer: the fidelity panel reports the audit it actually ran", () => {
  const run = humanize(FACTS, { goal: "natural", intensity: "full" })
  const lines = fidelityLines(run).join("\n")
  assert.match(lines, /protected spans/)
  assert.match(lines, /Numbers and names: unchanged/)
  assert.match(lines, /Hedges kept/)
  const summary = summarise(run)
  assert.match(summary, /Humanized draft \(natural, full\)/)
  assert.match(summary, /protected spans/)
  assert.ok(summary.includes(run.text.slice(0, 40)))
})

test("humanizer: nothing promises to beat an AI detector", () => {
  const promised = /detector|detection|undetectab|evad|fool|trick|game the system/i
  for (const goal of GOALS) {
    for (const intensity of INTENSITIES) {
      const run = humanize([STIFF, FACTS, CERTAINTY, PASSIVE, VOICE_SAMPLE].join("\n\n"), { goal, intensity })
      for (const note of run.notes) assert.equal(promised.test(note), false, "note claims detection behaviour: " + note)
      for (const edit of run.edits) {
        assert.equal(promised.test(edit.reason), false, "reason claims detection behaviour: " + edit.reason)
        if (edit.risk) assert.equal(promised.test(edit.risk), false, edit.risk)
      }
    }
  }
  assert.match(HUMANIZER_DISCLAIMER, /does not claim/i)
  assert.match(HUMANIZER_DISCLAIMER, /detector/i)
})

test("humanizer: notes state the local-only guarantee", () => {
  const run = humanize(STIFF, { goal: "natural", intensity: "standard" })
  assert.match(run.notes.join(" "), /on this device/i)
  assert.match(run.notes.join(" "), /not uploaded, stored or sent/i)
})

test("humanizer: the tool is registered in the catalog, telemetry and the app", () => {
  const config = fs.readFileSync(path.resolve("src/config.ts"), "utf8")
  assert.match(config, /tool\(\s*"humanizer",\s*"Humanizer",/)
  const insights = fs.readFileSync(path.resolve("shared/insights.ts"), "utf8")
  assert.match(insights, /"humanizer",/)
  const toolPage = fs.readFileSync(path.resolve("src/ToolPage.tsx"), "utf8")
  assert.match(toolPage, /import HumanizerStudio from ".\/HumanizerStudio"/)
  assert.match(toolPage, /tool\.id === "humanizer" \? \(\s*<HumanizerStudio toolId=\{tool\.id\} onComplete=\{onComplete\} \/>/)
  const css = fs.readFileSync(path.resolve("src/humanizer.css"), "utf8")
  assert.match(css, /\.humanizer-output/)
  assert.match(fs.readFileSync(path.resolve("src/index.css"), "utf8"), /@import '\.\/humanizer\.css'/)
})
