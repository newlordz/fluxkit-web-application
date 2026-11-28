/**
 * Related tools that share one catalog card and a tab strip on the tool page.
 * Every member keeps its own URL, tier and sitemap entry; only the catalog
 * surface merges, so search results for any member still land on the family.
 */
export interface ToolFamily {
  id: string
  label: string
  description: string
  /** The first member is the card's default destination. */
  members: readonly string[]
}

export const TOOL_FAMILIES: readonly ToolFamily[] = [
  {
    id: "merge-split",
    label: "Merge & Split",
    description:
      "Combine PDFs or Word documents, or separate one PDF into independent files — from one page.",
    members: ["merge-pdf", "split-pdf", "merge-word"],
  },
  {
    id: "arrange-pdf",
    label: "Arrange PDF Pages",
    description:
      "Reorder pages, rotate them, or stamp page numbers — all from one workspace.",
    members: ["organize-pdf", "rotate-pdf", "page-numbers-pdf"],
  },
  {
    id: "image-studio",
    label: "Image Studio",
    description:
      "Crop, resize, or turn a photo into a passport-ready ID picture — all processed on this device.",
    members: ["image-crop", "image-resize", "passport-photo"],
  },
]

const FAMILY_BY_MEMBER = new Map<string, ToolFamily>()
for (const family of TOOL_FAMILIES) {
  for (const member of family.members) FAMILY_BY_MEMBER.set(member, family)
}

export function toolFamilyFor(toolId: string): ToolFamily | undefined {
  return FAMILY_BY_MEMBER.get(toolId)
}

export function familyHeadId(toolId: string): string | undefined {
  return FAMILY_BY_MEMBER.get(toolId)?.members[0]
}

/** Members other than the head are hidden from the catalog grid only. */
export function isFamilyTail(toolId: string): boolean {
  const family = FAMILY_BY_MEMBER.get(toolId)
  return Boolean(family && family.members[0] !== toolId)
}

export function familyMemberIds(toolId: string): readonly string[] {
  return FAMILY_BY_MEMBER.get(toolId)?.members ?? []
}
