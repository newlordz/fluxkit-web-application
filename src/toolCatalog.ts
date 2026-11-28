import { tools, type Tool } from "./config"
import { converterGroupFor, isConverterTail } from "./converterGroups"
import { isFamilyTail, toolFamilyFor } from "./toolFamilies"

/** A grid/search entry: one merged pair or family, or a standalone tool. */
export interface CatalogTool extends Tool {
  /** "2-WAY" for mirror pairs, "3 TOOLS" for families, absent for standalone tools. */
  badge?: string
  /** Every tool id this card represents; the card id is the first one. */
  memberIds: readonly string[]
}

export const catalogTools: CatalogTool[] = tools
  .filter((tool) => !isConverterTail(tool.id) && !isFamilyTail(tool.id))
  .map((tool) => {
    const converter = converterGroupFor(tool.id)
    const family = toolFamilyFor(tool.id)
    return {
      ...tool,
      name: converter?.label ?? family?.label ?? tool.name,
      description:
        converter?.description ?? family?.description ?? tool.description,
      badge: converter
        ? "2-WAY"
        : family
          ? `${family.members.length} TOOLS`
          : undefined,
      memberIds: converter?.members ?? family?.members ?? [tool.id],
    }
  })

const CATALOG_ID_BY_TOOL = new Map<string, string>()
for (const entry of catalogTools) {
  for (const member of entry.memberIds) CATALOG_ID_BY_TOOL.set(member, entry.id)
}

/** Maps a hidden direction/member back to the card that represents it. */
export function catalogIdFor(toolId: string): string {
  return CATALOG_ID_BY_TOOL.get(toolId) ?? toolId
}
