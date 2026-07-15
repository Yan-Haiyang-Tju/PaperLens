import { Component, type ErrorInfo, type ReactNode } from "react";
import { CircleAlert, RefreshCw } from "lucide-react";

type State = { error: Error | null };

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("PaperLens renderer error", { name: error.name, componentStack: info.componentStack });
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="fatal-error">
        <CircleAlert size={34} aria-hidden />
        <h1>界面遇到问题</h1>
        <p>论文和标注仍保存在本地。重新载入界面通常可以恢复。</p>
        <button className="primary-button" type="button" onClick={() => window.location.reload()}><RefreshCw size={16} />重新载入</button>
      </div>
    );
  }
}
