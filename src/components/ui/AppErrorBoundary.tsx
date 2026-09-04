import { Component, type ErrorInfo, type ReactNode } from 'react';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  hasError: boolean;
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled application render error:', error, info);
  }

  private reloadApp = () => {
    try {
      sessionStorage.clear();
      window.location.hash = '#/';
    } catch {
      // Reload still provides a recovery path when storage is unavailable.
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-[#121212] px-6 text-center">
          <h1 className="text-xl font-bold text-white">Не удалось показать экран</h1>
          <p className="mt-3 max-w-sm text-sm text-[#B0B0B0]">
            Уже сохранённые локальные данные не удалены. Приложение вернётся на
            главную страницу и перезапустит интерфейс.
          </p>
          <button
            type="button"
            onClick={this.reloadApp}
            className="mt-6 rounded-xl bg-[#4CAF50] px-6 py-3 font-semibold text-white active:bg-[#388E3C]"
          >
            Перезапустить приложение
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
