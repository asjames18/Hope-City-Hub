import { Component } from 'react';
import { Link } from 'react-router-dom';

function ErrorFallback({ error, onRetry, title = 'Something went wrong' }) {
  return (
    <div className="min-h-screen bg-gray-50 px-4 py-8">
      <div className="mx-auto max-w-md rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-gray-400">Recovery</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-teal-900">{title}</h1>
        <p className="mt-3 text-sm text-gray-600">
          The page hit an unexpected error. You can retry this view or return to the home page.
        </p>
        {error?.message ? (
          <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error.message}</p>
        ) : null}
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={onRetry}
            className="w-full rounded-xl bg-teal-900 px-4 py-3 text-sm font-bold text-white hover:bg-teal-800 sm:w-auto"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-bold text-gray-700 hover:bg-gray-50 sm:w-auto"
          >
            Reload page
          </button>
          <Link
            to="/"
            className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-sm font-bold text-gray-700 hover:bg-gray-50 sm:w-auto"
          >
            Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

export default class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error) {
    console.error('UI boundary caught an error:', error);
  }

  componentDidUpdate(prevProps) {
    const resetKeys = this.props.resetKeys || [];
    const prevResetKeys = prevProps.resetKeys || [];
    if (resetKeys.length !== prevResetKeys.length) {
      this.reset();
      return;
    }

    for (let index = 0; index < resetKeys.length; index += 1) {
      if (resetKeys[index] !== prevResetKeys[index]) {
        this.reset();
        return;
      }
    }
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={this.reset}
          title={this.props.title}
        />
      );
    }

    return this.props.children;
  }
}
