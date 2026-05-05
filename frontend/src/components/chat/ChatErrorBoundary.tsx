import React from 'react';

interface ChatErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

interface ChatErrorBoundaryProps {
  children: React.ReactNode;
}

class ChatErrorBoundaryView extends React.Component<ChatErrorBoundaryProps, ChatErrorBoundaryState> {
  constructor(props: ChatErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ChatErrorBoundaryState {
    return { hasError: true, error };
  }

  handleReset = () => this.setState({ hasError: false, error: undefined });

  render() {
    if (this.state.hasError) {
      return (
        <div className="oc-error-wrap">
          <div className="oc-error-card">
            <h3>Errore nella chat</h3>
            <p>Ricarica la chat per continuare.</p>
            {this.state.error && <pre>{this.state.error.toString()}</pre>}
            <button onClick={this.handleReset}>Riprova</button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export function ChatErrorBoundary(props: ChatErrorBoundaryProps) {
  return <ChatErrorBoundaryView {...props} />;
}
