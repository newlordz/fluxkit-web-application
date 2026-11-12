import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import Notifications from "./Notifications"
import ErrorBoundary from "./ErrorBoundary"
import "./index.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Notifications>
        <App />
      </Notifications>
    </ErrorBoundary>
  </React.StrictMode>,
)
