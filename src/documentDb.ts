/**
 * FluxKit Document & File Database
 *
 * Re-exports persistent client-side database capabilities powered by IndexedDB.
 */

export {
  isDatabaseSupported,
  openDocumentDatabase,
  isDatabaseInitialized,
  markDatabaseInitialized,
  dbSaveDocument,
  dbGetAllDocuments,
  dbGetDocument,
  dbDeleteDocument,
  dbClearAllDocuments,
  dbGetStorageStats,
} from "./services"

export type { DatabaseStats, SessionDocument } from "./services"
