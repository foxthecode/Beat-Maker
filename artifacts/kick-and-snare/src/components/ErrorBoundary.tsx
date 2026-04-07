import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary] Render error:", error, info.componentStack); // skipcq: JS-0002
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center",
          background: "#0a0a0a", color: "#FF375F",
          fontFamily: "'JetBrains Mono','SF Mono','Fira Code',monospace",
          gap: 16, padding: 24, textAlign: "center",
        }}>
          <span style={{ fontSize: 32 }}>⚠</span>
          <p style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Erreur — rechargez la page</p>
          {this.state.error && (
            <pre style={{ fontSize: 10, color: "#888", maxWidth: 480, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {this.state.error.message}
            </pre>
          )}
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 24px", borderRadius: 8, border: "1px solid #FF375F",
              background: "rgba(255,55,95,0.12)", color: "#FF375F",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
              fontFamily: "inherit", letterSpacing: "0.08em",
            }}
          >
            RECHARGER
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
