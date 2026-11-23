import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import Notifications from "./Notifications"
import ErrorBoundary from "./ErrorBoundary"
import { migrateLegacyBrandStorage } from "./brandMigration"
import "./index.css"

function bootstrap() {
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <ErrorBoundary>
        <Notifications>
          <App />
        </Notifications>
      </ErrorBoundary>
    </React.StrictMode>,
  )
}

// Carrying the old data over must not be able to hold the first paint hostage:
// a database still open in another tab blocks the copy, and the app renders
// anyway because that tab keeps writing the legacy names.
const migration = migrateLegacyBrandStorage().catch(() => undefined)
const deadline = new Promise((resolve) => setTimeout(resolve, 4000))
Promise.race([migration, deadline]).then(bootstrap)
