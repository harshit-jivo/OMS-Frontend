import { Component } from "react";
import type { ErrorInfo, ReactNode } from "react";

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
    window.location.href = "/Dashboard";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            padding: "24px",
            textAlign: "center",
            fontFamily: "system-ui, sans-serif",
            color: "#0f172a",
          }}
        >
          <div style={{ fontSize: "48px" }}>⚠️</div>
          <h1 style={{ margin: 0, fontSize: "1.4rem" }}>Something went wrong</h1>
          <p style={{ margin: 0, maxWidth: 480, color: "#5b6878" }}>
            This page hit an unexpected error. You can reload it or go back to the
            dashboard.
          </p>
          <pre
            style={{
              maxWidth: 560,
              overflowX: "auto",
              background: "#f1f5f9",
              padding: "12px 16px",
              borderRadius: 8,
              fontSize: "0.8rem",
              color: "#dc2626",
            }}
          >
            {this.state.error?.message ?? "Unknown error"}
          </pre>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              type="button"
              onClick={this.handleReload}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "none",
                background: "#0f766e",
                color: "#fff",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Reload page
            </button>
            <button
              type="button"
              onClick={this.handleHome}
              style={{
                padding: "10px 20px",
                borderRadius: 8,
                border: "1px solid #cbd5e1",
                background: "#fff",
                color: "#0f172a",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
