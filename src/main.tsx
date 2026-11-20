import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import Notifications from "./Notifications"
import ErrorBoundary from "./ErrorBoundary"
import { syncUsersWithServer } from "./adminService"
import "./index.css"

// Eagerly sync user accounts with central cloud database on application boot for all visitors
if (typeof window !== "undefined") {
  syncUsersWithServer().catch(() => null)
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Notifications>
        <App />
      </Notifications>
    </ErrorBoundary>
  </React.StrictMode>,
)
