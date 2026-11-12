import { Component, type ReactNode } from "react"
import { AlertTriangle } from "lucide-react"

export default class ErrorBoundary extends Component<{ children: ReactNode }, {
  failed: boolean
}> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="error-page">
        <section className="panel coming-soon" role="alert">
          <AlertTriangle size={36} />
          <div className="eyebrow">LET’S TRY THAT AGAIN</div>
          <h1>Something interrupted your flow.</h1>
          <p>
            The page couldn’t be displayed. Reload to start fresh. Unsaved files
            and transcript edits will not be retained.
          </p>
          <button
            className="primary"
            onClick={() => {
              location.hash = "overview"
              location.reload()
            }}
          >
            Reload workspace
          </button>
        </section>
      </main>
    )
  }
}
