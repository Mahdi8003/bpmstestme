import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper-100 px-6">
        <div className="w-full max-w-md rounded-xl border border-line bg-paper-50 p-8 text-center shadow-sm">
          <h1 className="text-lg font-bold text-ink-900">مشکلی در نمایش برنامه پیش آمد.</h1>
          <p className="mt-3 text-xs leading-6 text-ink-500">
            می‌توانید صفحه را دوباره بارگیری کنید. اگر مشکل ادامه داشت، با مدیر سیستم تماس بگیرید.
          </p>
          <div className="mt-6 flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="focus-ring inline-flex h-9 items-center justify-center rounded-lg bg-ink-900 px-4 text-xs font-semibold text-paper-50 transition hover:bg-ink-800"
            >
              بارگیری دوباره
            </button>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="focus-ring inline-flex h-9 items-center justify-center rounded-lg border border-line px-4 text-xs font-semibold text-ink-600 transition hover:bg-paper-100"
            >
              تلاش دوباره
            </button>
          </div>
        </div>
      </div>
    );
  }
}
