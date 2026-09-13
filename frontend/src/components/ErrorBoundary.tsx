import { Component, ErrorInfo, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render-time errors anywhere below it so a bug in one page shows a
 * recoverable card instead of a blank white screen for the whole app. Does
 * NOT catch errors in event handlers or async code (React's boundary model
 * never does) — those are caught at the call site instead (see the
 * try/catch + setError pattern already used throughout the form pages). */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("Uncaught render error:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <div className="card error-boundary-card">
            <h3>Something went wrong</h3>
            <p className="card-subtitle">
              This page hit an unexpected error. Reloading usually fixes it — if it keeps happening, the detail
              below is worth including in a bug report.
            </p>
            <pre className="error-boundary-detail">{this.state.error.message}</pre>
            <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
