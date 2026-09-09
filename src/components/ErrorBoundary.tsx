import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";
import "../styles/ErrorBoundary.css";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * App-wide safety net. Without this, any error thrown during render (e.g. an
 * undefined component or a bad data access) unmounts the entire React tree and
 * leaves a blank white page. This catches such errors and shows a recoverable
 * message instead, so one broken page never takes down the whole app.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => {
    window.location.href = "/Home";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="eb-screen">
          <div className="eb-icon">⚠️</div>
          <h1 className="eb-title">Something went wrong</h1>
          <p className="eb-text">
            This page hit an unexpected error. You can reload it or go back to the
            dashboard.
          </p>
          <pre className="eb-message">{this.state.error?.message ?? "Unknown error"}</pre>
          <div className="eb-actions">
            <button type="button" onClick={this.handleReload} className="eb-btn eb-btn--reload">
              Reload page
            </button>
            <button type="button" onClick={this.handleHome} className="eb-btn eb-btn--home">
              Go to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
