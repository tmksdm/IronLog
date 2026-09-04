interface StartupErrorScreenProps {
  onRetry: () => void;
}

export function StartupErrorScreen({ onRetry }: StartupErrorScreenProps) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#121212] px-6 text-center">
      <h1 className="text-xl font-bold text-white">Не удалось открыть локальные данные</h1>
      <p className="mt-3 max-w-sm text-sm text-[#B0B0B0]">
        История не удалена. Закрывать приложение или очищать его данные не нужно —
        попробуйте открыть базу ещё раз.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-6 rounded-xl bg-[#4CAF50] px-6 py-3 font-semibold text-white active:bg-[#388E3C]"
      >
        Повторить запуск
      </button>
    </div>
  );
}
