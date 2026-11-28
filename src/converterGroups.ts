/**
 * Mirrored conversion pairs share one surface in the catalog: a single card that
 * opens either direction, with the direction switched inside the tool page.
 * Both tool ids keep their own URL, tier and sitemap entry, so search engines
 * and per-tool unlocks are unaffected.
 */
export interface ConverterGroup {
  id: string
  label: string
  description: string
  /** [default direction, reverse direction] */
  members: readonly [string, string]
}

export const CONVERTER_GROUPS: readonly ConverterGroup[] = [
  {
    id: "pdf-word",
    label: "PDF ↔ Word",
    description:
      "Convert both ways — turn a PDF into an editable Word file, or a Word document into a clean PDF.",
    members: ["pdf-to-word", "word-to-pdf"],
  },
  {
    id: "pdf-powerpoint",
    label: "PDF ↔ PowerPoint",
    description:
      "Move a deck between PDF and editable PowerPoint slides, in either direction.",
    members: ["pdf-to-ppt", "ppt-to-pdf"],
  },
  {
    id: "pdf-excel",
    label: "PDF ↔ Excel",
    description:
      "Pull tables out of a PDF, or turn a spreadsheet into a clean PDF, from one page.",
    members: ["pdf-to-excel", "excel-to-pdf"],
  },
  {
    id: "pdf-jpg",
    label: "PDF ↔ JPG",
    description:
      "Export PDF pages as JPG images, or combine JPG photos into a single PDF.",
    members: ["pdf-to-jpg", "jpg-to-pdf"],
  },
]

const GROUP_BY_MEMBER = new Map<string, ConverterGroup>()
for (const group of CONVERTER_GROUPS) {
  for (const member of group.members) GROUP_BY_MEMBER.set(member, group)
}

export function converterGroupFor(toolId: string): ConverterGroup | undefined {
  return GROUP_BY_MEMBER.get(toolId)
}

/** The direction a merged card opens by default. */
export function converterHeadId(toolId: string): string | undefined {
  const group = GROUP_BY_MEMBER.get(toolId)
  return group ? group.members[0] : undefined
}

/** The reverse direction, hidden from the catalog grid only. */
export function isConverterTail(toolId: string): boolean {
  const group = GROUP_BY_MEMBER.get(toolId)
  return Boolean(group && group.members[1] === toolId)
}

export function converterMemberIds(toolId: string): readonly string[] {
  return GROUP_BY_MEMBER.get(toolId)?.members ?? []
}

/** "PDF to Word" becomes the switch label "PDF → Word". */
export function converterDirectionLabel(toolName: string): string {
  return toolName.replace(/\s+to\s+/i, " → ")
}
