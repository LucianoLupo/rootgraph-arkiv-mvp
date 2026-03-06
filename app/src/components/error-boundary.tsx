'use client';

import { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mb-6">
            <AlertTriangle className="w-8 h-8 text-red-400" />
          </div>
          <h2 className="text-lg font-bold mb-2">Something went wrong</h2>
          <p className="text-muted-foreground text-sm normal-case max-w-md mb-1">
            An unexpected error occurred. This might be a network issue or a temporary problem.
          </p>
          {this.state.error && (
            <p className="text-xs text-muted-foreground font-mono mb-6 max-w-md truncate">
              {this.state.error.message}
            </p>
          )}
          <Button
            className="bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Try again
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
