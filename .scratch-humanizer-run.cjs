const fs = require("fs")
const path = require("path")
const ts = require("typescript")

const source = fs.readFileSync(path.join(__dirname, "src/humanizer.ts"), "utf8")
const out = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

const mod = { exports: {} }
new Function("module", "exports", "require", out)(mod, mod.exports, require)
const H = mod.exports

const samples = {
  corporate:
    "It is important to note that the quarterly revenue increased by 12.5% in Q3 2026, which demonstrates that we have leveraged our core competencies in order to deliver value. Furthermore, the team was led by Sarah Chen. Utilising a holistic approach, we were able to effectively streamline the process. The report was approved by the board. Please refer to https://example.com/pricing for details, and contact accounts@masterfilepro.com if you have any questions whatsoever. In order to facilitate the onboarding of the 34 new staff members in Manchester, it is important to note that each of them has been provided with a laptop, and the total cost of $12,400 was approved by the board on 4 March 2026, which means that the budget allocated by Finance must be reviewed, and the IT team, which has been stretched thin, will need to be supported.",
  numbers:
    "The invoice dated 12/05/2026 for £4,500.00 covers 3 units at a 15% discount (ref: PO-8821). Dr. Ahmed met the client at 2:30 pm on Tuesday. The ETA is 45 mins and the ratio is 3:1. Payment terms are net-30.",
  chatty:
    "i think that we should probably just maybe get the report done. It is good. It is fine. It is ready. I really do not think it is very complicated at all, to be honest with you, and in my opinion, the thing is that the data  is  wrong.",
  short: "Hello there.",
  other: "Bonjour tout le monde, comment allez vous aujourd hui, je pense que nous devons continuer le travail ensemble maintenant.",
}

function report(name, text, options) {
  const run = H.humanize(text, options)
  const groups = H.groupEdits(run)
  console.log("\n=============== " + name + " (" + (options.goal || "natural") + "/" + (options.intensity || "standard") + ")")
  console.log("edits=" + run.edits.length + " applied=" + groups.applied.length + " flagged=" + groups.flagged.length)
  console.log("fidelity: spans=" + run.fidelity.protectedSpans + " intact=" + run.fidelity.protectedSpansIntact +
    " numbers=" + run.fidelity.numbersPreserved + " names=" + run.fidelity.namesPreserved +
    " sentences=" + run.fidelity.sentencesBefore + "->" + run.fidelity.sentencesAfter +
    " mean=" + run.fidelity.meanLengthBefore + "->" + run.fidelity.meanLengthAfter +
    " readability=" + run.fidelity.readabilityBefore + "->" + run.fidelity.readabilityAfter)
  console.log("--- DRAFT ---")
  console.log(run.text)
  console.log("--- WITH ALL SUGGESTIONS ON ---")
  const decisions = { off: [], on: run.edits.filter((e) => !e.autoApply).map((e) => e.id) }
  console.log(H.buildText(run, decisions))
  console.log("--- EDIT ROWS ---")
  for (const edit of run.edits.slice(0, 12)) {
    console.log("[" + edit.id + " " + edit.kind + "/" + edit.confidence + "/" + edit.op + (edit.autoApply ? " auto" : " FLAG") + "] “" + edit.before + "” -> “" + edit.after + "” :: " + edit.reason + (edit.risk ? " !RISK: " + edit.risk : ""))
  }
  if (run.edits.length > 12) console.log("... " + (run.edits.length - 12) + " more")
  console.log("--- SEGMENTS (draft) ---")
  console.log(JSON.stringify(H.renderDraft(run, decisions).slice(0, 6), null, 0))
  console.log("--- markers:", JSON.stringify(H.splitMarkers(run)))
  console.log("--- notes:", JSON.stringify(run.notes, null, 0))
  return run
}

const corporate = report("corporate", samples.corporate, {})
report("corporate light", samples.corporate, { intensity: "light" })
report("corporate formal-lite", samples.corporate, { goal: "formal-lite" })
report("corporate full + voice sample", samples.corporate, { goal: "natural", intensity: "full", voiceSample: samples.chatty.repeat(3) })
report("numbers", samples.numbers, { intensity: "full" })
report("chatty", samples.chatty, { goal: "tighter", intensity: "full" })
report("short", samples.short, {})
report("other-language", samples.other, {})

// Determinism + invariant checks
const a = H.humanize(samples.corporate, {})
const b = H.humanize(samples.corporate, {})
console.log("\nDETERMINISTIC:", a.text === b.text && JSON.stringify(a.edits) === JSON.stringify(b.edits))
const spans = H.__spans ? H.__spans(samples.corporate) : null
for (const key of ["12.5%", "Q3 2026", "https://example.com/pricing", "accounts@masterfilepro.com", "$12,400", "4 March 2026", "Sarah Chen"]) {
  console.log("span kept in default draft:", key, a.text.includes(key))
  console.log("span kept in full-accept draft:", key, H.buildText(a, { off: [], on: a.edits.map((e) => e.id) }).includes(key))
}
console.log("no detector language:", !/detector|undetectab|ai detect/i.test(JSON.stringify(H.HUMANIZER_DISCLAIMER + a.notes).toLowerCase().replace(/does not claim to make writing undetectable, to defeat ai detectors/, "OK")))
console.log("disclaimer:", H.HUMANIZER_DISCLAIMER)
console.log("fidelityLines:", JSON.stringify(H.fidelityLines(a), null, 0))
console.log("summarise head:", H.summarise(a).split("\n").slice(0, 6).join(" | "))
