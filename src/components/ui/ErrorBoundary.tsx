import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let displayMessage = error.message || 'An unexpected error occurred.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string; path?: string };
      if (parsed && typeof parsed.error === 'string') {
        displayMessage = `${parsed.error}${parsed.path ? ` (${parsed.operationType ?? 'operation'} on ${parsed.path})` : ''}`;
      }
    } catch {
      // Standard non-JSON error message
    }
    return { hasError: true, message: displayMessage };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950 flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900 flex items-center justify-center text-red-600 dark:text-red-400 mx-auto">
              <AlertTriangle className="w-6 h-6" aria-hidden="true" />
            </div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">Something went wrong</h1>
            <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false, message: '' });
                window.location.assign('/');
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>Reload AINEMAX</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
