import { Component, ErrorInfo, ReactNode } from "react";

import Card, { CARD_SUBTITLE_CLASS, CARD_TITLE_CLASS } from "./Card";
import { btnClass } from "../lib/buttonClasses";

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
        <div className="py-2">
          <Card className="border-risk-high">
            <h3 className={CARD_TITLE_CLASS}>Something went wrong</h3>
            <p className={CARD_SUBTITLE_CLASS}>
              This page hit an unexpected error. Reloading usually fixes it — if it keeps happening, the detail
              below is worth including in a bug report.
            </p>
            <pre className="bg-panel-muted border border-border rounded-lg py-2.5 px-3 text-xs text-text-secondary overflow-x-auto mb-3.5">{this.state.error.message}</pre>
            <button type="button" className={btnClass("primary")} onClick={() => window.location.reload()}>
              Reload page
            </button>
          </Card>
        </div>
      );
    }
    return this.props.children;
  }
}
