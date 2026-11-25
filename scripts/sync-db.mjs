import fs from "node:fs"
import { syncDatabases } from "../server/_lib/sync.ts"

for (const file of [".env", ".env.local"]) {
  if (!fs.existsSync(file)) continue
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "")
    }
  }
}

try {
  const result = await syncDatabases()
  console.log("Database sync completed in", result.durationMs, "ms")
  console.log("Primary -> Fallback:", result.primaryToFallback)
  console.log("Fallback -> Primary:", result.fallbackToPrimary)
} catch (err) {
  console.error("Database sync failed:", err?.message || err)
  process.exit(1)
}
