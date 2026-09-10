import React from 'react';

interface Props {
  children: React.ReactNode;
  fallbackMessage?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error('UI crashed:', error.message);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-broadcast-dark flex items-center justify-center px-4">
          <div className="text-center max-w-md" role="alert">
            <h1 className="font-display text-2xl font-bold text-white mb-2">Something went wrong</h1>
            <p className="text-broadcast-text-secondary mb-6">
              {this.props.fallbackMessage ?? 'The screen crashed. Your draft is saved — reload to continue.'}
            </p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.reload(); }}
              className="btn-primary px-6 py-3"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
